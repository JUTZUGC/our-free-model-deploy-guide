# Our Free Model 一键部署脚本（第三方指南）——按官方文档封装
# 官方文档：https://github.com/Ebony-Vinyl/dsh-our-free-model#安装
# 更新日期：2026-10-28
# 类型：script
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw '需要先安装 Git' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '需要先安装 Node.js' }

New-Item -ItemType Directory -Force -Path .download | Out-Null
Set-Location -Path .download

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) { throw '需要先安装 DeepSeek Harness（dsh）' }
git clone https://github.com/Ebony-Vinyl/dsh-our-free-model
dsh plugin --profile web add "$PWD\dsh-our-free-model"

Write-Host ''

Write-Host '安装完成：重启客户端，在模型选择器里选 Our Free Model 分组的模型即可；没有 dsh 请先安装 DeepSeek Harness'
Write-Host '若结果异常或需要改配置，请参考官方文档：https://github.com/Ebony-Vinyl/dsh-our-free-model#安装'
