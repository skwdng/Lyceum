#!/bin/sh
set -e

echo "--- 修 Redis 持久化目录（dir 现在是 /，redis 用户写不了）---"
grep -q '^dir ' /etc/redis/redis.conf && sed -i 's|^dir .*|dir /var/lib/redis|' /etc/redis/redis.conf || echo 'dir /var/lib/redis' >> /etc/redis/redis.conf
grep -n '^dir ' /etc/redis/redis.conf

echo "--- 重启 Redis ---"
systemctl restart redis-server
sleep 3
systemctl is-active redis-server

echo "--- 自检：PING / 写入 / 落盘 ---"
redis-cli -a siyige123456 --no-auth-warning ping
redis-cli -a siyige123456 --no-auth-warning set siyige:doctor ok >/dev/null && echo "SET ok"
redis-cli -a siyige123456 --no-auth-warning bgsave
sleep 2
redis-cli -a siyige123456 --no-auth-warning config get stop-writes-on-bgsave-error
redis-cli -a siyige123456 --no-auth-warning config get dir
ls -l /var/lib/redis/dump.rdb
redis-cli -a siyige123456 --no-auth-warning del siyige:doctor >/dev/null
echo "--- 完 ---"
