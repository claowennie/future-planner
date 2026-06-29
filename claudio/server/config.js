// 配置集中处。优先读环境变量，其次读 config.local.json（你放密钥的地方，
// 这个文件不要提交/分享）。没有密钥时各模块会走"降级"路径，链路照样能跑。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let local = {};
const localPath = path.join(__dirname, 'config.local.json');
try {
  if (fs.existsSync(localPath)) local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
} catch (e) {
  console.warn('[config] config.local.json 解析失败，忽略：', e.message);
}

const pick = (envKey, localKey, fallback) =>
  process.env[envKey] ?? local[localKey] ?? fallback;

export const config = {
  port: Number(pick('CLAUDIO_PORT', 'port', 3000)),

  // 大脑：Claude Code CLI（走你的 Pro 订阅，免 API key）。
  // claudeCmd 在 Windows 上通常是 'claude'（配合 shell:true 调用）。
  claudeCmd: pick('CLAUDE_CMD', 'claudeCmd', 'claude'),
  claudeModel: pick('CLAUDE_MODEL', 'claudeModel', ''), // 留空用 CLI 默认
  // 代理：claude 要靠它连 Anthropic（国内裸连会被 403/拦截）。默认本机 Clash 7897。
  // 关键：双击 bat 从资源管理器启动时，环境里没有 HTTPS_PROXY（它只存在于终端），
  // 所以这里显式提供，由 claude.js 注入给 claude 子进程，确保它能连上。设为 '' 可关闭。
  proxy: pick('CLAUDIO_PROXY', 'proxy', 'http://127.0.0.1:7897'),

  // 音乐 provider：'local'（你自己的音频文件，不需账号，最稳）| 'qq' | 'netease'
  musicProvider: pick('MUSIC_PROVIDER', 'musicProvider', 'local'),
  // 本地曲库目录（musicProvider='local' 时用）
  musicDir: pick('MUSIC_DIR', 'musicDir', path.join(__dirname, '..', 'user', 'music')),
  // QQ 音乐 API 服务地址（如 jsososo/QQMusicApi）。没起也没关系，会用占位结果。
  qqApiBase: pick('QQ_API_BASE', 'qqApiBase', 'http://localhost:3300'),
  // 网易云 API 服务地址（NeteaseCloudMusicApi），以后接网易云时用
  neteaseApiBase: pick('NETEASE_API_BASE', 'neteaseApiBase', 'http://localhost:3001'),

  // 语音合成：provider 可选 'kokoro'（开源本地 onnx，免费/离线，强烈推荐）| 'edge'（微软，免费）| 'minimax'（按量付费声贝）| 'fish'。
  // 没配对应 key 时 synthesize 返回 null，前端自动用浏览器内置语音兜底。
  ttsProvider: pick('TTS_PROVIDER', 'ttsProvider', 'edge'),
  // Edge TTS（微软 edge-tts，免费、自然，国内直连不走代理）。
  // 通过 spawn 一个 python edge_tts 子进程合成（python 库自带微软鉴权 token 轮换，最省心）。
  // 需先 `pip install edge-tts`。edgePython 指向 python 解释器，找不到则回退 'python'。
  edgeVoice: pick('EDGE_VOICE', 'edgeVoice', 'en-US-AndrewNeural'),
  edgeRate: pick('EDGE_RATE', 'edgeRate', '-12%'), // 语速，负值更慢更柔
  edgePitch: pick('EDGE_PITCH', 'edgePitch', ''),  // 音调，如 '-4Hz'，空=默认
  edgePython: pick('EDGE_PYTHON', 'edgePython', ''), // python 绝对路径，空=用 'python'
  // Kokoro TTS（开源本地 onnx，完全免费、离线、不烧任何额度）。node spawn 一个常驻 python
  // 工作进程（kokoro_worker.py）把模型加载一次常驻。需 `pip install kokoro-onnx soundfile`
  // （onnxruntime 用 1.19.2 稳）并把模型下到 kokoro-models/。
  // 英式青年男声：bm_fable / bm_george / bm_lewis / bm_daniel；美音男 am_*；英女 bf_*。
  kokoroVoice: pick('KOKORO_VOICE', 'kokoroVoice', 'bm_fable'),
  kokoroSpeed: Number(pick('KOKORO_SPEED', 'kokoroSpeed', 0.9)), // <1 更慢更柔
  kokoroLang: pick('KOKORO_LANG', 'kokoroLang', 'en-gb'),        // 英式发音；美音 'en-us'
  kokoroPython: pick('KOKORO_PYTHON', 'kokoroPython', ''),       // python 绝对路径，空=用 'python'
  kokoroOnnx: pick('KOKORO_ONNX', 'kokoroOnnx', path.join(__dirname, '..', 'kokoro-models', 'kokoro-v1.0.onnx')),
  kokoroVoices: pick('KOKORO_VOICES', 'kokoroVoices', path.join(__dirname, '..', 'kokoro-models', 'voices-v1.0.bin')),
  // MiniMax（海螺）TTS（备选；speech-02-turbo 比 speech-02-hd 便宜约 40%）
  minimaxApiKey: pick('MINIMAX_API_KEY', 'minimaxApiKey', ''),
  minimaxVoiceId: pick('MINIMAX_VOICE_ID', 'minimaxVoiceId', 'Chinese (Mandarin)_Gentleman'),
  minimaxModel: pick('MINIMAX_MODEL', 'minimaxModel', 'speech-2.8-turbo'),
  minimaxApiBase: pick('MINIMAX_API_BASE', 'minimaxApiBase', 'https://api.minimaxi.com'),
  // Fish Audio（备选）
  fishApiKey: pick('FISH_API_KEY', 'fishApiKey', ''),
  fishModelId: pick('FISH_MODEL_ID', 'fishModelId', ''), // 你训练/选用的音色 id

  // 允许的前端来源（CORS）。默认放开本地常见端口与 file://。
  corsOrigins: local.corsOrigins ?? '*',
};

export const paths = {
  root: __dirname,
  // 前端站点根目录。迁移到 Vite 后托管构建产物 dist/（先跑「构建网页.bat」或
  // `npm run build`）；dist 不存在时回退托管仓库根（老的裸文件方式），不至于打不开。
  web: fs.existsSync(path.join(__dirname, '..', '..', 'dist', 'index.html'))
    ? path.join(__dirname, '..', '..', 'dist')
    : path.join(__dirname, '..', '..'),
  user: path.join(__dirname, '..', 'user'),
  cache: path.join(__dirname, 'cache'),
  ttsCache: path.join(__dirname, 'cache', 'tts'),
  stateFile: path.join(__dirname, 'state.json'),
};

// 确保缓存目录 + 本地曲库目录存在
for (const d of [paths.cache, paths.ttsCache, config.musicDir]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}
