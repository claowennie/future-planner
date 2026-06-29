// 音乐层 · 可插拔 provider。
// 大脑只说"放 周杰伦 晴天"，由 provider 负责 搜歌→直链→歌词。
// QQ / 网易云 实现同一套接口，想换/想都接，都不动大脑代码。
import { config } from '../config.js';
import * as local from './local.js';
import * as qq from './qq.js';
import * as netease from './netease.js';

const providers = { local, qq, netease };

export function getProvider(name = config.musicProvider) {
  return providers[name] || qq;
}

// 把大脑给的曲目（{artist,title,play} 或旧的 "歌手 歌名" 字符串）解析成可播放列表。
// 每首：{ title, artist, id, url, lyric, source, unresolved? }
// 关键：把 want={artist,title} 传给 provider 做精准匹配；大脑指定了歌手但搜到的歌手对不上
// （多见于版权缺失、只剩同名的另一首歌）→ 判为没找到、不放，避免放成难听的同名错歌。
export async function resolveTracks(items, providerName) {
  const p = getProvider(providerName);
  const out = [];
  for (const item of items || []) {
    const isStr = typeof item === 'string';
    const want = isStr ? {} : { artist: (item.artist || '').trim(), title: (item.title || '').trim() };
    const q = (isStr ? item : (item.play || [want.artist, want.title].filter(Boolean).join(' '))).trim();
    if (!q) continue;
    const label = want.title || q;
    try {
      const hit = await p.search(q, want);
      if (!hit) { out.push({ title: label, artist: want.artist || '', url: null, source: p.name, unresolved: true }); continue; }
      // 同名错歌保护：大脑给了歌手，但 provider 明确报「歌手没对上」→ 不放（标记没找到）。
      if (want.artist && hit.artistMatched === false) {
        out.push({ title: label, artist: want.artist, url: null, source: p.name, unresolved: true, wrongMatch: true });
        continue;
      }
      const [url, lyric] = await Promise.all([
        p.songUrl(hit.id).catch(() => null),
        p.lyric(hit.id).catch(() => ''),
      ]);
      out.push({ ...hit, url, lyric, source: p.name });
    } catch (e) {
      out.push({ title: label, artist: want.artist || '', url: null, source: p.name, unresolved: true, error: e.message });
    }
  }
  return out;
}
