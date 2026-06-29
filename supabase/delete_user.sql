-- ============================================================
-- 注销账号 RPC（配合应用里的「注销账号」按钮）
-- 用法：把整个文件内容贴到 Supabase Dashboard → SQL Editor → Run，执行一次即可。
--
-- 为什么需要它：客户端凭 RLS 只能删自己的数据行和图片，但删除 auth.users
-- 里的用户本身需要服务端权限。这个函数用 SECURITY DEFINER（以函数创建者
-- 即 postgres 的身份执行），但只允许「已登录用户删除自己」：
--   delete ... where id = auth.uid()  ——  uid 来自调用者的 JWT，伪造不了。
-- 匿名用户（anon）被 revoke，无法调用。
--
-- 应用侧调用顺序（src/sync.jsx deleteAccount）：
--   1) 删 Storage note-images/<uid>/ 下的图片（客户端 RLS 放行）
--   2) 删 planner_data 数据行（客户端 RLS 放行）
--   3) rpc('delete_user') —— 本函数，删 auth 用户
-- ============================================================

create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

-- 收紧执行权限：只有已登录用户能调，匿名不行
revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
