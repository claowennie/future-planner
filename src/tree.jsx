/* =========================================================================
   tree.jsx — FourSeasonsTree({ stage, season, tod })
     stage  0-6 · season spring|summer|autumn|winter · tod ignored
   Stage 6 == the exact stage_6.svg (leafy seasons). Earlier stages GROW in
   structure (visible trunk + branches + leaf-puffs) toward it. Winter shows
   the natural bare branch skeleton.
   Root pinned to bottom (y≈780), centred x≈300, viewBox 0 0 600 800.
   Requires: seasons.jsx, canonical.jsx, parametric.jsx
   ========================================================================= */
import React from 'react';
import { SEASONS, r1 } from './seasons.jsx';
import { CanonicalTree } from './canonical.jsx';
import { ParaTree } from './parametric.jsx';

const S0 = 1.45;                 // full-size scale (stage 6) of the 512 art
const ORX = 259, ORY = 428;      // root point in original art coords
const SHADOW_RX = [60, 30, 64, 96, 120, 150, 202];

/* Winter: real cut-out photos per stage (magenta keyed out).
   h = target height in the 600x800 viewBox; bf = trunk-base x as fraction of
   image width; aspect = w/h of the cut-out. Bottom pinned to the baseline. */
/* Unified height progression shared by ALL seasons (stages 0-6), so every
   column shows the same tree size at a given stage, and sizes grow strictly
   small -> large across the growth stages. Stage 6 (~545) matches the scaled
   canonical SVG height (S0 below). */
const STAGE_H = [56, 150, 250, 345, 430, 490, 545];

const WINTER_IMG = [
  { src: 'assets/winter-0.png', h: STAGE_H[0], bf: 0.5075, aspect: 1.2343 },
  { src: 'assets/winter-1.png', h: STAGE_H[1], bf: 0.4937, aspect: 0.5112 },
  { src: 'assets/winter-2.png', h: STAGE_H[2], bf: 0.4919, aspect: 0.5502 },
  { src: 'assets/winter-3.png', h: STAGE_H[3], bf: 0.4739, aspect: 0.5054 },
  { src: 'assets/winter-4.png', h: STAGE_H[4], bf: 0.5225, aspect: 0.7206 },
  { src: 'assets/winter-5.png', h: STAGE_H[5], bf: 0.5219, aspect: 0.8753 },
  { src: 'assets/winter-6.png', h: STAGE_H[6], bf: 0.5202, aspect: 1.0022 },
];

/* Spring/summer/autumn: cut-out photo stages 0-5 (magenta + shadow removed).
   Summer/autumn are foliage-recolored derivatives of the spring art, so the
   geometry (h / bf / aspect) is shared. Heights preserve the true relative
   scale measured from the source art. src = `assets/${season}-${stage}.png`. */
const SEASON_IMG = [
  { h: STAGE_H[0], bf: 0.42,  aspect: 1.069 },
  { h: STAGE_H[1], bf: 0.492, aspect: 0.511 },
  { h: STAGE_H[2], bf: 0.515, aspect: 0.723 },
  { h: STAGE_H[3], bf: 0.503, aspect: 0.777 },
  { h: STAGE_H[4], bf: 0.506, aspect: 0.833 },
  { h: STAGE_H[5], bf: 0.482, aspect: 0.840 },
];

