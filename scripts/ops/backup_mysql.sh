#!/bin/bash
# 思弈阁 MySQL 每日备份：mysqldump → gzip，保留最近 7 份。
# 安装：cp 到 /opt/siyige/backup_mysql.sh && chmod +x；cron 见 docs/migration-mysql/生产切库记录。
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/opt/siyige/backups}
DB=${DB:-siyige}
KEEP=${KEEP:-7}
STAMP=$(date +%F-%H%M)
OUT="$BACKUP_DIR/$DB-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
# root 走 unix socket（Ubuntu 默认 auth_socket），不需要密码
mysqldump --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 -uroot "$DB" | gzip -9 > "$OUT"

# 空文件视为失败（避免「备份成功但 0 字节」）
if [ ! -s "$OUT" ] || [ "$(stat -c%s "$OUT")" -lt 1024 ]; then
  echo "backup failed: $OUT too small" >&2
  rm -f "$OUT"
  exit 1
fi

# 只保留最近 KEEP 份（按文件名时间倒序）
ls -1t "$BACKUP_DIR"/"$DB"-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "ok $OUT $(du -h "$OUT" | cut -f1)"
