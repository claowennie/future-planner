// 本地通知中枢：统一「权限 + 主开关偏好 + 发送路径」。
// 设计：
//   · 发送优先走 service worker 的 registration.showNotification —— 页面切到后台/
//     关掉、以及移动端都比 new Notification 可靠，而且这正是将来 Web Push 收到
//     推送后要调的同一个 API（sw.js 里已加 notificationclick 处理）。SW 未就绪
//     （开发模式、首次安装未刷新）时回退 new Notification。
//   · 每条通知都受【浏览器权限 granted】+【主开关 enabled】双重门控。
//   · 偏好存 localStorage，纯 JS、无 React 依赖，和 pomo-alert 的全局 watcher 同风格：
//     习惯打卡提醒的定时检查也放在本模块（每分钟读一次 localStorage 状态）。
import { t } from './i18n.js';
import { todayISO } from './dates.js';

const PREF_KEY = 'notif_prefs_v1';
const HABIT_REMINDED_KEY = 'habit_reminded_for';   // 已为哪一天发过打卡提醒（去重，值=ISO 日期）
const STATE_KEY = 'study_planner_v2';              // = store.jsx 的 STORAGE_KEY（沿用 pomo-alert 直读 localStorage 的做法）

// habitTime = 'HH:MM'；weekReview = 周日晚是否推送「本周回顾」（仅 Web Push 用，本地周回顾卡不受它管）
const DEFAULTS = { enabled: true, habitReminder: false, habitTime: '20:00', weekReview: true };

function getNotifPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    // 迁移：旧版只存整点 habitHour（数字），换算成 'HH:MM' 字符串
    if (saved.habitTime == null && saved.habitHour != null) {
      saved.habitTime = `${String(saved.habitHour).padStart(2, '0')}:00`;
    }
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

function setNotifPrefs(patch) {
  const next = { ...getNotifPrefs(), ...patch };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  // 让设置面板等订阅方即时刷新（同一标签页 storage 事件不触发，自己广播）
  try { window.dispatchEvent(new CustomEvent('future:notif-prefs', { detail: next })); } catch { /* ignore */ }
  return next;
}

const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
const notifPermission = () => (notifSupported() ? Notification.permission : 'unsupported');

// 必须由用户手势调用（浏览器硬性要求）。返回最终是否拿到 granted。
async function requestNotifPermission() {
  if (!notifSupported()) return false;
  try {
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    return p === 'granted';
  } catch { return false; }
}

// 统一发送入口。受权限 + 主开关门控；调用方只管给标题和内容。
async function notify(title, opts = {}) {
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  if (getNotifPrefs().enabled === false) return false;
  const options = { icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', ...opts };
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return true;
    }
  } catch { /* 退回 new Notification */ }
  try { new Notification(title, options); return true; } catch { return false; }
}

// ===== 习惯打卡提醒（本地版）=====
// 限制：只在 app 开着（或 PWA 在后台存活）时有效 —— 完全关闭时的定时提醒要等
// Web Push（见 launch-readiness-plan）。文案里对用户讲清楚这一点。
function anyHabitDoneToday(state, today) {
  if (!state || !Array.isArray(state.habits) || state.habits.length === 0) return true; // 没有习惯就不催
  return state.habits.some((h) => state.habitDays && state.habitDays[h.id] && state.habitDays[h.id][today]);
}

function maybeRemindHabits() {
  const prefs = getNotifPrefs();
  if (!prefs.enabled || !prefs.habitReminder) return;
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const [hh, mm] = String(prefs.habitTime || '20:00').split(':').map((n) => parseInt(n, 10));
  const target = (Number.isFinite(hh) ? hh : 20) * 60 + (Number.isFinite(mm) ? mm : 0);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < target) return;       // 还没到设定的提醒时间
  const today = todayISO();
  try { if (localStorage.getItem(HABIT_REMINDED_KEY) === today) return; } catch { /* ignore */ }  // 今天提醒过了
  let state = null;
  try { state = JSON.parse(localStorage.getItem(STATE_KEY)); } catch { /* ignore */ }
  if (anyHabitDoneToday(state, today)) return;                        // 今天已打卡 / 没有习惯
  try { localStorage.setItem(HABIT_REMINDED_KEY, today); } catch { /* ignore */ }
  notify(t('notify.habitTitle'), { body: t('notify.habitBody'), tag: 'habit-reminder' });
}

if (typeof window !== 'undefined') {
  setInterval(maybeRemindHabits, 60 * 1000);
  // 切回前台时也查一次（手机锁屏一晚再打开，能立刻补上当天提醒）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeRemindHabits();
  });
}

Object.assign(window, { getNotifPrefs, setNotifPrefs, notifSupported, notifPermission, requestNotifPermission, notify });

export { getNotifPrefs, setNotifPrefs, notifSupported, notifPermission, requestNotifPermission, notify };
