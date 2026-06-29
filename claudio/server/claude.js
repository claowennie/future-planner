// 大脑适配器：spawn `claude -p --output-format json` 子进程，把组装好的 prompt
// 从 stdin 喂进去，解析出 { reply, set:[{play, intro, hue}] }（set 可空＝纯聊天）。
// 走你的 Claude Code（Pro 订阅），免 API key。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// 解析 claude 可执行体。优先直接定位 npm 全局里的 claude.exe（绝对路径 + 不经 shell），
// 这样彻底绕开 `cmd /c claude` 那层（PATHEXT / .js 关联 / shell 引号 / DEP0190 一类问题）。
// 找不到 .exe 时回退到老办法（claudeCmd + shell:true）。
function resolveClaude() {
  const c = config.claudeCmd;
  if (c && c.toLowerCase().endsWith('.exe') && existsSync(c)) return { bin: c, shell: false };
  // 候选绝对路径，按优先级探测。能直接拿到 .exe 就走 shell:false，绕开 `cmd /c claude`
  // （双击 bat 启动时那层会卡住返回空输出）。
  const candidates = [];
  // 新版原生安装器（2.x 起默认）：%USERPROFILE%\.local\bin\claude.exe
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'));
  }
  // 旧版 npm 全局安装位置
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
  }
  for (const exe of candidates) {
    if (existsSync(exe)) return { bin: exe, shell: false };
  }
  return { bin: c || 'claude', shell: true };
}

// 从 claude CLI 的 JSON 输出里取出正文文本
function extractResult(stdout) {
  const trimmed = stdout.trim();
  try {
    const obj = JSON.parse(trimmed);
    // claude -p --output-format json => { type, subtype, result, ... }
    if (typeof obj.result === 'string') return obj.result;
    if (typeof obj.text === 'string') return obj.text;
    return trimmed;
  } catch {
    return trimmed; // 不是 JSON 就当纯文本
  }
}

// 从模型正文里抠出我们要的结构（容忍代码块包裹/前后废话）。
// 当前结构：{ reply, set:[{play, intro, hue}] }，set 可为空（纯聊天回合）。
// 兼容旧结构：{opener,set} / {say, play[]}。
function parseDjJson(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  const obj = JSON.parse(t);

  const reply = String(obj.reply || obj.opener || obj.say || '').trim();
  // hue：归一到 0-359 的整数；给不出有效值就留 null，由前端按歌名哈希兜底上色。
  const normHue = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? ((Math.round(n) % 360) + 360) % 360 : null;
  };
  let set = [];
  if (Array.isArray(obj.set)) {
    set = obj.set
      .map((it) => {
        const artist = String(it.artist || '').trim();
        const title = String(it.title || '').trim();
        // play：优先用大脑给的；没有就由 artist+title 拼出来（兼容只给了 artist/title 的新结构，
        // 以及只给了 play 的旧结构）。下游 music 层用 artist/title 做精准匹配、用 play 当检索词。
        const play = (String(it.play || '').trim()) || [artist, title].filter(Boolean).join(' ');
        return { artist, title, play, intro: String(it.intro || '').trim(), hue: normHue(it.hue) };
      })
      .filter((it) => it.play);
  } else if (Array.isArray(obj.play)) {
    // 旧结构兜底：play[] 没有逐首 intro/hue/artist/title
    set = obj.play.map((p) => ({ artist: '', title: '', play: String(p || '').trim(), intro: '', hue: null })).filter((it) => it.play);
  }
  return { reply, set };
}

// 跑一次 claude CLI。空输出会带 EmptyOutputError 抛出，供上层决定是否重试。
class EmptyOutputError extends Error {}

function runClaudeOnce(prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json'];
    if (config.claudeModel) args.push('--model', config.claudeModel);

    // DISABLE_AUTOUPDATER：禁掉 claude-code 的后台自动更新，避免调用恰逢更新时空跑。
    const env = { ...process.env, DISABLE_AUTOUPDATER: '1' };
    // 关键修复：claude 要靠代理连 Anthropic（国内裸连被拦 → 返空/403）。双击 bat 启动时
    // 环境里没有 HTTPS_PROXY，所以这里显式注入 config.proxy；NO_PROXY 保留 localhost 直连。
    const proxy = config.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxy) {
      env.HTTPS_PROXY = proxy;
      env.HTTP_PROXY = proxy;
      env.NODE_USE_ENV_PROXY = '1';
      env.NO_PROXY = [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(',');
    }
    // 直接用 claude.exe 绝对路径（shell:false），绕开 `cmd /c claude` 那层。这是本次故障的真凶：
    // 从资源管理器双击 bat 起的进程里走 cmd 调用 claude 会卡住返回空输出；直调 .exe 即正常。
    const { bin: claudeBin, shell: useShell } = resolveClaude();

    const child = spawn(claudeBin, args, {
      shell: useShell,
      windowsHide: true,
      env,
    });

    let stdout = '', stderr = '';
    const killer = setTimeout(() => { child.kill(); reject(new Error('claude 调用超时')); }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(killer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(killer);
      const so = stdout.trim();
      // 空输出：claude 没吐任何东西（偶发网络/代理抖动、CLI 内部异常）。把 stderr + 退出码
      // 一并带出，既能让上层重试，也能在重试仍失败时让报错有据可查（旧版只显示空 stdout）。
      if (!so) {
        return reject(new EmptyOutputError(
          `claude 无输出（退出码 ${code}）。stderr：${stderr.slice(0, 600) || '（空）'}`));
      }
      try {
        resolve(parseDjJson(extractResult(so)));
      } catch (e) {
        reject(new Error(`解析 Claude 输出失败：${e.message}\n退出码 ${code}\nstderr：${stderr.slice(0, 300) || '（空）'}\n原始：${so.slice(0, 500)}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function askClaude(prompt, { timeoutMs = 120000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runClaudeOnce(prompt, timeoutMs);
    } catch (e) {
      lastErr = e;
      // 只对「空输出」这种偶发情况重试；解析失败/超时是确定性问题，重试无益。
      if (e instanceof EmptyOutputError && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
