/* =========================================================================
   canonical.jsx — the EXACT stage_6.svg art as a recolourable <g>.
   Rendered in original 512-space; the caller applies the canvas transform.
   season recolours the leaves; winter strips them; spring/autumn decorate.
   ========================================================================= */
import { SEASONS, leafCol, mulberry32, r1 } from './seasons.jsx';

/* exact path data from stage_6.svg */
const ART = {
  backBranch: [
    'M249 270C218 241 197 213 173 190', 'M265 255C293 228 316 209 338 192',
    'M241 307C209 287 184 274 155 267', 'M277 295C309 275 338 264 367 256',
    'M257 236C255 211 253 189 249 168',
  ],
  leafMain: 'M126 284C99 275 79 250 77 222C73 188 95 158 127 151C130 117 158 91 193 89C208 67 233 54 263 54C292 54 317 67 332 89C367 88 398 109 408 140C438 145 461 170 464 201C467 234 448 263 420 277C413 305 388 327 356 332C336 335 316 330 300 320C287 329 272 334 256 334C240 334 224 329 211 321C194 331 174 335 155 332C124 327 99 307 92 280C103 286 115 287 126 284Z',
  leafMid: 'M119 244C104 214 115 177 143 161C159 151 178 149 195 154C206 131 227 116 251 114C276 112 298 124 311 143C331 137 354 141 372 155C395 174 403 205 392 231C381 256 352 273 325 269C315 283 299 294 281 300C255 308 225 301 206 282C190 290 170 292 152 286C134 280 122 263 119 244Z',
  trunk: 'M208 428C209 402 225 385 229 362C232 343 231 325 228 306C225 287 216 271 200 251C184 230 179 207 185 187C191 168 206 153 227 147C241 143 254 145 266 151C278 142 293 140 307 145C329 153 344 172 347 194C350 216 342 237 325 251C313 261 298 267 286 274C276 280 269 286 267 297C264 310 271 322 282 333C296 348 307 367 308 390C309 405 306 418 303 428H263C266 411 260 393 250 380C241 367 230 357 224 343C217 325 217 305 223 288C229 271 239 260 250 250C235 242 222 234 211 219C201 205 197 189 201 174C205 159 218 148 233 146C247 143 262 148 270 160C274 146 285 135 300 132C316 129 331 134 343 146C356 159 362 176 361 193C359 214 346 228 331 239C316 250 297 257 285 268C268 284 262 306 269 328C274 343 286 355 296 369C311 389 318 408 317 428H208Z',
  frontBranch: [
    ['M248 264C227 244 210 225 189 209', 1], ['M255 249C276 228 294 214 318 198', 1],
    ['M238 297C213 282 191 273 166 268', 1], ['M271 288C297 273 321 263 346 257', 1],
    ['M254 226C254 203 253 185 251 164', 1], ['M233 277C219 262 206 251 192 244', 0.7],
    ['M278 273C293 259 307 249 322 242', 0.7],
  ],
  blobs: [
    ['M180 102C198 90 221 85 243 89C267 94 286 109 296 130C312 124 330 126 344 136C359 146 368 162 370 180C372 200 364 219 349 231C334 243 314 247 296 243C285 251 272 256 258 257C226 260 195 241 183 212C164 214 145 208 131 195C116 181 110 160 115 141C120 120 136 105 157 101C165 100 173 100 180 102Z', '#6B9358', 1],
    ['M104 250C93 227 100 198 122 185C138 175 158 175 174 182C184 170 198 163 213 162C236 160 258 175 267 196C275 217 270 241 253 257C236 273 210 278 190 269C181 275 170 279 158 280C136 283 113 272 104 250Z', '#7DA264', 1],
    ['M344 252C333 229 339 201 360 187C379 175 403 175 421 186C440 198 450 220 445 242C440 264 421 281 398 283C385 285 372 281 361 274C352 272 343 264 338 256C340 255 342 254 344 252Z', '#638850', 1],
    ['M306 112C324 100 349 99 367 110C386 121 396 143 393 164C390 184 376 201 357 208C338 215 315 211 300 197C290 200 280 200 270 197C253 191 239 176 236 158C233 138 243 119 261 109C275 100 292 98 306 112Z', '#8FB173', 1],
    ['M193 282C182 266 181 245 190 230C200 214 219 206 237 209C258 212 276 228 278 249C281 271 268 291 248 299C228 307 205 301 193 282Z', '#739A5F', 0.92],
  ],
  leafLight: 'M168 116C180 105 197 100 214 102C228 104 241 110 251 119C266 110 284 109 300 114C292 107 282 102 271 98C248 89 223 89 201 97C188 102 177 108 168 116Z',
  dotsHi: [[174,116,2.2],[206,124,1.8],[240,111,1.9],[292,122,1.8],[334,135,2.2],[378,173,1.9],[410,205,1.8],[154,204,2],[136,229,1.8],[180,242,2],[220,221,1.8],[245,261,2],[292,224,1.9],[327,243,1.8],[371,233,2],[397,217,1.8],[350,155,1.8],[301,159,1.8],[196,184,1.8]],
  dotsLo: [[190,136],[226,145],[264,133],[316,145],[357,178],[391,201],[167,223],[207,242],[287,244],[338,259]],
  // anchors for decoration
  snowCaps: [[173,190],[189,209],[318,198],[338,192],[251,164],[346,257],[166,268],[245,120],[300,118],[200,150],[360,165]],
  blossomAt: [[174,116],[240,111],[292,122],[334,135],[154,204],[220,221],[292,224],[371,233],[301,159],[196,184],[206,124],[378,173],[180,242],[327,243]],
  fallen: [[210,432],[250,438],[300,434],[345,440],[180,440],[380,436],[270,444]],
};

