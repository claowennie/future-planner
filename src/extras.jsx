// Recurring tasks, quick capture (Cmd+J), and monthly/yearly review.
import { _us, _ue, _ur } from './hooks.js';
import { t } from './i18n.js';
import { useStore, todayISO, uid, toISO } from './store.jsx';

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
    if (list.some(td => td.recurringId === tpl.id)) return;
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
  const { state, setState, removeEntity } = useStore();
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
    removeEntity('recurring', id);   // filter + 墓碑，删除才能跨设备传播
  };

  const ruleOptions = [
    { v: 'daily', l: t('recurring.daily') },
    { v: 'weekdays', l: t('recurring.weekdays') },
    { v: 'mon', l: t('recurring.mon') },
    { v: 'tue', l: t('recurring.tue') },
    { v: 'wed', l: t('recurring.wed') },
    { v: 'thu', l: t('recurring.thu') },
    { v: 'fri', l: t('recurring.fri') },
    { v: 'sat', l: t('recurring.sat') },
    { v: 'sun', l: t('recurring.sun') },
    { v: 'monthly:1', l: t('recurring.monthly1') },
    { v: 'monthly:15', l: t('recurring.monthly15') },
  ];

  return (
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal" style={{ width: 520 }}>
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('recurring.title')}</div>
          <div className="auth-sub">{t('recurring.sub')}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {list.length === 0 && (
            <div className="encourage" style={{ padding: 12 }}>{t('recurring.empty')}</div>
          )}
          {list.map(tpl => (
            <div key={tpl.id} className="recurring-row">
              <div className="recurring-text">{tpl.text}</div>
              <div className="recurring-rule">{ruleOptions.find(o => o.v === tpl.rule)?.l || tpl.rule}</div>
              <button className="recurring-del" onClick={() => remove(tpl.id)} title={t('recurring.del')}>×</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('recurring.ph')}
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
              <option value="study">{t('recurring.tagStudy')}</option>
              <option value="side">{t('recurring.tagSide')}</option>
              <option value="health">{t('recurring.tagHealth')}</option>
              <option value="life">{t('recurring.tagLife')}</option>
            </select>
            <button className="btn btn-primary" onClick={submit}>{t('common.add')}</button>
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
            <div className="quick-title">{t('quick.title')}</div>
            <div className="quick-sub">{t('quick.sub')}</div>
          </div>
          <button className="quick-close" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="quick-tabs">
          {[
            { k: 'todo', l: t('quick.tabTodo') },
            { k: 'note', l: t('quick.tabNote') },
            { k: 'gratitude', l: t('quick.tabGratitude') },
          ].map(tab => (
            <button key={tab.k}
              className={`quick-tab ${kind === tab.k ? 'active' : ''}`}
              onClick={() => setKind(tab.k)}>
              {tab.l}
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
            kind === 'todo' ? t('quick.phTodo') :
            kind === 'note' ? t('quick.phNote') :
            t('quick.phGratitude')
          }
        />
        <div className="quick-foot">
          <span className="quick-hint">{t('quick.hint')}</span>
          <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>{t('quick.save')}</button>
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
    totalTodos += list.filter(td => !td.migrated).length;   // 已迁移存根在新日期重算
    completedTodos += list.filter(td => td.done).length;
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

// ===== Weekly stats — 本周回顾（纯本地统计版）=====
// 给一周（weekStart = 周一 0 点）算足迹：完成待办数、周内最长连续打卡、番茄数，
// 并挑一条本周写过的「五件好事」原文。与 computeMonthStats 同源，额外算周内连续打卡。
function computeWeekStats(state, weekStart) {
  const days = Array.from({ length: 7 }, (_, i) => toISO(new Date(weekStart.getTime() + i * 86400000)));
  const daySet = new Set(days);
  const inWeek = (iso) => daySet.has(iso);

  let totalTodos = 0, completedTodos = 0, totalPomos = 0, habitCheckins = 0;

  Object.entries(state.todos || {}).forEach(([iso, list]) => {
    if (!inWeek(iso) || !list) return;
    totalTodos += list.filter(td => !td.migrated).length;   // 已迁移存根在新日期重算
    completedTodos += list.filter(td => td.done).length;
  });

  Object.entries(state.pomoCount || {}).forEach(([iso, n]) => { if (inWeek(iso)) totalPomos += n; });

  // 周内每天「是否打了任意习惯」——含已删习惯的足迹（与年度热力图「全部」同口径）
  const habitDayFlags = days.map((iso) => {
    let any = false;
    for (const d of Object.values(state.habitDays || {})) {
      if (d && d[iso]) { habitCheckins++; any = true; }
    }
    return any;
  });
  // 周窗口内的最长连续打卡天数
  let longestRun = 0, run = 0, habitDaysActive = 0;
  habitDayFlags.forEach((on) => {
    if (on) { run++; habitDaysActive++; if (run > longestRun) longestRun = run; }
    else run = 0;
  });

  // 摘录一条本周写过的「五件好事」原文（按周稳定挑一条，不随重渲染跳动）
  const gratitudeTexts = [];
  Object.entries(state.gratitude || {}).forEach(([iso, items]) => {
    if (!inWeek(iso)) return;
    (items || []).forEach(x => { if (x && x.trim()) gratitudeTexts.push(x.trim()); });
  });
  let gratitudeQuote = '';
  if (gratitudeTexts.length) {
    const seed = days[0].split('-').reduce((a, b) => a + Number(b), 0);
    gratitudeQuote = gratitudeTexts[seed % gratitudeTexts.length];
  }

  const hasData = completedTodos > 0 || totalPomos > 0 || habitCheckins > 0 || gratitudeTexts.length > 0;

  return {
    totalTodos, completedTodos, totalPomos, habitCheckins,
    longestRun, habitDaysActive, gratitudeQuote, hasData,
  };
}

Object.assign(window, {
  spawnRecurringForToday, shouldSpawn, RecurringManager, QuickCapture, computeMonthStats, computeWeekStats,
});

export { spawnRecurringForToday, shouldSpawn, RecurringManager, QuickCapture, computeMonthStats, computeWeekStats };
