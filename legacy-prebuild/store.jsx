// Global store: localStorage-backed state with React context.
// Schema v2: date-keyed for natural week/month rollover.
const { useState, useEffect, useRef, useContext, createContext, useMemo, useCallback } = React;

const STORAGE_KEY = 'study_planner_v2';
const OLD_STORAGE_KEY = 'study_planner_v1';

// ===== Date helpers =====
function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fromISO(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function todayISO() { return toISO(new Date()); }
// Normalize a journal entry's `date` (may be 'YYYY-MM-DD', a full ISO
// timestamp from a serialized Date, or a Date) to a local 'YYYY-MM-DD'.
// Used to dedup the auto-archive against existing journal entries.
function journalDateISO(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : toISO(dt);
}

const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_EN = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const MONTH_CN = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function getMonIndex(d) {
  // Convert JS getDay (Sun=0..Sat=6) to Mon-based (Mon=0..Sun=6)
  const g = d.getDay();
  return (g + 6) % 7;
}

function startOfWeek(d) {
  const x = new Date(d);
  const di = getMonIndex(x);
  x.setDate(x.getDate() - di);
  x.setHours(0,0,0,0);
  return x;
}

function weekKey(d) { return toISO(startOfWeek(d)); }

function weekDates(d) {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start); x.setDate(start.getDate() + i); return x;
  });
}

function fmtMD(d) { return `${d.getMonth()+1}月${d.getDate()}日`; }

