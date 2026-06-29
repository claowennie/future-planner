// 网易云 provider —— 自带 weapi 加密、直连网易，不依赖外部 API 服务。
//   search : 公开 web 搜索（免登录）
//   songUrl: weapi /song/enhance/player/url（免登录可放非会员歌 320k；有 cookie 时按账号权限覆盖更多）
//   lyric  : 公开歌词接口
//
// 登录可选：把网易 Cookie（至少含 MUSIC_U=...）整段写进 user/netease-cookie.txt，
// 覆盖率随账号权限提升（黑胶会员可放 VIP 曲）。cookie 过期就重贴一次。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';
import { cleanArtistMatch, titleHit } from './match.js';

export const name = 'netease';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const BASE_HEADERS = { 'User-Agent': UA, Referer: 'https://music.163.com/' };

// —— weapi 加密 ——
const PRESET = '0CoJUm6Qyw8W8jud', IV = '0102030405060708';
const MOD = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const EXP = '010001';
function aes(text, key) { const c = crypto.createCipheriv('aes-128-cbc', key, IV); return c.update(text, 'utf8', 'base64') + c.final('base64'); }
function rsa(text) {
  const rev = text.split('').reverse().join('');
  const n = BigInt('0x' + Buffer.from(rev, 'utf8').toString('hex'));
  const mod = BigInt('0x' + MOD), exp = BigInt('0x' + EXP);
  let r = 1n, b = n % mod, e = exp;
  while (e > 0n) { if (e & 1n) r = r * b % mod; b = b * b % mod; e >>= 1n; }
  return r.toString(16).padStart(256, '0');
}
function weapi(obj) {
  const sk = crypto.randomBytes(8).toString('hex'); // 16 chars
  return new URLSearchParams({ params: aes(aes(JSON.stringify(obj), PRESET), sk), encSecKey: rsa(sk) }).toString();
}

// 可选 cookie（60s 缓存）
let _ck = null, _ckAt = 0;
function cookie() {
  if (_ck !== null && Date.now() - _ckAt < 60000) return _ck;
  try { _ck = fs.readFileSync(path.join(paths.user, 'netease-cookie.txt'), 'utf8').trim().replace(/\s*\n\s*/g, ' '); }
  catch { _ck = ''; }
  _ckAt = Date.now();
  return _ck;
}

async function getJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const ck = cookie();
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { ...BASE_HEADERS, ...(ck ? { Cookie: ck } : {}), ...(opts.headers || {}) } });
    return await res.json();
  } finally { clearTimeout(t); }
}

// 歌手 / 歌名 匹配逻辑统一放在 ./match.js（QQ 与网易云共用），见那里的注释。

// 返回 { id, title, artist, album, cover, artistMatched } 或 null。
// want={artist,title}：在候选里挑「歌手+歌名都对得上」的那一首（不一定是第 1 个）；
// 都对不上时返回排第 1 的并标 artistMatched:false，由上层决定「宁可跳过也不放同名错歌」。
export async function search(keyword, want = {}) {
  try {
    const u = 'https://music.163.com/api/search/get/web?' + new URLSearchParams({ s: keyword, type: 1, limit: 10, offset: 0 });
    const data = await getJson(u);
    const songs = data?.result?.songs || [];
    if (!songs.length) return null;
    const toHit = (s) => ({
      id: s.id,
      title: s.name,
      artist: (s.artists || s.ar || []).map((a) => a.name).join('/'),
      album: s.album?.name || s.al?.name || '',
      cover: s.album?.picUrl || s.al?.picUrl || '',
    });
    for (const s of songs) {
      const h = toHit(s);
      if (cleanArtistMatch(want.artist, h.artist) && titleHit(want.title, h.title)) {
        return { ...h, artistMatched: true };
      }
    }
    return { ...toHit(songs[0]), artistMatched: false };
  } catch {
    return { id: null, title: keyword, artist: '', album: '', cover: '', _stub: true };
  }
}

// weapi 直链。返回可直接 <audio src> 的 url，或 null（VIP/版权且无对应权限）。
export async function songUrl(id) {
  if (!id) return null;
  try {
    const data = await getJson('https://music.163.com/weapi/song/enhance/player/url?csrf_token=', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: weapi({ ids: JSON.stringify([id]), br: 320000, csrf_token: '' }),
    });
    const url = data?.data?.[0]?.url || null;
    // 网易 CDN 默认返 http 直链；从 https 网站（Netlify）托管时 http 音频会被浏览器
    // 当「混合内容」拦掉。网易 CDN 同样支持 https，统一升到 https 即可直接 <audio> 播。
    return url ? url.replace(/^http:\/\//, 'https://') : null;
  } catch {
    return null;
  }
}

// 返回歌词纯文本（含时间轴的 lrc）
export async function lyric(id) {
  if (!id) return '';
  try {
    const u = 'https://music.163.com/api/song/lyric?' + new URLSearchParams({ id, lv: 1, kv: 1, tv: -1 });
    const data = await getJson(u);
    return data?.lrc?.lyric || '';
  } catch {
    return '';
  }
}
