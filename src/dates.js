// 日期工具 + 小纯函数（无 React、无副作用）。
// 从 store.jsx 抽出来：让 node 单测能直接 import（store.jsx 是 JSX，node 进不去）。
// 各视图仍从 store.jsx 拿这些名字（它原样 re-export），不用改任何调用方。
import { t, tArr, getLocale } from './i18n.js';

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

// 历史名字（_CN 后缀）保留以免改全部调用方；内容已跟随界面语言。
// 用法约定：WEEKDAY_CN[i] 是短形（一/Mo），要「周一/Mon」用 i18n 的 weekdayFull(i)。
const WEEKDAY_CN = tArr('date.weekdaysMin');
const WEEKDAY_EN = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const MONTH_CN = tArr('date.months');
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

// 月日 / 问候语跟随界面语言（i18n 在 node 里固定 zh，单测断言不受影响）
function fmtMD(d) {
  if (getLocale() === 'en') return `${tArr('date.monthsShort')[d.getMonth()]} ${d.getDate()}`;
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

function greetingFor(d) {
  const h = d.getHours();
  if (h < 5) return t('greet.lateNight');
  if (h < 11) return t('greet.morning');
  if (h < 14) return t('greet.noon');
  if (h < 18) return t('greet.afternoon');
  if (h < 22) return t('greet.evening');
  return t('greet.lateNight');
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export {
  pad2, toISO, fromISO, todayISO, journalDateISO,
  WEEKDAY_CN, WEEKDAY_EN, MONTH_CN, MONTH_EN,
  getMonIndex, startOfWeek, weekKey, weekDates, fmtMD, greetingFor, uid,
};
