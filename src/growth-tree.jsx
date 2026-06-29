// Background growth tree — spans the entire window as a fixed background layer.
// More refined botanical illustration; stage + season + time-of-day drive what's drawn.
import React from 'react';
import ReactDOM from 'react-dom';
import { useStore } from './store.jsx';
import { t, tArr } from './i18n.js';

const { useState, useEffect } = React;

function getSeason(d = new Date()) {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

function getTimeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return 'night';
  if (h < 11) return 'morning';
  if (h < 17) return 'day';
  if (h < 20) return 'dusk';
  return 'night';
}

const SEASON_PALETTES = {
  spring: { leaf1: '#7fa46e', leaf2: '#a8c389', leaf3: '#c8d99a', accent: '#e9b5c4', accent2: '#dfa3b8', ground: '#bfca8d' },
  summer: { leaf1: '#3e6b48', leaf2: '#5e8a5c', leaf3: '#7da176', accent: '#d8a85a', accent2: '#c69142', ground: '#90a36b' },
  autumn: { leaf1: '#a35a32', leaf2: '#c47b3e', leaf3: '#d49658', accent: '#8a3a2a', accent2: '#7a3020', ground: '#a8895a' },
  winter: { leaf1: '#4e6a55', leaf2: '#6a8472', leaf3: '#8aa28d', accent: '#c8d4ca', accent2: '#aab8af', ground: '#a8a995' },
};

function getStage(streak) {
  if (streak <= 0) return 0;
  if (streak <= 3) return 1;
  if (streak <= 7) return 2;
  if (streak <= 14) return 3;
  if (streak <= 30) return 4;
  if (streak <= 60) return 5;
  return 6;
}

const STAGE_NAMES = tArr('tree.stageNames');   // 跟随界面语言（切语言会 reload）
const STAGE_LABELS_EN = ['Seed', 'Sprout', 'Seedling', 'Sapling', 'Growing', 'Flourishing', 'Ancient Tree'];

// ===== Background tree (fixed, full viewport) =====
// The world (sky · clouds · birds · hills · seasonal particles) is the
// self-contained BackgroundScene; the growth tree itself is FourSeasonsTree.
// Both are Claude-designed, share season/tod, and use the bg-tree-svg class so
// the existing dusk/night CSS filters still tint the tree.
function BackgroundTree() {
  const store = useStore();
  const streak = store.overallStreak || 0;
  const stage = getStage(streak);
  const season = getSeason();
  const tod = getTimeOfDay();

  return (
    <div className={`bg-tree-layer tod-${tod} season-${season}`} aria-hidden="true">
      {window.BackgroundScene && <window.BackgroundScene season={season} tod={tod} />}
      <div className="bg-tree-wrap">
        {window.FourSeasonsTree && <window.FourSeasonsTree stage={stage} season={season} tod={tod} />}
      </div>
    </div>
  );
}

// ===== Growth stages gallery (七个阶段一览 — 点成长条弹出) =====
const STAGE_THRESHOLD_LABELS = tArr('tree.thresholds');
function GrowthStagesModal({ open, onClose, currentStage }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const season = getSeason();
  // Always render in 'day' tod so every stage is clearly visible (night/winter
  // would darken or strip the foliage), while still using the live season tint.
  // Portal to <body>: the growth pill has a persistent backdrop-filter, which
  // would otherwise make it the containing block for this position:fixed overlay
  // (overlay shrinks to the pill instead of covering the screen).
  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal growth-stages-modal">
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('tree.modalTitle')}</div>
          <div className="auth-sub">{t('tree.modalSub', { name: STAGE_NAMES[currentStage] })}</div>
        </div>
        <div className="growth-stages-grid">
          {[0,1,2,3,4,5,6].map(s => (
            <div className={`growth-stage-cell ${s === currentStage ? 'current' : ''}`} key={s}>
              <div className="growth-stage-tree">
                {window.FourSeasonsTree && <window.FourSeasonsTree stage={s} season={season} tod="day" />}
              </div>
              <div className="growth-stage-meta">
                <div className="growth-stage-name">{STAGE_NAMES[s]}{s === currentStage && <span className="growth-stage-here">{t('tree.here')}</span>}</div>
                <div className="growth-stage-en">{STAGE_LABELS_EN[s]}</div>
                <div className="growth-stage-days">{STAGE_THRESHOLD_LABELS[s]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ), document.body);
}

// ===== Compact growth-status pill (used inside Today view header) =====
function GrowthStatusPill({ streak }) {
  const stage = getStage(streak || 0);
  const nextThresholds = [1, 4, 8, 15, 31, 61, null];
  const next = nextThresholds[stage];
  const palette = SEASON_PALETTES[getSeason()];
  const [galleryOpen, setGalleryOpen] = useState(false);

  return (
    <>
    <div className="growth-pill growth-pill-clickable" onClick={() => setGalleryOpen(true)} title={t('tree.pillTitle')}>
      <div className="growth-pill-icon" style={{ color: palette.leaf2 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21c0-7 4-12 9-13-1 7-4 12-9 13z" fill="currentColor" fillOpacity="0.25"/>
          <path d="M12 21c-1-4-1-8 0-12"/>
          <path d="M11 21c-3-1-5-3-6-6"/>
        </svg>
      </div>
      <div className="growth-pill-text">
        <div className="growth-pill-stage">{STAGE_NAMES[stage]} <span className="growth-pill-en">· {STAGE_LABELS_EN[stage]}</span></div>
        <div className="growth-pill-streak">
          <span className="growth-pill-num serif">{streak || 0}</span>
          <span className="growth-pill-unit">{t('tree.streakUnit')}</span>
          {next && <span className="growth-pill-next">{t('tree.next', { n: next - (streak || 0), name: STAGE_NAMES[stage + 1] })}</span>}
          {!next && <span className="growth-pill-next">{t('tree.maxed')}</span>}
        </div>
      </div>
    </div>
    <GrowthStagesModal open={galleryOpen} onClose={() => setGalleryOpen(false)} currentStage={stage} />
    </>
  );
}

// Preload + decode the stage PNGs so the「七个阶段」gallery and the background
// tree appear instantly instead of fetching/decoding 6 rasters on open. Stage 6
// is inline SVG (already instant) — this brings stages 0–5 up to parity. Refs are
// kept alive in window.__treeImgPreloaded so the browser doesn't evict the decode.
(function preloadTreeImages() {
  if (window.__treeImgPreloaded) return;
  window.__treeImgPreloaded = [];
  const srcsFor = (season) => season === 'winter'
    ? [0, 1, 2, 3, 4, 5, 6].map(n => `assets/winter-${n}.png`)
    : [0, 1, 2, 3, 4, 5].map(n => `assets/${season}-${n}.png`);
  const warm = (src) => {
    const img = new Image();
    img.src = src;
    if (img.decode) img.decode().catch(() => {});
    window.__treeImgPreloaded.push(img);
  };
  const here = getSeason();
  srcsFor(here).forEach(warm);                       // current season first (eager)
  const rest = ['spring', 'summer', 'autumn', 'winter'].filter(s => s !== here);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 800));
  idle(() => rest.forEach(s => srcsFor(s).forEach(warm)));   // other seasons in idle time
})();

Object.assign(window, { BackgroundTree, GrowthStatusPill, GrowthStagesModal, getSeason, getTimeOfDay, getStage, STAGE_NAMES, STAGE_LABELS_EN });

export { BackgroundTree, GrowthStatusPill, GrowthStagesModal, getSeason, getTimeOfDay, getStage, STAGE_NAMES, STAGE_LABELS_EN };
