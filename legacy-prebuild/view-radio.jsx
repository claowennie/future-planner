// 电台 · Claudio —— 个人 AI 电台界面。
// 跟本地中枢（默认 http://localhost:3000）对话：你说一句 → Claude 先跟你聊（reply），
// 聊到合适时再排一段歌单（set，可能为空＝纯聊天）。每首歌带「风格色相 hue」给播放器上色。
// 切歌 / 开口前都会先暂停当前歌曲，让 DJ 的话不被音乐盖住。
const { useState: _us, useEffect: _ue, useRef: _ur } = React;

// API 基址：优先 localStorage('claudio_base') 覆盖；否则用「当前页面同源」——这样从电脑
// localhost:3000、局域网 IP、或 Tailscale 私有 IP 打开都自动对（中枢前端与 API 同端口同源）；
// file:// 等非 http 场景兜底 localhost:3000。
const CLAUDIO_BASE =
  (typeof localStorage !== 'undefined' && localStorage.getItem('claudio_base')) ||
  ((typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol))
    ? window.location.origin
    : 'http://localhost:3000');

// 音量平衡：音乐母带偏响、DJ 的 TTS 偏轻，听感差很多。把音乐压低，并用 Web Audio
// 给 DJ 语音加增益（HTML <audio> 元素音量上限是 1，Web Audio 的 GainNode 能超过 1），
// 让两者听感拉平，不用每次手动调音量。觉得还想再调就改这两个数。
const MUSIC_VOLUME = 0.55; // 音乐播放音量（0~1）
const TTS_GAIN = 2.0;      // DJ 语音增益倍数（可 >1）

