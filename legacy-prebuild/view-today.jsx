// ===== Inline-editable name (click to edit) =====
function NameEditor() {
  const { state, updateField } = useStore();
  const [editing, setEditing] = _us(false);
  const inputRef = _ur(null);
  const [draft, setDraft] = _us(state.name || '');

  _ue(() => { setDraft(state.name || ''); }, [state.name]);
  _ue(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== state.name) updateField('name', v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { setDraft(state.name || ''); setEditing(false); }
        }}
        placeholder="你的名字…"
        maxLength={20}
      />
    );
  }
  return (
    <button className="name-display" onClick={() => setEditing(true)} title="点击修改称呼">
      {state.name || '朋友'}
    </button>
  );
}

// ===== OKR strip — 年度目标在今日页的一条细带 =====
// 让 OKR 每天都被看见：每个目标一截小进度条；今天完成的挂靠待办会在右侧计数。
// 点击整条跳去「年度」页。没有设定 OKR 时显示一句轻提示。
function OkrStrip() {
  const { state } = useStore();
  const okrs = state.okrs || [];
  const goYear = () => window.__appNavigate?.('year');

  if (okrs.length === 0) {
    return (
      <button className="okr-strip empty" onClick={goYear}>
        <span className="okr-strip-label">年度目标</span>
        <span className="okr-strip-note">还没有年度目标 — 去「年度」页种下第一个 →</span>
      </button>
    );
  }

  const todayLinkedDone = (state.todos?.[todayISO()] || []).filter(t => t.okrId && t.done).length;
  return (
    <button className="okr-strip" onClick={goYear} title="查看年度目标">
      <span className="okr-strip-label">年度目标</span>
      {okrs.map(o => {
        const pct = o.krs.length === 0 ? 0 : Math.round(
          o.krs.reduce((sum, k) => sum + Math.min(1, (k.cur || 0) / (k.max || 1)), 0) / o.krs.length * 100
        );
        const color = window.okrColor(o.icon);
        return (
          <span className="okr-strip-item" key={o.id} title={`${o.name} · ${pct}%`}>
            <span className="okr-strip-initial serif" style={{ color }}>{o.initial}</span>
            <span className="okr-strip-bar"><span style={{ width: pct + '%', background: color }}/></span>
            <span className="okr-strip-pct">{pct}%</span>
          </span>
        );
      })}
      <span className="okr-strip-note">
        {todayLinkedDone > 0 ? `今天为目标推进了 ${todayLinkedDone} 件事 🌱` : '今天还没为目标做点什么'}
      </span>
    </button>
  );
}

