// ===== Conflict-safe merge (NEVER lose content) =====
// 从 store.jsx 抽出的纯函数模块（node 单测可直接 import）。
// The old sync did whole-blob last-write-wins by wall-clock timestamp, so a
// device that was behind could overwrite newer data with a fresh timestamp —
// and the overwrite was irreversible. This merges two states entity-by-entity:
// same item on both sides → resolve by a clear rule (later edit / max / richer
// text); item on one side only → keep it. The result is a *union*, so a stale
// device can only ever make data grow…
//
// ——除了被用户明确删除的东西。并集合并的老问题是「删除不传播」：A 设备删了，
// B 设备的副本一合并又回来了（复活）。解法 = 墓碑（tombstones）：
//   · 删除实体时在 state.tombstones[kind][id] 记一个时间戳（withTombstone）；
//   · mergeStates 先把双方墓碑取并集（同 id 取较新时间戳），再用它过滤合并结果——
//     无论哪边还留着尸体，都会被墓碑压住；
//   · 墓碑随 state 走云同步，所以删除会传播到所有设备；
//   · 超过 TTL（180 天）的墓碑在合并时丢弃，注册表不会无限膨胀。代价：一台
//     180 天没同步过的设备可能让旧条目复活——可接受，比永久膨胀好。
// 删除后重建不受影响：新条目拿的是新 uid，旧墓碑压不到它。

import { journalDateISO } from './dates.js';

const TOMBSTONE_TTL_MS = 180 * 24 * 3600 * 1000;
// 墓碑作用的实体种类 → state 里对应的顶层数组字段（todos 是日期键控的嵌套结构，单独处理）
const TOMBSTONE_ARRAY_KINDS = ['notes', 'habits', 'okrs', 'recurring'];

// 删除动作配套：往墓碑注册表记一笔（纯函数，返回新对象）。store 的各 remove* 用它。
function withTombstone(tombs, kind, id) {
  return { ...(tombs || {}), [kind]: { ...((tombs || {})[kind] || {}), [id]: Date.now() } };
}

function _mergeTombstones(a, b) {
  a = (a && typeof a === 'object') ? a : {};
  b = (b && typeof b === 'object') ? b : {};
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const out = {};
  for (const kind of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const merged = _mergeMap(a[kind], b[kind], (x, y) => Math.max(x || 0, y || 0));
    const keep = {};
    for (const [id, ts] of Object.entries(merged)) if (ts > cutoff) keep[id] = ts;
    if (Object.keys(keep).length) out[kind] = keep;
  }
  return out;
}

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
// journal 条目没有 id（自动归档生成），合并和墓碑都用内容签名当身份。
function journalSig(j) {
  return journalDateISO(j.date) + '|' + (j.reflection || '').slice(0, 60) + '|' + ((j.good || []).join('|').slice(0, 60));
}
function _mergeJournal(a, b) {
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  const seen = new Set(), out = [];
  for (const j of [...a, ...b]) { const s = journalSig(j); if (seen.has(s)) continue; seen.add(s); out.push(j); }
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

  // 墓碑：并集 + 按它过滤掉「任何一边还留着」的已删条目（见文件头注释）
  out.tombstones = _mergeTombstones(local.tombstones, cloud.tombstones);
  const dead = (kind, id) => !!(out.tombstones[kind] && out.tombstones[kind][id]);
  if (out.todos && typeof out.todos === 'object') {
    for (const [iso, list] of Object.entries(out.todos)) {
      if (Array.isArray(list) && list.some(td => td && dead('todos', td.id))) {
        out.todos[iso] = list.filter(td => !td || !dead('todos', td.id));
      }
    }
  }
  for (const kind of TOMBSTONE_ARRAY_KINDS) {
    if (Array.isArray(out[kind]) && out[kind].some(x => x && dead(kind, x.id))) {
      out[kind] = out[kind].filter(x => !x || !dead(kind, x.id));
    }
  }
  // journal 没有 id，墓碑键 = 内容签名（与 _mergeJournal 的去重身份一致）
  if (Array.isArray(out.journal) && out.journal.some(j => j && dead('journal', journalSig(j)))) {
    out.journal = out.journal.filter(j => !j || !dead('journal', journalSig(j)));
  }
  return out;
}

export { mergeStates, withTombstone, journalSig, _richerStr, _mergeMap, _mergeById, _mergeJournal, TOMBSTONE_TTL_MS };
