#!/usr/bin/env bash
# 每日备份：MySQL 导出 + 上传的原文件，各保留最近 14 份。
# 向量不备份（可由 MySQL 分块重建，恢复后运行 npm run reindex）。
# 用法：crontab -e 加一行  30 3 * * * /opt/personal-knowledge/deploy/backup.sh >> /var/log/pk-backup.log 2>&1
set -euo pipefail

APP=${APP:-/opt/personal-knowledge/server}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/personal-knowledge}
KEEP=14

# 只取需要的几项，不直接 source .env（避免值里有特殊字符时出错）
env_get() { grep -E "^$1=" "$APP/.env" | head -1 | cut -d= -f2-; }

umask 077
mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)

MYSQL_PWD="$(env_get MYSQL_PASSWORD)" mysqldump \
  -h "$(env_get MYSQL_HOST)" -P "$(env_get MYSQL_PORT)" -u "$(env_get MYSQL_USER)" \
  --single-transaction --no-tablespaces "$(env_get MYSQL_DATABASE)" | gzip > "$BACKUP_DIR/db-$stamp.sql.gz"
tar czf "$BACKUP_DIR/uploads-$stamp.tgz" -C "$APP" uploads

# 删除过旧的备份
for prefix in db uploads; do
  ls -1t "$BACKUP_DIR/$prefix"-* | tail -n +$((KEEP + 1)) | xargs -r rm -f
done
echo "$(date -Is) 备份完成：$stamp"
