#!/bin/bash
export LC_ALL=C
PID=$(systemctl show -p MainPID --value siyige)
echo "MainPID=$PID"
echo "--- 环境变量是否注入（应为 1）---"
tr '\0' '\n' < /proc/$PID/environ | grep -c SPRING_APPLICATION_JSON
echo "--- 内存 ---"
ps -o rss= -p $PID | awk '{printf "java RSS: %.0f MB\n", $1/1024}'
echo "--- 审核接口（走真模型时理由不会是「存在正反两种合理立场」这句规则文案）---"
curl -s -m 40 -X POST http://127.0.0.1:8090/api/topics/audit \
  -H 'Content-Type: application/json' \
  -d '{"title":"考研是否应当取消英语单科分数线"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('result :', d['result'])
print('reason :', d['reason'])
for s in d.get('suggestions', []):
    print('  建议 :', s)
"
echo
echo "--- 再审核一个明显该拒的题 ---"
curl -s -m 40 -X POST http://127.0.0.1:8090/api/topics/audit \
  -H 'Content-Type: application/json' \
  -d '{"title":"那个傻逼说的对不对"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('result :', d['result'])
print('reason :', d['reason'])
"
