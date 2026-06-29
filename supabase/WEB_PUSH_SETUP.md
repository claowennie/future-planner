# Web Push 部署指南（future.v2）

让 future 在 **app 完全关闭时**也能推「习惯提醒」和「周日晚周回顾」。
前端代码已就绪（`src/push.js` + 设置里的「远程推送」开关 + `public/sw.js` 的 `push` 监听）；
下面这几步是**你在 Supabase 后台做一次**的服务端部分。

> 本地通知（番茄结束、app 开着时的打卡提醒）不依赖这套，照常工作。Web Push 是「人不在也能叫醒你」的加强层。

---

## 0. 你需要的密钥（已生成）

VAPID 密钥对（这套就是当前 `src/supabase-config.js` 里公钥对应的私钥）：

- **公钥**（已写进前端 `window.VAPID_PUBLIC_KEY`，可公开）：
  `BC7AwA74brLS6WTJNEKhYEswfkSm3QXq0R5aLyNO_tO8vQaK5BP3xxygh7VZGDw0SiW2GWEZadUZ9OImFN6798E`
- **私钥**（机密，只放 Supabase Secrets，**绝不进任何前端文件 / git**）：
  小克会在对话里单独给你这串值，对应下面 `VAPID_PRIVATE_KEY`。

> 想重新生成：`npx web-push generate-vapid-keys --json`，把新公钥替换进 `src/supabase-config.js`，
> 新私钥更新到下面的 Secret，然后 `npm run build` 重新部署前端。换密钥会让**所有老订阅失效**（需重新开启）。

---

## 1. 建表 + RLS

Dashboard → **SQL Editor** → 粘贴执行 [`push_subscriptions.sql`](./push_subscriptions.sql)。
（建 `push_subscriptions` 表 + 行级安全：用户只能管自己的订阅。）

## 2. 设置 Edge Function 的 Secrets

Dashboard → **Edge Functions → Secrets**（或用 CLI），加这 4 个：

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | 上面那串公钥 |
| `VAPID_PRIVATE_KEY` | 对话里给你的私钥 |
| `VAPID_SUBJECT` | `mailto:cwm221382@gmail.com` |
| `CRON_SECRET` | 你自己随便定一串长随机字符串（cron 调用时要带，防止被乱触发） |

> `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 平台会自动注入，不用手填。

CLI 等价写法：
```bash
supabase secrets set VAPID_PUBLIC_KEY="BC7A...798E" \
  VAPID_PRIVATE_KEY="<对话里给你的私钥>" \
  VAPID_SUBJECT="mailto:cwm221382@gmail.com" \
  CRON_SECRET="<一串长随机字符串>"
```

## 3. 部署 Edge Function

函数代码在 [`functions/send-push/index.ts`](./functions/send-push/index.ts)。用 `--no-verify-jwt`
（改用 `CRON_SECRET` 自己鉴权）：

```bash
supabase functions deploy send-push --no-verify-jwt
```

> 没装 CLI：`npm i -g supabase`，再 `supabase login`、`supabase link --project-ref binhahyliwbgkfxzgaoh`。
> 也可以在 Dashboard → Edge Functions 里手动新建 `send-push` 函数、粘贴代码、关掉 "Verify JWT" 后部署。

## 4. 定时触发（pg_cron + pg_net）

Dashboard → **SQL Editor** 执行（把 `<CRON_SECRET>` 换成第 2 步那串）：

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-push-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://binhahyliwbgkfxzgaoh.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_fphUL8Mgy_l2h0-Lx6QySQ_DXVMJbF6',
      'Authorization','Bearer sb_publishable_fphUL8Mgy_l2h0-Lx6QySQ_DXVMJbF6',
      'x-cron-secret','<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

> ⚠️ 若函数是在 **Dashboard 网页里建**的（默认 **Verify JWT 开着**），cron 必须带上 `apikey` +
> `Authorization`（值都用前端那个公开 publishable key）才能过门卫——上面已经带了。
> 若是用 CLI `--no-verify-jwt` 部署的，则只要 `x-cron-secret` 也行，但带着这两个 header 无害。
> 改 cron 先 `select cron.unschedule('send-push-every-15min');` 再重建。
>
> 每 15 分钟跑一次。习惯提醒在「设定时间起 1 小时窗口」内命中一次（靠 `last_sent` 去重，一天最多一条）；
> 周回顾在周日 18:00 后命中一次。想更准时可改成 `*/10` 或 `*/5`。
> 改主意/重排：`select cron.unschedule('send-push-every-15min');` 再重建。

## 5. 自测

1. `npm run build` 后部署前端（Cloudflare 拖 `dist/`），用**https 或 localhost**打开（Web Push 要安全上下文）。
2. 登录账号 → 设置（齿轮）→ 提醒 → **开启远程推送**（会先要通知权限）。
3. 手动触发函数验证链路：
   ```bash
   curl -X POST 'https://binhahyliwbgkfxzgaoh.supabase.co/functions/v1/send-push' \
     -H 'x-cron-secret: <CRON_SECRET>'
   ```
   返回 `{ ok: true, total, sent, gone }`。把习惯提醒时间在设置里临时调到「现在的前一两分钟」、当天先别打卡，
   再 curl 一次，应能收到推送（手机锁屏 / 关掉标签页也能到）。
4. Edge Function 日志在 Dashboard → Edge Functions → send-push → Logs。

## 坑位备忘

- **iOS**：必须先把 future「添加到主屏幕」当 PWA 打开（Safari 16.4+）才能订阅/收到。普通 Safari 标签页不行。
- **国产安卓**：无 Google 服务（FCM）的机型常收不到 —— 这是系统层限制，本地通知是保底。
- **HTTPS**：Web Push 只在 https / localhost 下可用；Cloudflare Pages 自带 https，OK。
- **失效订阅**：用户清缓存/换设备后老 endpoint 会 404/410，函数会自动删行，不用管。
- **机密**：`VAPID_PRIVATE_KEY` / `CRON_SECRET` 只在 Supabase Secrets 里；本目录若将来入 git，记得 .gitignore 掉含密钥的文件（本指南用占位符，没写真实私钥）。
