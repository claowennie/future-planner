// Claudio 中枢 · 最小闭环。
// 主线：POST /api/chat → 组装 prompt → Claude → 解析 {say,play} →
//       music provider 解析直链 + Fish 合成开场白 → 返回给前端 + WS 推 now-playing。
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

// —— 代理自举 ——
// Node 内置 fetch（undici）默认不走 HTTPS_PROXY，海外 API（如 Fish TTS）会直连超时。
// 而 undici 只在进程启动时读 NODE_USE_ENV_PROXY，运行时改无效。所以：检测到系统有
// 代理、且本进程还没开代理时，带着该变量重新拉起自己；NO_PROXY 让 QQ 等国内域名仍直连。
if (!process.env.NODE_USE_ENV_PROXY && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)) {
  const noProxy = [process.env.NO_PROXY, 'qq.com', '.qq.com', 'qqmusic.qq.com',
    '163.com', '.163.com', 'music.163.com', '126.net', '.126.net', '163cn.tv',
    'minimaxi.com', '.minimaxi.com', 'localhost', '127.0.0.1'].filter(Boolean).join(',');
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NO_PROXY: noProxy },
  });
  process.exit(res.status ?? 0);
}

import { config, paths } from './config.js';
import { store } from './state.js';
import { buildPrompt } from './context.js';
import { askClaude } from './claude.js';
import { resolveTracks, getProvider } from './music/index.js';
import { synthesize } from './tts.js';

const app = express();
app.use(express.json());

