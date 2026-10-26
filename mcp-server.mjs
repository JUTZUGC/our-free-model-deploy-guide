#!/usr/bin/env node
// mcp-server.mjs —— 第三方部署指南 MCP server（零依赖，Node 18+）
//
// 传输：stdio + 换行分隔 JSON-RPC
// 工具：get_guide / search_guide / get_project_info
// 内容：全部来自同目录 guide.json（由生成器按项目配置产出，不写死项目信息）
// 门控：见 host-gate.mjs；检测失败时按 guide.json 的 gate.onError 处理（本项目取 allow，即放行）

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createHostGate } from './host-gate.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, 'guide.json'), 'utf8'));
const project = guide.project;

const gate = createHostGate({
  allow: guide.gate.allow || [],
  label: guide.gate.label,
  downloadUrl: guide.gate.url,
  guideUrl: guide.gate.guideUrl || '',
  howToFix: guide.gate.howToFix || [],
  hint: guide.gate.hint || '',
  onError: guide.gate.onError || 'allow',
});

const TOOLS = [
  {
    name: 'get_guide',
    description: `${project.nameCn} 部署指南（第三方指南）：返回官方部署步骤、管理面板地址与常见坑。`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_guide',
    description: `在 ${project.nameCn} 部署指南中检索：平台支持、模型接入、端口、MCP、常见坑。`,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '关键词，例如 端口 / 微信 / MCP' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_project_info',
    description: `${project.nameCn} 项目元信息（第三方指南）：官方仓库、协议、stars、MCP 支持情况。`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function guideText() {
  const lines = [
    `# ${project.nameCn} 部署指南（第三方指南）`,
    '',
    `官方仓库：${project.officialRepo}`,
    `官方文档：${project.officialDocs}`,
    `更新日期：${project.collectedAt}`,
    '',
    '## 官方部署步骤',
    '```bash',
    ...project.deploy.steps,
    '```',
    '',
  ];
  if (project.webuiUrl) lines.push(`管理面板：${project.webuiUrl}`);
  if (project.adapterPorts) lines.push(`适配器端口：${project.adapterPorts}`);
  lines.push('', '## MCP 支持', project.mcpSupport, '', '## 常见坑');
  for (const item of project.pitfalls) lines.push(`- ${item}`);
  lines.push('', `来源：${project.deploy.source}`);
  return lines.join('\n');
}

function infoText() {
  const lines = [
    `项目：${project.nameCn}（${project.key}）`,
    `定位：${project.oneLiner}`,
    `协议：${project.license}`,
    `Stars：${project.stars}（更新于 ${project.collectedAt}）`,
    `官方仓库：${project.officialRepo}`,
    `官方文档：${project.officialDocs}`,
    `MCP 支持：${project.mcpSupport}`,
    ...(project.highlights || []),
  ];
  if ((project.verification || []).length) {
    lines.push('验证状态：', ...project.verification.map(([k, v]) => `- ${k}：${v}`));
  }
  return lines.join('\n');
}

function sections() {
  return [
    { title: '部署步骤', text: project.deploy.steps.join('\n') },
    { title: '管理面板与端口', text: [project.webuiUrl, project.adapterPorts].filter(Boolean).join(' ') },
    { title: '项目要点', text: (project.highlights || []).join('\n') },
    { title: 'MCP 支持', text: project.mcpSupport },
    { title: '验证状态', text: (project.verification || []).map(([k, v]) => `${k}：${v}`).join('\n') },
    { title: '常见坑', text: project.pitfalls.join('\n') },
    { title: '项目定位', text: project.oneLiner },
  ];
}

function searchGuide(query) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '请提供检索关键词，例如：端口 / 微信 / MCP';
  const hits = [];
  for (const s of sections()) {
    const hay = `${s.title}\n${s.text}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (score) hits.push({ ...s, score });
  }
  if (!hits.length) return `未在指南中命中「${query}」。可尝试：部署 / 端口 / 平台 / 模型 / MCP / 常见坑。`;
  hits.sort((a, b) => b.score - a.score);
  return hits
    .slice(0, 3)
    .map((h) => `## ${h.title}\n${h.text}`)
    .join('\n\n');
}

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function ok(id, result) {
  return send({ jsonrpc: '2.0', id, result });
}

function rpcError(id, code, message) {
  return send({ jsonrpc: '2.0', id, error: { code, message } });
}

function toolResult(id, textContent, isError = false) {
  return ok(id, { content: [{ type: 'text', text: textContent }], ...(isError ? { isError: true } : {}) });
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: `${project.key}-mcp-guide`, version: '1.0.0' },
    });
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return;
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};

    // 门控：连接放行，实际调用前拦截，错误直接显示在对话里
    const check = await gate.check();
    if (!check.ok) return toolResult(id, JSON.stringify(check.payload, null, 2), true);

    try {
      if (name === 'get_guide') return toolResult(id, guideText());
      if (name === 'search_guide') return toolResult(id, searchGuide(args.query));
      if (name === 'get_project_info') return toolResult(id, infoText());
      return rpcError(id, -32602, `未知工具：${name}`);
    } catch (e) {
      return toolResult(id, `工具执行失败：${e && e.message ? e.message : e}`, true);
    }
  }
  if (!isNotification) return rpcError(id, -32601, `未实现的方法：${method}`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, 'JSON 解析失败');
  }
  handle(msg).catch((e) => rpcError(msg.id ?? null, -32603, String(e && e.message ? e.message : e)));
});

process.on('unhandledRejection', (e) => {
  process.stderr.write(`mcp-server 未处理异常：${e && e.stack ? e.stack : e}\n`);
});
