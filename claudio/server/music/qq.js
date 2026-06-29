// QQ 音乐 provider —— 自带登录态、直连 QQ，不依赖本地 3300 服务。
//   search : QQ 公开搜索接口（无需登录）
//   songUrl: 现行 vkey 直链（musicu.fcg + CgiGetVkey，带 cookie，VIP/版权曲也能放）
//   lyric  : QQ 公开歌词接口（base64 解码）
//
// 登录态读 ../../qqmusic-api/data/cookie.json（你用那套 login 流程写入的）。
// cookie 过期后直链会变 null —— 去 qqmusic-api 重登刷新 cookie.json 即可，本文件不用动。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanArtistMatch, titleHit } from './match.js';

export const name = 'qq';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_PATH = path.join(__dir, '..', '..', 'qqmusic-api', 'data', 'cookie.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
};

// hash5381：QQ 的 g_tk 算法
function gtk(key = '') {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h += (h << 5) + key.charCodeAt(i);
  return h & 0x7fffffff;
}

// 读 cookie.json（60s 缓存，重登后自动生效）
let _ck = null, _ckAt = 0;
function cookie() {
  if (_ck && Date.now() - _ckAt < 60000) return _ck;
  try {
    const c = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
    const str = Object.entries(c)
      .filter(([, v]) => typeof v === 'string' && v)
      .map(([k, v]) => `${k}=${v}`).join('; ');
    const authst = c.qqmusic_key || c.qm_keyst || '';
    _ck = { str, uin: String(c.uin || 0), authst, g_tk: gtk(authst), tmeLoginType: Number(c.tmeLoginType) || 2 };
  } catch {
    _ck = { str: '', uin: '0', authst: '', g_tk: gtk(''), tmeLoginType: 2 };
  }
  _ckAt = Date.now();
  return _ck;
}

async function getJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { ...HEADERS, ...(opts.headers || {}) } });
    const text = await res.text();
    return JSON.parse(text.replace(/^[^{]*\(/, '').replace(/\)\s*;?\s*$/, '')); // 容忍 jsonp
  } finally {
    clearTimeout(t);
  }
}

// 返回 { id(=songmid), title, artist, album, cover, artistMatched } 或 null
// 用 smartbox 建议接口：现行桌面搜索模块被限流（estimate_sum 有值但 list 空），
// 而 smartbox 对「歌手 歌名」这种 query 命中很准，正好对上大脑给的 play 格式。
// want={artist,title}：在建议列表里挑「歌手+歌名都对得上」的那一首（不一定是第 1 个），
// 都对不上时返回第 1 个并标 artistMatched:false，由上层决定「宁可跳过也不放同名错歌」。
export async function search(keyword, want = {}) {
  try {
    const u = new URL('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg');
    u.search = new URLSearchParams({ format: 'json', key: keyword, g_tk: cookie().g_tk }).toString();
    const data = await getJson(u, { headers: { Cookie: cookie().str } });
    const list = data?.data?.song?.itemlist || [];
    if (!list.length) return null;
    const toHit = (s) => ({ id: s.mid, title: s.name, artist: s.singer || '', album: '', cover: '' });
    for (const s of list) {
      const h = toHit(s);
      if (cleanArtistMatch(want.artist, h.artist) && titleHit(want.title, h.title)) {
        return { ...h, artistMatched: true };
      }
    }
    return { ...toHit(list[0]), artistMatched: false };
  } catch {
    return { id: null, title: keyword, artist: '', album: '', cover: '', _stub: true };
  }
}

// 现行 vkey 直链。返回可直接 <audio src> 的 url，或 null。
export async function songUrl(id) {
  if (!id) return null;
  try {
    const c = cookie();
    const guid = String(Math.floor(Math.random() * 1e10));
    const body = {
      comm: {
        uin: c.uin, format: 'json', ct: 24, cv: 0, authst: c.authst,
        tmeLoginType: c.tmeLoginType, g_tk: c.g_tk, g_tk_new_20200303: c.g_tk,
        notice: 0, platform: 'yqq.json', needNewCode: 1,
      },
      req_1: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid, songmid: [id], songtype: [0], uin: c.uin, loginflag: 1, platform: '20', filename: [`M500${id}${id}.mp3`] },
      },
    };
    const j = await getJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST', headers: { Cookie: c.str }, body: JSON.stringify(body),
    });
    const d = j?.req_1?.data;
    const purl = d?.midurlinfo?.[0]?.purl;
    if (!purl || !d?.sip?.length) return null; // 空 = 无版权/权限或 cookie 过期
    return d.sip[0] + purl;
  } catch {
    return null;
  }
}

// 返回歌词纯文本（含时间轴的 lrc）
export async function lyric(id) {
  if (!id) return '';
  try {
    const u = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg');
    u.search = new URLSearchParams({ songmid: id, format: 'json', nobase64: 0, g_tk: cookie().g_tk }).toString();
    const data = await getJson(u, { headers: { Referer: 'https://y.qq.com/portal/player.html', Cookie: cookie().str } });
    const b64 = data?.lyric;
    if (!b64) return '';
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}
