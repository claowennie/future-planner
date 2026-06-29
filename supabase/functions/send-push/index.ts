// Supabase Edge Function：send-push
// 由 pg_cron 每 ~15 分钟调一次。遍历 push_subscriptions，按每个订阅的【本地时区时间】+
// 偏好决定是否推送，去重靠 last_sent。两类推送：
//   · habit  —— 到设定的提醒时间、当天还没打卡、今天没推过 → 催一下打卡
//   · week   —— 周日 ≥18:00、本周日没推过 → 推「本周回顾」
// app 完全关闭时也能到达（这正是它相对本地通知的意义）。
//
// 需要的 Secrets（Dashboard → Edge Functions → Secrets，或 supabase secrets set）：
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT（mailto:你的邮箱）, CRON_SECRET
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入，不用手填）
// 部署：supabase functions deploy send-push --no-verify-jwt   （改用 CRON_SECRET 自己鉴权）
// 详见 supabase/WEB_PUSH_SETUP.md。

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// 文案（跟前端 i18n 对齐；点开导航到首页，周回顾在「本周」页，url 用相对 './'）
const MSG: Record<string, Record<string, { title: string; body: string; url: string }>> = {
  habit: {
    zh: { title: '今天还没打卡哦 🌱', body: '花一点点时间照顾今天的习惯，别让连续记录断掉。', url: './' },
    en: { title: 'Not checked in yet today 🌱', body: "Take a moment for today's habits — keep your streak alive.", url: './' },
  },
  week: {
    zh: { title: '🌿 本周回顾来啦', body: '这一周走完了 —— 看看你的本周回顾。', url: './' },
    en: { title: '🌿 Your Week in Review', body: 'The week is done — take a look at your Week in Review.', url: './' },
  },
};

// 取某 IANA 时区下的本地「日期 / 自零点起的分钟 / 星期几」
function localParts(tz: string, now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value;
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);   // 某些运行时零点给 '24'
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + parseInt(p.minute, 10),
    weekday: p.weekday, // 'Sun' | 'Mon' | ...
  };
}

// 读该用户的 planner_data，看今天是否已有任意习惯打卡（避免「已打卡还催」）
async function anyHabitDoneToday(userId: string, dateISO: string): Promise<boolean> {
  const { data } = await sb.from('planner_data').select('data').eq('user_id', userId).maybeSingle();
  const state = data?.data;
  if (!state || !Array.isArray(state.habits) || state.habits.length === 0) return true; // 没习惯就不催
  const hd = state.habitDays || {};
  return state.habits.some((h: { id: string }) => hd[h.id] && hd[h.id][dateISO]);
}

type Sub = {
  endpoint: string; user_id: string; p256dh: string; auth: string;
  prefs: { habitReminder?: boolean; habitTime?: string; weekReview?: boolean };
  tz: string; locale: string; last_sent: { habit?: string; week?: string };
};

async function send(sub: Sub, payload: { title: string; body: string; url: string }): Promise<'ok' | 'gone' | 'error'> {
  const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return 'ok';
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) {            // 订阅失效 → 清掉这一行
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      return 'gone';
    }
    console.error('push failed', code, (e as { body?: string })?.body || (e as Error)?.message);
    return 'error';
  }
}

Deno.serve(async (req) => {
  // 自己用 CRON_SECRET 鉴权（函数用 --no-verify-jwt 部署，避免还要带 JWT）
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const now = new Date();
  const { data: subs, error } = await sb.from('push_subscriptions').select('*');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, gone = 0;
  for (const sub of (subs ?? []) as Sub[]) {
    const prefs = sub.prefs || {};
    const last = sub.last_sent || {};
    const locale = sub.locale === 'en' ? 'en' : 'zh';
    let lp;
    try { lp = localParts(sub.tz || 'UTC', now); } catch { lp = localParts('UTC', now); }
    const patch: Record<string, string> = {};

    // 习惯提醒：到点后 ~1 小时窗口内、当天没打卡、今天没推过
    if (prefs.habitReminder) {
      const [hh, mm] = String(prefs.habitTime || '20:00').split(':').map(Number);
      const target = (Number.isFinite(hh) ? hh : 20) * 60 + (Number.isFinite(mm) ? mm : 0);
      if (lp.minutes >= target && lp.minutes < target + 60 && last.habit !== lp.date) {
        if (await anyHabitDoneToday(sub.user_id, lp.date)) {
          patch.habit = lp.date;                    // 已打卡：标记今天处理过，别再查
        } else {
          const r = await send(sub, MSG.habit[locale]);
          if (r === 'ok') { sent++; patch.habit = lp.date; }
          else if (r === 'gone') { gone++; continue; }
        }
      }
    }

    // 周回顾：周日 ≥18:00、本周日没推过
    if (prefs.weekReview !== false && lp.weekday === 'Sun' && lp.minutes >= 18 * 60 && last.week !== lp.date) {
      const r = await send(sub, MSG.week[locale]);
      if (r === 'ok') { sent++; patch.week = lp.date; }
      else if (r === 'gone') { gone++; continue; }
    }

    if (Object.keys(patch).length) {
      await sb.from('push_subscriptions').update({ last_sent: { ...last, ...patch } }).eq('endpoint', sub.endpoint);
    }
  }

  return new Response(JSON.stringify({ ok: true, total: subs?.length ?? 0, sent, gone }), {
    headers: { 'content-type': 'application/json' },
  });
});
