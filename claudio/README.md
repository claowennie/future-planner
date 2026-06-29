# Claudio · 个人 AI 电台

读懂你的听歌习惯 → 让 Claude 当大脑选歌 + 写串场词 → 像 DJ 那样为你播报。
已接进 future.v2：侧栏「声音 · Sound → 电台 · Claudio」。

**默认用「本地曲库」模式**：放你自己的音乐文件，不依赖任何账号、不会过期、全离线。

```
claudio/
├─ user/
│  ├─ taste.md          ← 先把这个改成你自己的听歌品味
│  ├─ playlists.json    ← 可选：常听的锚点歌
│  └─ music/            ← 把你的 mp3/flac 等丢进这里（曲库）
└─ server/              本地中枢（Node 服务，localhost:3000）
   ├─ server.js         HTTP + WebSocket 入口
   ├─ context.js        把语料 + 曲库 + 历史 + 环境 → prompt
   ├─ claude.js         spawn `claude -p` 当大脑（走你的 Pro 订阅）
   ├─ music/            可插拔音乐层：local（默认）/ qq / netease 同一套接口
   ├─ tts.js            Fish Audio 语音合成（没 key 则前端用浏览器语音）
   └─ state.json        记忆：对话/播放历史（自动生成）
```

## 用起来（三步）

```bash
# 1) 把音乐文件拖进 claudio/user/music/   文件名建议「歌手 - 歌名.mp3」
# 2) 起中枢
cd claudio/server
npm install      # 只需一次
npm start        # 起在 http://localhost:3000
# 3) 打开 future.v2 的 index.html → 进「电台」页 → 右上角「中枢在线」即通
```

跟它说句话或点快捷按钮，它就会从你的曲库里挑歌、播报、放歌。
改 `user/taste.md` 写上你的品味，它会选得越来越对味。

## 本地曲库说明

- 支持 `mp3 / flac / m4a / aac / ogg / opus / wav / wma`
- 文件名 `歌手 - 歌名.ext` 最准；只写 `歌名.ext` 也行；开头的曲目序号会自动忽略
- 想要歌词：放一个同名 `.lrc`（如 `周杰伦 - 晴天.lrc`）
- 加歌随时往文件夹里丢，约 5 秒后自动生效，不用重启

## 现状

| 能力 | 状态 |
|---|---|
| Claude 大脑（从你曲库选歌 + 串场词） | ✅ 已通（Pro 订阅，免 API key） |
| 本地曲库播放 | ✅ 已通（`/media` 托管，支持拖动进度条） |
| DJ 语音播报 | ✅ 浏览器内置语音兜底；想要专属音色 → 配 Fish key |
| 记忆（对话/播放历史持久） | ✅ |

## 可选：配专属 DJ 音色（Fish Audio）

复制 `server/config.example.json` 为 `server/config.local.json`，填 `fishApiKey` / `fishModelId`
（fish.audio 注册）。不配就用浏览器内置语音，链路一样通。
`config.local.json` / `state.json` / `cache/` 不会被提交（见 `.gitignore`）。

---

## 进阶（可选）：用 QQ 全网曲库代替本地文件

不想自己准备文件、想点全网任意歌，可切到 QQ。代价是**要登录 QQ 音乐账号、cookie 过几天~两周会失效需重登**（这也是默认不用它的原因）。

1. 把 `config.local.json` 的 `musicProvider` 改成 `"qq"`
2. 起 QQ API：`cd claudio/qqmusic-api && npm start`（localhost:3300，另开一个终端）
3. 登录拿 cookie：浏览器登录 https://y.qq.com → F12 复制整段 Cookie → 贴进
   `claudio/qqmusic-api/my-cookie.txt` → `node login.mjs` → 重启 QQ 服务

> ⚠️ 注意：`jsososo/QQMusicApi` 自带的 `/song/url` 取直链方式已被 QQ 淘汰（返回 502 / code 104009）。
> 我已验证「现行」取法可用（POST `musicu.fcg` + UA/Referer + 新版 comm + 计算 g_tk），
> 但需要在 `server/music/qq.js` 里自己实现这个 vkey 请求才能稳定出声。要走这条路再找我接上。

想用网易云同理：`musicProvider` 改 `"netease"`，起 `NeteaseCloudMusicApi` 指到 `neteaseApiBase`。
三家同一套接口，随时切换，不动大脑代码。
