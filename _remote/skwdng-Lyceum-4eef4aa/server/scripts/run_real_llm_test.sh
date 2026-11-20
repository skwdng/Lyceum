#!/bin/bash
export LC_ALL=C

# 注意：不要把 siyige.env 用 `source` 读进来——bash 会吃掉 JSON 里的双引号，导致 Spring 解析失败。
# 这里只把 key 抠出来，用命令行参数传给临时实例。
KEY=$(grep -o 'sk-[A-Za-z0-9]*' /opt/siyige/siyige.env | head -n 1)
if [ -z "$KEY" ]; then echo "没读到 key"; exit 1; fi
echo "key 已读到（长度 ${#KEY}）"

pkill -f 'server.port=8091' 2>/dev/null
sleep 1
cd /opt/siyige
nohup java -Xmx320m -jar /opt/siyige/siyige.jar \
  --server.port=8091 \
  --spring.datasource.url=jdbc:h2:mem:llmreal \
  --siyige.pace.time-scale=0.03 \
  --siyige.llm.base-url=https://api.deepseek.com/v1 \
  --siyige.llm.model=deepseek-chat \
  --siyige.llm.api-key="$KEY" \
  > /tmp/llmreal.log 2>&1 &

for i in $(seq 1 45); do
  sleep 1
  if curl -s -m 2 http://127.0.0.1:8091/api/health > /dev/null; then break; fi
done
echo "临时实例已起（真实模型 + 加速节奏）"
python3 /opt/siyige/_llm_real.py

echo
echo "=== 清理临时实例 ==="
pkill -f 'server.port=8091'
sleep 1
pgrep -af 'server.port=8091' || echo "已停止"
