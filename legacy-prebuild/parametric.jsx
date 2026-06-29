/* =========================================================================
   parametric.jsx — structural growth for stages 2-5 (and the natural bare
   winter tree for stage 6). Builds a visible tapered trunk + branches, each
   ending in a rounded leaf-puff, so the tree gains STRUCTURE as it grows.
   Requires: seasons.jsx (mulberry32, r1, SEASONS, BlobCanopy)
   ========================================================================= */

function norm(x, y) { const m = Math.hypot(x, y) || 1; return [x / m, y / m]; }

/* tapered branch polygon along a quadratic curve, width w0 -> w1 */
function taperBranch(s) {
  const w1 = s.w0 / 2, w2 = s.w1 / 2, wc = (w1 + w2) / 2;
  const d1 = norm(s.cx - s.x0, s.cy - s.y0);
  const d2 = norm(s.x1 - s.cx, s.y1 - s.cy);
  const dc = norm(d1[0] + d2[0], d1[1] + d2[1]);
  const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]], nc = [-dc[1], dc[0]];
  const f = (px, py) => `${r1(px)},${r1(py)}`;
  return `M${f(s.x0 + n1[0] * w1, s.y0 + n1[1] * w1)} `
    + `Q${f(s.cx + nc[0] * wc, s.cy + nc[1] * wc)} ${f(s.x1 + n2[0] * w2, s.y1 + n2[1] * w2)} `
    + `L${f(s.x1 - n2[0] * w2, s.y1 - n2[1] * w2)} `
    + `Q${f(s.cx - nc[0] * wc, s.cy - nc[1] * wc)} ${f(s.x0 - n1[0] * w1, s.y0 - n1[1] * w1)} Z`;
}

/* tapered trunk with flared base + slight curve */
function trunkPath(L) {
  const bx = 300, by = 780, bw = L.trunkBaseW, tw = L.trunkTopW, ty = L.trunkTop, cur = L.trunkCurve || 0;
  const fl = bw * 0.55, mid = (by + ty) / 2;
  const topL = bx + cur - tw / 2, topR = bx + cur + tw / 2;
  return [
    `M${r1(bx - bw / 2 - fl)} ${by}`,
    `Q${r1(bx - bw / 2)} ${r1(by - bw * 0.45)} ${r1(bx - bw / 2)} ${r1(by - bw * 1.1)}`,
    `C${r1(bx - bw / 2 + 1)} ${r1(mid)} ${r1(topL - 1)} ${r1(ty + 44)} ${r1(topL)} ${r1(ty)}`,
    `Q${r1(bx + cur)} ${r1(ty - tw * 0.7)} ${r1(topR)} ${r1(ty)}`,
    `C${r1(topR + 1)} ${r1(ty + 44)} ${r1(bx + bw / 2 - 1)} ${r1(mid)} ${r1(bx + bw / 2)} ${r1(by - bw * 1.1)}`,
    `Q${r1(bx + bw / 2)} ${r1(by - bw * 0.45)} ${r1(bx + bw / 2 + fl)} ${by}`, 'Z',
  ].join(' ');
}

/* one leaf-puff = central blob + ring of smaller blobs, shaded by position */
function cluster(cx, cy, r, seed) {
  const rng = mulberry32(seed);
  const out = [{ x: cx, y: cy, r: r, rank: 2 }];
  const n = 5 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rng() * 0.6;
    const dx = Math.cos(a) * r * 0.66, dy = Math.sin(a) * r * 0.6;
    const rr = r * (0.5 + rng() * 0.33);
    let rank = dy < -r * 0.12 ? (dx < 0 ? 4 : 3) : (dy > r * 0.28 ? 0 : 1);
    out.push({ x: cx + dx, y: cy + dy, r: rr, rank });
  }
  return out;
}

