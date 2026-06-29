// mergeStates 单测（含墓碑）：node tests/merge.test.mjs（或 npm test 一起跑）
import { mergeStates, withTombstone, journalSig, TOMBSTONE_TTL_MS } from '../src/merge.js';

let fails = 0;
const t = (cond, msg) => { if (!cond) { fails++; console.error('  FAIL:', msg); } else console.log('  ok:', msg); };
console.log('merge.test:');

const base = () => ({
  name: '朋友', todos: {}, habits: [], habitDays: {}, gratitude: {}, reflection: {},
  pomoCount: {}, okrs: [], notes: [], journal: [], tombstones: {},
});

// ===== 并集语义（原有行为不回归）=====
{
  const local = { ...base(), todos: { '2026-06-10': [{ id: 'a', text: '本地的', done: false }] } };
  const cloud = { ...base(), todos: { '2026-06-11': [{ id: 'b', text: '云端的', done: true }] } };
  const m = mergeStates(local, cloud);
  t(m.todos['2026-06-10'][0].id === 'a' && m.todos['2026-06-11'][0].id === 'b', '两边独有的日期都保留（并集）');
}
{
  const local = { ...base(), todos: { '2026-06-10': [{ id: 'a', text: '改过的较长文本', done: true }] } };
  const cloud = { ...base(), todos: { '2026-06-10': [{ id: 'a', text: '旧', done: false }, { id: 'c', text: '云端新增' }] } };
  const m = mergeStates(local, cloud);
  t(m.todos['2026-06-10'].length === 2, '同日合并：同 id 去重 + 云端新增保留');
  t(m.todos['2026-06-10'].find(x => x.id === 'a').done === true, '同 id 本地版本优先');
}
{
  const m = mergeStates({ ...base(), name: '小满' }, { ...base(), name: '朋友' });
  t(m.name === '小满', 'name 取更丰富的一边（非默认）');
  const m2 = mergeStates({ ...base(), reflection: { '2026-06-10': '今天写了很长一段心得' } },
                         { ...base(), reflection: { '2026-06-10': '短' } });
  t(m2.reflection['2026-06-10'].length > 1, 'reflection 取更长文本');
  const m3 = mergeStates({ ...base(), pomoCount: { '2026-06-10': 2 } }, { ...base(), pomoCount: { '2026-06-10': 5 } });
  t(m3.pomoCount['2026-06-10'] === 5, 'pomoCount 取较大');
}
{
  const local = { ...base(), notes: [{ id: 'n1', body: '新', editedAt: 200 }] };
  const cloud = { ...base(), notes: [{ id: 'n1', body: '旧', editedAt: 100 }, { id: 'n2', body: '云端笔记', createdAt: 50 }] };
  const m = mergeStates(local, cloud);
  t(m.notes.length === 2 && m.notes.find(n => n.id === 'n1').body === '新', 'notes 同 id 取 editedAt 较新');
}
{
  const j = (date, r) => ({ date, good: [], reflection: r });
  const m = mergeStates({ ...base(), journal: [j('2026-06-10', 'x')] },
                        { ...base(), journal: [j('2026-06-10', 'x'), j('2026-06-09', 'y')] });
  t(m.journal.length === 2 && m.journal[0].date === '2026-06-10', 'journal 按签名去重 + 新在前');
}
{
  t(mergeStates(null, { ...base(), name: 'x' }).name === 'x', 'local 缺失返回 cloud');
  t(mergeStates({ ...base(), name: 'y' }, null).name === 'y', 'cloud 缺失返回 local');
}

