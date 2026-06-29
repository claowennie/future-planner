import React from 'react';
/* =========================================================================
   background-scene.jsx — BackgroundScene({ season, tod })
   Self-contained world background for future.v2 (no imports / no libs).
     season : 'spring' | 'summer' | 'autumn' | 'winter'
     tod    : 'morning' | 'day' | 'dusk' | 'night'
   Flat, soft, low-saturation illustration. Warm-cream + sage family.
   Leaves the bottom-centre clear for the growth tree to stand in.
   ========================================================================= */

/* ---- sky gradients (per time of day) ---------------------------------- */
const BG_SKY = {
  morning: 'linear-gradient(180deg,#f9d9a8 0%,#f6e4be 30%,#f0e8d2 70%,#ece6cf 100%)',
  day:     'linear-gradient(180deg,#b8d4e6 0%,#d8e4ea 50%,#ebebd9 100%)',
  dusk:    'linear-gradient(180deg,#c87a5c 0%,#e09875 25%,#ecb88a 55%,#e8b88a 100%)',
  night:   'linear-gradient(180deg,#1a2138 0%,#232c47 40%,#2e3a5a 75%,#3b4868 100%)',
};

/* ---- colour helpers ---------------------------------------------------- */
function bgHexArr(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function bgToHex(a){ return '#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function bgMix(a,b,k){ const A=bgHexArr(a),B=bgHexArr(b); return bgToHex([0,1,2].map(i=>A[i]+(B[i]-A[i])*k)); }

/* ---- season + tod palettes -------------------------------------------- */
const BG_FOLIAGE = {            /* far -> near (far is lighter / hazier) */
  spring: ['#bcd49a','#9cbf80','#7fa46e'],
  summer: ['#8fae7f','#6f9568','#4f7c52'],
  autumn: ['#d8a567','#c07b3e','#9c5a32'],
  winter: ['#a3b5a6','#84998a','#62786a'],
};
const BG_GROUND = { spring:'#bfca8d', summer:'#90a36b', autumn:'#a8895a', winter:'#cdd2c8' };
const BG_HAZE   = { morning:'#f3ead4', day:'#d8e4ea', dusk:'#edc298', night:'#2b3656' };

function bgHill(season, tod, layer){          /* layer 0 far .. 2 near */
  const haze = [0.58, 0.38, 0.16][layer];
  let c = bgMix(BG_FOLIAGE[season][layer], BG_HAZE[tod], haze);
  if (tod === 'night') c = bgMix(c, '#1b2540', 0.5);
  if (tod === 'dusk')  c = bgMix(c, '#c89876', 0.2);
  if (tod === 'morning') c = bgMix(c, '#f1dcad', 0.1);
  return c;
}
function bgGround(season, tod){
  let g = BG_GROUND[season];
  if (tod === 'night')   g = bgMix(g, '#222c44', 0.52);
  if (tod === 'dusk')    g = bgMix(g, '#b98a6a', 0.24);
  if (tod === 'morning') g = bgMix(g, '#f0dcab', 0.12);
  return g;
}

/* ---- hill ridge paths (viewBox 0 0 1600 900) -------------------------- */
const BG_RIDGE = [
  'M0,452 C 230,408 430,432 660,452 C 900,472 1080,414 1320,446 C 1460,464 1540,452 1600,448 L1600,900 L0,900 Z',
  'M0,548 C 200,512 420,560 640,548 C 880,534 1060,500 1280,540 C 1420,566 1520,548 1600,544 L1600,900 L0,900 Z',
  'M0,636 C 260,602 440,648 700,636 C 980,622 1140,664 1360,632 C 1470,616 1540,636 1600,630 L1600,900 L0,900 Z',
];
const BG_GROUND_PATH =
  'M0,742 C 300,722 560,736 820,740 C 1120,744 1360,726 1600,738 L1600,900 L0,900 Z';

/* ---- tiny seeded RNG --------------------------------------------------- */
function bgRng(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6D2B79F5)>>>0; let z=s; z=Math.imul(z^(z>>>15),z|1); z^=z+Math.imul(z^(z>>>7),z|61); return ((z^(z>>>14))>>>0)/4294967296; }; }