// 去掉 lrc 时间轴，留纯歌词
function stripLrc(lrc) {
  if (!lrc) return '';
  return lrc.replace(/\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
}

// 每首歌的「风格色相」(0~359)：优先用大脑给的 hue（按歌的气质上色），
// 拿不到就用「歌手+歌名」哈希兜底——保证每首都有稳定且互不相同的色调。
function hueFor(t) {
  if (t && Number.isFinite(Number(t.hue))) return ((Math.round(Number(t.hue)) % 360) + 360) % 360;
  const s = `${(t && t.artist) || ''}${(t && t.title) || ''}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function RadioView() {
  const [status, setStatus] = _us('connecting'); // connecting | online | offline
  const [health, setHealth] = _us(null);
  const [input, setInput] = _us('');
  const [thinking, setThinking] = _us(false);
  const [log, setLog] = _us([]);            // [{role:'you'|'claudio', text}]
  const [queue, setQueue] = _us([]);         // tracks
  const [idx, setIdx] = _us(0);
  const [now, setNow] = _us(null);           // 当前曲目
  const [playing, setPlaying] = _us(false);  // 音乐是否正在播放（驱动播放指示条动画）
  const [err, setErr] = _us('');
  // Claudio 说哪种语言：'en' 英文 / 'zh' 中文。持久记住做默认；对话里也能临时说「说中文」切换。
  const [lang, setLang] = _us(() => (typeof localStorage !== 'undefined' && localStorage.getItem('claudio_lang')) || 'en');
  const setLangPersist = (l) => { setLang(l); try { localStorage.setItem('claudio_lang', l); } catch { /* ignore */ } };

  const musicRef = _ur(null);
  const sayRef = _ur(null);
  const playTokenRef = _ur(0); // 防止用户切歌时多个播放序列打架
  const audioCtxRef = _ur(null);
  const ttsGainRef = _ur(null);
  const ttsCacheRef = _ur(new Map()); // audioUrl -> 本地 blob objectURL，避免手机经慢链路边下边播卡壳

  // 懒初始化：给 DJ 语音那个 <audio> 接上 Web Audio 增益链（只能接一次）。
  // 必须在用户手势触发的播放里调用，AudioContext 才能 resume（绕过自动播放限制）。
  const ensureTtsBoost = () => {
    try {
      if (!ttsGainRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !sayRef.current) return;
        const ctx = new AC();
        const src = ctx.createMediaElementSource(sayRef.current);
        const gain = ctx.createGain();
        gain.gain.value = TTS_GAIN;
        src.connect(gain).connect(ctx.destination);
        audioCtxRef.current = ctx;
        ttsGainRef.current = gain;
      }
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
    } catch { /* Web Audio 不可用就用原音量兜底 */ }
  };

  // 移动端音频解锁：iOS/安卓禁止非用户手势的自动播放，且每个 <audio> 必须在手势里「响过一次」
  // 之后才允许用代码 .play()。用户第一次点击（send / 快捷键）时，趁这个手势同步给两个 <audio>
  // 各放一小段静音 + 唤醒 AudioContext —— 这样后续串场语音、自动接下一首才出得了声（桌面端无害）。
  const audioUnlockedRef = _ur(false);
  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  const unlockAudio = () => {
    ensureTtsBoost();
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    for (const el of [musicRef.current, sayRef.current]) {
      if (!el) continue;
      try {
        el.muted = true;
        const prev = el.getAttribute('src');
        el.src = SILENT_WAV;
        const restore = () => { try { el.pause(); el.muted = false; el.currentTime = 0; if (prev) el.src = prev; else el.removeAttribute('src'); } catch { /* ignore */ } };
        const p = el.play();
        if (p && p.then) p.then(restore).catch(() => { el.muted = false; });
        else restore();
      } catch { try { el.muted = false; } catch { /* ignore */ } }
    }
  };

  // 探活：离线时每 2s 重试（中枢可能比页面晚几秒起来，尤其有代理自举时），
  // 在线后每 10s 慢心跳以便中枢挂掉时能察觉。绝不一次失败就永久离线。
  _ue(() => {
    let alive = true;
    let timer = null;
    const probe = () => {
      fetch(`${CLAUDIO_BASE}/api/health`)
        .then((r) => r.json())
        .then((h) => { if (alive) { setHealth(h); setStatus('online'); schedule(10000); } })
        .catch(() => { if (alive) { setStatus('offline'); schedule(2000); } });
    };
    const schedule = (ms) => { if (alive) timer = setTimeout(probe, ms); };
    probe();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  // 进场时把音乐音量压到 MUSIC_VOLUME，和被增益放大的 DJ 语音拉平。只设一次，
  // 之后你手动拖动音量条的调整会保留（换歌不重置）。
  _ue(() => { if (musicRef.current) musicRef.current.volume = MUSIC_VOLUME; }, []);

  // 预取一段 TTS 为本地 blob（手机经慢链路时整段下完再播才不卡）。返回 objectURL 或 null，结果进缓存。
  const prefetchTts = async (audioUrl) => {
    if (!audioUrl) return null;
    const cache = ttsCacheRef.current;
    if (cache.has(audioUrl)) return cache.get(audioUrl);
    try {
      const r = await fetch(`${CLAUDIO_BASE}${audioUrl}`);
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      cache.set(audioUrl, obj);
      return obj;
    } catch { return null; }
  };

  // 朗读串场词：有 Fish 音频用音频，否则用浏览器语音。返回 Promise，播完 resolve。
  const speak = (text, audioUrl) => new Promise((resolve) => {
    if (!text) return resolve();
    if (audioUrl) {
      const a = sayRef.current;
      ensureTtsBoost(); // 接上增益链并唤醒 AudioContext（此刻在用户手势链路里）
      a.onended = resolve;
      a.onerror = resolve;
      // 先把整段语音下成本地 blob 再播——手机经 Tailscale 慢链路时，边下边播会欠载卡壳，
      // 整段缓冲好再播就顺了；拿不到 blob 就退回直连流式。
      prefetchTts(audioUrl).then((obj) => {
        a.src = obj || `${CLAUDIO_BASE}${audioUrl}`;
        a.play().catch(resolve);
      });
      return;
    }
    if (typeof speechSynthesis !== 'undefined') {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return;
    }
    setTimeout(resolve, 1500);
  });

  // 停掉正在放的歌（切歌 / DJ 要说话前用）。返回它在停之前是否正在播。
  const stopMusic = () => {
    const a = musicRef.current;
    const wasPlaying = !!(a && !a.paused && !a.ended);
    if (a) { try { a.pause(); } catch { /* ignore */ } }
    return wasPlaying;
  };

  // 播放队列里某一首：先停上一首，再念这首的介绍（语音），最后放歌。连续电台的核心。
  const playAt = async (i, tracks = queue) => {
    const t = tracks[i];
    if (!t) return;
    const token = ++playTokenRef.current;
    setIdx(i);
    setNow(t);

    // 关键：切歌时立刻暂停上一首，别让它盖过 DJ 的介绍（有好的听感的前提）。
    stopMusic();

    // 把这首的介绍打进对话记录（DJ 在说话），再朗读出来
    if (t.intro) setLog((l) => [...l, { role: 'claudio', text: t.intro }]);
    await speak(t.intro, t.introAudio);
    if (token !== playTokenRef.current) return; // 期间用户切了别的，放弃

    const a = musicRef.current;
    if (t.url) {
      // 本地曲库给的是 /media/... 相对路径，补上中枢地址；网易/QQ 给的是完整 http 链接
      a.src = t.url.startsWith('http') ? t.url : `${CLAUDIO_BASE}${t.url}`;
      a.play().catch(() => {});
    } else if (i + 1 < tracks.length) {
      // 这首没拿到直链 → 直接跳到下一首（别卡住整台）
      playAt(i + 1, tracks);
    }
  };

  // 一首放完 → 自动接下一首（连续播）
  const onTrackEnded = () => {
    if (idx + 1 < queue.length) playAt(idx + 1);
  };

  const send = async (text) => {
    unlockAudio(); // 趁用户点击的手势解锁移动端音频（仅首次真正解锁）
    const msg = (text ?? input).trim();
    setErr('');
    setInput('');
    setLog((l) => [...l, { role: 'you', text: msg || '（随便放点）' }]);
    setThinking(true);
    try {
      const res = await fetch(`${CLAUDIO_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg, lang }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLog((l) => [...l, { role: 'claudio', text: data.say }]);
      const tracks = data.tracks || [];
      // 手机优化：本轮全部语音（opener + 各 intro）立刻并行预取成本地 blob，播放零等待不卡
      prefetchTts(data.sayAudio);
      tracks.forEach((t) => prefetchTts(t.introAudio));
      setThinking(false);

      if (tracks.length) {
        // 排了歌：停掉当前歌 → 念回应 → 进入"介绍→放歌→下一首"的连续流
        setQueue(tracks);
        setIdx(0);
        stopMusic();
        await speak(data.say, data.sayAudio);
        playAt(0, tracks);
      } else {
        // 纯聊天回合（Claudio 先跟你聊、还没放歌）：暂停当前歌让它说话，说完接着放，
        // 不打断你正在听的歌，也不清空已有队列。
        const resume = stopMusic();
        await speak(data.say, data.sayAudio);
        if (resume) { try { musicRef.current.play().catch(() => {}); } catch { /* ignore */ } }
      }
    } catch (e) {
      setThinking(false);
      setErr(String(e.message || e));
    }
  };

  const quicks = [
    { label: '🎧 随便放点', text: '' },
    { label: '💻 我在工作', text: '我在专注工作，给我点不分心的' },
    { label: '😮‍💨 我有点累', text: '今天有点累，来点温柔的' },
    { label: '🌙 深夜了', text: '深夜了，放点适合现在的' },
  ];

  return (
    <div className="main-inner radio">
      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">Claudio</span> · 你的 AI 电台</div>
          <div className="greeting-sub">先跟我聊两句 —— 我顺着你的话，给你放歌。</div>
        </div>
        <div className="radio-hero-right">
          {/* Claudio 说哪种语言：点一下切换、持久记住。对话里也能直接说「说中文 / speak English」临时切。 */}
          <div className="radio-lang" role="group" aria-label="Claudio 语言">
            <button
              className={`radio-lang-btn ${lang === 'zh' ? 'active' : ''}`}
              onClick={() => setLangPersist('zh')}
              title="Claudio 说中文">中</button>
            <button
              className={`radio-lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLangPersist('en')}
              title="Claudio speaks English">EN</button>
          </div>
          <div className={`radio-status radio-status-${status}`}>
            <span className="dot" />
            {status === 'online' && '中枢在线'}
            {status === 'connecting' && '连接中…'}
            {status === 'offline' && '中枢离线'}
          </div>
        </div>
      </div>

      {status === 'offline' && (
        <div className="radio-offline-hint">
          没连上本地中枢。请先在 <code>claudio/server</code> 里跑 <code>npm install</code> 然后 <code>npm start</code>，
          确认它监听在 <code>{CLAUDIO_BASE}</code>。
        </div>
      )}

      {/* 当前播放 —— 整张卡片的色调由这首歌的「风格色相」驱动（--rad-h），换歌平滑过渡 */}
      <div className="radio-now" style={{ '--rad-h': now ? hueFor(now) : 220 }}>
        {now ? (
          <div className={`radio-now-card ${playing ? 'is-playing' : ''}`}>
            <div className="radio-cover-wrap">
              {now.cover
                ? <img className="radio-cover" src={now.cover} alt="" />
                : <div className="radio-cover radio-cover-blank">♪</div>}
              {/* 播放指示条：正在放歌时跳动 */}
              <div className="radio-eq" aria-hidden="true"><span /><span /><span /><span /></div>
            </div>
            <div className="radio-now-meta">
              <div className="radio-now-kicker">{playing ? 'NOW PLAYING' : 'PAUSED'}</div>
              <div className="radio-now-title">{now.title || '未知曲目'}</div>
              <div className="radio-now-artist">{now.artist || ''}</div>
              {now.unresolved && <div className="radio-warn">没找到这首的直链（版权受限或没搜到，已自动跳过）</div>}
              {!now.url && !now.unresolved && <div className="radio-warn">无可播放链接</div>}
            </div>
          </div>
        ) : (
          <div className="radio-now-empty">还没开始播。跟 Claudio 说句话，或点下面任意一个 👇</div>
        )}
        <audio
          ref={musicRef}
          controls
          onEnded={() => { setPlaying(false); onTrackEnded(); }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="radio-audio"
        />
        {/* crossOrigin 必须设：DJ 语音从 localhost:3000 跨域来，不设的话 Web Audio 增益会被浏览器静音 */}
        <audio ref={sayRef} crossOrigin="anonymous" className="radio-audio-hidden" />
      </div>

      {/* 队列 */}
      {queue.length > 1 && (
        <div className="radio-queue">
          <div className="radio-queue-label">接下来</div>
          {queue.map((t, i) => (
            <button key={i} className={`radio-queue-item ${i === idx ? 'active' : ''}`} onClick={() => playAt(i)} style={{ '--rad-h': hueFor(t) }}>
              <span className="radio-queue-dot" />
              <span className="radio-queue-t">{t.title}</span>
              <span className="radio-queue-a">{t.artist}</span>
            </button>
          ))}
        </div>
      )}

      {/* 对话/串场记录 */}
      <div className="radio-log">
        {log.map((m, i) => (
          <div key={i} className={`radio-bubble radio-bubble-${m.role}`}>
            {m.role === 'claudio' && <span className="radio-dj-tag">DJ</span>}
            {m.text}
          </div>
        ))}
        {thinking && <div className="radio-bubble radio-bubble-claudio radio-thinking">Claudio 正在想…</div>}
        {err && <div className="radio-err">出错：{err}</div>}
      </div>

      {/* 快捷 + 输入 */}
      <div className="radio-quicks">
        {quicks.map((q) => (
          <button key={q.label} className="radio-quick" disabled={thinking || status !== 'online'} onClick={() => send(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="radio-compose">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="跟 Claudio 说点什么…（想听什么 / 现在的心情）"
          disabled={status !== 'online'}
        />
        <button onClick={() => send()} disabled={thinking || status !== 'online'}>播</button>
      </div>
    </div>
  );
}

window.RadioView = RadioView;
