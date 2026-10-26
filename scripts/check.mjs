#!/usr/bin/env node
// scripts/check.mjs —— 发布前自检（对应方案 §11 验收清单中可机器校验的项）
// 用法：node scripts/check.mjs [仓库目录，默认 .]
// 退出码：0 = 通过；1 = 有错误

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '.');
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const at = (f) => path.join(ROOT, f);
const exists = (f) => fs.existsSync(at(f));
const read = (f) => (exists(f) ? fs.readFileSync(at(f), 'utf8') : null);

const REQUIRED = [
  'README.md',
  'guide.json',
  '.mcp.json',
  'host-gate.mjs',
  'mcp-server.mjs',
  'cli.mjs',
  'deploy.sh',
  'deploy.ps1',
  'LICENSE',
  '.gitignore',
  'scripts/check.mjs',
  '.github/workflows/ci.yml',
];
for (const f of REQUIRED) if (!exists(f)) fail(`缺少文件：${f}`);

let guide = null;
if (exists('guide.json')) {
  try {
    guide = JSON.parse(read('guide.json'));
  } catch (e) {
    fail(`guide.json 不是合法 JSON：${e.message}`);
  }
}

if (guide) {
  const project = guide.project || {};
  const gate = guide.gate || {};

  if (!project.key || !project.nameCn || !project.repoName) fail('guide.json 缺少 project.key / nameCn / repoName');
  if (!/-(deploy-guide|mcp-guide|tutorial)$/.test(project.repoName || '')) {
    fail(`仓库名必须以 -deploy-guide / -mcp-guide / tutorial 结尾：${project.repoName}`);
  }
  if (!guide.code) fail('guide.json 缺少 code（账号名）');
  if (guide.code !== guide.owner) fail(`code 与 owner 不一致：${guide.code} != ${guide.owner}`);
  if (!/^[A-Z0-9]{7}$/.test(guide.code || '')) {
    fail(`code 必须是 7 位大写字母/数字：${guide.code}`);
  }
  if (guide.code === 'AB12CDE' || /^YOUR/i.test(guide.code || '')) warn('code 仍是示例值（AB12CDE / YOUR...），发布前必须替换为真实 GitHub 账号名');

  if (!Array.isArray(guide.keywords) || guide.keywords.length < 8 || guide.keywords.length > 10) {
    fail(`SEO 关键词需 8-10 个，当前：${Array.isArray(guide.keywords) ? guide.keywords.length : 0}`);
  }
  if (!Array.isArray(guide.topics) || guide.topics.length < 4 || guide.topics.length > 8) {
    fail(`Topics 需 4-8 个，当前：${Array.isArray(guide.topics) ? guide.topics.length : 0}`);
  }
  for (const f of ['officialRepo', 'officialDocs']) {
    if (!/^https:\/\//.test(project[f] || '')) fail(`project.${f} 必须是 https 链接`);
  }
  if (!project.collectedAt) fail('guide.json 缺少 project.collectedAt（更新日期）');
  if (!Array.isArray(project.pitfalls) || !project.pitfalls.length) fail('guide.json 缺少 project.pitfalls');
  if (project.verification && (!Array.isArray(project.verification)
    || project.verification.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((s) => typeof s !== 'string' || !s.trim())))) {
    fail('project.verification 必须是 [[场景, 状态], ...]');
  }
  if (!project.deploy || !Array.isArray(project.deploy.steps) || !project.deploy.steps.length) {
    fail('guide.json 缺少 project.deploy.steps');
  }
  if (project.deploy && !['docker', 'script', 'binary'].includes(project.deploy.type)) {
    fail(`project.deploy.type 必须是 docker / script / binary：${project.deploy.type}`);
  }

  if (!Array.isArray(gate.allow) || !gate.allow.length) fail('gate.allow 不能为空');
  if (!gate.label) fail('gate.label 不能为空');
  if (!/^https:\/\//.test(gate.url || '')) fail('gate.url 必须是 https 链接');
  if (!['allow', 'deny'].includes(gate.onError)) fail("gate.onError 只能是 'allow' 或 'deny'");
}

const readme = read('README.md');
if (readme && guide) {
  if (readme.includes('{{')) fail('README.md 存在未替换的模板变量 {{...}}');
  if (!readme.includes('第三方部署指南')) fail('README.md 首行需注明「第三方部署指南」');
  if (!readme.includes(`${guide.code}/${guide.project.repoName}`)) {
    fail('README.md 推广指令里缺少 <账号名>/<仓库名>');
  }
  for (const bad of ['官方 MCP', '官方MCP', '官方授权', '官方合作', '自动完成部署']) {
    if (readme.includes(bad)) fail(`README.md 出现禁词：${bad}`);
  }
  // 裸 URL 紧跟中文/全角标点时，GitHub 自动链接会把后面的文字并进链接
  if (/(^|[^(\[<])https?:\/\/[^\s<>)\]]*[\u4e00-\u9fff，。；：、）]/.test(readme)) {
    fail('README.md 有裸 URL 紧跟中文或全角标点，会被自动链接吞掉后面的文字；请改成 [文字](URL)');
  }
  if (!readme.includes(guide.project.officialRepo)) fail('README.md 未引用官方仓库链接');
  if (!readme.includes(guide.project.officialDocs)) fail('README.md 未引用官方文档链接');
  if (!readme.includes('绝对路径')) fail('README.md 的 MCP 接入段必须写明用绝对路径注册');
  if (!readme.includes('"type": "local"')) fail('README.md 未给出百度搭子的 local 注册写法');
  if (!readme.includes(guide.project.collectedAt)) fail('README.md 未标注更新日期');
  if ((guide.project.verification || []).length && !readme.includes('## 验证状态')) {
    fail('guide.json 有 verification，但 README.md 缺少「## 验证状态」章节');
  }
}

const mcpText = read('.mcp.json');
if (mcpText) {
  try {
    const mcp = JSON.parse(mcpText);
    const servers = Object.values(mcp.mcpServers || {});
    if (!servers.length) fail('.mcp.json 缺少 mcpServers');
    for (const s of servers) {
      if (!s.command) fail('.mcp.json 的 server 缺少 command');
      if (!Array.isArray(s.args)) fail('.mcp.json 的 server 缺少 args 数组');
      for (const key of ['cwd', 'description']) {
        if (key in s) fail(`.mcp.json 不能包含 ${key}：百度搭子为 strict 校验，多余字段会让整条定义非法`);
      }
    }
  } catch (e) {
    fail(`.mcp.json 不是合法 JSON：${e.message}`);
  }
}

const sh = read('deploy.sh');
if (sh) {
  if (!sh.startsWith('#!/usr/bin/env bash')) fail('deploy.sh 缺少 bash shebang');
  if (!sh.includes('set -euo pipefail')) fail('deploy.sh 缺少 set -euo pipefail');
  if (/<官方目录>|示例为|TODO|占位/.test(sh)) fail('deploy.sh 仍含占位命令');
  if (sh.includes('{{')) fail('deploy.sh 存在未替换的模板变量');
  if (process.platform !== 'win32') {
    try {
      if (!(fs.statSync(at('deploy.sh')).mode & 0o111)) warn('deploy.sh 没有可执行权限（chmod +x deploy.sh）');
    } catch {
      /* stat 失败已在缺少文件里报过 */
    }
  }
}

const license = read('LICENSE');
if (license && /Your Name|TODO|占位|\[year\]/i.test(license)) fail('LICENSE 版权人仍是占位符，发布前替换');

for (const f of ['host-gate.mjs', 'mcp-server.mjs', 'cli.mjs', 'scripts/check.mjs']) {
  if (!exists(f)) continue;
  try {
    execFileSync(process.execPath, ['--check', at(f)], { stdio: 'pipe' });
  } catch (e) {
    const msg = String((e.stderr && e.stderr.toString()) || e.message).split('\n').find((l) => l.trim()) || '语法错误';
    fail(`${f} 语法错误：${msg}`);
  }
}

const title = guide ? `${guide.project.nameCn} / ${guide.project.repoName}` : ROOT;
console.log(`[${errors.length ? 'FAIL' : 'PASS'}] ${title}`);
for (const w of warnings) console.log(`  WARN ${w}`);
for (const e of errors) console.log(`  ERR  ${e}`);
if (!errors.length) console.log(`  已检查 ${REQUIRED.length} 个必需文件、README 账号名、禁词、MCP 声明与脚本语法`);
process.exit(errors.length ? 1 : 0);
