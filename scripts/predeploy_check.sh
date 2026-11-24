#!/usr/bin/env bash
# 上线自检：从「应用自己」到「公网入口」逐层验证，任何一层挂了就报错退出
set -u
FAIL=0
say() { printf '%s\n' "$*"; }

say "=== 1. 服务状态 ==="
ST=$(systemctl is-active siyige 2>/dev/null || true)
if [ "$ST" = "active" ]; then say "  OK  siyige active"; else say "  FAIL siyige=$ST"; FAIL=1; fi

say "=== 2. 应用自身 127.0.0.1:8090 ==="
H1=$(curl -s -m 8 http://127.0.0.1:8090/api/health || true)
case "$H1" in
  *'"ok":true'*) say "  OK  8090/api/health" ;;
  *) say "  FAIL 8090/api/health -> $H1"; FAIL=1 ;;
esac

say "=== 3. 公网入口 8787 反向代理 ==="
H2=$(curl -s -m 8 http://127.0.0.1:8787/siyige/api/health || true)
case "$H2" in
  *'"ok":true'*) say "  OK  8787/siyige/api/health" ;;
  *) say "  FAIL 8787/siyige/api/health -> $H2"; say "       多半是 server.cjs 里的 siyige 代理块丢了"; FAIL=1 ;;
esac

S1=$(curl -s -m 8 -o /dev/null -w '%{http_code}:%{size_download}' http://127.0.0.1:8787/siyige/v2/index.html || echo "000:0")
CODE=${S1%%:*}
SIZE=${S1##*:}
if [ "$CODE" = "200" ] && [ "${SIZE:-0}" -gt 500 ]; then
  say "  OK  静态页 ${SIZE}B"
else
  say "  FAIL 静态页 code=$CODE size=$SIZE"; FAIL=1
fi

S2=$(curl -s -m 8 -o /dev/null -w '%{http_code}:%{size_download}' http://127.0.0.1:8787/siyige/api/topics || echo "000:0")
CODE2=${S2%%:*}
SIZE2=${S2##*:}
if [ "$CODE2" = "200" ] && [ "${SIZE2:-0}" -gt 500 ]; then
  say "  OK  题库接口 ${SIZE2}B"
else
  say "  FAIL 题库接口 code=$CODE2 size=$SIZE2"; FAIL=1
fi

say "=== 4. 反向代理代码块 ==="
if grep -q "proxyToSiyige" /opt/lifekit/server.cjs 2>/dev/null; then
  say "  OK  server.cjs 里有 proxyToSiyige"
else
  say "  FAIL server.cjs 里 siyige 代理块丢了，站点会整体 404"
  say "       修复：python3 /opt/siyige/fix_route.py && systemctl restart lifekit"
  FAIL=1
fi

say "=== 5. 近 10 分钟日志 ==="
ERRS=$(journalctl -u siyige --since "-10 min" --no-pager 2>/dev/null | grep -c "ERROR" || true)
if [ "${ERRS:-0}" -eq 0 ]; then
  say "  OK  无 ERROR"
else
  say "  WARN 有 ${ERRS} 条 ERROR，看 journalctl -u siyige -n 50"
fi

say ""
if [ "$FAIL" -eq 0 ]; then say "全部通过"; else say "有检查未通过"; fi
exit "$FAIL"
