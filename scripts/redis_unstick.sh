#!/bin/sh
# Redis 卡在 deactivating（RDB 存盘失败 -> 无法退出）。这里强杀旧进程再按新配置起来。
echo "--- 杀卡住的 Redis（数据是缓存/队列，会重建）---"
pkill -9 -f 'redis-server 127.0.0.1:6379' 2>/dev/null || true
sleep 2
systemctl reset-failed redis-server 2>/dev/null || true
systemctl stop redis-server 2>/dev/null || true
sleep 1

echo "--- 按新配置启动 ---"
systemctl start redis-server
sleep 3
echo "服务状态: $(systemctl is-active redis-server)"

echo "--- 自检 ---"
redis-cli -a siyige123456 --no-auth-warning ping
redis-cli -a siyige123456 --no-auth-warning config get dir | tr '\n' ' '; echo
redis-cli -a siyige123456 --no-auth-warning set siyige:doctor ok
redis-cli -a siyige123456 --no-auth-warning bgsave
sleep 3
redis-cli -a siyige123456 --no-auth-warning dbsize
redis-cli -a siyige123456 --no-auth-warning del siyige:doctor > /dev/null
echo "--- rdb 文件 ---"
ls -l /var/lib/redis/dump.rdb 2>/dev/null
echo "--- 完 ---"