/* ---- soft cloud (group of overlapping ellipses) ----------------------- */
function bgCloud(x, y, s, fill, op, dur, delay, key){
  const e = (cx,cy,rx,ry)=> <ellipse key={cx+'-'+cy} cx={cx} cy={cy} rx={rx} ry={ry} />;
  return (
    <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="bgs-cloud" style={{ animationDuration: dur+'s', animationDelay: delay+'s' }}
         fill={fill} opacity={op} filter="url(#bgsCloudBlur)">
        {e(0,0,70,30)}{e(48,8,52,24)}{e(-46,10,46,22)}{e(18,-18,42,26)}{e(-12,16,60,22)}
      </g>
    </g>
  );
}

/* ====================================================================== */
function BackgroundScene({ season = 'summer', tod = 'day' }){
  const S = ['spring','summer','autumn','winter'].includes(season) ? season : 'summer';
  const T = ['morning','day','dusk','night'].includes(tod) ? tod : 'day';
  const night = T === 'night';

  /* celestial */
  const sun = { morning:{x:360,y:300,r:52}, day:{x:1230,y:158,r:46}, dusk:{x:430,y:430,r:78} }[T];
  const sunCore = { morning:'#ffe7b0', day:'#fef0cf', dusk:'#f6b271' }[T] || '#fff';
  const sunGlow = { morning:'#fbd99a', day:'#f4e6b8', dusk:'#e89a63' }[T] || '#fff';

  /* stars (night) */
  const stars = React.useMemo(()=>{
    if (!night) return [];
    const r = bgRng(7321);
    return Array.from({length:46}, () => ({
      x: r()*1600, y: r()*430, rad: 0.7 + r()*1.5,
      dur: (2.4 + r()*3.6).toFixed(2), delay: (r()*4).toFixed(2),
    }));
  }, [night]);

  /* clouds */
  const cloudFill = night ? '#39456a' : T==='dusk' ? '#f4c9ae' : T==='morning' ? '#fff6e6' : '#ffffff';
  const cloudOp   = night ? 0.34 : T==='dusk' ? 0.7 : T==='morning' ? 0.82 : 0.9;
  const clouds = React.useMemo(()=>{
    const base = [
      [300,150,1.05,70,0],[1180,120,0.9,90,-30],[760,230,0.78,80,-55],
      [1430,250,0.7,76,-18],[120,300,0.62,84,-44],
    ];
    return (night ? base.slice(0,2) : base);
  }, [night]);

  /* birds (hidden at night) */
  const birds = night ? [] : [
    {y:206,d:-2,dur:40},{y:222,d:-9,dur:40},{y:238,d:-15,dur:40},{y:300,d:-26,dur:52},
  ];
  const birdColor = night ? '#1b2236' : T==='dusk' ? '#7a4f43' : T==='morning' ? '#9a8b73' : '#5a6b62';

  /* particles */
  const particles = React.useMemo(()=>{
    const conf = {
      spring: { n:26, kind:'petal',  cols:['#e9b5c4','#f1d2dc','#fbe9ee','#ffffff'], sizeMin:7,  sizeMax:13, durMin:9,  durMax:15 },
      summer: { n:18, kind:'mote',   cols:['#eaf2d4','#dfeac6','#fbf6df'],            sizeMin:4,  sizeMax:8,  durMin:11, durMax:18 },
      autumn: { n:24, kind:'leaf',   cols:['#c47b3e','#a35a32','#d49658','#b5532c'], sizeMin:9,  sizeMax:16, durMin:8,  durMax:14 },
      winter: { n:46, kind:'snow',   cols:['#ffffff','#f3f6f8','#e7eef0'],            sizeMin:4,  sizeMax:10, durMin:9,  durMax:17 },
    }[S];
    const r = bgRng(91 + S.charCodeAt(0)*7);
    return { kind: conf.kind, items: Array.from({length:conf.n}, () => {
      const dur = conf.durMin + r()*(conf.durMax-conf.durMin);
      return {
        left: (r()*100).toFixed(2),
        size: (conf.sizeMin + r()*(conf.sizeMax-conf.sizeMin)).toFixed(1),
        dur: dur.toFixed(2), delay: (-r()*dur).toFixed(2),
        sway: ((r()*2-1)*60).toFixed(0), op: (0.55 + r()*0.45).toFixed(2),
        col: conf.cols[(r()*conf.cols.length)|0], rot: (r()*360).toFixed(0),
      };
    })};
  }, [S]);

  const groundFill = bgGround(S, T);
  const vignette = night
    ? 'radial-gradient(120% 80% at 50% 8%, transparent 52%, rgba(12,16,30,.42) 100%)'
    : 'radial-gradient(125% 82% at 50% 6%, transparent 58%, rgba(31,42,34,.16) 100%)';

  return (
    <div className="bgs-root" aria-hidden="true">
      <style>{BGS_CSS}</style>

      {/* sky */}
      <div className="bgs-sky" style={{ background: BG_SKY[T] }} />

      {/* scenery */}
      <svg className="bgs-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="bgsCloudBlur" x="-40%" y="-60%" width="180%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="bgsSun" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={sunCore} stopOpacity="1" />
            <stop offset="55%" stopColor={sunCore} stopOpacity="0.95" />
            <stop offset="100%" stopColor={sunGlow} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bgsMoon" cx="38%" cy="36%" r="68%">
            <stop offset="0%" stopColor="#f7f4e8" />
            <stop offset="70%" stopColor="#e7e4d2" />
            <stop offset="100%" stopColor="#cfcdbb" />
          </radialGradient>
          <radialGradient id="bgsMoonHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#eef0e0" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#dfe3d6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#dfe3d6" stopOpacity="0" />
          </radialGradient>
          <mask id="bgsCrescent">
            <circle cx="300" cy="190" r="46" fill="#fff" />
            <circle cx="319" cy="177" r="43" fill="#000" />
          </mask>
        </defs>

        {/* sun / moon + halo */}
        {!night && sun && <>
          <circle cx={sun.x} cy={sun.y} r={sun.r*3.2} fill="url(#bgsSun)" opacity={T==='day'?0.55:0.8} />
          <circle cx={sun.x} cy={sun.y} r={sun.r} fill={sunCore} />
        </>}
        {night && <>
          <circle cx="300" cy="190" r="96" fill="url(#bgsMoonHalo)" />
          <g mask="url(#bgsCrescent)">
            <circle cx="300" cy="190" r="46" fill="url(#bgsMoon)" />
          </g>
          {stars.map((st,i)=>(
            <circle key={i} className="bgs-star" cx={st.x} cy={st.y} r={st.rad} fill="#f4f1e4"
              style={{ animationDuration: st.dur+'s', animationDelay: st.delay+'s' }} />
          ))}
        </>}

        {/* clouds (behind hills) */}
        {clouds.map((c,i)=>bgCloud(c[0],c[1],c[2],cloudFill,cloudOp,c[3],c[4],'cl'+i))}

        {/* hills, far -> near */}
        {BG_RIDGE.map((d,i)=>(
          <g key={'h'+i}>
            <path className="bgs-fillT" d={d} fill={bgHill(S,T,i)} />
            {S==='winter' && <path d={d} fill="none" stroke={night?'#cfd6da':'#f3f6f7'}
              strokeWidth={8-i*1.5} strokeLinecap="round" opacity={night?0.4:0.6} />}
          </g>
        ))}

        {/* foreground ground (tree stands here) */}
        <path className="bgs-fillT" d={BG_GROUND_PATH} fill={groundFill} />
        <path d={BG_GROUND_PATH} fill="none" stroke={bgMix(groundFill,'#1f2a22',0.18)} strokeWidth="1.5" opacity="0.4" />

        {/* birds */}
        {birds.map((b,i)=>(
          <g key={'b'+i} className="bgs-bird" style={{ animationDuration:b.dur+'s', animationDelay:b.d+'s' }}>
            <path transform={`translate(0 ${b.y}) scale(${i===3?1.25:1})`}
              d="M0,0 Q10,-9 20,0 Q30,-9 40,0" fill="none" stroke={birdColor} strokeWidth="3" strokeLinecap="round" />
          </g>
        ))}
      </svg>

      {/* seasonal falling particles */}
      <div className="bgs-particles">
        {particles.items.map((p,i)=>(
          <span key={i} className={'bgs-p bgs-'+particles.kind}
            style={{
              left: p.left+'%', width: p.size+'px', height: p.size+'px',
              background: particles.kind==='leaf'
                ? p.col
                : particles.kind==='petal'
                  ? `radial-gradient(circle at 30% 30%, #fff, ${p.col})`
                  : p.col,
              '--dur': p.dur+'s', '--delay': p.delay+'s', '--sway': p.sway+'px',
              '--op': p.op, '--rot': p.rot+'deg',
              animationDuration: p.dur+'s', animationDelay: p.delay+'s',
            }} />
        ))}
      </div>

      {/* readability vignette + paper grain */}
      <div className="bgs-vignette" style={{ background: vignette }} />
      <svg className="bgs-grain" aria-hidden="true">
        <filter id="bgsGrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/></filter>
        <rect width="100%" height="100%" filter="url(#bgsGrain)" />
      </svg>
    </div>
  );
}