function greetingFor(d) {
  const h = d.getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早安';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 22) return '晚上好';
  return '夜深了';
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ===== Migration from v1 → v2 =====
function migrateV1toV2(old) {
  // v1 shape: { todayTodos:[], weekTodos:{0..6:[]}, habits:[{id,name,emoji,week:[7]}], gratitude:[3], reflection:string, pomoCount:number, ... }
  const today = todayISO();
  const wDates = weekDates(new Date()).map(toISO);

  const todos = {};
  todos[today] = old.todayTodos || [];
  // map weekTodos by current week's dates
  if (old.weekTodos) {
    Object.keys(old.weekTodos).forEach(k => {
      const i = parseInt(k, 10);
      if (!isNaN(i) && wDates[i]) {
        // Don't overwrite today if already set
        if (wDates[i] === today) {
          // merge — prefer todayTodos
        } else {
          todos[wDates[i]] = old.weekTodos[i] || [];
        }
      }
    });
  }

  const habits = (old.habits || []).map(h => ({ id: h.id, name: h.name, emoji: h.emoji }));
  const habitDays = {};
  (old.habits || []).forEach(h => {
    habitDays[h.id] = {};
    (h.week || []).forEach((v, i) => {
      if (v && wDates[i]) habitDays[h.id][wDates[i]] = 1;
    });
  });

  const gratitude = {};
  const oldG = old.gratitude || [];
  gratitude[today] = [oldG[0]||'', oldG[1]||'', oldG[2]||'', '', ''];

  const reflection = {};
  if (old.reflection) reflection[today] = old.reflection;

  const pomoCount = {};
  if (old.pomoCount) pomoCount[today] = old.pomoCount;

  return {
    name: old.name || '朋友',
    avatar: old.avatar || '',
    todos,
    habits,
    habitDays,
    gratitude,
    reflection,
    pomoCount,
    pomoFocus: 25 * 60,
    pomoBreak: 5 * 60,
    pomoLong: 15 * 60,
    streakDays: old.streakDays || 0,
    weekGoals: { [weekKey(new Date())]: old.weekGoal || '' },
    monthThemes: (old.monthThemes && !Array.isArray(old.monthThemes)) ? old.monthThemes : {},
    okrs: old.okrs || [],
    notes: old.notes || [],
    journal: old.journal || [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // try migration
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const migrated = migrateV1toV2(old);
      return migrated;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// "Essentially empty" = first-run state where the SEED demo content would
// be more useful than blanks. Used both at first load and when the cloud
// returns a stub row (e.g. {name:'朋友'}) — otherwise that stub would
// overwrite the local seed and the demo OKRs / habits / notes vanish.
function isEmptyState(s) {
  if (!s || typeof s !== 'object') return true;
  const empty = (v) => !v || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
  return empty(s.okrs) && empty(s.habits) && empty(s.notes)
      && empty(s.monthThemes) && empty(s.journal) && empty(s.todos);
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function useLocalState() {
  const [state, setStateRaw] = useState(() => {
    const loaded = loadState();
    return (loaded && !isEmptyState(loaded)) ? loaded : window.SEED;
  });

  // Persist every state change to localStorage — but DON'T bump last_edit_at
  // here. Doing it here would treat initial mount and cloud pulls as fresh
  // local edits, which corrupts cross-device conflict resolution and caused
  // newer cloud changes to be overwritten by an older local snapshot.
  useEffect(() => { saveState(state); }, [state]);

  // User-initiated state changes. Bumps last_edit_at so the sync layer knows
  // "this device has unsynced edits since the last pull" — but ONLY when the
  // state actually changed. Guards like runArchive can call setState as a no-op
  // (returning the same state ref); bumping last_edit_at there would falsely
  // flag this device as having unsynced edits, and cross-device conflict
  // resolution (sync.jsx) would then reject newer cloud data → the phone-edits-
  // don't-reach-laptop bug. Comparing refs keeps the "I edited" signal honest.
  const setState = useCallback((updater) => {
    setStateRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next !== prev) localStorage.setItem('last_edit_at', String(Date.now()));
      return next;
    });
  }, []);

  // Cloud-initiated state changes. Does NOT bump last_edit_at — this data
  // came from another device, it's not a local edit.
  const applyCloudState = useCallback((newState) => {
    setStateRaw(newState);
  }, []);

  const update = useCallback((updater) => {
    setState(s => typeof updater === 'function' ? updater(s) : { ...s, ...updater });
  }, []);

  const updateField = useCallback((key, value) => {
    setState(s => ({ ...s, [key]: typeof value === 'function' ? value(s[key]) : value }));
  }, []);

  // === Date-scoped helpers ===
  const getTodos = useCallback((iso) => (state.todos && state.todos[iso]) || [], [state.todos]);
  const setTodos = useCallback((iso, mut) => {
    setState(s => {
      const cur = (s.todos && s.todos[iso]) || [];
      const next = typeof mut === 'function' ? mut(cur) : mut;
      return { ...s, todos: { ...s.todos, [iso]: next } };
    });
  }, []);

  // Toggle a todo's done state while keeping the list ordered "undone on top,
  // done at the bottom". Completing an item sinks it below every still-open
  // task; un-checking lifts it back to the end of the open section. Because
  // every view (今日/本周/本月) reads the same state.todos[iso] array, the new
  // order shows up in all of them at once.
  const toggleTodo = useCallback((iso, id) => {
    setState(s => {
      const cur = (s.todos && s.todos[iso]) || [];
      const idx = cur.findIndex(t => t.id === id);
      if (idx < 0) return s;
      const item = { ...cur[idx], done: !cur[idx].done };
      const rest = cur.filter(t => t.id !== id);
      let next;
      if (item.done) {
        next = [...rest, item];                       // sink to the very bottom
      } else {
        const fd = rest.findIndex(t => t.done);       // first completed item
        next = fd < 0 ? [...rest, item] : [...rest.slice(0, fd), item, ...rest.slice(fd)];
      }
      return { ...s, todos: { ...s.todos, [iso]: next } };
    });
  }, []);

  // Add a new (open) todo, inserting it at the END OF THE OPEN SECTION — i.e.
  // just above the first completed item — so a freshly added task never lands
  // beneath the sunk done ones (which looked off and forced a manual drag).
  const addTodo = useCallback((iso, todo) => {
    setState(s => {
      const cur = (s.todos && s.todos[iso]) || [];
      const fd = cur.findIndex(t => t.done);          // first completed item
      const next = fd < 0 ? [...cur, todo] : [...cur.slice(0, fd), todo, ...cur.slice(fd)];
      return { ...s, todos: { ...s.todos, [iso]: next } };
    });
  }, []);

  // Move todo `fromId` to where `toId` currently sits (drag-to-reorder). Only
  // used between open items, so the undone-on-top / done-at-bottom invariant
  // from toggleTodo is preserved.
  const reorderTodos = useCallback((iso, fromId, toId) => {
    setState(s => {
      const cur = (s.todos && s.todos[iso]) || [];
      const from = cur.findIndex(t => t.id === fromId);
      const to = cur.findIndex(t => t.id === toId);
      if (from < 0 || to < 0 || from === to) return s;
      const arr = cur.slice();
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...s, todos: { ...s.todos, [iso]: arr } };
    });
  }, []);

  const getHabit = useCallback((hid, iso) => !!(state.habitDays && state.habitDays[hid] && state.habitDays[hid][iso]), [state.habitDays]);
  const toggleHabit = useCallback((hid, iso) => {
    setState(s => {
      const d = { ...(s.habitDays || {}) };
      const m = { ...(d[hid] || {}) };
      if (m[iso]) delete m[iso]; else m[iso] = 1;
      d[hid] = m;
      return { ...s, habitDays: d };
    });
  }, []);

  // ===== Habit streak helpers =====
  // Count the current run of consecutive days. The day still in progress (today)
  // does NOT break the streak: if today isn't checked yet we start counting from
  // yesterday, so opening the app in the morning keeps your streak (and the tree)
  // intact instead of snapping back to 0/seed. The run only breaks once a whole
  // past day was missed.
  const habitStreak = useCallback((hid) => {
    const done = (d) => !!(state.habitDays && state.habitDays[hid] && state.habitDays[hid][toISO(d)]);
    const cur = new Date();
    cur.setHours(0,0,0,0);
    if (!done(cur)) cur.setDate(cur.getDate() - 1); // today still open — grace
    let n = 0;
    while (done(cur)) { n++; cur.setDate(cur.getDate() - 1); if (n > 9999) break; }
    return n;
  }, [state.habitDays]);

  // Total accumulated check-in days for one habit, all time. Unlike habitStreak
  // (which only counts the current unbroken run and resets after a miss) this
  // never decreases — so each habit shows how many days you've ever ticked it.
  const habitTotal = useCallback((hid) => {
    const m = state.habitDays && state.habitDays[hid];
    return m ? Object.keys(m).length : 0;
  }, [state.habitDays]);

  // Overall streak: count days where AT LEAST ONE habit was done. The tree grows
  // as long as you tend any habit each day. Like habitStreak, the in-progress
  // day is forgiving — if nothing's checked today yet we count from yesterday,
  // so the tree doesn't drop back to a seed every morning before you check in.
  const overallStreak = useMemo(() => {
    if (!state.habits || state.habits.length === 0) return 0;
    const anyDone = (d) => {
      const k = toISO(d);
      return state.habits.some(h => state.habitDays && state.habitDays[h.id] && state.habitDays[h.id][k]);
    };
    const cur = new Date();
    cur.setHours(0,0,0,0);
    if (!anyDone(cur)) cur.setDate(cur.getDate() - 1); // today still open — grace
    let n = 0;
    while (anyDone(cur)) { n++; cur.setDate(cur.getDate() - 1); if (n > 9999) break; }
    return n;
  }, [state.habits, state.habitDays]);

  const addHabit = useCallback((name, emoji) => {
    setState(s => ({ ...s, habits: [...s.habits, { id: uid(), name, emoji: emoji || '✨' }] }));
  }, []);
  const updateHabit = useCallback((hid, patch) => {
    setState(s => ({ ...s, habits: s.habits.map(h => h.id === hid ? { ...h, ...patch } : h) }));
  }, []);
  const removeHabit = useCallback((hid) => {
    setState(s => {
      const d = { ...(s.habitDays || {}) };
      delete d[hid];
      return { ...s, habits: s.habits.filter(h => h.id !== hid), habitDays: d };
    });
  }, []);

  const getGratitude = useCallback((iso) => {
    const cur = (state.gratitude && state.gratitude[iso]) || [];
    return [0,1,2,3,4].map(i => cur[i] || '');
  }, [state.gratitude]);
  const setGratitudeItem = useCallback((iso, i, v) => {
    setState(s => {
      const cur = (s.gratitude && s.gratitude[iso]) || ['','','','',''];
      const next = [...cur]; next[i] = v;
      while (next.length < 5) next.push('');
      return { ...s, gratitude: { ...s.gratitude, [iso]: next } };
    });
  }, []);

  const getReflection = useCallback((iso) => (state.reflection && state.reflection[iso]) || '', [state.reflection]);
  const setReflection = useCallback((iso, v) => {
    setState(s => ({ ...s, reflection: { ...s.reflection, [iso]: v } }));
  }, []);

  const getPomoCount = useCallback((iso) => (state.pomoCount && state.pomoCount[iso]) || 0, [state.pomoCount]);
  const incPomoCount = useCallback((iso) => {
    setState(s => ({ ...s, pomoCount: { ...s.pomoCount, [iso]: ((s.pomoCount && s.pomoCount[iso]) || 0) + 1 } }));
  }, []);

  const getWeekGoal = useCallback((wkey) => (state.weekGoals && state.weekGoals[wkey]) || '', [state.weekGoals]);
  const setWeekGoal = useCallback((wkey, v) => {
    setState(s => ({ ...s, weekGoals: { ...s.weekGoals, [wkey]: v } }));
  }, []);

  const reorderHabits = useCallback((from, to) => {
    setState(s => {
      const arr = (s.habits || []).slice();
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return s;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...s, habits: arr };
    });
  }, []);

  // ===== Week theme — single source of truth shared by 本周 & 本月 views =====
  // Both the Week page's "本周主题" and the Month page's per-week themes write
  // to the SAME slot inside monthThemes[monthKey][weekIdx], so editing one is
  // reflected in the other. weekIdx mirrors MonthView's ceil(date/7) bucketing.
  const monthThemeSlot = (d) => ({
    mkey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    idx: Math.min(3, Math.max(0, Math.ceil(d.getDate() / 7) - 1)),
  });
  const getWeekTheme = useCallback((date) => {
    const { mkey, idx } = monthThemeSlot(date);
    const map = (state.monthThemes && !Array.isArray(state.monthThemes) && typeof state.monthThemes === 'object') ? state.monthThemes : {};
    const arr = Array.isArray(map[mkey]) ? map[mkey] : null;
    const title = (arr && arr[idx] && arr[idx].title) || '';
    // Fall back to the legacy per-week store so an existing 本周主题 still shows.
    if (title) return title;
    return (state.weekGoals && state.weekGoals[weekKey(date)]) || '';
  }, [state.monthThemes, state.weekGoals]);
  const setWeekTheme = useCallback((date, title) => {
    const { mkey, idx } = monthThemeSlot(date);
    setState(s => {
      const prev = (s.monthThemes && !Array.isArray(s.monthThemes) && typeof s.monthThemes === 'object') ? { ...s.monthThemes } : {};
      const arr = Array.isArray(prev[mkey]) ? prev[mkey].slice() : Array.from({ length: 4 }, () => ({ title: '', progress: 0 }));
      arr[idx] = { ...(arr[idx] || { title: '', progress: 0 }), title };
      prev[mkey] = arr;
      return { ...s, monthThemes: prev };
    });
  }, []);

  // ===== Auto-archive into 成功日记 (journal) =====
  // Roll a past day's "five good things" + reflection into a journal entry.
  // `archivedDates` records which dates we've already processed, kept SEPARATE
  // from the journal list — so deleting a journal entry stays permanent (a
  // backfill won't resurrect it) yet a day is still never archived twice.
  const ARCHIVE_WINDOW_DAYS = 60;

  // Scan recent past days for written-but-not-yet-archived content and roll
  // them into the journal. This replaces the old "only the single day that just
  // ended" driver, which silently dropped a day whenever the device skipped it
  // (e.g. wrote at night, reopened a day later, or edited on another device) —
  // the bug where last night's 五件好事 / 心得 never reached the 成功日记.
  const runArchive = useCallback(() => {
    setState(s => {
      const today = todayISO();
      const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - ARCHIVE_WINDOW_DAYS); return toISO(d); })();
      const archived = { ...(s.archivedDates || {}) };
      let journal = s.journal || [];
      const added = [];
      let changed = false;

      const dates = new Set([
        ...Object.keys(s.gratitude || {}),
        ...Object.keys(s.reflection || {}),
      ]);
      dates.forEach(iso => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
        if (iso >= today) return;                 // today is still in progress
        if (iso < cutoff) return;                 // bounded look-back
        if (archived[iso]) return;                // already handled this date
        const good = ((s.gratitude && s.gratitude[iso]) || []).map(g => (g || '').trim()).filter(Boolean);
        const reflection = ((s.reflection && s.reflection[iso]) || '').trim();
        if (good.length === 0 && !reflection) return;   // nothing written that day
        archived[iso] = 1;
        changed = true;
        if (journal.some(j => journalDateISO(j.date) === iso)) return;  // already in journal (legacy)
        added.push({ date: iso, good, reflection, pomo: (s.pomoCount && s.pomoCount[iso]) || 0 });
      });

      if (!changed) return s;
      if (added.length) {
        journal = [...added, ...journal].sort((a, b) =>
          journalDateISO(b.date).localeCompare(journalDateISO(a.date)));  // newest first
      }
      return { ...s, journal, archivedDates: archived };
    });
  }, []);

  // `last_active_date` is a per-device marker. On mount it catches "reopened on
  // a new day"; the 60s tick + visibility listener catch "left open across
  // midnight". The scan itself is idempotent, so running it often is harmless.
  useEffect(() => {
    const KEY = 'last_active_date';
    const tick = () => { runArchive(); localStorage.setItem(KEY, todayISO()); };
    tick();
    const id = setInterval(tick, 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [runArchive]);

  return {
    state, setState, applyCloudState, update, updateField,
    getTodos, setTodos, addTodo, toggleTodo, reorderTodos,
    getHabit, toggleHabit, habitStreak, habitTotal, overallStreak, addHabit, updateHabit, removeHabit, reorderHabits,
    getGratitude, setGratitudeItem,
    getReflection, setReflection,
    getPomoCount, incPomoCount,
    getWeekGoal, setWeekGoal,
    getWeekTheme, setWeekTheme,
  };
}

const StoreCtx = createContext(null);
function useStore() { return useContext(StoreCtx); }

// ===== Conflict-safe merge (NEVER lose content) =====
// The old sync did whole-blob last-write-wins by wall-clock timestamp, so a
// device that was behind could overwrite newer data with a fresh timestamp —
// and the overwrite was irreversible. This merges two states entity-by-entity:
// same item on both sides → resolve by a clear rule (later edit / max / richer
// text); item on one side only → keep it. Deletions intentionally do NOT
// propagate — a resurrected item is far less painful than a lost one. The
// result is a *union*, so a stale device can only ever make data grow.
function _richerStr(a, b) {
  const A = (a == null ? '' : String(a)), B = (b == null ? '' : String(b));
  if (A && B) return A.length >= B.length ? A : B;
  return A || B;
}
function _mergeMap(a, b, resolve) {
  a = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {};
  b = (b && typeof b === 'object' && !Array.isArray(b)) ? b : {};
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[k] = (k in a && k in b) ? resolve(a[k], b[k]) : (k in a ? a[k] : b[k]);
  }
  return out;
}
function _mergeById(a, b, resolveSame) {
  a = Array.isArray(a) ? a : [];
  b = Array.isArray(b) ? b : [];
  const byId = new Map(), order = [];
  for (const it of a) if (it && it.id != null) { byId.set(it.id, it); order.push(it.id); }
  for (const it of b) {
    if (!it || it.id == null) continue;
    if (byId.has(it.id)) byId.set(it.id, resolveSame ? resolveSame(byId.get(it.id), it) : byId.get(it.id));
    else { byId.set(it.id, it); order.push(it.id); }
  }
  const noId = [...a.filter(x => x && x.id == null), ...b.filter(x => x && x.id == null)];
  return [...order.map(id => byId.get(id)), ...noId];
}
function _mergeJournal(a, b) {
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  const sig = (j) => journalDateISO(j.date) + '|' + (j.reflection || '').slice(0, 60) + '|' + ((j.good || []).join('|').slice(0, 60));
  const seen = new Set(), out = [];
  for (const j of [...a, ...b]) { const s = sig(j); if (seen.has(s)) continue; seen.add(s); out.push(j); }
  return out.sort((x, y) => journalDateISO(y.date).localeCompare(journalDateISO(x.date)));
}
function mergeStates(local, cloud) {
  if (!local || typeof local !== 'object') return cloud;
  if (!cloud || typeof cloud !== 'object') return local;
  const out = { ...cloud, ...local };  // local wins for any scalar not handled below
  out.name = _richerStr(local.name, cloud.name) || '朋友';
  if (local.selfNote !== undefined || cloud.selfNote !== undefined) out.selfNote = _richerStr(local.selfNote, cloud.selfNote);
  out.streakDays = Math.max(local.streakDays || 0, cloud.streakDays || 0);
  out.pomoFocus = local.pomoFocus || cloud.pomoFocus;
  out.pomoBreak = local.pomoBreak || cloud.pomoBreak;
  out.pomoLong = local.pomoLong || cloud.pomoLong;
  out.reflection = _mergeMap(local.reflection, cloud.reflection, _richerStr);
  out.weekGoals = _mergeMap(local.weekGoals, cloud.weekGoals, _richerStr);
  out.pomoCount = _mergeMap(local.pomoCount, cloud.pomoCount, (x, y) => Math.max(x || 0, y || 0));
  out.archivedDates = _mergeMap(local.archivedDates, cloud.archivedDates, (x, y) => x || y);
  out.gratitude = _mergeMap(local.gratitude, cloud.gratitude, (x, y) => {
    const r = []; for (let i = 0; i < 5; i++) r[i] = _richerStr((x || [])[i], (y || [])[i]); return r;
  });
  out.todos = _mergeMap(local.todos, cloud.todos, (x, y) => _mergeById(x, y));
  out.habitDays = _mergeMap(local.habitDays, cloud.habitDays, (x, y) => _mergeMap(x, y, (m, n) => m || n));
  out.monthThemes = _mergeMap(local.monthThemes, cloud.monthThemes, (x, y) => {
    const len = Math.max((x || []).length, (y || []).length, 4), r = [];
    for (let i = 0; i < len; i++) { const p = (x || [])[i] || {}, q = (y || [])[i] || {};
      r[i] = { title: _richerStr(p.title, q.title), progress: Math.max(p.progress || 0, q.progress || 0) }; }
    return r;
  });
  out.notes = _mergeById(local.notes, cloud.notes, (p, q) => {
    const at = (n) => n.editedAt || n.createdAt || 0; return at(p) >= at(q) ? p : q;
  });
  out.habits = _mergeById(local.habits, cloud.habits);
  out.okrs = _mergeById(local.okrs, cloud.okrs);
  out.journal = _mergeJournal(local.journal, cloud.journal);
  if (local.recurring || cloud.recurring) out.recurring = _mergeById(local.recurring, cloud.recurring);
  return out;
}

