// 把一张【公开】QQ 音乐歌单拉成歌名清单，存进 user/sources/qq-<id>.json。
// 只拉文字（歌手/歌名/专辑），不碰直链、不需要登录 cookie。
// 用法：
//   node tools/distill-qq.mjs <歌单链接或纯ID>
// 例：
//   node tools/distill-qq.mjs https://y.qq.com/n/ryqq/playlist/8975585308
//   node tools/distill-qq.mjs 8975585308
//
// 私密歌单（含「我喜欢」）拉不到 —— 请先在 App 里把歌单设为公开。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(__dir, '..', 'user', 'sources');

// 从分享链接或纯数字里抠出 disstid
function extractId(input) {
  if (!input) return null;
  const m1 = String(input).match(/playlist\/(\d+)/);       // .../playlist/123
  if (m1) return m1[1];
  const m2 = String(input).match(/[?&]id=(\d+)/);           // ...?id=123
  if (m2) return m2[1];
  const m3 = String(input).match(/[?&]disstid=(\d+)/);      // ...?disstid=123
  if (m3) return m3[1];
  const m4 = String(input).match(/^\s*(\d{3,})\s*$/);       // 纯数字
  if (m4) return m4[1];
  return null;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
};

// 现行格式：musicu.fcg + aiDissInfo，能拿全量、不截断
async function viaMusicu(id) {
  const body = {
    comm: { ct: 24, cv: 0 },
    req_0: {
      module: 'music.srfDissInfo.aiDissInfo',
      method: 'CgiGetDiss',
      param: { disstid: Number(id), onlysong: 0, song_begin: 0, song_num: 1000 },
    },
  };
  const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const j = await r.json();
  const d = j?.req_0?.data;
  if (!d || j?.req_0?.code !== 0) return null;
  const title = d.dirinfo?.title || '';
  const songs = (d.songlist || []).map((s) => ({
    title: s.name || s.title,
    artist: (s.singer || []).map((a) => a.name).join('/'),
    album: s.album?.name || '',
    mid: s.mid,
  }));
  return { title, songs };
}

// 登录兜底：私密歌单（账号隐私挡了匿名访问）用现有 cookie.json 带登录态拉。
// cookie 只需在此刻有效一次 —— 拉到的口味写进本地就永久了，之后 cookie 过期无所谓。
async function viaLogin(id) {
  const cookiePath = path.join(__dir, '..', 'qqmusic-api', 'data', 'cookie.json');
  let c;
  try { c = JSON.parse(fs.readFileSync(cookiePath, 'utf8')); } catch { return null; }
  const cookieStr = Object.entries(c)
    .filter(([, v]) => typeof v === 'string' && v)
    .map(([k, v]) => `${k}=${v}`).join('; ');
  const uin = c.uin || 0;
  const u = new URL('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg');
  u.search = new URLSearchParams({ type: 1, utf8: 1, disstid: id, loginUin: uin, hostUin: uin, format: 'json' }).toString();
  const r = await fetch(u, { headers: { ...HEADERS, Referer: 'https://y.qq.com/n/yqq/playlist', Cookie: cookieStr } });
  const j = await r.json();
  const cd = j?.cdlist?.[0];
  if (!cd || j.code !== 0) return null;
  const songs = (cd.songlist || []).map((s) => ({
    title: s.songname || s.name,
    artist: (s.singer || []).map((a) => a.name).join('/'),
    album: s.albumname || '',
    mid: s.songmid || s.mid,
  }));
  return songs.length ? { title: cd.dissname || '', songs } : null;
}

// 老接口兜底：fcg_ucc_getcdinfo_byids_cp.fcg（可能被截断到前若干首）
async function viaOld(id) {
  const u = new URL('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg');
  u.search = new URLSearchParams({ type: 1, utf8: 1, disstid: id, loginUin: 0, format: 'json' }).toString();
  const r = await fetch(u, { headers: { ...HEADERS, Referer: 'https://y.qq.com/n/yqq/playlist' } });
  const text = await r.text();
  const j = JSON.parse(text.replace(/^[^{]*\(/, '').replace(/\)\s*;?\s*$/, '')); // 可能是 jsonp
  const cd = j?.cdlist?.[0];
  if (!cd) return null;
  const songs = (cd.songlist || []).map((s) => ({
    title: s.songname || s.name,
    artist: (s.singer || []).map((a) => a.name).join('/'),
    album: s.albumname || '',
    mid: s.songmid || s.mid,
  }));
  return { title: cd.dissname || '', songs };
}

async function main() {
  const raw = process.argv[2];
  const id = extractId(raw);
  if (!id) {
    console.error('❌ 没认出歌单 ID。请传分享链接或纯数字，例：\n   node tools/distill-qq.mjs https://y.qq.com/n/ryqq/playlist/8975585308');
    process.exit(1);
  }
  console.log(`→ 歌单 ID: ${id}，正在拉取（公开接口，无需登录）…`);

  let result = null;
  try { result = await viaOld(id); } catch (e) { console.error('  匿名接口失败：', e.message); }
  if (!result || !result.songs.length) {
    console.log('  匿名拿不到（多半是账号隐私挡了），用现有登录 cookie 兜底…');
    try { result = await viaLogin(id); } catch (e) { console.error('  登录接口失败：', e.message); }
  }
  if (!result || !result.songs.length) {
    console.log('  再试现行 musicu 接口…');
    try { result = await viaMusicu(id); } catch (e) { console.error('  现行接口失败：', e.message); }
  }

  if (!result || !result.songs.length) {
    console.error('❌ 拉不到歌曲。可能：① cookie 过期（去 qqmusic-api 重登）；② ID 不对。');
    process.exit(2);
  }

  fs.mkdirSync(SOURCES, { recursive: true });
  const out = path.join(SOURCES, `qq-${id}.json`);
  const payload = {
    source: 'qq',
    disstid: id,
    title: result.title,
    fetched_at: new Date().toISOString().slice(0, 10),
    count: result.songs.length,
    songs: result.songs,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ 「${result.title}」共 ${result.songs.length} 首 → 已存 ${path.relative(path.join(__dir, '..'), out)}`);
  console.log('   前 10 首预览：');
  result.songs.slice(0, 10).forEach((s, i) => console.log(`   ${String(i + 1).padStart(2)}. ${s.artist} - ${s.title}`));
  console.log('\n下一步：把这个文件给我，我来蒸馏成 taste.md + playlists.json。');
}

main();