/* ---- styles + keyframes (scoped bgs-) --------------------------------- */
const BGS_CSS = `
.bgs-root{ position:absolute; inset:0; overflow:hidden; }
.bgs-sky{ position:absolute; inset:0; transition:background 1.1s ease; }
.bgs-svg{ position:absolute; inset:0; width:100%; height:100%; }
.bgs-fillT{ transition:fill 1.1s ease; }
.bgs-particles{ position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.bgs-vignette{ position:absolute; inset:0; pointer-events:none; transition:background 1.1s ease; }
.bgs-grain{ position:absolute; inset:0; width:100%; height:100%; opacity:.045; mix-blend-mode:multiply; pointer-events:none; }

.bgs-cloud{ animation-name:bgs-drift; animation-timing-function:ease-in-out;
  animation-iteration-count:infinite; animation-direction:alternate; will-change:transform; }
@keyframes bgs-drift{ from{transform:translateX(-22px)} to{transform:translateX(34px)} }

.bgs-star{ animation-name:bgs-twinkle; animation-timing-function:ease-in-out;
  animation-iteration-count:infinite; animation-direction:alternate; }
@keyframes bgs-twinkle{ from{opacity:.25} to{opacity:1} }

.bgs-bird{ animation-name:bgs-fly; animation-timing-function:linear;
  animation-iteration-count:infinite; will-change:transform; }
@keyframes bgs-fly{ 0%{transform:translate(-140px,10px)} 50%{transform:translate(820px,-26px)} 100%{transform:translate(1780px,8px)} }

.bgs-p{ position:absolute; top:0; display:block; will-change:transform,opacity; }
.bgs-snow{ border-radius:50%; box-shadow:0 0 4px rgba(255,255,255,.5);
  animation-name:bgs-snow; animation-timing-function:linear; animation-iteration-count:infinite; }
.bgs-petal{ border-radius:75% 15% 75% 15%;
  animation-name:bgs-spin; animation-timing-function:linear; animation-iteration-count:infinite; }
.bgs-leaf{ border-radius:0 100% 0 100%;
  animation-name:bgs-spin; animation-timing-function:linear; animation-iteration-count:infinite; }
.bgs-mote{ border-radius:50%; filter:blur(.4px);
  animation-name:bgs-mote; animation-timing-function:ease-in-out; animation-iteration-count:infinite; }

@keyframes bgs-snow{
  0%{ transform:translateY(-12vh) translateX(0); opacity:0; }
  7%{ opacity:var(--op); }
  50%{ transform:translateY(50vh) translateX(var(--sway)); }
  93%{ opacity:var(--op); }
  100%{ transform:translateY(112vh) translateX(0); opacity:0; }
}
@keyframes bgs-spin{
  0%{ transform:translateY(-12vh) translateX(0) rotate(0deg); opacity:0; }
  7%{ opacity:var(--op); }
  50%{ transform:translateY(50vh) translateX(var(--sway)) rotate(200deg); }
  93%{ opacity:var(--op); }
  100%{ transform:translateY(112vh) translateX(calc(var(--sway) * -0.6)) rotate(430deg); opacity:0; }
}
@keyframes bgs-mote{
  0%{ transform:translateY(8vh) translateX(0); opacity:0; }
  25%{ opacity:var(--op); }
  75%{ opacity:var(--op); }
  100%{ transform:translateY(-34vh) translateX(var(--sway)); opacity:0; }
}
@media (prefers-reduced-motion: reduce){
  .bgs-cloud,.bgs-bird,.bgs-star,.bgs-p{ animation:none !important; }
}
`;

window.BackgroundScene = BackgroundScene;

export { BackgroundScene };
