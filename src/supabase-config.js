// Supabase project credentials.
// Safe to be public — anon/publishable key is browser-safe by design.
// Row-Level Security in the database is what protects user data.
window.SUPABASE_CONFIG = {
  url: 'https://binhahyliwbgkfxzgaoh.supabase.co',
  key: 'sb_publishable_fphUL8Mgy_l2h0-Lx6QySQ_DXVMJbF6',
};

// Web Push 的 VAPID 公钥（applicationServerKey）。公钥本就该公开 —— 浏览器订阅时要带它，
// 服务端用配套的【私钥】签名（私钥只放 Supabase Secrets，绝不进任何前端文件 / dist）。
// 换/重生成密钥：见 supabase/WEB_PUSH_SETUP.md。
window.VAPID_PUBLIC_KEY = 'BC7AwA74brLS6WTJNEKhYEswfkSm3QXq0R5aLyNO_tO8vQaK5BP3xxygh7VZGDw0SiW2GWEZadUZ9OImFN6798E';
