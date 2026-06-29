// 应用内确认/提示弹窗 —— 替代原生 confirm()/alert()。
// 原生弹窗的问题：样式突兀、阻塞主线程、PWA/standalone 里部分平台直接静默失败。
// 用法（调用方在事件处理器里 await）：
//   if (await appConfirm({ title:'删除习惯', message:'…', confirmText:'删除', danger:true })) {…}
//   await appAlert('导出失败：' + e.message);
// 实现：模块级队列 + 单例 ModalHost（挂在 app.jsx 根部）。多个请求排队逐个显示。
import React from 'react';
import ReactDOM from 'react-dom';
import { t } from './i18n.js';

const { useState, useEffect, useRef } = React;

let _push = null;        // ModalHost 挂载后注入
const _backlog = [];     // host 还没挂载时先排队（理论上不会发生，保险）

function _request(req) {
  return new Promise((resolve) => {
    const item = { ...req, resolve };
    if (_push) _push(item); else _backlog.push(item);
  });
}

// resolve true/false
function appConfirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return _request({
    kind: 'confirm',
    title: o.title || t('common.confirm'),
    message: o.message || '',
    confirmText: o.confirmText || t('common.ok'),
    cancelText: o.cancelText || t('common.cancel'),
    danger: !!o.danger,
  });
}

// resolve undefined（只是等用户看完）
function appAlert(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return _request({ kind: 'alert', title: o.title || t('common.tips'), message: o.message || '', confirmText: o.confirmText || t('common.gotIt') });
}

function ModalHost() {
  const [cur, setCur] = useState(null);
  const queueRef = useRef([]);

  useEffect(() => {
    _push = (item) => setCur((c) => {
      if (c) { queueRef.current.push(item); return c; }
      return item;
    });
    while (_backlog.length) _push(_backlog.shift());
    return () => { _push = null; };
  }, []);

  const close = (val) => {
    cur.resolve(val);
    setCur(queueRef.current.shift() || null);
  };

  useEffect(() => {
    if (!cur) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(cur.kind === 'confirm' ? false : undefined); }
      else if (e.key === 'Enter') { e.preventDefault(); close(cur.kind === 'confirm' ? true : undefined); }
    };
    window.addEventListener('keydown', onKey, true);   // capture：压过页面其他快捷键
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cur]);

  if (!cur) return null;
  const dismiss = () => close(cur.kind === 'confirm' ? false : undefined);
  return ReactDOM.createPortal((
    <div className="auth-overlay cfm-overlay" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="cfm-modal" role="dialog" aria-modal="true">
        <div className="cfm-title">{cur.title}</div>
        {cur.message && <div className="cfm-message">{cur.message}</div>}
        <div className="cfm-actions">
          {cur.kind === 'confirm' && (
            <button className="btn btn-ghost" onClick={() => close(false)}>{cur.cancelText}</button>
          )}
          <button className={`btn btn-primary ${cur.danger ? 'btn-danger' : ''}`} autoFocus
            onClick={() => close(cur.kind === 'confirm' ? true : undefined)}>
            {cur.confirmText}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

Object.assign(window, { appConfirm, appAlert, ModalHost });

export { appConfirm, appAlert, ModalHost };
