// 歌手 / 歌名 匹配工具 —— QQ 与 网易云 provider 共用，保证「同名错歌保护」一致。
// 大脑指定了歌手时，靠这里把「另一个歌手的同名歌」「翻唱 / 迷妹号 / remix」挡在外面，
// 宁可标记没找到（上层会跳过、不放）也不放成错歌。
const normKey = (s) => (s || '').toString().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// 候选歌手串拆成单个歌手（/ 、，& 都算分隔）。
const splitArtists = (a) => String(a || '').split(/[\/、,，&]+/).map(normKey).filter(Boolean);
// 含 CJK（汉字 / 假名 / 谚文）→ 视为「另一个名字」，而不是拉丁别名。
const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

// 单个歌手名是否「足够等同」想要的歌手：
//  · 完全相等 → 是
//  · 一方包含另一方，且多出来的部分只是拉丁/数字别名（如「G.E.M.邓紫棋」⊇「邓紫棋」，多出 gem）→ 是
//  · 多出来的是 CJK 文字（如「王力宏的小迷妹」⊇「王力宏」，多出「的小迷妹」）→ 否
//    —— 这正是版权缺失时冒出来的翻唱号 / 迷妹号，名字里嵌了原歌手名但根本是另一个人。
function softEqualArtist(wa, p) {
  if (!wa || !p) return false;
  if (p === wa) return true;
  if (p.includes(wa)) return !CJK.test(p.split(wa).join(''));
  if (wa.includes(p)) return !CJK.test(wa.split(p).join(''));
  return false;
}

// 「干净歌手匹配」：候选里要有一个歌手对得上想要的歌手，且不能混进对不上的额外歌手。
// 没指定歌手则不校验。多挂歌手（feat / remix / 合唱）会因 foreign 被判非原版而拒掉。
export function cleanArtistMatch(wantArtist, candArtist) {
  const wa = normKey(wantArtist);
  if (!wa) return true;
  const parts = splitArtists(candArtist);
  if (!parts.length) return false;
  let matched = false, foreign = false;
  for (const p of parts) {
    if (softEqualArtist(wa, p)) matched = true; else foreign = true;
  }
  return matched && !foreign;
}

// 歌名匹配（双向 includes，容忍「晴天」vs「晴天 (Live)」这类后缀）。
export function titleHit(wantTitle, candTitle) {
  const wt = normKey(wantTitle), ct = normKey(candTitle);
  if (!wt || !ct) return true;
  return ct.includes(wt) || wt.includes(ct);
}

export { normKey };
