#!/usr/bin/env bash
set -euo pipefail
# Our Free Model 一键部署脚本（第三方指南）——按官方文档封装
# 官方文档：https://github.com/Ebony-Vinyl/dsh-our-free-model#安装
# 更新日期：2026-10-26
# 类型：script
cd "$(dirname "${BASH_SOURCE[0]}")"

command -v git >/dev/null 2>&1 || { echo "需要先安装 Git"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "需要先安装 Node.js"; exit 1; }

mkdir -p .download
cd .download

command -v dsh >/dev/null 2>&1 || { echo "需要先安装 DeepSeek Harness（dsh）"; exit 1; }
git clone https://github.com/Ebony-Vinyl/dsh-our-free-model
dsh plugin --profile web add "$PWD/dsh-our-free-model"

echo ""

echo "安装完成：重启客户端，在模型选择器里选 Our Free Model 分组的模型即可；没有 dsh 请先安装 DeepSeek Harness"
echo "若结果异常或需要改配置，请参考官方文档：https://github.com/Ebony-Vinyl/dsh-our-free-model#安装"