function FourSeasonsTree({ stage, season, tod }) {
  const uid = React.useId().replace(/[:]/g, '');
  const S = SEASONS[season] ? season : 'summer';
  const pal = SEASONS[S];
  stage = Math.max(0, Math.min(6, stage | 0));

  const svgProps = {
    viewBox: '0 0 600 800', preserveAspectRatio: 'xMidYMax meet',
    width: '100%', height: '100%', className: 'bg-tree-svg',
  };
  const shadow = (
    <ellipse cx="300" cy="783" rx={SHADOW_RX[stage]} ry={r1(SHADOW_RX[stage] * 0.12)}
      fill="#6C7564" opacity="0.18" />
  );

  /* ---------- winter : real cut-out photo per stage ---------- */
  if (pal.bare) {
    const w = WINTER_IMG[stage];
    const ih = w.h, iw = r1(w.h * w.aspect);
    const ix = r1(300 - iw * w.bf), iy = r1(785 - ih);
    const snowRx = r1(iw * 0.44);
    return (
      <svg {...svgProps}>
        <ellipse cx="300" cy="783" rx={r1(iw * 0.34)} ry={r1(iw * 0.34 * 0.12)}
          fill="#6C7564" opacity="0.14" />
        {/* snow ring on the ground — back mound behind the trunk */}
        <ellipse cx="300" cy={r1(790)} rx={snowRx} ry={r1(snowRx * 0.135)}
          fill="#E6EBEC" opacity="0.9" />
        <ellipse cx="300" cy={r1(786)} rx={r1(snowRx * 0.9)} ry={r1(snowRx * 0.12)}
          fill="#F7F5EF" />
        <image href={w.src} x={ix} y={iy} width={iw} height={ih}
          preserveAspectRatio="xMidYMax meet" />
        {/* front lip of snow piled against the trunk base */}
        <ellipse cx="300" cy={r1(792)} rx={r1(snowRx * 0.6)} ry={r1(snowRx * 0.105)}
          fill="#FBFAF5" />
        <ellipse cx="300" cy={r1(789)} rx={r1(snowRx * 0.34)} ry={r1(snowRx * 0.06)}
          fill="#FFFFFF" opacity="0.7" />
      </svg>
    );
  }

  /* ---------- spring / summer / autumn : cut-out photo stages 0-5 ---------- */
  if (stage <= 5) {
    const w = SEASON_IMG[stage];
    const ih = w.h, iw = r1(w.h * w.aspect);
    const ix = r1(300 - iw * w.bf), iy = r1(785 - ih);
    return (
      <svg {...svgProps}>
        <ellipse cx="300" cy="783" rx={r1(iw * 0.32)} ry={r1(iw * 0.32 * 0.12)}
          fill="#6C7564" opacity="0.12" />
        <image href={`assets/${S}-${stage}.png`} x={ix} y={iy} width={iw} height={ih}
          preserveAspectRatio="xMidYMax meet" />
      </svg>
    );
  }

  /* ---------- stage 6 : the exact art (leafy) / natural bare tree (winter) ---------- */
  if (stage === 6) {
    const tx = r1(300 - ORX * S0), ty = r1(780 - ORY * S0);
    return (
      <svg {...svgProps}>
        {shadow}
        <g transform={`translate(${tx} ${ty}) scale(${S0})`}>
          <CanonicalTree season={S} uid={uid} />
        </g>
      </svg>
    );
  }

  /* ---------- stages 2-5 : structural growth ---------- */
  if (stage >= 2) {
    return <svg {...svgProps}>{shadow}<ParaTree stage={stage} season={S} uid={uid} /></svg>;
  }

  /* ---------- stage 0 : seed ---------- */
  if (stage === 0) {
    return (
      <svg {...svgProps}>
        <defs>
          <radialGradient id={`seed${uid}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
            gradientTransform="translate(300 760) rotate(14) scale(26 17)">
            <stop stopColor="#8C694D" /><stop offset="1" stopColor="#5E4331" />
          </radialGradient>
        </defs>
        {shadow}
        <path d="M240 783 Q300 756 360 783 Z" fill="#8A7C63" opacity="0.45" />
        <ellipse cx="300" cy="760" rx="25" ry="16" fill={`url(#seed${uid})`} transform="rotate(12 300 760)" />
        <path d="M289 752 Q300 746 311 752" stroke="#C8B48F" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
        {(S === 'spring' || S === 'summer') &&
          <path d="M300 748 q-3 -15 -11 -21 q13 1 13 19" fill={pal.scale[S === 'spring' ? 3 : 2]} />}
        {S === 'winter' && <ellipse cx="300" cy="751" rx="20" ry="7" fill={pal.snow} opacity="0.92" />}
      </svg>
    );
  }

  /* ---------- stage 1 : sprout (嫩芽) — thin stem with leaf sprigs ---------- */
  const stem = pal.stem;
  const leaf = pal.bare ? null : pal.scale[3];
  const leafDk = pal.bare ? null : pal.scale[2];
  const sprig = (x, y, ang, c) => (
    <g>
      <path d={`M300 ${y} Q${r1(x - Math.sin(ang) * 4)} ${r1(y - 4)} ${r1(x)} ${r1(y - 6)}`}
        stroke={stem} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx={r1(x)} cy={r1(y - 7)} rx="11" ry="5.5" fill={c} transform={`rotate(${Math.round(ang * 57)} ${r1(x)} ${r1(y - 7)})`} />
    </g>
  );
  return (
    <svg {...svgProps}>
      {shadow}
      <path d="M300 780 Q303 720 300 654" stroke={stem} strokeWidth="5" fill="none" strokeLinecap="round" />
      {!pal.bare && <g>
        {sprig(276, 702, -0.7, leafDk)}
        {sprig(324, 686, 0.7, leaf)}
        {sprig(282, 668, -0.6, leaf)}
        <ellipse cx="300" cy="650" rx="12" ry="6.5" fill={leaf} />
        <ellipse cx="296" cy="647" rx="5" ry="2.6" fill={pal.hi} opacity="0.5" />
        {S === 'spring' && <>
          <circle cx="300" cy="644" r="4.5" fill={pal.flower[0]} />
          <circle cx="300" cy="644" r="1.8" fill={pal.flowerCore} />
        </>}
      </g>}
      {pal.bare && <>
        <path d="M300 690 q-12 -6 -20 -4" stroke={stem} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M300 676 q13 -6 22 -3" stroke={stem} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M300 662 q-10 -8 -18 -8" stroke={stem} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <ellipse cx="300" cy="652" rx="6" ry="3" fill={pal.snow} />
      </>}
    </svg>
  );
}

Object.assign(window, { FourSeasonsTree });

export { FourSeasonsTree };
