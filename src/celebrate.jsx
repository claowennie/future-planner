// 可复用的「庆祝」提示：缩放淡入的卡片，自动消失、可点关闭。
// 用法：celebrate({ icon: '🌱', title: '新功能解锁', sub: '本周规划' })
// 渐进解锁的解锁时刻先用它；成长树升阶动画后续可复用同一底子（更隆重的版本）。
import React from 'react';
import ReactDOM from 'react-dom';
import { t } from './i18n.js';

const { useState, useEffect } = React;

const EVENT = 'future:celebrate';
const TREE_EVENT = 'future:tree-stage';
let seq = 0;

// 任意模块（含非 React）都能触发
function celebrate(detail) {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: detail || {} })); } catch { /* ignore */ }
}

// 成长树升阶：更隆重的全屏庆祝（与 toast 共用动画语言）。detail = { stage, name }
function treeStageUp(detail) {
  try { window.dispatchEvent(new CustomEvent(TREE_EVENT, { detail: detail || {} })); } catch { /* ignore */ }
}

const AUTO_MS = 4200;

function CelebrationHost() {
  const [items, setItems] = useState([]);   // { id, icon, title, sub, leaving }

  useEffect(() => {
    const onCelebrate = (e) => {
      const id = ++seq;
      const d = (e && e.detail) || {};
      setItems((cur) => [...cur, { id, icon: d.icon || '🎉', title: d.title || '', sub: d.sub || '' }]);
      // 进场后排定自动退场
      setTimeout(() => dismiss(id), AUTO_MS);
    };
    window.addEventListener(EVENT, onCelebrate);
    return () => window.removeEventListener(EVENT, onCelebrate);
  }, []);

  const dismiss = (id) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, leaving: true } : it)));
    setTimeout(() => setItems((cur) => cur.filter((it) => it.id !== id)), 280);
  };

  if (!items.length) return null;
  return ReactDOM.createPortal((
    <div className="celebrate-host" aria-live="polite">
      {items.map((it) => (
        <button key={it.id} className={`celebrate-toast ${it.leaving ? 'leaving' : ''}`} onClick={() => dismiss(it.id)}>
          <span className="celebrate-icon">{it.icon}</span>
          <span className="celebrate-text">
            {it.title && <span className="celebrate-title">{it.title}</span>}
            {it.sub && <span className="celebrate-sub">{it.sub}</span>}
          </span>
        </button>
      ))}
    </div>
  ), document.body);
}

// ===== 成长树升阶：全屏庆祝 =====
// 暗化背景 + 居中弹出「新阶段的树」+ 柔光 + 阶段名。点任意处或 6 秒后退场。
function TreeStageUp() {
  const [data, setData] = useState(null);   // { stage, name }

  useEffect(() => {
    const on = (e) => setData((e && e.detail) || {});
    window.addEventListener(TREE_EVENT, on);
    return () => window.removeEventListener(TREE_EVENT, on);
  }, []);
  useEffect(() => {
    if (!data) return undefined;
    const id = setTimeout(() => setData(null), 6000);
    const onKey = (e) => { if (e.key === 'Escape') setData(null); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [data]);

  if (!data) return null;
  const season = (window.getSeason && window.getSeason()) || 'summer';
  const Tree = window.FourSeasonsTree;
  return ReactDOM.createPortal((
    <div className="treeup-overlay" onClick={() => setData(null)}>
      <div className="treeup-card" onClick={(e) => e.stopPropagation()}>
        <div className="treeup-glow" />
        <div className="treeup-tree">{Tree && <Tree stage={data.stage} season={season} tod="day" />}</div>
        <div className="treeup-title serif">{t('tree.levelUpTitle')}</div>
        {data.name && <div className="treeup-name">{data.name}</div>}
        <div className="treeup-sub">{t('tree.levelUpSub')}</div>
        <button className="btn btn-primary treeup-btn" onClick={() => setData(null)}>{t('tree.levelUpBtn')}</button>
      </div>
    </div>
  ), document.body);
}

Object.assign(window, { celebrate, treeStageUp, CelebrationHost, TreeStageUp });

export { celebrate, treeStageUp, CelebrationHost, TreeStageUp };
