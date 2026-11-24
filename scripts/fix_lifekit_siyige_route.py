# -*- coding: utf-8 -*-
"""
修复线上：lifekit 的 server.cjs 在 11-23 的更新里丢了「思弈阁反向代理」代码块，
导致 /siyige/* 全部 404（站点整体打不开）。这里从备份 server.cjs.bak-1794644115802 里
把 proxyToSiyige 函数和它的路由行取回来，插进当前 server.cjs。

安全措施：改之前先备份当前文件；插入前检查是否已存在（幂等）；插入后做语法检查。
"""
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

CUR = Path("/opt/lifekit/server.cjs")
BAK = Path("/opt/lifekit/server.cjs.bak-1794644115802")

cur = CUR.read_text(encoding="utf-8")
bak = BAK.read_text(encoding="utf-8")

if "proxyToSiyige" in cur:
    print("当前文件里已有 proxyToSiyige，无需插入")
    sys.exit(0)

# ---- 1. 从备份里取函数块 ----
start = bak.find("function proxyToSiyige(req, res) {")
if start < 0:
    print("备份里没找到 proxyToSiyige")
    sys.exit(1)
# 往前带上注释头
head = bak.rfind("/**", 0, start)
if head < 0:
    head = start
end = bak.find("\n}\n", start)
if end < 0:
    print("函数结尾没找到")
    sys.exit(1)
func_block = bak[head:end + 3]

# ---- 2. 取路由行 ----
m = re.search(r"\n(\s*)if \(p === '/siyige' \|\| p\.startsWith\('/siyige/'\)\) \{\s*\n\s*return proxyToSiyige\(req, res\);\s*\n\s*\}\n", bak)
route_line = m.group(0) if m else "\n  if (p === '/siyige' || p.startsWith('/siyige/')) {\n    return proxyToSiyige(req, res);\n  }\n"

# ---- 3. 插函数：放在 createServer 之前 ----
marker = "const server = http.createServer(async (req, res) => {"
if marker not in cur:
    print("找不到 createServer 标记")
    sys.exit(1)
cur2 = cur.replace(marker, func_block + "\n" + marker, 1)

# ---- 4. 插路由：放在 /ai 代理之后 ----
ai_route = "  if (p === '/ai' || p.startsWith('/ai/')) {\n    return proxyToAi(req, res);\n  }\n"
if ai_route not in cur2:
    print("找不到 /ai 路由锚点，改用 createServer 第一行之后插入")
    idx = cur2.find(marker) + len(marker)
    cur2 = cur2[:idx] + route_line + cur2[idx:]
else:
    cur2 = cur2.replace(ai_route, ai_route + route_line, 1)

# ---- 5. 备份 + 写入 ----
stamp = time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(CUR, CUR.with_name(f"server.cjs.bak-fixsiyige-{stamp}"))
CUR.write_text(cur2, encoding="utf-8")
print("已写入，备份：server.cjs.bak-fixsiyige-" + stamp)

# ---- 6. 语法检查 ----
r = subprocess.run(["node", "--check", str(CUR)], capture_output=True, text=True)
print("node --check →", r.returncode, (r.stderr or "").strip()[:200])
sys.exit(r.returncode)
