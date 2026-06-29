// Global store: localStorage-backed state with React context.
// Schema v2: date-keyed for natural week/month rollover.
import React from 'react';
import { SEED } from './data.js';

const { useState, useEffect, useRef, useContext, createContext, useMemo, useCallback } = React;

const STORAGE_KEY = 'study_planner_v2';
const OLD_STORAGE_KEY = 'study_planner_v1';

// ===== Date helpers =====
// 日期工具和合并逻辑都抽成了纯 JS 模块（node 单测可直接 import，见 tests/）；
// 这里 import 进来并在文件尾原样 re-export，调用方照旧从 store.jsx 拿。
import {
  toISO, fromISO, todayISO, journalDateISO,
  WEEKDAY_CN, WEEKDAY_EN, MONTH_CN, MONTH_EN,
  getMonIndex, startOfWeek, weekKey, weekDates, fmtMD, greetingFor, uid,
} from './dates.js';
import { mergeStates, withTombstone, journalSig } from './merge.js';

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

// targetIso 之前 lookbackDays 天内、没做完也没迁移过的待办（Bullet Journal 迁移
// 的扫描口径，今日页横幅和 migrateTodos 共用）。按日期升序返回 { iso, t }。
function listOverdueTodos(state, targetIso, lookbackDays = 7) {
  const min = toISO(new Date(fromISO(targetIso).getTime() - lookbackDays * 86400000));
  const out = [];
  for (const [iso, list] of Object.entries(state.todos || {})) {
    if (iso >= targetIso || iso < min || !Array.isArray(list)) continue;
    for (const td of list) if (td && !td.done && !td.migrated) out.push({ iso, t: td });   // 返回形状 {iso, t} 维持不变
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

// 干净的初始状态。曾经首启自动灌 SEED 示例数据，但示例会在登录合并时混进真实
// 账号（混入 bug），所以新用户改为从空白开始；想体验示例去 Tweaks 面板手动载入。
function emptyState() {
  return {
    name: '朋友', avatar: '',
    todos: {}, habits: [], habitDays: {},
    gratitude: {}, reflection: {}, pomoCount: {},
    pomoFocus: 25 * 60, pomoBreak: 5 * 60, pomoLong: 15 * 60,
    streakDays: 0, weekGoals: {}, monthThemes: {}, archivedDates: {},
    okrs: [], notes: [], journal: [],
    tombstones: {},   // 已删实体登记表 { kind: { id: ts } }，让删除能跨设备传播（见 merge.js）
  };
}

function useLocalState() {
  const [state, setStateRaw] = useState(() => {
    const loaded = loadState();
    // 与空状态合并兜底：老数据/云端 stub 缺字段时补齐，避免 .map of undefined
    return loaded ? { ...emptyState(), ...loaded } : emptyState();
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
      const idx = cur.findIndex(td => td.id === id);
      if (idx < 0) return s;
      const item = { ...cur[idx], done: !cur[idx].done };
      const rest = cur.filter(td => td.id !== id);
      let next;
      if (item.done) {
        next = [...rest, item];                       // sink to the very bottom
      } else {
        const fd = rest.findIndex(td => td.done);     // first completed item
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
      const fd = cur.findIndex(td => td.done);        // first completed item
      const next = fd < 0 ? [...cur, todo] : [...cur.slice(0, fd), todo, ...cur.slice(fd)];
      return { ...s, todos: { ...s.todos, [iso]: next } };
    });
  }, []);

  // Bullet-Journal 迁移：把回看窗口内所有未完成的旧待办搬到 targetIso（今天）。
  // 原条目【不删除】—— mergeStates 删除不传播，删掉的会被云端合并复活成重复；
  // 改成打 migrated 标记留在原日期当「→ 已迁移」存根。副本拿新 id（避免同一 id
  // 出现在两天的数组里）插到今天未完成段的末尾。整个动作在一次 setState 内完成。
  const migrateTodos = useCallback((targetIso) => {
    setState(s => {
      const pending = listOverdueTodos(s, targetIso);
      if (!pending.length) return s;
      const todos = { ...(s.todos || {}) };
      for (const iso of new Set(pending.map(p => p.iso))) {
        todos[iso] = todos[iso].map(td => (!td.done && !td.migrated) ? { ...td, migrated: targetIso } : td);
      }
      const copies = pending.map((p) => {
        const { migrated, ...rest } = p.t;
        return { ...rest, id: uid(), done: false };
      });
      const cur = todos[targetIso] || [];
      const fd = cur.findIndex(td => td.done);        // first completed item
      todos[targetIso] = fd < 0 ? [...cur, ...copies] : [...cur.slice(0, fd), ...copies, ...cur.slice(fd)];
      return { ...s, todos };
    });
  }, []);

  // 删除待办：从当天列表移除 + 登记墓碑。光 filter 掉是不够的 —— 云合并是并集，
  // 另一台设备还留着的副本会把它带回来；墓碑让 mergeStates 在合并时把尸体压住。
  const removeTodo = useCallback((iso, id) => {
    setState(s => ({
      ...s,
      todos: { ...s.todos, [iso]: ((s.todos && s.todos[iso]) || []).filter(td => td.id !== id) },
      tombstones: withTombstone(s.tombstones, 'todos', id),
    }));
  }, []);

  // 删除顶层数组实体（notes / habits / okrs / recurring）：同上，filter + 墓碑。
  const removeEntity = useCallback((kind, id) => {
    setState(s => ({
      ...s,
      [kind]: (s[kind] || []).filter(x => x.id !== id),
      tombstones: withTombstone(s.tombstones, kind, id),
    }));
  }, []);

  // 删成功日记：journal 条目没有 id，按对象身份 filter（搜索过滤时也准确），
  // 墓碑键用内容签名（与云合并的去重身份一致，见 merge.js journalSig）。
  const removeJournal = useCallback((entry) => {
    setState(s => ({
      ...s,
      journal: (s.journal || []).filter(x => x !== entry),
      tombstones: withTombstone(s.tombstones, 'journal', journalSig(entry)),
    }));
  }, []);

  // Move todo `fromId` to where `toId` currently sits (drag-to-reorder). Only
  // used between open items, so the undone-on-top / done-at-bottom invariant
  // from toggleTodo is preserved.
  const reorderTodos = useCallback((iso, fromId, toId) => {
    setState(s => {
      const cur = (s.todos && s.todos[iso]) || [];
      const from = cur.findIndex(td => td.id === fromId);
      const to = cur.findIndex(td => td.id === toId);
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
  // 删习惯：走墓碑（防云合并复活）。habitDays【特意保留】—— 年度热力图把已删
  // 习惯的历史打卡也算作足迹，「删掉习惯不抹掉走过的路」。
  const removeHabit = useCallback((hid) => removeEntity('habits', hid), [removeEntity]);

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
    getTodos, setTodos, addTodo, toggleTodo, reorderTodos, migrateTodos, removeTodo, removeEntity, removeJournal,
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

// （合并逻辑已抽到 src/merge.js —— 含墓碑机制：删除经 withTombstone 登记后，
//  mergeStates 会在合并时过滤掉已删条目，删除从此跨设备传播、不再复活。）

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
  toISO, fromISO, todayISO, listOverdueTodos,
  mergeStates, pushBackup, listBackups, restoreBackup,
});

export {
  useLocalState, useStore, StoreCtx, isEmptyState,
  WEEKDAY_CN, WEEKDAY_EN, MONTH_CN, MONTH_EN,
  getMonIndex, startOfWeek, weekKey, weekDates, fmtMD, greetingFor, uid,
  toISO, fromISO, todayISO, journalDateISO, listOverdueTodos,
  mergeStates, pushBackup, listBackups, restoreBackup,
};
