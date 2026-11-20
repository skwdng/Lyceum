#!/usr/bin/env python3
"""部署前数据库体检：对比现有 H2 表结构与我们期望的列，列出缺口。

不修改任何东西，只读。用 H2 的 Shell（从 jar 里解出来的 h2 jar）执行。
"""
import subprocess, sys, zipfile, os, glob

JAR = "/opt/siyige/siyige.jar"
DB = "jdbc:h2:file:/opt/siyige/data/siyige"
WORK = "/tmp/h2tool"
H2JAR = WORK + "/h2.jar"

os.makedirs(WORK, exist_ok=True)

# 从 fat jar 里抽出 h2 驱动
if not os.path.exists(H2JAR):
    with zipfile.ZipFile(JAR) as z:
        names = [n for n in z.namelist() if n.startswith("BOOT-INF/lib/h2-")]
        if not names:
            print("jar 里没找到 h2 驱动"); sys.exit(1)
        with z.open(names[0]) as src, open(H2JAR, "wb") as dst:
            dst.write(src.read())
        print("已解出", names[0])


def sql(stmt):
    p = subprocess.run(
        ["java", "-cp", H2JAR, "org.h2.tools.Shell", "-url", DB, "-user", "SA", "-password", "", "-sql", stmt],
        capture_output=True, text=True, timeout=120)
    return p.stdout + p.stderr


def columns(table):
    out = sql("select column_name from information_schema.columns where table_name='%s' order by ordinal_position;" % table.upper())
    cols = []
    for line in out.splitlines():
        t = line.strip().strip('"')
        if not t or t.startswith("COLUMN_NAME") or t.startswith("(") or "rows" in t or "row" in t.lower() and "select" in t.lower():
            continue
        if t.upper() in ("COLUMN_NAME", "NULL", "SA"):
            continue
        cols.append(t.lower())
    return cols


def tables():
    out = sql("select table_name from information_schema.tables where table_schema='PUBLIC' order by table_name;")
    res = []
    for line in out.splitlines():
        t = line.strip().strip('"')
        if not t or t.startswith("TABLE_NAME") or t.startswith("(") or "row" in t:
            continue
        if t.isupper() or t.startswith("SY_") or t.startswith("DV_"):
            res.append(t.lower())
    return res


print("\n=== 现有表 ===")
ts = tables()
print("  " + ", ".join(ts[:40]))
print("  共", len(ts), "张")

print("\n=== 关键表列结构 ===")
for tb in ["sy_post", "sy_user", "sy_match", "sy_wallet", "sy_order", "sy_user_llm"]:
    if tb in ts:
        cs = columns(tb)
        print("  %-14s %d 列: %s" % (tb, len(cs), ", ".join(cs[:14])))
    else:
        print("  %-14s 不存在（会在启动时新建）" % tb)
