// 远程推送（Web Push）：把这台设备的 PushSubscription 存进 Supabase，由 Edge Function
// + pg_cron 在 app 完全关闭时也能推「习惯提醒 / 周日晚周回顾」。本地通知（notify.js）
// 是保底（只在 app 开着时有效），这一层是「人不在也能叫醒你」的主力。
//
// 依赖：window.sbClient（sync.jsx 建的 Supabase 客户端）、window.VAPID_PUBLIC_KEY
//       （supabase-config.js）、已注册的 service worker（main.jsx 生产环境注册）。
// 落库表 push_subscriptions 的结构 + 服务端见 supabase/WEB_PUSH_SETUP.md。
import { getNotifPrefs, requestNotifPermission } from './notify.js';
import { getLocale } from './i18n.js';

const TABLE = 'push_subscriptions';

// VAPID 公钥是 base64url，subscribe 要的是 Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.ready; } catch { return null; }
}

// 这台设备当前是否已订阅（本地查 pushManager，不碰网络）
async function getPushSubscription() {
  const reg = await getRegistration();
  if (!reg) return null;
  try { return await reg.pushManager.getSubscription(); } catch { return null; }
}

function tzName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// 把当前偏好整理成落库的 prefs（服务端按它决定推什么、几点推）
function prefsPayload() {
  const p = getNotifPrefs();
  return {
    habitReminder: !!p.habitReminder,
    habitTime: p.habitTime || '20:00',
    weekReview: p.weekReview !== false,
  };
}

// 订阅 + 落库。要求：已登录、SW 就绪、配了 VAPID 公钥、拿到通知权限。
// 返回 { ok, reason }，reason 供设置面板给用户对应的指引。
async function subscribePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const sb = window.sbClient;
  if (!sb) return { ok: false, reason: 'no-supabase' };
  if (!window.VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-vapid' };

  let user = null;
  try { ({ data: { user } } = await sb.auth.getUser()); } catch { /* ignore */ }
  if (!user) return { ok: false, reason: 'no-login' };

  const granted = await requestNotifPermission();
  if (!granted) {
    return { ok: false, reason: (typeof Notification !== 'undefined' && Notification.permission === 'denied') ? 'denied' : 'no-perm' };
  }

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: 'no-sw' };

  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
      });
    }
  } catch (e) {
    return { ok: false, reason: 'subscribe-failed', error: e };
  }

  const json = sub.toJSON();
  const row = {
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh: json.keys && json.keys.p256dh,
    auth: json.keys && json.keys.auth,
    prefs: prefsPayload(),
    tz: tzName(),
    locale: getLocale(),
    updated_at: new Date().toISOString(),
  };
  // endpoint 唯一：同一台设备重复开关不会留下重复行
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: 'endpoint' });
  if (error) return { ok: false, reason: 'db', error };
  return { ok: true };
}

// 退订 + 删库（只删这台设备这条；其它设备的订阅不动）
async function unsubscribePush() {
  const sb = window.sbClient;
  const sub = await getPushSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch { /* ignore */ }
    if (sb) { try { await sb.from(TABLE).delete().eq('endpoint', endpoint); } catch { /* ignore */ } }
  }
  return { ok: true };
}

// 偏好变化时（习惯时间 / 周回顾开关 / 语言）若本机已订阅，把新值同步到那一行。
// 静默：没订阅 / 没登录就什么都不做。
async function syncPushPrefs() {
  const sb = window.sbClient;
  if (!sb) return;
  const sub = await getPushSubscription();
  if (!sub) return;
  try {
    await sb.from(TABLE).update({
      prefs: prefsPayload(),
      locale: getLocale(),
      tz: tzName(),
      updated_at: new Date().toISOString(),
    }).eq('endpoint', sub.endpoint);
  } catch { /* ignore */ }
}

Object.assign(window, { pushSupported, getPushSubscription, subscribePush, unsubscribePush, syncPushPrefs });

export { pushSupported, getPushSubscription, subscribePush, unsubscribePush, syncPushPrefs };
