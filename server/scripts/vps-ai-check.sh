#!/bin/bash
export LC_ALL=C

echo "=== 1. 临时实例(8091)与假模型状态 ==="
pgrep -af 'server.port=8091' || echo '  8091: 已停止'
pgrep -af 'mock-llm.cjs' || echo '  mock-llm: 已停止'

echo
echo "=== 2. 线上服务(8090) ==="
systemctl is-active siyige
curl -s -m 5 http://127.0.0.1:8090/api/health
echo

echo
echo "=== 3. 线上服务用的是模板还是模型？（看 AI 发言内容）==="
MID=$(curl -s -m 10 -X POST http://127.0.0.1:8090/api/matches \
  -H 'Content-Type: application/json' \
  -d '{"userId":"probe","topicId":"t4","seats":["B2"],"mode":"SPRINT"}' \
  | grep -o '"matchId":"[^"]*"' | cut -d'"' -f4)
echo "matchId=$MID"
sleep 8
curl -s -m 10 "http://127.0.0.1:8090/api/matches/$MID" | tr ',' '\n' | grep -A1 '"content"' | head -n 4

echo
echo "=== 4. 假模型收到的调用（证据）==="
tail -n 8 /tmp/mock-llm.log 2>/dev/null || echo '  (日志已清)'

echo
echo "=== 5. 清理 ==="
pkill -f 'server.port=8091' 2>/dev/null
pkill -f 'mock-llm.cjs' 2>/dev/null
sleep 1
pgrep -af 'server.port=8091' || echo '  8091 已停'
pgrep -af 'mock-llm.cjs' || echo '  mock-llm 已停'
echo
echo "=== 6. 线上服务最终状态 ==="
systemctl is-active siyige
free -m | sed -n '2p'
