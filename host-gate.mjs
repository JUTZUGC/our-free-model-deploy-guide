// host-gate.mjs —— 进程链宿主门控（零依赖，Node 18+）
//
// 目标：让 MCP server / CLI 只在指定 AI 客户端（如「百度搭子」）环境中工作，
// 其它宿主调用时返回结构化的 HOST_NOT_ALLOWED 引导负载（带下载地址 + 部署步骤）。
//
// 判断依据：启动本进程的「祖先进程链」里是否出现允许列表中的进程特征。
// 不信任客户端自报名称：MCP SDK 默认 self-reported name 会重名、可伪造。
// 百度搭子实测：其 MCP 服务由 dumate-opencode.exe 启动，allow 特征用 'dumate'（子串、大小写不敏感）即可命中。
//
// 用法：
//   import { createHostGate } from './host-gate.mjs'
//   const gate = createHostGate({ allow: ['dumate'], label: '百度搭子', downloadUrl: '...', guideUrl: '...', howToFix: [...], hint: '...' })
//   const r = await gate.check()
//   if (!r.ok) return r.payload        // MCP：作为 tools/call 的错误返回；CLI：打印后 exit(1)
//
// 定位：转化摩擦而非 DRM。开源可删，挡小白不挡高手，设计意图即如此。
// 失败策略：默认 fail-open（读不到进程表即放行，避免误伤真实用户）；
// 需要更严格拦截时显式设置 onError:'deny'。本项目按业务取舍取 fail-open。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------- 1. 进程表采集（跨平台） ----------

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function getProcessTable() {
  const platform = process.platform;
  const table = new Map();

  if (platform === 'win32') {
    // 主路径：PowerShell CIM（Windows 自带）
    let arr = null;
    try {
      const psCmd = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 8000 });
      const parsed = JSON.parse(stdout);
      arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      arr = null;
    }
    if (arr && arr.length) {
      for (const p of arr) {
        if (p && p.ProcessId) {
          table.set(Number(p.ProcessId), {
            pid: Number(p.ProcessId),
            ppid: Number(p.ParentProcessId) || 0,
            name: String(p.Name || ''),
            cmd: String(p.CommandLine || ''),
          });
        }
      }
      return table;
    }
    // 回退：wmic（老系统）
    const { stdout } = await execFileAsync('wmic', ['process', 'get', 'ProcessId,ParentProcessId,Name,CommandLine', '/format:csv'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 8000 });
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines.slice(1)) {
      const f = splitCsvLine(line); // Node,CommandLine,Name,ParentProcessId,ProcessId
      if (f.length < 5) continue;
      const pid = Number(f[4]);
      if (!pid) continue;
      table.set(pid, { pid, ppid: Number(f[3]) || 0, name: f[2], cmd: f[1] });
    }
    return table;
  }

  // macOS / Linux
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { maxBuffer: 16 * 1024 * 1024, timeout: 8000 });
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    if (!pid) continue;
    table.set(pid, { pid, ppid: Number(m[2]) || 0, name: m[3], cmd: m[4] || '' });
  }
  return table;
}

// ---------- 2. 祖先进程链 ----------

function buildAncestorChain(table, startPid, maxDepth = 32) {
  const chain = [];
  const seen = new Set();
  let pid = startPid;
  for (let i = 0; i < maxDepth && pid && pid > 0 && !seen.has(pid); i++) {
    seen.add(pid);
    const p = table.get(pid);
    if (!p) break;
    chain.push(p);
    pid = p.ppid;
  }
  return chain;
}

// ---------- 3. 匹配 ----------

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\\/g, '/');
}

const WRAPPERS = new Set([
  'node', 'node.exe', 'cmd', 'cmd.exe', 'sh', 'bash', 'zsh', 'dash',
  'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'conhost', 'conhost.exe',
  'npx', 'npx.cmd', 'npm', 'npm.exe', 'wmic', 'wmic.exe', 'explorer', 'explorer.exe',
]);

function matchChain(chain, allow) {
  const rules = allow.map(normalize).filter(Boolean);
  for (const p of chain) {
    const name = normalize(p.name);
    const cmd = normalize(p.cmd);
    for (const rule of rules) {
      if (name.includes(rule) || cmd.includes(rule)) {
        return { matched: true, rule, process: { pid: p.pid, name: p.name, cmd: p.cmd } };
      }
    }
  }
  return { matched: false };
}

// ---------- 4. 门控 ----------

export function createHostGate(options = {}) {
  const {
    allow = [],        // 允许的进程特征（可执行名/命令行子串，大小写不敏感）
    label = '指定客户端',
    downloadUrl = '',
    guideUrl = '',
    howToFix = [],
    hint = '',
    envHints = [],     // 可选：环境变量特征兜底（如 ['DUMATE_']），不作主判据
    onError = 'allow', // 检测失败时：'allow'（放行，默认）| 'deny'（拒绝）
    cacheMs = 60_000,  // 进程表缓存
  } = options;

  let cache = null;
  let cacheAt = 0;

  async function table() {
    const now = Date.now();
    if (cache && now - cacheAt < cacheMs) return cache;
    cache = await getProcessTable();
    cacheAt = now;
    return cache;
  }

  function envMatch() {
    for (const key of Object.keys(process.env)) {
      const k = key.toLowerCase();
      for (const h of envHints) {
        if (k.includes(h.toLowerCase())) return { matched: true, key };
      }
    }
    return { matched: false };
  }

  function denyPayload(detected) {
    return {
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      error: `本工具目前仅支持在「${label}」中使用。`,
      reason: `检测到当前是由「${detected.name}」启动的，不在允许范围内。`,
      detected,
      howToFix: howToFix.length ? howToFix : [
        `1. 打开 ${downloadUrl} ，下载并安装「${label}」电脑端（Windows / macOS）`,
        '2. 用账号登录',
        '3. 在对话窗口里发送：你好，帮我从 github 部署 <owner>/<repo> 到我的电脑上',
        '4. 部署完成后，直接在同一对话窗里使用',
      ],
      hint: hint || `请改用「${label}」部署后再使用。`,
      downloadUrl,
      guideUrl,
    };
  }

  async function check() {
    let t;
    try {
      t = await table();
    } catch (e) {
      if (onError === 'allow') {
        return { ok: true, host: 'check-failed', chain: [] };
      }
      return {
        ok: false,
        payload: {
          ok: false,
          code: 'HOST_CHECK_FAILED',
          error: '无法检测当前运行环境。',
          reason: String((e && e.message) || e),
          hint: `请重试；若持续失败，请确认已在「${label}」中运行。`,
        },
      };
    }

    const chain = buildAncestorChain(t, process.ppid || 0);
    const hit = matchChain(chain, allow);
    if (hit.matched) {
      return { ok: true, host: hit.process.name, chain: chain.map((p) => p.name) };
    }

    const envHit = envMatch();
    if (envHit.matched) {
      return { ok: true, host: `env:${envHit.key}`, chain: chain.map((p) => p.name) };
    }

    // 挑最近的非包装进程作为「检测到的宿主」上报（比报 node.exe 更有信息量）
    const detected =
      chain.find((p) => !WRAPPERS.has(normalize(p.name))) ||
      chain[0] || { name: '未知进程', pid: 0, cmd: '' };
    return {
      ok: false,
      payload: denyPayload({
        name: detected.name || '未知进程',
        pid: detected.pid || 0,
        processes: chain.map((p) => p.name).filter(Boolean),
      }),
    };
  }

  return { check };
}
