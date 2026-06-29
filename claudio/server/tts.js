// 声音管线：开场白文本 → TTS 合成 mp3 → 缓存到 cache/tts/<hash>.mp3，返回相对路径 /tts/<hash>.mp3。
// provider 见 config.ttsProvider：'kokoro'（开源本地 onnx，免费/离线）| 'edge'（微软，免费）| 'minimax' | 'fish'。
// 没配 key / 合成失败时返回 null —— 前端自动用浏览器内置语音（speechSynthesis）兜底，链路照跑。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config, paths } from './config.js';

function voiceTag() {
  if (config.ttsProvider === 'kokoro')
    return `kokoro:${config.kokoroVoice}:${config.kokoroSpeed}:${config.kokoroLang}`;
  if (config.ttsProvider === 'edge')
    return `edge:${config.edgeVoice}:${config.edgeRate}:${config.edgePitch}`;
  if (config.ttsProvider === 'minimax')
    return `mm:${config.minimaxModel}:${config.minimaxVoiceId}`;
  return `fish:${config.fishModelId}`;
}
function hashText(text) {
  return crypto.createHash('sha1').update(`${voiceTag()}:${text}`).digest('hex').slice(0, 16);
}

// 缓存包装：命中直接返回路径，否则调 fn() 拿 Buffer 写盘。
async function cached(text, fn) {
  const hash = hashText(text);
  const file = path.join(paths.ttsCache, `${hash}.mp3`);
  const urlPath = `/tts/${hash}.mp3`;
  if (fs.existsSync(file)) return urlPath;
  const buf = await fn();
  if (!buf || !buf.length) return null;
  fs.writeFileSync(file, buf);
  return urlPath;
}

// Edge TTS（微软 edge-tts，免费）：spawn `python -m edge_tts`，从 stdout 收 mp3 Buffer。
// python 库自带微软鉴权 token 轮换，比纯 node 自己实现稳。需先 `pip install edge-tts`。
function viaEdge(text) {
  return new Promise((resolve) => {
    const py = config.edgePython || 'python';
    const args = ['-m', 'edge_tts', '--voice', config.edgeVoice, '--text', text];
    if (config.edgeRate) args.push(`--rate=${config.edgeRate}`);
    if (config.edgePitch) args.push(`--pitch=${config.edgePitch}`);
    // --write-media 缺省时 edge_tts 把音频写到 stdout；字幕走 stderr，忽略即可。
    let child;
    try {
      child = spawn(py, args, { windowsHide: true });
    } catch (e) {
      console.warn('[tts] Edge spawn 失败，回退浏览器语音：', e.message);
      return resolve(null);
    }
    const chunks = [];
    let err = '';
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      console.warn('[tts] Edge 进程错误（python/edge-tts 没装？）：', e.message);
      resolve(null);
    });
    child.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code === 0 && buf.length) return resolve(buf);
      console.warn('[tts] Edge 合成失败 code', code, err.trim().slice(0, 200));
      resolve(null);
    });
  });
}

// MiniMax（海螺）T2A v2：返回 Buffer 或 null。音频是 hex 字符串，需解码。
async function viaMinimax(text) {
  try {
    const res = await fetch(`${config.minimaxApiBase}/v1/t2a_v2`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.minimaxApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.minimaxModel,
        text,
        stream: false,
        language_boost: 'auto', // 文本可能中英混（开场白英文 + 歌名原文），让它自适应
        voice_setting: { voice_id: config.minimaxVoiceId, speed: 1.0, vol: 1.0, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
      }),
    });
    const j = await res.json();
    if (j?.base_resp?.status_code !== 0) {
      console.warn('[tts] MiniMax', j?.base_resp?.status_code, j?.base_resp?.status_msg);
      return null;
    }
    const audio = j?.data?.audio;
    return audio ? Buffer.from(audio, 'hex') : null;
  } catch (e) {
    console.warn('[tts] MiniMax 合成失败，回退浏览器语音：', e.message);
    return null;
  }
}

