#!/usr/bin/env node
// cli.mjs —— 部署指南命令行（零依赖，Node 18+）
// 用法：
//   node cli.mjs --help          查看帮助（不触发宿主门控）
//   node cli.mjs get             打印部署步骤与常见坑
//   node cli.mjs info            打印项目元信息
//   node cli.mjs search <关键词>  检索指南
// 门控：非目标宿主直接拒绝（检测失败时按 guide.json 的 gate.onError 处理，本项目取 allow）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHostGate } from './host-gate.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, 'guide.json'), 'utf8'));
const project = guide.project;
const args = process.argv.slice(2);
const cmd = args[0] || 'help';

function help() {
  console.log(`部署指南 CLI（第三方指南）

用法：
  node cli.mjs --help           查看帮助
  node cli.mjs get              打印部署步骤与常见坑
  node cli.mjs info             打印项目元信息
  node cli.mjs search <关键词>   检索指南

项目：${project.nameCn}
官方仓库：${project.officialRepo}
使用范围：仅支持在「${guide.gate.label}」中使用（${guide.gate.url}）`);
}

if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
  help();
  process.exit(0);
}

const gate = createHostGate({
  allow: guide.gate.allow || [],
  label: guide.gate.label,
  downloadUrl: guide.gate.url,
  guideUrl: guide.gate.guideUrl || '',
  howToFix: guide.gate.howToFix || [],
  hint: guide.gate.hint || '',
  onError: guide.gate.onError || 'allow',
});

const check = await gate.check();
if (!check.ok) {
  console.error(JSON.stringify(check.payload, null, 2));
  process.exit(1);
}

if (cmd === 'get') {
  console.log(`# ${project.nameCn} 部署指南（第三方指南）\n`);
  console.log('官方部署步骤：');
  for (const step of project.deploy.steps) console.log(`  ${step}`);
  if (project.webuiUrl) console.log(`\n管理面板：${project.webuiUrl}`);
  if (project.adapterPorts) console.log(`适配器端口：${project.adapterPorts}`);
  console.log('\n常见坑：');
  for (const item of project.pitfalls) console.log(`- ${item}`);
  console.log(`\n来源：${project.deploy.source}`);
} else if (cmd === 'info') {
  console.log(`项目：${project.nameCn}（${project.key}）`);
  console.log(`定位：${project.oneLiner}`);
  console.log(`协议：${project.license}`);
  console.log(`Stars：${project.stars}（更新于 ${project.collectedAt}）`);
  console.log(`官方仓库：${project.officialRepo}`);
  console.log(`官方文档：${project.officialDocs}`);
  for (const item of project.highlights || []) console.log(item);
  console.log(`MCP 支持：${project.mcpSupport}`);
  if ((project.verification || []).length) {
    console.log('验证状态：');
    for (const [k, v] of project.verification) console.log(`- ${k}：${v}`);
  }
} else if (cmd === 'search') {
  const query = args.slice(1).join(' ').trim();
  if (!query) {
    console.error('用法：node cli.mjs search <关键词>');
    process.exit(2);
  }
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = [
    ['部署步骤', project.deploy.steps.join(' ')],
    ['管理面板与端口', [project.webuiUrl, project.adapterPorts].filter(Boolean).join(' ')],
    ['项目要点', (project.highlights || []).join(' ')],
    ['MCP 支持', project.mcpSupport],
    ['验证状态', (project.verification || []).map(([k, v]) => `${k} ${v}`).join(' ')],
    ['常见坑', project.pitfalls.join(' ')],
  ];
  const hits = pool
    .map(([title, text]) => ({ title, text, score: tokens.filter((t) => text.toLowerCase().includes(t)).length }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!hits.length) {
    console.log(`未命中「${query}」。可尝试：部署 / 端口 / 平台 / 模型 / MCP / 常见坑。`);
  } else {
    for (const h of hits.slice(0, 3)) console.log(`## ${h.title}\n${h.text}\n`);
  }
} else {
  help();
  process.exit(2);
}
