-- Web Push 订阅表。一台设备一行（endpoint 唯一）。
-- 前端（push.js）以登录态 upsert/delete/select 自己的订阅；Edge Function 用 service_role
-- 读全表 + 写 last_sent（绕过 RLS）。在 Supabase Dashboard → SQL Editor 执行一次即可。
-- 完整部署步骤见 supabase/WEB_PUSH_SETUP.md。

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  prefs       jsonb not null default '{}'::jsonb,   -- { habitReminder, habitTime:'HH:MM', weekReview }
  tz          text  not null default 'UTC',          -- IANA 时区，如 'Asia/Shanghai'
  locale      text  not null default 'zh',
  last_sent   jsonb not null default '{}'::jsonb,    -- { habit:'YYYY-MM-DD', week:'YYYY-MM-DD' } 去重用
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- 用户只能看/管自己的订阅行（前端走 anon key + 登录态）
drop policy if exists "push own select" on public.push_subscriptions;
drop policy if exists "push own insert" on public.push_subscriptions;
drop policy if exists "push own update" on public.push_subscriptions;
drop policy if exists "push own delete" on public.push_subscriptions;

create policy "push own select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push own insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push own update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push own delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
