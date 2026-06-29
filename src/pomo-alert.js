// 番茄钟结束提醒：合成铃声（Web Audio，无音频资源）+ 桌面通知。
// 两条触发路径共用 ringPhaseEnd：
//   1) Pomodoro 组件的 tick 在相位切换瞬间调用（今日页打开时，最准时）；
//   2) 本模块的全局 watcher 每秒读 localStorage 的计时器（今日页没开着也能响——
//      组件只在今日页挂载，切去别的页面时全靠它）。
// 用 localStorage `pomo_rang_for` = endAt 去重，谁先到谁响、后到的无声跳过。

import { t } from './i18n.js';
import { notify, requestNotifPermission } from './notify.js';

const TIMER_KEY = 'pomo_timer_v1';     // Pomodoro 组件持久化的计时器（mode/running/endAt）
const RANG_KEY = 'pomo_rang_for';      // 已为哪个 endAt 响过铃（去重）
const SOUND_OFF_KEY = 'pomo_sound_off';

let ctx = null;
const ensureCtx = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

// 三音上行琶音（A5-C#6-E6），正弦波 + 指数衰减 —— 像小风铃，不刺耳。
function playChime() {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  [880, 1108.73, 1318.51].forEach((freq, i) => {
    const t0 = now + i * 0.18;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + 1.3);
  });
}

// 用户手势时机（点「开始」）调用：解锁 AudioContext + 顺手申请通知权限。
// 浏览器要求两者都得由手势触发，之后相位结束时才能直接响/弹。
function primeAlert() {
  ensureCtx();
  requestNotifPermission();   // permission==='default' 时弹一次系统询问；否则静默 no-op
}

function showNotification(endedMode) {
  if (document.hasFocus()) return;   // 正盯着看就不弹系统通知，铃声足够
  // notify() 内部统一做「权限 + 主开关」门控，并优先走 SW showNotification。
  notify(
    endedMode === 'focus' ? t('pomoAlert.focusEndTitle') : t('pomoAlert.breakEndTitle'),
    {
      body: endedMode === 'focus' ? t('pomoAlert.focusEndBody') : t('pomoAlert.breakEndBody'),
      tag: 'pomo-phase-end',       // 同 tag 覆盖旧通知，不会堆一摞
    }
  );
}

// endedMode = 刚结束的相位（'focus' | 'break'），endAt = 它的结束时间戳（去重键）。
function ringPhaseEnd(endedMode, endAt) {
  if (!endAt) return;
  try {
    if (localStorage.getItem(RANG_KEY) === String(endAt)) return;
    localStorage.setItem(RANG_KEY, String(endAt));
  } catch {}
  // 结束太久才发现（关页面后回来补处理）就不响了 —— 迟到的铃声只会吓一跳
  if (Date.now() - endAt > 60 * 1000) return;
  let soundOff = false;
  try { soundOff = localStorage.getItem(SOUND_OFF_KEY) === '1'; } catch {}
  if (!soundOff) playChime();
  showNotification(endedMode);
}

// 全局 watcher：今日页没挂载时，相位到点也能按时响。
setInterval(() => {
  let tm = null;
  try { tm = JSON.parse(localStorage.getItem(TIMER_KEY)); } catch {}
  if (!tm || !tm.running || !tm.endAt) return;
  if (Date.now() >= tm.endAt) ringPhaseEnd(tm.mode, tm.endAt);
}, 1000);

Object.assign(window, { primeAlert, ringPhaseEnd, playChime });

export { primeAlert, ringPhaseEnd, playChime, SOUND_OFF_KEY };
