// Recurring tasks, quick capture (Cmd+J), and monthly/yearly review.

// ===== Recurring tasks =====
// A "template" task with a recurrence rule. When opening any date, we materialize
// pending templates into that date's todos (only once).
//
// state.recurring: [{ id, text, tag, rule: 'daily' | 'mon'|'tue'|... | 'monthly:15', startDate, lastSpawnedISO }]

function shouldSpawn(template, dateISO) {
  const d = new Date(dateISO);
  const dayIdx = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
  const dom = d.getDate();
  switch (template.rule) {
    case 'daily':   return true;
    case 'weekdays': return dayIdx <= 4;
    case 'mon': return dayIdx === 0;
    case 'tue': return dayIdx === 1;
    case 'wed': return dayIdx === 2;
    case 'thu': return dayIdx === 3;
    case 'fri': return dayIdx === 4;
    case 'sat': return dayIdx === 5;
    case 'sun': return dayIdx === 6;
    default:
      if (template.rule && template.rule.startsWith('monthly:')) {
        const n = parseInt(template.rule.split(':')[1], 10);
        return dom === n;
      }
      return false;
  }
}

// Spawn pending recurring tasks for "today" — call on app mount or date change
function spawnRecurringForToday(state, setState) {
  if (!state.recurring || state.recurring.length === 0) return;
  const today = todayISO();
  const todos = { ...(state.todos || {}) };
  let changed = false;
  state.recurring.forEach(tpl => {
    if (tpl.lastSpawnedISO === today) return; // already spawned today
    if (!shouldSpawn(tpl, today)) return;
    const list = todos[today] || [];
    // skip if already exists (avoid dupes from older client)
    if (list.some(t => t.recurringId === tpl.id)) return;
    todos[today] = [...list, {
      id: uid(),
      text: tpl.text,
      tag: tpl.tag || 'study',
      done: false,
      recurringId: tpl.id,
    }];
    changed = true;
  });
  if (changed) {
    const newRecurring = state.recurring.map(tpl => ({ ...tpl, lastSpawnedISO: today }));
    setState(s => ({ ...s, todos, recurring: newRecurring }));
  }
}