// Fish Audio：返回 Buffer 或 null。
async function viaFish(text) {
  try {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.fishApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, format: 'mp3', ...(config.fishModelId ? { reference_id: config.fishModelId } : {}) }),
    });
    if (!res.ok) { console.warn('[tts] Fish Audio 返回', res.status, await res.text().catch(() => '')); return null; }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn('[tts] Fish 合成失败，回退浏览器语音：', e.message);
    return null;
  }
}

// Kokoro TTS（开源本地 onnx，完全免费/离线，不烧任何额度）：node spawn 一个常驻 python
// 工作进程（kokoro_worker.py），onnx 模型只加载一次常驻内存，之后逐条合成。请求在 node 端
// 串行化（一次一条、收到一帧再发下一条），所以 stdin/stdout 的二进制帧不会交错。
// worker 随 node 进程生死，仍是“只起 node 一个服务”。需 `pip install kokoro-onnx soundfile`。
let _kokoroWorker = null;
let _kokoroQueue = Promise.resolve();

function kokoroWorker() {
  if (_kokoroWorker && !_kokoroWorker.killed) return _kokoroWorker;
  const py = config.kokoroPython || 'python';
  const script = path.join(paths.root, 'kokoro_worker.py');
  let child;
  try {
    child = spawn(py, [script, config.kokoroOnnx, config.kokoroVoices], { windowsHide: true });
  } catch (e) {
    console.warn('[tts] kokoro worker spawn 失败：', e.message);
    return null;
  }
  child.stderr.on('data', (d) => { const t = d.toString().trim(); if (t) console.log('[tts]', t); });
  child.on('exit', (code) => { console.warn('[tts] kokoro worker 退出 code', code); if (_kokoroWorker === child) _kokoroWorker = null; });
  child.on('error', (e) => { console.warn('[tts] kokoro worker 错误：', e.message); if (_kokoroWorker === child) _kokoroWorker = null; });
  _kokoroWorker = child;
  return child;
}

// 向 worker 发一条请求，读回一个 [status:1B][len:4B BE][payload] 帧 → mp3 Buffer 或 null。
function kokoroRequest(req) {
  return new Promise((resolve) => {
    const child = kokoroWorker();
    if (!child) return resolve(null);
    let header = null, acc = Buffer.alloc(0);
    const onData = (d) => {
      acc = Buffer.concat([acc, d]);
      if (!header) {
        if (acc.length < 5) return;
        header = { status: acc.readUInt8(0), len: acc.readUInt32BE(1) };
        acc = acc.subarray(5);
      }
      if (acc.length < header.len) return;
      const payload = acc.subarray(0, header.len);
      cleanup();
      if (header.status === 1 && payload.length) return resolve(payload);
      console.warn('[tts] kokoro 合成失败：', payload.toString('utf8').slice(0, 200));
      resolve(null);
    };
    const onExit = () => { cleanup(); resolve(null); };
    function cleanup() { child.stdout.removeListener('data', onData); child.removeListener('exit', onExit); }
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    try { child.stdin.write(JSON.stringify(req) + '\n'); }
    catch (e) { cleanup(); resolve(null); }
  });
}

function viaKokoro(text) {
  // 串行化：排到队尾，保证同一时刻只有一条请求在 worker 上跑。
  const job = _kokoroQueue.then(() => kokoroRequest({
    text, voice: config.kokoroVoice, speed: config.kokoroSpeed, lang: config.kokoroLang,
  }));
  _kokoroQueue = job.catch(() => {});
  return job;
}

export async function synthesize(text) {
  const clean = (text || '').trim();
  if (!clean) return null;
  if (config.ttsProvider === 'kokoro') return cached(clean, () => viaKokoro(clean));
  if (config.ttsProvider === 'edge') return cached(clean, () => viaEdge(clean));
  if (config.ttsProvider === 'minimax' && config.minimaxApiKey) return cached(clean, () => viaMinimax(clean));
  if (config.fishApiKey) return cached(clean, () => viaFish(clean));
  return null; // 没配任何 key → 前端兜底
}
