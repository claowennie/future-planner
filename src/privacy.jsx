// 隐私政策弹窗。单例 Host 挂在 app.jsx 根部，任何地方 openPrivacy() 即可打开
// （登录/注册弹窗页脚、设置弹窗都有入口）。
// 正文整段按语言切换（zh / en 两个 JSX 版本）——比拆三十个 key 好维护；改内容记得两边同步。
import React from 'react';
import ReactDOM from 'react-dom';
import { t, getLocale } from './i18n.js';

const { useState, useEffect } = React;

let _set = null;
function openPrivacy() { if (_set) _set(true); }

const UPDATED = '2026-06-12';

function ZhBody() {
  return (
    <div className="privacy-body">
      <h4>我们存了什么</h4>
      <p>· <b>账号信息</b>：仅你的邮箱（用于登录和找回密码）。</p>
      <p>· <b>应用数据</b>：待办、习惯打卡、番茄钟次数、五件好事、心得、成功日记、随手笔记、OKR 等。
        未登录时只存在本机浏览器（localStorage）；登录后同步到 Supabase 云端数据库。</p>
      <p>· <b>笔记图片</b>：登录后上传到 Supabase 私有存储桶，按账号隔离，外人无法访问。</p>

      <h4>谁能看到</h4>
      <p>只有你。云端数据库启用行级安全（RLS）：每一行都绑定你的账号，其他用户、
        包括匿名访问者都读不到、改不了。我们没有后台查看你内容的功能。</p>

      <h4>错误报告</h4>
      <p>仅在线上版本里，应用崩溃时会把错误堆栈发送到 Sentry 用于修复 bug。
        报告不包含你的笔记、待办等内容，也不收集 IP 等个人信息（已关闭 PII 收集）。</p>

      <h4>第三方服务</h4>
      <p>Supabase（数据库 / 登录 / 图片存储）、Sentry（错误监控）、Cloudflare Pages（网页托管）。
        没有广告，没有数据出售，没有第三方追踪脚本。</p>

      <h4>你的数据，你说了算</h4>
      <p>· <b>导出</b>：设置里的「导出备份」可随时把全部数据下载为 JSON 文件。</p>
      <p>· <b>删除</b>：设置里的「注销账号」会永久删除云端的全部数据、图片和登录账号，不可恢复。</p>

      <h4>联系</h4>
      <p>有任何疑问或数据请求，写信给 <b>cwm221382@gmail.com</b>。</p>
    </div>
  );
}

function EnBody() {
  return (
    <div className="privacy-body">
      <h4>What we store</h4>
      <p>· <b>Account info</b>: only your email (for sign-in and password recovery).</p>
      <p>· <b>App data</b>: tasks, habit check-ins, pomodoro counts, five good things, reflections,
        journal entries, notes, OKRs. Signed out, everything lives only in this browser (localStorage);
        signed in, it syncs to a Supabase database.</p>
      <p>· <b>Note images</b>: uploaded to a private Supabase storage bucket, isolated per account.</p>

      <h4>Who can see it</h4>
      <p>Only you. The database uses row-level security (RLS): every row is bound to your account —
        other users and anonymous visitors can neither read nor modify it. There is no admin backdoor
        to view your content.</p>

      <h4>Error reports</h4>
      <p>In production builds only, crashes send a stack trace to Sentry so bugs can be fixed.
        Reports contain none of your notes or tasks, and PII collection (e.g. IP) is disabled.</p>

      <h4>Third-party services</h4>
      <p>Supabase (database / auth / image storage), Sentry (error monitoring), Cloudflare Pages (hosting).
        No ads, no data sales, no third-party trackers.</p>

      <h4>Your data, your call</h4>
      <p>· <b>Export</b>: “Export backup” in Settings downloads everything as a JSON file, anytime.</p>
      <p>· <b>Delete</b>: “Delete account” in Settings permanently removes all cloud data, images and
        the account itself. Irreversible.</p>

      <h4>Contact</h4>
      <p>Questions or data requests: <b>cwm221382@gmail.com</b>.</p>
    </div>
  );
}

function PrivacyHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => { _set = setOpen; return () => { _set = null; }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="auth-modal privacy-modal">
        <button className="auth-close" onClick={() => setOpen(false)}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('privacy.title')}</div>
          <div className="auth-sub">{t('privacy.updated', { date: UPDATED })}</div>
        </div>
        {getLocale() === 'en' ? <EnBody /> : <ZhBody />}
      </div>
    </div>
  ), document.body);
}

Object.assign(window, { openPrivacy, PrivacyHost });

export { openPrivacy, PrivacyHost };