function RecurringManager({ open, onClose }) {
  const { state, setState } = useStore();
  const [text, setText] = _us('');
  const [rule, setRule] = _us('daily');
  const [tag, setTag] = _us('study');

  if (!open) return null;

  const list = state.recurring || [];

  const submit = () => {
    if (!text.trim()) return;
    const tpl = { id: uid(), text: text.trim(), tag, rule, lastSpawnedISO: null };
    setState(s => ({ ...s, recurring: [...(s.recurring || []), tpl] }));
    setText('');
  };

  const remove = (id) => {
    setState(s => ({ ...s, recurring: (s.recurring || []).filter(t => t.id !== id) }));
  };

  const ruleOptions = [
    { v: 'daily', l: '每天' },
    { v: 'weekdays', l: '工作日' },
    { v: 'mon', l: '每周一' },
    { v: 'tue', l: '每周二' },
    { v: 'wed', l: '每周三' },
    { v: 'thu', l: '每周四' },
    { v: 'fri', l: '每周五' },
    { v: 'sat', l: '每周六' },
    { v: 'sun', l: '每周日' },
    { v: 'monthly:1', l: '每月 1 号' },
    { v: 'monthly:15', l: '每月 15 号' },
  ];

  return (
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal" style={{ width: 520 }}>
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">重复任务 · Recurring</div>
          <div className="auth-sub">设定好之后，每到那天就会自动出现在「今日代办」里。</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {list.length === 0 && (
            <div className="encourage" style={{ padding: 12 }}>还没有重复任务。在下面加一个看看？</div>
          )}
          {list.map(tpl => (
            <div key={tpl.id} className="recurring-row">
              <div className="recurring-text">{tpl.text}</div>
              <div className="recurring-rule">{ruleOptions.find(o => o.v === tpl.rule)?.l || tpl.rule}</div>
              <button className="recurring-del" onClick={() => remove(tpl.id)} title="删除">×</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="任务内容…（如：复盘本周）"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
              borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 10,
              background: 'var(--surface-2)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={rule} onChange={(e) => setRule(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', fontSize: 13 }}>
              {ruleOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={tag} onChange={(e) => setTag(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', fontSize: 13 }}>
              <option value="study">学习</option>
              <option value="side">副业</option>
              <option value="health">健康</option>
              <option value="life">生活</option>
            </select>
            <button className="btn btn-primary" onClick={submit}>添加</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Quick capture — Cmd/Ctrl+J global shortcut =====
function QuickCapture() {
  const store = useStore();
  const [open, setOpen] = _us(false);
  const [text, setText] = _us('');
  const [kind, setKind] = _us('todo'); // todo | note | gratitude
  const inputRef = _ur(null);

  _ue(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  _ue(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setText('');
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const v = text.trim();
    if (!v) { setOpen(false); return; }
    if (kind === 'todo') {
      store.setTodos(todayISO(), list => [...list, { id: uid(), text: v, tag: 'study', done: false }]);
    } else if (kind === 'note') {
      store.updateField('notes', list => [{
        id: uid(), tag: 'IDEA', body: v, color: '', images: [], createdAt: Date.now(),
      }, ...list]);
    } else if (kind === 'gratitude') {
      const items = store.getGratitude(todayISO());
      const slot = items.findIndex(x => !x);
      if (slot >= 0) store.setGratitudeItem(todayISO(), slot, v);
      else store.setGratitudeItem(todayISO(), 0, v); // overflow into first
    }
    setOpen(false);
  };

  return (
    <div className="quick-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="quick-modal">
        <div className="quick-head">
          <div className="quick-icon">⌨</div>
          <div>
            <div className="quick-title">快速捕捉 · Quick Capture</div>
            <div className="quick-sub">⌘+J 任何时候召唤</div>
          </div>
          <button className="quick-close" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="quick-tabs">
          {[
            { k: 'todo', l: '✓ 加代办' },
            { k: 'note', l: '✍ 记笔记' },
            { k: 'gratitude', l: '🌿 记好事' },
          ].map(t => (
            <button key={t.k}
              className={`quick-tab ${kind === t.k ? 'active' : ''}`}
              onClick={() => setKind(t.k)}>
              {t.l}
            </button>
          ))}
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            kind === 'todo' ? '一件想做的事…  按回车保存' :
            kind === 'note' ? '一个想法、一段话、一句话…  按回车保存' :
            '今天发生了什么值得记下来的好事？'
          }
        />
        <div className="quick-foot">
          <span className="quick-hint">Enter 保存 · Esc 关闭</span>
          <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ===== Monthly stats =====
// (The standalone "月度回顾" modal and the History page were both removed — the Month
//  view's history paging now reuses computeMonthStats below for past-month summaries.)
function computeMonthStats(state, date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const inMonth = (iso) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  let totalTodos = 0, completedTodos = 0, totalPomos = 0, daysWithGratitude = 0, totalHabitDays = 0;

  Object.entries(state.todos || {}).forEach(([iso, list]) => {
    if (!inMonth(iso)) return;
    totalTodos += list.length;
    completedTodos += list.filter(t => t.done).length;
  });

  Object.entries(state.pomoCount || {}).forEach(([iso, n]) => {
    if (!inMonth(iso)) return;
    totalPomos += n;
  });

  Object.entries(state.gratitude || {}).forEach(([iso, items]) => {
    if (!inMonth(iso)) return;
    if (items.some(x => x && x.trim())) daysWithGratitude++;
  });

  const habitCounts = {};
  Object.entries(state.habitDays || {}).forEach(([hid, days]) => {
    let n = 0;
    Object.keys(days).forEach(iso => { if (inMonth(iso)) n++; });
    if (n > 0) habitCounts[hid] = n;
    totalHabitDays += n;
  });
  let topHabit = null;
  let topN = 0;
  Object.entries(habitCounts).forEach(([hid, n]) => {
    if (n > topN) {
      const h = (state.habits || []).find(h => h.id === hid);
      if (h) { topHabit = { ...h, count: n }; topN = n; }
    }
  });

  const notesCount = (state.notes || []).filter(n => n.createdAt && new Date(n.createdAt).getFullYear() === y && new Date(n.createdAt).getMonth() === m).length;
  const journalCount = (state.journal || []).filter(j => {
    const d = new Date(j.date);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;

  return {
    totalTodos, completedTodos, totalPomos, daysWithGratitude, totalHabitDays,
    topHabit, notesCount, journalCount,
  };
}

Object.assign(window, {
  spawnRecurringForToday, shouldSpawn, RecurringManager, QuickCapture, computeMonthStats,
});