/* per-stage structural layout (canvas 600x800, base at 300,780) */
const LAYOUT = {
  2: {
    trunkBaseW: 16, trunkTopW: 10, trunkTop: 612, trunkCurve: 5,
    branches: [{ x0: 300, y0: 650, cx: 282, cy: 636, x1: 258, y1: 632, w0: 8, w1: 4 }],
    clusters: [{ x: 300, y: 600, r: 38 }, { x: 256, y: 628, r: 26 }],
  },
  3: {
    trunkBaseW: 21, trunkTopW: 11, trunkTop: 486, trunkCurve: 3,
    branches: [
      { x0: 300, y0: 556, cx: 268, cy: 528, x1: 238, y1: 512, w0: 9, w1: 4 },
      { x0: 300, y0: 540, cx: 332, cy: 526, x1: 360, y1: 520, w0: 9, w1: 4 },
    ],
    clusters: [{ x: 300, y: 476, r: 44 }, { x: 234, y: 506, r: 38 }, { x: 364, y: 514, r: 34 }],
  },
  4: {
    trunkBaseW: 27, trunkTopW: 12, trunkTop: 400, trunkCurve: 2,
    branches: [
      { x0: 300, y0: 612, cx: 262, cy: 572, x1: 232, y1: 548, w0: 10, w1: 4 },
      { x0: 300, y0: 592, cx: 340, cy: 572, x1: 372, y1: 556, w0: 10, w1: 4 },
      { x0: 300, y0: 500, cx: 272, cy: 472, x1: 248, y1: 452, w0: 9, w1: 4 },
      { x0: 300, y0: 484, cx: 328, cy: 462, x1: 352, y1: 448, w0: 9, w1: 4 },
    ],
    clusters: [
      { x: 300, y: 392, r: 46 }, { x: 226, y: 540, r: 38 }, { x: 378, y: 548, r: 34 },
      { x: 242, y: 444, r: 42 }, { x: 358, y: 440, r: 40 },
    ],
  },
  5: {
    trunkBaseW: 33, trunkTopW: 14, trunkTop: 360, trunkCurve: 2,
    branches: [
      { x0: 300, y0: 624, cx: 256, cy: 580, x1: 220, y1: 552, w0: 12, w1: 5 },
      { x0: 300, y0: 604, cx: 344, cy: 580, x1: 384, y1: 560, w0: 12, w1: 5 },
      { x0: 300, y0: 520, cx: 264, cy: 484, x1: 236, y1: 456, w0: 11, w1: 5 },
      { x0: 300, y0: 504, cx: 336, cy: 480, x1: 366, y1: 456, w0: 11, w1: 5 },
    ],
    clusters: [
      { x: 300, y: 348, r: 54 }, { x: 262, y: 374, r: 46 }, { x: 340, y: 374, r: 46 },
      { x: 300, y: 412, r: 50 }, { x: 230, y: 448, r: 44 }, { x: 372, y: 448, r: 42 },
      { x: 214, y: 544, r: 40 }, { x: 390, y: 552, r: 38 },
    ],
  },
};

/* ---- recursive bare branches (stage 6 winter natural skeleton) ---------- */
function growBare(x, y, ang, len, w, depth, maxDepth, segs, rng) {
  const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len;
  const sway = (rng() - 0.5) * len * 0.18;
  const cx = (x + ex) / 2 + Math.cos(ang) * sway, cy = (y + ey) / 2 + Math.sin(ang) * sway;
  segs.push({ x0: x, y0: y, cx, cy, x1: ex, y1: ey, w0: w, w1: w * 0.62 });
  if (depth >= maxDepth || w < 2) return;
  const spread = 0.42 + 0.08 * depth;
  for (let i = 0; i < 2; i++) {
    const childAng = ang + (i ? 1 : -1) * (spread + rng() * 0.18) + (rng() - 0.5) * 0.12;
    growBare(ex, ey, childAng, len * (0.74 + rng() * 0.12), w * 0.66, depth + 1, maxDepth, segs, rng);
  }
  if (rng() < 0.55) growBare(ex, ey, ang + (rng() - 0.5) * 0.3, len * (0.7 + rng() * 0.1), w * 0.58, depth + 1, maxDepth, segs, rng);
}