// Today view — the centerpiece.
const TodayView = () => {
  const store = useStore();
  const { state, getTodos, setTodos, habitStreak } = store;
  const now = new Date();
  const greeting = greetingFor(now);
  const today = todayISO();

  const todayTodos = getTodos(today);

  const addTodo = (text) => store.addTodo(today, { id: uid(), text, tag: 'study', done: false });

  const total = todayTodos.length;
  const done = todayTodos.filter(t => t.done).length;
  const pomoCount = store.getPomoCount(today);

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            {greeting}，<NameEditor />。
          </div>
          <div className="greeting-sub">
            {fmtMD(now)} · 周{WEEKDAY_CN[getMonIndex(now)]} · 今天计划了 {total} 件事，已完成 {done} 件。
          </div>
        </div>
        <window.SelfNote />
      </div>

      <window.GrowthStatusPill streak={store.overallStreak} />

      <OkrStrip />

      <div className="grid grid-today">
        {/* Todos — spans across both rows on left */}
        <div className="card" style={{ gridRow: 'span 2' }}>
          <div className="card-header">
            <div className="card-title"><Icon.Sun /> 今日代办 · Today</div>
            <div className="card-meta">{done}/{total} 已完成</div>
          </div>
          <div className="todo-list">
            <TodoRows iso={today} />
            <TodoAdd onAdd={addTodo} placeholder="加一件今天要做的事…  ↵" />
          </div>
        </div>

        {/* Pomodoro */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Timer /> 番茄钟 · Focus</div>
            <div className="card-meta">今日 {pomoCount} 个</div>
          </div>
          <Pomodoro />
        </div>

        {/* Habits */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Sparkle /> 习惯打卡 · Habits</div>
            <div className="card-meta">本周</div>
          </div>
          <HabitTracker />
        </div>
      </div>

      {/* Reflection row */}
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card card-warm">
          <div className="card-header">
            <div className="card-title"><Icon.Heart /> 五件好事 · Five Good Things</div>
            <div className="card-meta serif" style={{ fontStyle: 'italic' }}>今天发生的小确幸</div>
          </div>
          <GratitudeList />
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Book /> 今日心得 · Reflection</div>
            <div className="card-meta">睡前 5 分钟</div>
          </div>
          <Reflection />
        </div>
      </div>
    </div>
  );
};

// ===== Pomodoro with editable durations =====
function Pomodoro() {
  const store = useStore();
  const { state, updateField, incPomoCount } = store;
  const focusSec = state.pomoFocus || 1500;
  const breakSec = state.pomoBreak || 300;

  // Wall-clock pomodoro, persisted across navigation. The Today view unmounts
  // when you switch pages (e.g. to Claudio), which used to reset the countdown
  // every time. We persist {mode, running, endAt, remaining} to localStorage and
  // derive the time left from a real timestamp (endAt) — so leaving and coming
  // back keeps the timer honest, and a phase that finished while you were away
  // is processed on return (counts the pomodoro + switches mode).
  const POMO_KEY = 'pomo_timer_v1';
  const loadTimer = () => {
    try { const s = JSON.parse(localStorage.getItem(POMO_KEY)); if (s && s.mode) return s; } catch {}
    return { mode: 'focus', running: false, endAt: null, remaining: focusSec };
  };
  const [timer, setTimer] = _us(loadTimer);
  const timerRef = _ur(timer); timerRef.current = timer;
  const [editing, setEditing] = _us(false);

  const [ambientKey, setAmbientKey] = _us(() => localStorage.getItem('ambient_key') || 'none');
  const [ambientVol, setAmbientVol] = _us(() => parseFloat(localStorage.getItem('ambient_vol') || '0.35'));

  const mode = timer.mode;
  const running = timer.running;
  const remaining = Math.max(0, timer.remaining || 0);

  const setAmbient = (k) => {
    setAmbientKey(k);
    localStorage.setItem('ambient_key', k);
    if (running) window.ambient?.play(k);
  };
  const changeVolume = (v) => {
    setAmbientVol(v);
    localStorage.setItem('ambient_vol', String(v));
    window.ambient?.setVolume(v);
  };

  // Persist on every change so navigation / reload restores the live timer.
  _ue(() => { try { localStorage.setItem(POMO_KEY, JSON.stringify(timer)); } catch {} }, [timer]);

  // The single tick: recompute remaining from the real clock; when a phase ends,
  // count the pomodoro (focus only) and auto-switch — focus → break (auto-started
  // so the rest begins on its own), break → focus (idle, ready for next round).
  const tick = () => {
    const t = timerRef.current;
    if (!t.running || !t.endAt) return;
    const rem = Math.ceil((t.endAt - Date.now()) / 1000);
    if (rem > 0) { if (rem !== t.remaining) setTimer({ ...t, remaining: rem }); return; }
    if (t.mode === 'focus') {
      incPomoCount(todayISO());
      setTimer({ mode: 'break', running: true, endAt: Date.now() + breakSec * 1000, remaining: breakSec });
    } else {
      setTimer({ mode: 'focus', running: false, endAt: null, remaining: focusSec });
    }
  };

  // Catch up on mount (handles "finished while away") + tick every second while
  // running. timerRef lets `tick` read the latest state without re-subscribing.
  _ue(() => {
    tick();
    if (!timerRef.current.running) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer.running, focusSec, breakSec]);

  // Editing the durations while idle resets the shown time to the new length —
  // but skip the first run so a persisted paused timer isn't wiped on load.
  const durInit = _ur(false);
  _ue(() => {
    if (!durInit.current) { durInit.current = true; return; }
    if (!timerRef.current.running) {
      setTimer(x => ({ ...x, endAt: null, remaining: x.mode === 'focus' ? focusSec : breakSec }));
    }
  }, [focusSec, breakSec]);

  // Ambient sound follows running + focus.
  _ue(() => {
    if (running && mode === 'focus' && ambientKey !== 'none') {
      window.ambient?.setVolume(ambientVol);
      window.ambient?.play(ambientKey);
    } else {
      window.ambient?.stop();
    }
  }, [running, mode, ambientKey]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const total = mode === 'focus' ? focusSec : breakSec;
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

  const toggle = () => {
    const t = timerRef.current;
    if (t.running) {
      const rem = t.endAt ? Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) : t.remaining;
      setTimer({ ...t, running: false, endAt: null, remaining: rem });
    } else {
      const rem = t.remaining > 0 ? t.remaining : (t.mode === 'focus' ? focusSec : breakSec);
      setTimer({ ...t, running: true, endAt: Date.now() + rem * 1000, remaining: rem });
    }
  };
  const reset = () => setTimer(t => ({ mode: t.mode, running: false, endAt: null, remaining: t.mode === 'focus' ? focusSec : breakSec }));
  const switchMode = () => setTimer(t => {
    const next = t.mode === 'focus' ? 'break' : 'focus';
    return { mode: next, running: false, endAt: null, remaining: next === 'focus' ? focusSec : breakSec };
  });
  const todayCount = store.getPomoCount(todayISO());

  return (
    <div className="pomo">
      <div className="pomo-mode">
        {mode === 'focus' ? '专注 · Focus' : '休息 · Break'}
        <button
          onClick={() => setEditing(e => !e)}
          style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
          title="编辑时长">
          {editing ? '✕' : '⚙'}
        </button>
      </div>

      {editing ? (
        <div style={{ padding: '14px 8px', background: 'var(--surface-2)', borderRadius: 10, margin: '6px 0 4px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>专注 · Focus</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoFocus', Math.max(60, focusSec - 60))}>−</button>
              <span className="mono" style={{ minWidth: 48, textAlign: 'center', fontSize: 14, color: 'var(--ink)' }}>{Math.round(focusSec/60)} min</span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoFocus', Math.min(120*60, focusSec + 60))}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>休息 · Break</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoBreak', Math.max(60, breakSec - 60))}>−</button>
              <span className="mono" style={{ minWidth: 48, textAlign: 'center', fontSize: 14, color: 'var(--ink)' }}>{Math.round(breakSec/60)} min</span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoBreak', Math.min(60*60, breakSec + 60))}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>
            预设：
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 25*60); updateField('pomoBreak', 5*60); }}>25/5</button>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 50*60); updateField('pomoBreak', 10*60); }}>50/10</button>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 90*60); updateField('pomoBreak', 20*60); }}>90/20</button>
          </div>
        </div>
      ) : (
        <>
          <div className="pomo-time">{mm}:{ss}</div>
          <div className="pomo-progress"><div className="pomo-progress-fill" style={{ width: progress + '%' }} /></div>
          <div className="pomo-controls">
            <button className={`btn ${running ? '' : 'btn-primary'}`} onClick={toggle}>
              {running ? <><Icon.Pause /> 暂停</> : <><Icon.Play /> 开始</>}
            </button>
            <button className="btn btn-ghost" onClick={reset}><Icon.Reset /> 重置</button>
            <button className="btn btn-ghost" onClick={switchMode}>切换</button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            {window.AmbientPicker && (
              <window.AmbientPicker value={ambientKey} onChange={setAmbient} volume={ambientVol} onVolume={changeVolume} />
            )}
          </div>
        </>
      )}

      <div className="pomo-stats">
        <span>今日已完成</span>
        <span>
          <span className="tomato">
            {Array.from({ length: 6 }).map((_, i) =>
              <span key={i} className={`tomato-dot ${i < todayCount ? 'filled' : ''}`} />
            )}
            {todayCount > 6 && <span style={{ fontSize: 10, color: 'var(--warm)', marginLeft: 4 }}>+{todayCount - 6}</span>}
          </span>
        </span>
      </div>
    </div>
  );
}

