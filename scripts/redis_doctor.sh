#!/bin/sh
echo "--- Redis 状态 ---"
systemctl is-active redis-server
echo "--- 磁盘 ---"
df -h / /var/lib 2>/dev/null | tail -2
echo "--- Redis 数据目录权限 ---"
ls -ld /var/lib/redis 2>/dev/null
ls -l /var/lib/redis/*.rdb 2>/dev/null | head -3
echo "--- Redis 配置（持久化相关）---"
redis-cli -a siyige123456 --no-auth-warning config get dir 2>/dev/null
redis-cli -a siyige123456 --no-auth-warning config get dbfilename 2>/dev/null
redis-cli -a siyige123456 --no-auth-warning config get stop-writes-on-bgsave-error 2>/dev/null
echo "--- Redis 最近日志 ---"
tail -25 /var/log/redis/redis-server.log 2>/dev/null || journalctl -u redis-server -n 20 --no-pager 2>/dev/null | tail -20
