#!/usr/bin/env bash
# 在服务器上执行：拉代码 → 按需装依赖 → 数据库迁移 → 替换前端 → 重启 → 自检
#
# 由 scripts/deploy.ps1 上传到 /tmp 后调用，也可以手动执行：
#   bash /tmp/deploy-remote.sh
#   SKIP_FRONTEND=1 bash /tmp/deploy-remote.sh   # 只更新后端
set -euo pipefail

APP=${APP:-/opt/personal-knowledge}
SKIP_FRONTEND=${SKIP_FRONTEND:-0}
DIST_TGZ=/tmp/pk-dist.tgz

log() { printf '\n=== %s ===\n' "$1"; }

log "拉取代码"
cd "$APP"
old=$(git rev-parse HEAD)
# 网络抖动时 git fetch/pull 可能失败，若代码已是最新则不影响部署
if ! git fetch --all -q 2>/dev/null; then
  echo "! git fetch 失败（网络抖动？），跳过远程同步，使用本地代码"
else
  git pull --ff-only -q 2>/dev/null || echo "! git pull 失败（网络抖动？），使用本地代码"
fi
new=$(git rev-parse HEAD)
if [ "$old" = "$new" ]; then
  echo "代码已是最新（${new:0:7}）"
else
  echo "更新：${old:0:7} -> ${new:0:7}"
  git log --oneline "$old..$new" | head -5
fi

log "检查依赖"
# 只有 package-lock.json 变了才重装，避免每次都拉 131MB
if [ "$old" != "$new" ] && git diff --name-only "$old" "$new" | grep -qx 'server/package-lock.json'; then
  ( cd "$APP/server" && npm ci )
  echo "已重装依赖"
else
  echo "依赖未变，跳过 npm ci"
fi

log "数据库迁移"
cd "$APP/server"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" \
  -e 'SELECT name FROM schema_migrations ORDER BY name' 2>/dev/null | tail -4 || true
npm run migrate

if [ "$SKIP_FRONTEND" = "0" ] && [ -f "$DIST_TGZ" ]; then
  log "替换前端产物"
  cd "$APP"
  rm -rf dist.prev
  mv dist dist.prev
  mkdir -p dist
  tar -xzf "$DIST_TGZ" -C dist
  chown -R pk:pk dist
  rm -f "$DIST_TGZ"
  echo "已替换，旧版保留在 dist.prev"
fi

log "重启并自检"
systemctl restart personal-knowledge
sleep 4
printf '状态: '; systemctl is-active personal-knowledge
printf '健康: '; curl -s -m 8 http://127.0.0.1:3001/api/health; echo
printf '首页: '; curl -s -o /dev/null -w '%{http_code}\n' -k -m 10 "https://${DOMAIN:-knowledge.myelowen.fun}/"