// ===== Habits — editable: add / rename / delete =====
function HabitTracker() {
  const store = useStore();
  const { state, getHabit, toggleHabit, habitStreak, habitTotal, addHabit, updateHabit, removeHabit, reorderHabits } = store;
  const now = new Date();
  const wDates = weekDates(now).map(toISO);
  const todayIdx = getMonIndex(now);

  const [editing, setEditing] = _us(false);
  const [newName, setNewName] = _us('');
  const [newEmoji, setNewEmoji] = _us('🌱');
  const [dragIdx, setDragIdx] = _us(null);
  const [overIdx, setOverIdx] = _us(null);

  const endDrag = () => { setDragIdx(null); setOverIdx(null); };

  const emojiPalette = ['🌱','🌿','🌳','🍃','🌸','🌻','🌅','📖','🏃','💧','🧘','🎨','💪','✍️','🎵','☕','🥗','📝','🎯','⏰','🧠','💡','🌙','☀️'];

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    addHabit(name, newEmoji);
    setNewName(''); setNewEmoji('🌱');
  };

  return (
    <div className="habit-list">
      <div className="habit-head-row">
        <div></div>
        {WEEKDAY_CN.map((d, i) =>
          <div key={i} className="habit-head-cell">{d}</div>
        )}
        <button
          onClick={() => setEditing(e => !e)}
          className={`habit-head-edit ${editing ? 'active' : ''}`}
          title="编辑">
          {editing ? '完成' : '✎'}
        </button>
      </div>

      {state.habits.map((h, idx) => {
        const streak = habitStreak(h.id);
        const total = habitTotal(h.id);
        return (
          <div
            className={`habit-row ${editing ? 'editing' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'drag-over' : ''} ${dragIdx === idx ? 'dragging' : ''}`}
            key={h.id}
            onDragOver={editing ? (e) => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); } : undefined}
            onDrop={editing ? (e) => { e.preventDefault(); if (dragIdx !== null) reorderHabits(dragIdx, idx); endDrag(); } : undefined}>
            <div className="habit-name">
              {editing && (
                <span
                  className="habit-drag"
                  draggable
                  onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={endDrag}
                  title="拖动调整顺序">⠿</span>
              )}
              {editing ? (
                <>
                  <select className="habit-edit-emoji" value={h.emoji} onChange={(e) => updateHabit(h.id, { emoji: e.target.value })}>
                    {[h.emoji, ...emojiPalette.filter(x => x !== h.emoji)].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input
                    className="habit-edit-input"
                    value={h.name}
                    onChange={(e) => updateHabit(h.id, { name: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <span className="habit-emoji">{h.emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                </>
              )}
            </div>
            {wDates.map((iso, i) => {
              const done = getHabit(h.id, iso);
              return (
                <button key={i}
                  className={`habit-day ${done ? 'done' : ''} ${i === todayIdx ? 'today' : ''}`}
                  onClick={() => toggleHabit(h.id, iso)}
                  title={`${iso} · 周${WEEKDAY_CN[i]}`}>
                  {done ? '·' : ''}
                </button>
              );
            })}
            {editing ? (
              <button className="habit-delete-btn" onClick={() => { if (confirm(`删除习惯「${h.name}」？`)) removeHabit(h.id); }}>
                删
              </button>
            ) : (
              <div className="habit-streak" title={`已打卡 ${total} 天${streak > 0 ? ` · 当前连续 ${streak} 天` : ''}`}>
                {streak > 0 && <span className="habit-streak-fire">🔥{streak}</span>}
                {total > 0 && <span className="habit-total">{total}天</span>}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <div className="habit-add-row">
          <div className="left">
            <select className="habit-edit-emoji" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)}>
              {emojiPalette.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input
              placeholder="新习惯名称…  ↵"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); }}
            />
          </div>
          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={submitNew}>添加</button>
        </div>
      )}

      {!editing && state.habits.length === 0 && (
        <div className="encourage" style={{ padding: 12 }}>点击 ✎ 添加你的第一个习惯</div>
      )}
    </div>
  );
}

// ===== Gratitude (Five Good Things) =====
function GratitudeList() {
  const store = useStore();
  const today = todayISO();
  const items = store.getGratitude(today);
  const placeholders = [
    '一件让你今天笑了一下的事…',
    '一件你为自己骄傲的事…',
    '一个想要谢谢的人或瞬间…',
    '一个意外的小温暖…',
    '一件平凡但珍贵的事…',
  ];
  return (
    <div className="gratitude-list">
      {[0,1,2,3,4].map(i => (
        <div className="gratitude-item" key={i}>
          <div className="gratitude-num">{i+1}.</div>
          <textarea
            className="gratitude-input"
            value={items[i] || ''}
            placeholder={placeholders[i]}
            onChange={(e) => store.setGratitudeItem(today, i, e.target.value)}
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }} />
        </div>
      ))}
    </div>
  );
}

// ===== Reflection =====
function Reflection() {
  const store = useStore();
  const today = todayISO();
  const value = store.getReflection(today);
  const [prompt] = _us(() => {
    const d = new Date();
    const idx = (d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate()) % window.REFLECTION_PROMPTS.length;
    return window.REFLECTION_PROMPTS[idx];
  });
  return (
    <div>
      <div className="reflection-prompt">{prompt}</div>
      <textarea
        className="reflection-textarea"
        value={value}
        onChange={(e) => store.setReflection(today, e.target.value)}
        placeholder="今天的我，想对自己说点什么…" />
    </div>
  );
}

Object.assign(window, { TodayView, Pomodoro, HabitTracker, GratitudeList, Reflection, NameEditor, OkrStrip });
