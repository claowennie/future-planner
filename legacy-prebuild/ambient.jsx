// Ambient soundscapes for the pomodoro — real field recordings, played as
// seamless loops via the Web Audio API. The loop files live in assets/ambient/
// (baked by claudio/tools/fetch-ambient.py from free CC0 / CC-BY sources; see
// assets/ambient/CREDITS.md). Each file is already a click-free loop, so we just
// play it with loop=true and crossfade gains when switching scenes / stopping.
// Swap any scene by dropping your own same-named mp3 into assets/ambient/.

const AMBIENT_OPTIONS = [
  { key: 'none', label: '无声 · Silence', emoji: '🤫' },
  { key: 'rain', label: '雨声 · Rain', emoji: '🌧️' },
  { key: 'forest', label: '森林 · Forest', emoji: '🌳' },
  { key: 'cafe', label: '咖啡馆 · Café', emoji: '☕' },
  { key: 'ocean', label: '海浪 · Ocean', emoji: '🌊' },
  { key: 'fire', label: '篝火 · Fire', emoji: '🔥' },
];

// 相对站点根：node 中枢(localhost:3000) 与 Netlify 都从同源托管 assets/，故相对路径两边都对。
const AMBIENT_BASE = 'assets/ambient/';

function createAmbientPlayer() {
  let ctx = null;
  let master = null;
  let userVol = 0.5;          // 0..1，来自音量滑块
  let current = 'none';
  let curSource = null;       // 当前在放的 AudioBufferSourceNode
  let curGain = null;         // 它的淡入淡出增益
  let loadToken = 0;          // 快速切换场景时防止旧的异步加载抢播
  const buffers = new Map();  // key -> 解码后的 AudioBuffer（缓存，只解一次）

  const ensureCtx = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = userVol;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const loadBuffer = async (key) => {
    if (buffers.has(key)) return buffers.get(key);
    const res = await fetch(AMBIENT_BASE + key + '.mp3');
    if (!res.ok) throw new Error('ambient fetch ' + res.status);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(key, buf);
    return buf;
  };

  // 把某个 source 淡出后停掉（切场景 / 停止时用），避免硬切的咔哒声。
  const fadeOut = (src, gain, dur = 0.5) => {
    if (!src || !gain || !ctx) return;
    const t = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.stop(t + dur + 0.05);
    } catch (e) { /* already stopped */ }
  };

  const stop = () => {
    current = 'none';
    loadToken++;                 // 作废任何进行中的加载
    fadeOut(curSource, curGain);
    curSource = null; curGain = null;
  };

  const play = async (key) => {
    if (key === 'none') return stop();
    if (!ensureCtx()) return;
    if (key === current && curSource) return;  // 已经在放这个场景了
    const token = ++loadToken;
    current = key;
    // 先淡出上一个场景，再起新的
    fadeOut(curSource, curGain);
    curSource = null; curGain = null;
    let buf;
    try { buf = await loadBuffer(key); }
    catch (e) { return; }                       // 文件缺失就静默兜底（不报错打断专注）
    if (token !== loadToken) return;            // 加载期间又切了别的场景 → 放弃
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;                            // 文件本身已是无缝循环
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.6);  // 淡入
    src.connect(g); g.connect(master);
    src.start();
    curSource = src; curGain = g;
  };

  const setVolume = (v) => {
    userVol = Math.max(0, Math.min(1, v));
    if (master && ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(userVol, t + 0.1);
    }
  };

  return { play, stop, setVolume };
}

const ambient = createAmbientPlayer();

// ===== Ambient selector UI (used inside pomodoro card) =====
function AmbientPicker({ value, onChange, volume, onVolume }) {
  const [open, setOpen] = _us(false);
  const cur = AMBIENT_OPTIONS.find(o => o.key === value) || AMBIENT_OPTIONS[0];
  return (
    <div className="ambient-picker">
      <button className="ambient-btn" onClick={() => setOpen(o => !o)} title="环境音">
        <span style={{ fontSize: 14 }}>{cur.emoji}</span>
        <span style={{ fontSize: 11 }}>{cur.label.split(' ·')[0]}</span>
      </button>
      {open && (
        <div className="ambient-panel" onMouseLeave={() => setOpen(false)}>
          <div className="ambient-options">
            {AMBIENT_OPTIONS.map(opt => (
              <button key={opt.key}
                className={`ambient-option ${opt.key === value ? 'active' : ''}`}
                onClick={() => { onChange(opt.key); }}>
                <span className="ambient-emoji">{opt.emoji}</span>
                <span className="ambient-label">{opt.label.split(' ·')[0]}</span>
              </button>
            ))}
          </div>
          <div className="ambient-volume">
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>音量</span>
            <input type="range" min="0" max="100" value={Math.round(volume * 100)}
              onChange={(e) => onVolume(parseInt(e.target.value, 10) / 100)} />
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ambient, AMBIENT_OPTIONS, AmbientPicker });