// ===== Rolling local backups (undo safety net before any overwrite) =====
const BACKUP_KEY = 'planner_backups_v1';
function pushBackup(reason) {
  try {
    const cur = localStorage.getItem(STORAGE_KEY);
    if (!cur) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch {}
    if (list.length && list[list.length - 1].data === cur) return; // no-op if unchanged
    list.push({ ts: Date.now(), reason: reason || '', data: cur });
    while (list.length > 8) list.shift();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
  } catch {}
}
function listBackups() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]')
      .map((b, i) => ({ i, ts: b.ts, when: new Date(b.ts).toLocaleString('zh-CN'), reason: b.reason, size: (b.data || '').length }));
  } catch { return []; }
}
function restoreBackup(i) {
  try {
    const list = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const b = list[i];
    if (!b) return false;
    localStorage.setItem(STORAGE_KEY, b.data);
    // Mark as a fresh local edit so the restored data is uploaded/merged out,
    // not silently overwritten by the cloud on the next pull.
    localStorage.setItem('last_edit_at', String(Date.now()));
    return true;
  } catch { return false; }
}

Object.assign(window, {
  useLocalState, useStore, StoreCtx, isEmptyState,
  WEEKDAY_CN, WEEKDAY_EN, MONTH_CN, MONTH_EN,
  getMonIndex, startOfWeek, weekKey, weekDates, fmtMD, greetingFor, uid,
  toISO, fromISO, todayISO,
  mergeStates, pushBackup, listBackups, restoreBackup,
});