// CORS：让 future.v2（可能是 file:// 或别的端口）能调到这里
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', config.corsOrigins);
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  // 让从 https 网站（如 Netlify）发起的「公网→本地 localhost」请求被 Chrome 的
  // Private Network Access 策略放行（否则预检会拦掉对本机中枢的调用）。
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 缓存的 tts mp3 直接静态托管
app.use('/tts', express.static(paths.ttsCache));
// 本地曲库音频直接静态托管（支持拖动进度条的 Range 请求，express.static 自带）
app.use('/media', express.static(config.musicDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ===== 核心：一次 DJ 播报 =====
async function runTurn(userText, env = {}) {
  if (userText) store.addMessage('user', userText);

  // 本地曲库为空时，别浪费一次 Claude 调用，直接友好提示
  const p = getProvider();
  if (typeof p.list === 'function' && p.list().length === 0) {
    const say = '你的曲库还是空的——把音乐文件放进 claudio/user/music 文件夹，我就能给你播了。';
    store.addMessage('claudio', say);
    return { say, sayAudio: await synthesize(say), tracks: [], reason: 'empty-library', segue: '' };
  }

  const prompt = buildPrompt(userText, env);
  const dj = await askClaude(prompt); // { reply, set:[{play, intro, hue}] }（set 可空＝纯聊天）

  // 解析直链（顺序与 set 一致），把逐首 intro / hue 贴回 track。
  // 纯聊天回合 set 为空 → resolveTracks([]) 直接返回 []，不浪费音乐检索。
  const resolved = await resolveTracks(dj.set, config.musicProvider);
  // 贴回逐首 intro / hue（按 set 顺序对齐），再滤掉解析不到直链的歌
  // （版权缺失 / 同名错歌被拦下 / VIP 放不了）——只把真能播的排进队列，
  // 免得 Claudio 介绍了一首却放不出来、或放成同名的另一首。
  const tracks = resolved
    .map((t, i) => ({
      ...t,
      intro: dj.set[i]?.intro || '',
      hue: dj.set[i]?.hue ?? null, // 大脑给的风格色相，前端据此上色（null 则前端按歌名哈希兜底）
    }))
    .filter((t) => t.url);

  // 并行合成：回应（reply）+ 每首歌的介绍语音（互不依赖，一起发）
  const [sayAudio, ...introAudios] = await Promise.all([
    synthesize(dj.reply),
    ...tracks.map((t) => synthesize(t.intro)),
  ]);
  tracks.forEach((t, i) => { t.introAudio = introAudios[i] || null; });

  store.addMessage('claudio', dj.reply);
  // 只有真排了歌才更新队列 / 在播 / 去重；纯聊天回合保留你现有的队列与在播曲目不动。
  if (tracks.length) {
    store.setQueue(tracks);
    for (const t of tracks) if (t.title) store.addPlay(t); // 整批记入，下一轮据此去重
    if (tracks[0]) store.setNowPlaying(tracks[0]);
  }

  const payload = { say: dj.reply, sayAudio, tracks };
  broadcast({ type: 'now', ...payload });
  return payload;
}

// ===== HTTP 契约（最小闭环子集）=====
app.post('/api/chat', async (req, res) => {
  try {
    const { text, mood, weather, lang } = req.body || {};
    const out = await runTurn(text, { mood, weather, lang });
    res.json(out);
  } catch (e) {
    console.error('[/api/chat]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/now', (_req, res) => res.json({ nowPlaying: store.get().nowPlaying }));
app.get('/api/next', (_req, res) => {
  const q = store.get().queue;
  res.json({ queue: q });
});
app.get('/api/taste', (_req, res) => {
  res.json({ messages: store.recentMessages(20), plays: store.get().plays.slice(-20) });
});
const ttsConfigured = () =>
  config.ttsProvider === 'kokoro' ||  // 本地 onnx，无需 key
  config.ttsProvider === 'edge' ||    // 微软 edge-tts，无需 key
  (config.ttsProvider === 'minimax' && !!config.minimaxApiKey) || !!config.fishApiKey;

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  musicProvider: config.musicProvider,
  ttsProvider: config.ttsProvider,
  ttsConfigured: ttsConfigured(),
  ttsModel: config.ttsProvider === 'minimax' ? config.minimaxModel
          : config.ttsProvider === 'kokoro' ? config.kokoroVoice
          : config.ttsProvider === 'edge' ? config.edgeVoice
          : config.ttsProvider === 'fish' ? config.fishModelId : '',
  ttsVoice: config.ttsProvider === 'minimax' ? config.minimaxVoiceId : undefined,
}));

// 托管前端（future.v2 整个目录）。放在所有 /api、/tts、/media 之后——那些请求已被
// 上面的路由处理掉，不会落到这里。给前端文件强制「不缓存」，避免改了 .jsx / index.html
// 后浏览器吃到旧版（之前用 python 静态站不发 Cache-Control，就因此电台页显示成旧首页）。
// 代码文件（.jsx/.js/.html/.css/.json）必须不缓存，否则改了浏览器吃旧版；
// 但图片/音频/字体这类素材几乎不变，走一年长缓存——否则成长树的 6 张 PNG
// 每次点开「七个阶段」都重新下载+解码，要刷半天才显示（stage6 是内联 SVG 才秒出）。
const LONG_CACHE_EXT = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|woff2?|ttf|otf|ico)$/i;
app.use((req, res, next) => {
  if (LONG_CACHE_EXT.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  }
  next();
});
app.use(express.static(paths.web, { etag: false, lastModified: false, index: 'index.html' }));

server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  🎙  Claudio 中枢已启动`);
  console.log(`     ▶ 本机打开：http://localhost:${config.port}/index.html`);
  // 列出可从手机/其它设备访问的地址（Tailscale 100.* / 局域网 192.168.* / 10.* / 172.*）
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      const a = ni.address;
      const tag = a.startsWith('100.') ? ' (Tailscale)'
        : (a.startsWith('192.168.') || a.startsWith('10.') || a.startsWith('172.')) ? ' (局域网)' : '';
      console.log(`     ▶ 其它设备：http://${a}:${config.port}/index.html${tag}`);
    }
  }
  console.log(`     音乐 provider：${config.musicProvider}`);
  console.log(`     语音：${ttsConfigured() ? `${config.ttsProvider} 已配置` : '未配置（前端用浏览器语音兜底）'}`);
  console.log(`     WS 流：ws://localhost:${config.port}/stream\n`);
});
