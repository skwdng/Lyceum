#!/bin/sh
# 给 JVM 多留一点堆：现在每场要跑 4 个并行裁判 + 20+ 步对话，384m 偏紧
set -e
F=/etc/systemd/system/siyige.service
cp $F $F.bak-$(date +%Y%m%d-%H%M%S)
sed -i 's/-Xmx384m/-Xmx512m/' $F
sed -i 's/MemoryMax=700M/MemoryMax=800M/' $F
systemctl daemon-reload
systemctl restart siyige
sleep 26
systemctl is-active siyige
ps -o rss= -C java | awk '{printf "  当前内存: %.0f MB\n", $1/1024}'
curl -s -m 8 http://127.0.0.1:8090/api/health
