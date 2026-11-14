#!/bin/sh
echo "--- 找 lifekit 的服务单元 ---"
systemctl list-units --type=service --no-pager 2>/dev/null | grep -iE 'lifekit|life-kit' | head -3
ls /etc/systemd/system/ 2>/dev/null | grep -i life | head -3
echo "--- 8787 进程 ---"
ss -lntp 2>/dev/null | grep 8787
echo "--- 重启 ---"
for u in lifekit lifekit-server life; do
  if systemctl cat "$u" >/dev/null 2>&1; then
    systemctl restart "$u" && sleep 2 && echo "restarted: $u"
    break
  fi
done
echo "--- 验证 /siyige/admin ---"
curl -sI -m 8 http://127.0.0.1:8787/siyige/admin | head -4
echo "--- 跟随跳转 ---"
curl -sL -m 10 -o /dev/null -w 'code=%{http_code} url=%{url_effective}\n' http://127.0.0.1:8787/siyige/admin
echo "--- 其它路径没被影响 ---"
curl -s -m 8 -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:8787/siyige/api/health
curl -s -m 8 -o /dev/null -w 'home=%{http_code}\n' http://127.0.0.1:8787/siyige/
