# 一键部署：本地构建前端 → 上传 → 服务器拉代码/迁移/重启/自检
#
# 用法（在仓库根目录执行）：
#   ./scripts/deploy.ps1                  # 完整部署（前端 + 后端）
#   ./scripts/deploy.ps1 -SkipFrontend    # 只更新后端
#   ./scripts/deploy.ps1 -SkipBuild       # 复用上次的 dist，不重新构建
#
# 前置条件：
#   1. 本机能 SSH 到服务器。注意：某些代理客户端会拦截 22 端口，需要给服务器 IP 加直连规则
#   2. 本地有 SSH 密钥（默认 ~/.ssh/id_ed25519_pk）；没有则回退到密码登录
#   3. 服务器上 /opt/personal-knowledge 已是 git 仓库
#
# 这个脚本不会“自动”跑，由你决定什么时候上线；真正的远端步骤在 scripts/deploy-remote.sh。

param(
  [string]$Server = "101.133.232.20",
  [int]$Port = 22,
  [string]$User = "root",
  [string]$KeyPath = "$HOME/.ssh/id_ed25519_pk",
  [string]$Domain = "knowledge.myelowen.fun",
  [switch]$SkipBuild,
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ok   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  !    $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  FAIL $text" -ForegroundColor Red; exit 1 }

$sshArgs = @("-p", "$Port", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")
$scpArgs = @("-P", "$Port", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")
if (Test-Path $KeyPath) {
  $sshArgs += @("-i", $KeyPath)
  $scpArgs += @("-i", $KeyPath)
  Ok "使用密钥 $KeyPath"
} else {
  Warn "未找到密钥 $KeyPath，将走密码登录（会提示输入）"
}
$target = "$User@$Server"

# ---------- 0. 连通性预检 ----------
Step "检查服务器连通性"
$probe = Test-NetConnection -ComputerName $Server -Port $Port -WarningAction SilentlyContinue
if (-not $probe.TcpTestSucceeded) {
  Fail "连不上 ${Server}:$Port —— 如果开着代理，请先给 $Server 加直连规则或临时关闭代理"
}
Ok "${Server}:$Port 可达"

# ---------- 1. 本地构建 ----------
if (-not $SkipFrontend) {
  if (-not $SkipBuild) {
    Step "构建前端"
    & pnpm build
    if ($LASTEXITCODE -ne 0) { Fail "前端构建失败" }
    Ok "构建完成"
  }
  if (-not (Test-Path "dist/index.html")) { Fail "dist/index.html 不存在，无法上传" }

  Step "打包前端产物"
  $tarball = Join-Path $env:TEMP "pk-dist.tgz"
  if (Test-Path $tarball) { Remove-Item $tarball -Force }
  & tar -czf $tarball -C dist .
  if ($LASTEXITCODE -ne 0) { Fail "打包失败" }
  Ok ("{0:N0} KB" -f ((Get-Item $tarball).Length / 1KB))
}

# ---------- 2. 上传 ----------
if (-not $SkipFrontend) {
  Step "上传前端产物"
  & scp @scpArgs $tarball "${target}:/tmp/pk-dist.tgz"
  if ($LASTEXITCODE -ne 0) { Fail "上传失败" }
  Ok "已上传 /tmp/pk-dist.tgz"
}

Step "上传部署脚本"
& scp @scpArgs "scripts/deploy-remote.sh" "${target}:/tmp/deploy-remote.sh"
if ($LASTEXITCODE -ne 0) { Fail "上传部署脚本失败" }

# ---------- 3. 远端执行 ----------
$skip = if ($SkipFrontend) { "SKIP_FRONTEND=1" } else { "SKIP_FRONTEND=0" }
Step "在服务器上执行部署"
& ssh @sshArgs $target "$skip DOMAIN=$Domain bash /tmp/deploy-remote.sh"
if ($LASTEXITCODE -ne 0) { Fail "服务器端部署失败" }

# ---------- 4. 本地验证 ----------
Step "从本机验证站点"
try {
  $resp = Invoke-WebRequest -Uri "https://$Domain/" -TimeoutSec 15 -UseBasicParsing
  Ok "https://$Domain/ -> $($resp.StatusCode)"
} catch {
  Fail "站点访问失败：$($_.Exception.Message)"
}

Write-Host "`n部署完成。" -ForegroundColor Green
Write-Host "回滚前端：ssh 到服务器后 cd /opt/personal-knowledge && rm -rf dist && mv dist.prev dist && systemctl restart personal-knowledge"

# 显式给 0：构建工具会往 stderr 写内容，不显式退出的话调用方可能拿到非零码
exit 0