// ===== 墓碑：删除传播、不复活 =====
{
  // A 设备删了 todo a（登记墓碑）；云端还留着尸体 → 合并后不复活
  let local = { ...base(), todos: { '2026-06-10': [] } };
  local.tombstones = withTombstone(local.tombstones, 'todos', 'a');
  const cloud = { ...base(), todos: { '2026-06-10': [{ id: 'a', text: '尸体' }, { id: 'b', text: '活着' }] } };
  const m = mergeStates(local, cloud);
  t(m.todos['2026-06-10'].length === 1 && m.todos['2026-06-10'][0].id === 'b', '本地删的 todo 不被云端带回（同日其余保留）');
  t(!!m.tombstones.todos.a, '墓碑本身保留在合并结果里（继续传播给其他设备）');
}
{
  // 反向：云端（别的设备）删了，本地还留着 → 合并后也消失（删除传播到本机）
  let cloud = { ...base() };
  cloud.tombstones = withTombstone(cloud.tombstones, 'notes', 'n1');
  const local = { ...base(), notes: [{ id: 'n1', body: '本机还留着' }, { id: 'n2', body: '没删' }] };
  const m = mergeStates(local, cloud);
  t(m.notes.length === 1 && m.notes[0].id === 'n2', '云端的删除传播到本机');
}
{
  // habits / okrs / recurring 同样生效
  let local = { ...base(), recurring: [] };
  local.tombstones = withTombstone(withTombstone(withTombstone(local.tombstones,
    'habits', 'h1'), 'okrs', 'o1'), 'recurring', 'r1');
  const cloud = { ...base(),
    habits: [{ id: 'h1' }, { id: 'h2' }], okrs: [{ id: 'o1' }], recurring: [{ id: 'r1' }] };
  const m = mergeStates(local, cloud);
  t(m.habits.length === 1 && m.habits[0].id === 'h2', 'habits 墓碑生效');
  t(m.okrs.length === 0, 'okrs 墓碑生效');
  t(m.recurring.length === 0, 'recurring 墓碑生效');
}
{
  // 删除后重建：新条目新 id，旧墓碑压不到
  let local = { ...base(), habits: [{ id: 'h-new', name: '重建的' }] };
  local.tombstones = withTombstone(local.tombstones, 'habits', 'h-old');
  const m = mergeStates(local, { ...base(), habits: [{ id: 'h-old', name: '老的' }] });
  t(m.habits.length === 1 && m.habits[0].id === 'h-new', '重建的新 id 不受旧墓碑影响');
}
{
  // 两边墓碑并集，同 id 取较新时间戳
  const local = { ...base(), tombstones: { todos: { x: 100, y: Date.now() } } };
  const cloud = { ...base(), tombstones: { todos: { x: Date.now() - 5000 }, notes: { z: Date.now() } } };
  const m = mergeStates(local, cloud);
  t(m.tombstones.todos.x >= Date.now() - 6000 && !!m.tombstones.notes.z, '墓碑并集 + 同 id 取较新（x 本地是远古时间戳，取云端较新的）');
  t(!!m.tombstones.todos.y, '新墓碑保留');
}
{
  // journal 没有 id —— 墓碑用内容签名；删掉的日记不被云端的签名并集带回
  const entry = { date: '2026-06-10', good: ['散步'], reflection: '今天很好' };
  let local = { ...base(), journal: [] };
  local.tombstones = withTombstone(local.tombstones, 'journal', journalSig(entry));
  const cloud = { ...base(), journal: [entry, { date: '2026-06-09', good: [], reflection: '前天的' }] };
  const m = mergeStates(local, cloud);
  t(m.journal.length === 1 && m.journal[0].date === '2026-06-09', 'journal 签名墓碑生效（其余日记保留）');
}
{
  // 老数据没有 tombstones 字段也不报错
  const old = { ...base() }; delete old.tombstones;
  const m = mergeStates(old, { ...base(), todos: { '2026-06-10': [{ id: 'a' }] } });
  t(m.todos['2026-06-10'].length === 1 && typeof m.tombstones === 'object', '无 tombstones 字段向后兼容');
}
{
  // TTL 边界：刚过期 vs 还在期内
  const fresh = Date.now() - TOMBSTONE_TTL_MS + 60000;   // 还差 1 分钟到期
  const stale = Date.now() - TOMBSTONE_TTL_MS - 60000;   // 过期 1 分钟
  const local = { ...base(), tombstones: { notes: { fresh, stale } } };
  const m = mergeStates(local, base());
  t(!!m.tombstones.notes.fresh && m.tombstones.notes.stale === undefined, 'TTL 边界：期内保留、过期丢弃');
}

if (fails) { console.error(`merge.test: ${fails} 个失败`); process.exit(1); }
console.log('merge.test: 全部通过\n');
