// i18n 语言包一致性测试：
//  1) en 不缺 zh 里的任何 key（缺了运行时会回退中文 —— 英文界面里冒中文就是这查出来的）
//  2) 同一 key 两边的 {占位符} 集合一致（少传/拼错会原样显示 {n}）
//  3) 数组型条目两边长度一致（星期/月份/占位提示组）
import { zh } from '../src/locales/zh.js';
import { en } from '../src/locales/en.js';

let fails = 0;
const fail = (msg) => { fails++; console.error('  FAIL:', msg); };

const placeholders = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');

// 两边占位符故意不同的 key（调用方传的是两边的并集，运行时安全）。
// 往这里加之前，确认调用处真的把两种占位符都传了。
const PLACEHOLDER_EXEMPT = new Set([
  'noteDate.fullDate',   // zh 用 {y}{m}{d}，en 用 {mShort}{d}{y}；fmtNoteDate 四个都传
]);

function walk(zhNode, enNode, path) {
  for (const [k, zv] of Object.entries(zhNode)) {
    const p = path ? `${path}.${k}` : k;
    const ev = enNode == null ? undefined : enNode[k];
    if (zv && typeof zv === 'object' && !Array.isArray(zv)) {
      walk(zv, ev, p);
    } else if (Array.isArray(zv)) {
      if (!Array.isArray(ev)) fail(`en 缺数组 ${p}`);
      else if (ev.length !== zv.length) fail(`数组长度不一致 ${p}：zh ${zv.length} vs en ${ev.length}`);
    } else {
      if (ev == null) fail(`en 缺 key ${p}`);
      else if (!PLACEHOLDER_EXEMPT.has(p) && placeholders(zv) !== placeholders(ev)) {
        fail(`占位符不一致 ${p}：zh [${placeholders(zv)}] vs en [${placeholders(ev)}]`);
      }
    }
  }
}

console.log('i18n.test:');
walk(zh, en, '');

if (fails) { console.error(`i18n.test: ${fails} 个失败`); process.exit(1); }
console.log('i18n.test: 全部通过（en 覆盖 zh 全部 key，占位符一致）\n');
