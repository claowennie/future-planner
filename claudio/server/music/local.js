// 本地曲库 provider —— 不依赖任何账号/外部 API。
// 你把音频文件丢进 config.musicDir（默认 claudio/user/music/），
// Claudio 就从这些文件里选歌、直接播。文件名按「歌手 - 歌名.mp3」最好，
// 也兼容「歌名.mp3」「01 歌名.mp3」。同名 .lrc 会被当作歌词。
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export const name = 'local';

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma']);

// 从文件名拆出 歌手/歌名
function parseName(file) {
  let base = file.replace(/\.[^.]+$/, '');
  base = base.replace(/^\s*\d{1,3}[\.\-_\s]+/, ''); // 去掉开头的曲目序号
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '', title: base.trim() };
}

let _cache = null, _at = 0;
function scan() {
  let files = [];
  try { files = fs.readdirSync(config.musicDir); } catch { return []; }
  return files
    .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const { artist, title } = parseName(f);
      const id = encodeURIComponent(f);
      return { id, title, artist, file: f, url: `/media/${id}`, source: 'local' };
    });
}

// 5 秒缓存，避免每次都读盘
export function list() {
  if (!_cache || Date.now() - _at > 5000) { _cache = scan(); _at = Date.now(); }
  return _cache;
}

const norm = (s) => (s || '').toLowerCase().replace(/[\s\-_'"“”·,，。.()（）\[\]]/g, '');

// 把大脑给的「歌手 歌名」匹配到曲库里某个文件（模糊）
export async function search(keyword) {
  const lib = list();
  if (!lib.length) return null;
  const q = norm(keyword);
  let best = null, score = 0;
  for (const t of lib) {
    const hay = norm(t.artist + t.title);
    const nt = norm(t.title);
    let s = 0;
    if (q && (hay.includes(q) || q.includes(hay))) s = 4;
    else if (nt && q.includes(nt)) s = 3;        // 关键词里包含完整歌名
    else if (nt && nt.includes(q)) s = 2;        // 歌名里包含关键词
    else if (t.artist && q.includes(norm(t.artist))) s = 1;
    if (s > score) { score = s; best = t; }
  }
  return score > 0 ? best : null;
}

export async function songUrl(id) {
  const t = list().find((x) => x.id === id);
  return t ? t.url : null;
}

export async function lyric(id) {
  const t = list().find((x) => x.id === id);
  if (!t) return '';
  const lrc = path.join(config.musicDir, t.file.replace(/\.[^.]+$/, '.lrc'));
  try { return fs.readFileSync(lrc, 'utf8'); } catch { return ''; }
}
