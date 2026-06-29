// 状态 · 记忆：跨重启持久。最小闭环用一个 JSON 文件就够（以后量大可换 sqlite）。
// 结构：{ messages:[{role,text,at}], plays:[{title,artist,at}], queue:[track], prefs:{} }
import fs from 'node:fs';
import { paths } from './config.js';

const EMPTY = { messages: [], plays: [], queue: [], nowPlaying: null, prefs: {} };

let state = load();

function load() {
  try {
    if (fs.existsSync(paths.stateFile)) {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(paths.stateFile, 'utf8')) };
    }
  } catch (e) {
    console.warn('[state] 读取失败，从空状态开始：', e.message);
  }
  return structuredClone(EMPTY);
}

let saveTimer = null;
function persist() {
  // 去抖写盘，避免高频 IO
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(paths.stateFile, JSON.stringify(state, null, 2)); }
    catch (e) { console.warn('[state] 写盘失败：', e.message); }
  }, 300);
}

export const store = {
  get: () => state,
  addMessage(role, text) {
    state.messages.push({ role, text, at: Date.now() });
    if (state.messages.length > 200) state.messages = state.messages.slice(-200);
    persist();
  },
  recentMessages(n = 12) { return state.messages.slice(-n); },
  addPlay(track) {
    state.plays.push({ title: track.title, artist: track.artist, at: Date.now() });
    if (state.plays.length > 500) state.plays = state.plays.slice(-500);
    persist();
  },
  setQueue(tracks) { state.queue = tracks; persist(); },
  setNowPlaying(track) { state.nowPlaying = track; persist(); },
  setPref(k, v) { state.prefs[k] = v; persist(); },
};
