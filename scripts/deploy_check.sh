#!/bin/sh
echo "--- 服务 ---"
systemctl is-active siyige
echo "--- 健康 ---"
curl -s -m 8 http://127.0.0.1:8090/api/health; echo
echo "--- 启动日志关键行 ---"
journalctl -u siyige -n 80 --no-pager | grep -E 'Started Siyige|APPLICATION FAILED|Error starting|not found|WARN.*schema' | tail -6
echo "--- 前端入口 ---"
curl -s -m 8 -o /dev/null -w 'v2/index.html: %{http_code}\n' http://127.0.0.1:8090/v2/index.html
curl -s -m 8 -o /dev/null -w '/: %{http_code}\n' http://127.0.0.1:8090/
echo "--- 内存 ---"
free -m | sed -n '2p'
ps -o rss= -C java | awk '{printf "java: %.0f MB\n", $1/1024}'
