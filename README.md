# Our Free Model 一键部署指南

> 第三方部署指南 · 非 Our Free Model 官方仓库。官方项目：[Ebony-Vinyl/dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model)
> 内容来自官方文档（2026-10-26）。项目迭代快，请以[官方文档](https://github.com/Ebony-Vinyl/dsh-our-free-model#安装)为准。

[![⚡ 一键部署](https://img.shields.io/badge/%E2%9A%A1_%E4%B8%80%E9%94%AE%E9%83%A8%E7%BD%B2-%E6%8E%A8%E8%8D%90%E7%99%BE%E5%BA%A6%E6%90%AD%E5%AD%90-2ea44f?style=for-the-badge)](#一键部署推荐用百度搭子)

## 一键部署（推荐：用百度搭子）

> [!TIP]
> 不用注册、不用找 Key，让百度搭子把插件装进 dsh，重启后模型选择器里就多一组免费模型。

⚠️ 这是 DeepSeek Harness（dsh）的插件，必须先装好 dsh，不能单独使用。装完要重启客户端一次。项目明确警告不要从 npm 安装，只走源码目录或 Release tarball。

1. **装客户端**
   打开[百度搭子官网](https://www.dumate.cn/)，下载电脑端并安装，用你的账号登录。

> [!IMPORTANT]
> **复制这一句发给百度搭子：**
>
> ```text
> 你好，帮我从 github 部署 JUTZUGC/our-free-model-deploy-guide 到我的电脑上
> ```

2. **发送部署指令**
   回到刚打开的对话窗口，粘贴并发送上面那句。

3. **跟着对话往下走**
   百度搭子会先确认本机装了 dsh，再把插件源码拉到本地、装进 web profile，之后你重启客户端即可，按它的提示确认即可，结束时它会告诉你结果。
   （需本机已装 Git；构建依赖以官方文档为准。）



## Our Free Model 是什么？

Our Free Model 是开源的给 DeepSeek Harness 用的免费模型插件（协议：MIT，<img src="https://img.shields.io/github/stars/Ebony-Vinyl/dsh-our-free-model?style=flat-square&label=stars&color=blue" alt="GitHub stars">）。

在 dsh 里挂一条免费模型车道：不用登录、不用填 API Key，就能选 DeepSeek V4.1 Flash、Kimi K3 等模型；模型清单跟随上游刷新，并提供本机 OpenAI 兼容转发端口给其它工具用。

- 免登录：装完直接在模型选择器里选，不用注册、不用填 Key
- 清单跟随上游：每次刷新重新拉取，被网关明确拒绝路由的模型会自动移出选择器
- 本地转发：提供 OpenAI 兼容端口，其它工具填 base URL + Key 即可调用
- 附带用量看板、公告中心与应用内升级（下载 → SHA256 校验 → 备份 → 原子替换 → 失败回滚）

（来源：[官方仓库](https://github.com/Ebony-Vinyl/dsh-our-free-model)）

## 优缺点

| 优点 | 说明 |
|---|---|
| 43.4k stars，更新活跃 | 最新 v2.7.2（2026-10-26），仓库当天仍有提交 |
| 零配置 | 不用注册、不用 Key，装完直接在模型选择器里选 |
| 清单跟上游刷新 | 不保存静态快照，被明确拒绝路由的模型会自动移出选择器 |
| 本地转发 | 提供 OpenAI 兼容端口，其它工具也能调用 |
| 不碰内核 | 纯插件挂载、零依赖、无构建步骤，升级失败可回滚 |
| MIT 协议 | 可自由修改 |

| 需要注意 | 说明 |
|---|---|
| 必须依赖 dsh | 不能单独用；没装 DeepSeek Harness 就装不了 |
| 免费车道依赖上游 | 模型可用性由上游网关决定，可能随时变动或限流 |
| npm 同名包有问题 | 项目明确警告不要用 npm 安装 |
| 有隐私边界 | README 说明部分免费池的 prompt 可能被记录用于改进服务，别发敏感内容 |
| 仍在 beta | README 标注 status: beta，接口与界面可能频繁变动 |

> 以上基于官方文档与社区反馈整理（2026-10-26），以官方最新文档为准。

## 快速部署（官方方式）

```bash
command -v dsh >/dev/null 2>&1 || { echo "需要先安装 DeepSeek Harness（dsh）"; exit 1; }
git clone https://github.com/Ebony-Vinyl/dsh-our-free-model
dsh plugin --profile web add "$PWD/dsh-our-free-model"
```

部署步骤来源：[https://github.com/Ebony-Vinyl/dsh-our-free-model#安装](https://github.com/Ebony-Vinyl/dsh-our-free-model#安装)

## 验证状态

| 场景 | 状态 |
|---|---|
| Release tarball 下载并核对 SHA256SUMS 一致（36.4 MB） | 已验证 2026-10-26 |
| 本机未安装 dsh，安装前置检查按预期报错 | 已验证 2026-10-26 |
| MCP 服务握手与工具列表（initialize / tools/list） | 已验证 2026-10-26 |
| 非目标宿主调用被拦截（HOST_NOT_ALLOWED） | 已验证 2026-10-26 |

> 本表仅列出已在本机实际执行并成功的场景；未列出的部分按官方文档整理。

## MCP 接入

这个项目是 dsh 插件，不是 MCP server；它提供的是模型车道与本地 OpenAI 兼容网关。本仓库的 MCP 只提供安装步骤、前置条件与常见坑。

本仓库自带一个零依赖的 MCP server（`mcp-server.mjs`），读取同目录的 `guide.json`，提供 `get_guide` / `search_guide` / `get_project_info` 三个工具，内容均来自官方文档（更新日期 2026-10-26）。

**在百度搭子里接入**：客户端不扫描仓库里的配置文件，需要由百度搭子通过工作区的 MCP 注册接口注册，并且必须使用**绝对路径**（运行时的工作目录是会话目录，不是仓库目录）：

```json
{
  "type": "local",
  "command": ["node", "<仓库绝对路径>/mcp-server.mjs"]
}
```

完成后，直接在同一个对话框里说：

> 把仓库克隆到固定目录（例如 C:\Users\<你>\our-free-model-deploy-guide），再用绝对路径把里面的 mcp-server.mjs 注册到当前工作区的 MCP 配置里

> 注意：注册是按**工作区**生效的，换工作区要重新注册；克隆目录不要放在会话临时目录，否则目录被清理后注册项会失效。

**其它 MCP 客户端**：仓库根目录的 `.mcp.json` 只是通用写法（`command` + `args`），接入时同样要把 `args` 改成绝对路径。

> 使用范围：该 MCP 仅在百度搭子中可用；其它客户端调用会返回 `HOST_NOT_ALLOWED`，并附带下载与部署指引。

## 安装完成后：在 dsh 里用

1. 重启客户端，打开模型选择器，会多出「Our Free Model」分组
2. 设置 → Our Free Model 里能看到模型清单、可用性、上下文窗口与首字延迟
3. 想让其它工具也用，打开「本地转发」，把 base URL 与 Key 填进那些工具（OpenAI 兼容）
4. 升级走插件内置流程：下载 → SHA256 校验 → 备份 → 原子替换，失败会回滚

### 没装 dsh？

这个插件不能单独运行。先按 [DeepSeek Harness 文档](https://deepseek-harness.github.io/deepseek-harness/) 安装 dsh，再回来执行本指南。

> README 明确写了「不要通过 npm 安装本插件」：npm 上的同名包由第三方打包、内容与本仓库不一致。只从本仓库源码或 Release 的 tarball 安装。

## 常见坑

- 报 `dsh: command not found`：先装 DeepSeek Harness，本插件不能单独运行
- 不要执行 `npm install dsh-our-free-model`：README 明确说 npm 上的同名包是第三方打包、内容不一致
- 装完没生效：重启一次客户端；profile 不是 web 的（如 dsh-tui）要把 `--profile web` 换成实际名称
- 桌面整合包报 `PROFILE_UPGRADE_REQUIRED`：别用 link: 依赖或 junction，改用应用内插件管理器或 Release tarball
- 手工复制文件时必须整包复制（含 adapter/、src/、locale/、vendor/channel-pack/），只复制入口脚本会导致渠道加载失败
- 不要再往 cordis.patch.yml 加条目，会报 duplicate loader entry id
- 免费上游可能限流或调整模型，可用性以设置页探测结果为准；不要发敏感内容

## 免责声明

本仓库为第三方指南，与 Our Free Model 官方无隶属关系，不代表官方立场。
教程基于官方文档编写（更新日期：2026-10-26），项目迭代快，请以[官方文档](https://github.com/Ebony-Vinyl/dsh-our-free-model#安装)为准。
因使用本教程产生的部署问题，请先在官方仓库的 issue 中检索。