/* ============================ stages 2-5 ================================= */
function ParaTree({ stage, season, uid }) {
  const pal = SEASONS[season];
  const L = LAYOUT[stage];
  const T = `pt${uid}`;
  const rng = mulberry32(0x4400 + stage * 17 + season.charCodeAt(0));
  const blobs = [];
  L.clusters.forEach((c, i) => cluster(c.x, c.y, c.r, 0x77 + stage * 131 + i * 19).forEach(b => blobs.push(b)));

  const branchEls = L.branches.map((b, i) => (
    <g key={i}>
      <path d={taperBranch(b)} fill={`url(#${T})`} />
      <circle cx={r1(b.x1)} cy={r1(b.y1)} r={r1(b.w1 / 2)} fill={`url(#${T})`} />
    </g>
  ));

  return (
    <g>
      <defs>
        <linearGradient id={T} x1="250" y1={L.trunkTop} x2="350" y2="780" gradientUnits="userSpaceOnUse">
          <stop stopColor="#745440" /><stop offset="0.52" stopColor="#644833" /><stop offset="1" stopColor="#4E3929" />
        </linearGradient>
      </defs>

      {/* ground litter */}
      {(season === 'spring' || season === 'autumn') && Array.from({ length: stage * 2 }).map((_, i) => {
        const x = 300 + (rng() - 0.5) * L.trunkBaseW * 7, y = 770 + rng() * 12;
        const cols = season === 'spring' ? pal.flower : ['#C77A33', '#B5532C', '#D89B4B'];
        return <ellipse key={'g' + i} cx={r1(x)} cy={r1(y)} rx={3} ry={1.6} fill={cols[i % cols.length]}
          opacity={0.8} transform={`rotate(${Math.round(rng() * 180)} ${r1(x)} ${r1(y)})`} />;
      })}

      {branchEls}
      <path d={trunkPath(L)} fill={`url(#${T})`} />

      {!pal.bare && <>
        <BlobCanopy blobs={blobs} season={season} uid={uid} flowers={season === 'spring'} />
        {season === 'autumn' && pal.accent && L.clusters.filter((_, i) => i % 2 === 0).map((c, i) => (
          <circle key={'a' + i} cx={r1(c.x + (rng() - 0.5) * c.r)} cy={r1(c.y + (rng() - 0.5) * c.r)}
            r={4} fill={pal.accent[i % 2]} opacity={0.8} />
        ))}
      </>}

      {/* winter: bare twigs + snow on the structural branches */}
      {pal.bare && <>
        <g stroke={pal.stem} strokeLinecap="round" fill="none">
          {L.clusters.map((c, i) => {
            const tw = [];
            for (let k = 0; k < 3; k++) {
              const a = -1.2 + k * 0.5 + (rng() - 0.5) * 0.3, ln = 14 + rng() * 12;
              tw.push(<path key={i + '_' + k} strokeWidth={2.4}
                d={`M${r1(c.x)} ${r1(c.y + 4)} Q${r1(c.x + Math.sin(a) * ln * 0.5)} ${r1(c.y + 4 - Math.cos(a) * ln * 0.6)} ${r1(c.x + Math.sin(a) * ln)} ${r1(c.y + 4 - Math.cos(a) * ln)}`} />);
            }
            return tw;
          })}
        </g>
        {L.clusters.map((c, i) => (
          <ellipse key={'s' + i} cx={r1(c.x)} cy={r1(c.y - 6)} rx={r1(c.r * 0.32 + 3)} ry={r1(c.r * 0.16 + 2)}
            fill={pal.snow} opacity={0.95} />
        ))}
      </>}
    </g>
  );
}

/* ====================== stage 6 winter: original tree, bare ==============
   Keeps the EXACT stage_6 trunk + branch detail, then grows natural bare
   branches out of its fork to fill the original crown area. Rendered in the
   original 512-space; the caller applies the canvas transform.            */
function BigBareTree({ uid }) {
  const pal = SEASONS.winter;
  const T = `bb${uid}`;
  const segs = [];
  const rng = mulberry32(0xB16E);
  // grow from points on the upper trunk, fanning into the crown silhouette
  const starts = [
    [236, 244, -0.62, 56], [255, 220, -0.22, 62], [272, 224, 0.22, 60],
    [296, 246, 0.66, 56], [260, 256, 0.0, 58],
  ];
  starts.forEach(([x, y, a, l]) => growBare(x, y, a, l, 9, 0, 4, segs, rng));

  const snow = [];
  segs.filter(s => s.w0 < 6 && s.y1 < 240).forEach((s, i) => {
    if (rng() < 0.4) snow.push(<ellipse key={'s' + i} cx={r1(s.x1)} cy={r1(s.y1 - s.w1)}
      rx={r1(s.w0 * 1.2 + 1.2)} ry={r1(s.w0 * 0.6 + 1)} fill={pal.snow} opacity={0.95} />);
  });

  return (
    <g>
      <defs>
        <linearGradient id={T} x1="190" y1="150" x2="320" y2="440" gradientUnits="userSpaceOnUse">
          <stop stopColor="#745440" /><stop offset="0.52" stopColor="#644833" /><stop offset="1" stopColor="#4E3929" />
        </linearGradient>
      </defs>
      {/* original back branch detail */}
      <g stroke="#5F4431" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
        {ART.backBranch.map((d, i) => <path key={i} d={d} fill="none" />)}
      </g>
      {/* grown natural branches */}
      {segs.map((s, i) => (
        <g key={i}>
          <path d={taperBranch(s)} fill={`url(#${T})`} />
          <circle cx={r1(s.x1)} cy={r1(s.y1)} r={r1(s.w1 / 2)} fill={`url(#${T})`} />
        </g>
      ))}
      {/* the exact trunk */}
      <path d={ART.trunk} fill={`url(#${T})`} />
      {/* original front branch detail */}
      <g stroke="#5B412F" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round">
        {ART.frontBranch.map(([d, o], i) => <path key={i} d={d} opacity={o} fill="none" />)}
      </g>
      {snow}
    </g>
  );
}

Object.assign(window, { ParaTree, BigBareTree, LAYOUT, cluster, trunkPath, taperBranch });
