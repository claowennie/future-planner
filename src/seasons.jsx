/* =========================================================================
   seasons.jsx — palettes, leaf recolor map, helpers
   All colours live in the sage-green + cream low-saturation warm family.
   Summer == the exact stage_6.svg colours (the 定本).
   ========================================================================= */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let z = Math.imul(a ^ (a >>> 15), 1 | a);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (n) => Math.round(n * 10) / 10;

/* Per-season palette for the BESPOKE young stages (seed/sprout/seedling) and
   for decorations. scale = leaf-blob shades dark→light.                     */
const SEASONS = {
  spring: {
    scale: ['#86B06A', '#95BD78', '#9CC07C', '#ABCB88', '#BFD89C'],
    back: '#8FB76E', hi: '#DCEBC4', dotHi: '#ECF4D9', dotLo: '#AEC58C',
    stem: '#6D503B',
    flower: ['#F2CBD8', '#E9B6C8', '#FBF4E8'], flowerCore: '#F6E7B8',
  },
  summer: {
    scale: ['#638850', '#6B9358', '#739A5F', '#7DA264', '#8FB173'],
    back: '#688F52', hi: '#B4CD92', dotHi: '#C1D4A0', dotLo: '#95A967',
    stem: '#6D503B',
  },
  autumn: {
    scale: ['#A8662F', '#C07A35', '#CC8A3E', '#D89B4B', '#E3B35F'],
    back: '#B5742F', hi: '#EAD191', dotHi: '#EFD79C', dotLo: '#B5532C',
    stem: '#6D503B',
    accent: ['#B5532C', '#C56A30'],
  },
  winter: {
    bare: true, snow: '#F3EFE6', snowSh: '#DCE1DF', stem: '#6D503B',
  },
};

/* Recolour map for the EXACT stage_6 art (canonical tree).
   Maps every original leaf colour → the season equivalent.                  */
const LEAFMAP = {
  summer: null, // identity
  spring: {
    '#97B978': '#B7D396', '#5F874D': '#86B06A',
    '#7EA667': '#A4C786', '#527645': '#7BA45E',
    '#B4CD92': '#DCEBC4',
    '#6B9358': '#9CC07C', '#7DA264': '#ABCB88', '#638850': '#86B06A',
    '#8FB173': '#BFD89C', '#739A5F': '#9AC07E',
    '#C1D4A0': '#ECF4D9', '#95A967': '#AEC58C',
  },
  autumn: {
    '#97B978': '#E0B85F', '#5F874D': '#C07A35',
    '#7EA667': '#D29A45', '#527645': '#A8662F',
    '#B4CD92': '#EAD191',
    '#6B9358': '#CC8A3E', '#7DA264': '#D89B4B', '#638850': '#A8662F',
    '#8FB173': '#E3B35F', '#739A5F': '#C07A35',
    '#C1D4A0': '#EBD79A', '#95A967': '#B5532C',
  },
};

/* helper: translate an original leaf colour for a season */
function leafCol(season, hex) {
  const m = LEAFMAP[season];
  return m && m[hex] ? m[hex] : hex;
}

/* ---- generic flat blob canopy for the bespoke young stages -------------- */
/* blobs: [{x,y,r,rank}]  rank 0..4 -> SEASONS[s].scale                      */
function BlobCanopy({ blobs, season, uid, flowers }) {
  const pal = SEASONS[season];
  if (pal.bare) return null;
  const rng = mulberry32(0x9E + uid.length + season.charCodeAt(1));
  return (
    <g>
      {blobs.map((b, i) => (
        <circle key={'k' + i} cx={r1(b.x)} cy={r1(b.y)} r={r1(b.r * 1.12)} fill={pal.back} />
      ))}
      {blobs.map((b, i) => (
        <circle key={'f' + i} cx={r1(b.x)} cy={r1(b.y)} r={r1(b.r)} fill={pal.scale[b.rank]} />
      ))}
      {blobs.filter(b => b.rank >= 4).map((b, i) => (
        <circle key={'l' + i} cx={r1(b.x - b.r * 0.24)} cy={r1(b.y - b.r * 0.24)} r={r1(b.r * 0.4)}
          fill={pal.hi} opacity={0.3} />
      ))}
      {blobs.filter((_, i) => i % 2 === 0).map((b, i) => {
        const a = rng() * 6.28, rr = rng() * b.r * 0.7;
        return <circle key={'d' + i} cx={r1(b.x + Math.cos(a) * rr)} cy={r1(b.y + Math.sin(a) * rr)}
          r={r1(1.2 + rng() * 0.8)} fill={rng() < 0.6 ? pal.dotHi : pal.dotLo} opacity={0.45} />;
      })}
      {flowers && season === 'spring' && blobs.map((b, i) => {
        const a = rng() * 6.28, rr = rng() * b.r * 0.7;
        const x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        const c = pal.flower[i % pal.flower.length];
        return <g key={'p' + i}>
          <circle cx={r1(x)} cy={r1(y)} r={2.4} fill={c} />
          <circle cx={r1(x)} cy={r1(y)} r={1} fill={pal.flowerCore} />
        </g>;
      })}
    </g>
  );
}

Object.assign(window, { mulberry32, r1, SEASONS, LEAFMAP, leafCol, BlobCanopy });

export { mulberry32, r1, SEASONS, LEAFMAP, leafCol, BlobCanopy };