function CanonicalTree({ season, uid }) {
  const pal = SEASONS[season];
  const T = `trunk${uid}`, LM = `lm${uid}`, LD = `ld${uid}`, LL = `ll${uid}`;
  const lc = (h) => leafCol(season, h);
  const rng = mulberry32(0x2C + season.charCodeAt(0));

  const defs = (
    <defs>
      <linearGradient id={T} x1="190" y1="150" x2="320" y2="440" gradientUnits="userSpaceOnUse">
        <stop stopColor="#745440" /><stop offset="0.52" stopColor="#644833" /><stop offset="1" stopColor="#4E3929" />
      </linearGradient>
      {!pal.bare && <>
        <linearGradient id={LM} x1="120" y1="90" x2="380" y2="290" gradientUnits="userSpaceOnUse">
          <stop stopColor={lc('#97B978')} /><stop offset="1" stopColor={lc('#5F874D')} />
        </linearGradient>
        <linearGradient id={LD} x1="150" y1="110" x2="360" y2="280" gradientUnits="userSpaceOnUse">
          <stop stopColor={lc('#7EA667')} /><stop offset="1" stopColor={lc('#527645')} />
        </linearGradient>
        <linearGradient id={LL} x1="180" y1="80" x2="300" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor={lc('#B4CD92')} stopOpacity="0.85" /><stop offset="1" stopColor={lc('#B4CD92')} stopOpacity="0.14" />
        </linearGradient>
      </>}
    </defs>
  );

  return (
    <g>
      {defs}
      {/* fallen petals / leaves on the ground (spring & autumn) */}
      {(season === 'spring' || season === 'autumn') && ART.fallen.map(([x, y], i) => {
        const cols = season === 'spring' ? pal.flower : ['#C77A33', '#B5532C', '#D89B4B'];
        return <ellipse key={'fa' + i} cx={x} cy={y} rx={3} ry={1.6}
          fill={cols[i % cols.length]} opacity={0.85} transform={`rotate(${Math.round(rng() * 180)} ${x} ${y})`} />;
      })}

      {/* back branch strokes */}
      <g stroke="#5F4431" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
        {ART.backBranch.map((d, i) => <path key={i} d={d} />)}
      </g>

      {/* canopy back masses (skip in winter) */}
      {!pal.bare && <g>
        <path d={ART.leafMain} fill={`url(#${LM})`} />
        <path d={ART.leafMid} fill={`url(#${LD})`} opacity="0.95" />
      </g>}

      {/* trunk */}
      <path d={ART.trunk} fill={`url(#${T})`} />

      {/* front branch strokes */}
      <g stroke="#5B412F" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round">
        {ART.frontBranch.map(([d, o], i) => <path key={i} d={d} opacity={o} />)}
      </g>

      {/* canopy detail blobs + highlight + speckles (skip in winter) */}
      {!pal.bare && <>
        <g>{ART.blobs.map(([d, c, o], i) => <path key={i} d={d} fill={lc(c)} opacity={o} />)}</g>
        <path d={ART.leafLight} fill={`url(#${LL})`} opacity="0.55" />
        <g opacity="0.58">
          <g fill={lc('#C1D4A0')}>{ART.dotsHi.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>
          <g fill={lc('#95A967')}>{ART.dotsLo.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.2} />)}</g>
        </g>
      </>}

      {/* spring blossoms */}
      {season === 'spring' && ART.blossomAt.map(([x, y], i) => {
        const c = pal.flower[i % pal.flower.length];
        const jx = x + (rng() - 0.5) * 10, jy = y + (rng() - 0.5) * 10;
        return <g key={'bl' + i}>
          <circle cx={r1(jx)} cy={r1(jy)} r={3.2} fill={c} />
          <circle cx={r1(jx)} cy={r1(jy)} r={1.2} fill={pal.flowerCore} />
        </g>;
      })}

      {/* autumn red accents */}
      {season === 'autumn' && pal.accent && ART.blossomAt.filter((_, i) => i % 3 === 0).map(([x, y], i) => (
        <circle key={'ac' + i} cx={x} cy={y} r={4} fill={pal.accent[i % 2]} opacity={0.8} />
      ))}

      {/* winter snow caps on bare branches */}
      {pal.bare && ART.snowCaps.map(([x, y], i) => (
        <ellipse key={'sn' + i} cx={x} cy={y - 2} rx={6} ry={3.2} fill={pal.snow} opacity={0.95} />
      ))}
    </g>
  );
}

Object.assign(window, { ART, CanonicalTree });

export { ART, CanonicalTree };
