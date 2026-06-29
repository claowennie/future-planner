# future.v2 — 学习规划 app

中文为主的个人成长/学习规划 web app：今日待办、周/月/年规划、习惯打卡、番茄钟、
五件好事、成功日记、随手笔记（朋友圈式）、OKR、四季成长树背景、Claudio AI 电台。

## 架构（2026-06 Vite 迁移后）

- **构建**：Vite + @vitejs/plugin-react。源码在 `src/`，静态资源在 `public/assets/`，
  产物在 `dist/`。字体用 @fontsource 自托管（无 Google Fonts / CDN 依赖）。
- **源码组织**：每个模块用 ESM import/export 显式声明依赖；同时保留
  `Object.assign(window, ...)` 兼容层 —— 渲染期仍有大量 `window.X` 引用
  （如 app.jsx 的 Views 表、`window.__appNavigate`）。`src/main.jsx` 按固定顺序导入全部模块。
- **数据**：localStorage（键 `study_planner_v2`）+ Supabase 云同步（`src/sync.jsx`，
  实体级合并、删除不传播、覆盖前自动本地备份）。配置在 `src/supabase-config.js`。
- **Claudio 电台**：`claudio/server/`（Express，端口 3000）。大脑 = spawn 本机
  Claude Code CLI（走 Pro 订阅，无 API key）；TTS = MiniMax（key 在
  `claudio/server/config.local.json`，勿提交）。中枢同时静态托管 `dist/`
  （`claudio/server/config.js` 的 `paths.web`，dist 缺失时回退仓库根）。
- **`legacy-prebuild/`**：迁移前的浏览器内 Babel 版源码存档，仅供参考，**不要再改它**。

## 常用命令

| 操作 | 命令 |
|---|---|
| 开发（热更新，5173，/api 等代理到 3000） | `npm run dev` 或 双击 `开发模式.bat` |
| 构建到 dist/ | `npm run build` 或 双击 `构建网页.bat` |
| 跨文件引用检查（no-undef） | `npm run lint` |
| 启动 Claudio 中枢 + 本地站点 | 双击 `启动Claudio.bat`，开 http://localhost:3000 |

## 重要约定

- **改完 src/ 必须重新 build**，否则 localhost:3000 / Netlify 上看到的还是旧版
  （开发期用 `npm run dev` 则不用）。
- Netlify 部署 = 手动把 `dist/` 目录拖到 Netlify 的 Deploys 页面上传。
- 新增静态文件放 `public/assets/`（代码里用 `assets/...` 相对路径引用）。
- 改动跨文件标识符后跑 `npm run lint`——它能抓住漏 import 的引用（含 JSX 组件位）。
- 番茄钟/electron 之类的计时逻辑依赖真实时间戳（endAt），不要改成 setInterval 减数。
