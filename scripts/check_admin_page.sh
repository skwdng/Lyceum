#!/bin/sh
echo "--- /admin 实际响应 ---"
curl -s -m 8 -i http://127.0.0.1:8090/admin | head -12
echo
echo "--- 静态页是否存在 ---"
for f in admin.html v2/index.html; do
  code=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/$f)
  echo "$f -> $code"
done
echo
echo "--- jar 里有没有 admin.html ---"
unzip -l /opt/siyige/siyige.jar | grep -E 'static/(admin.html|v2/index.html)' | head -5
