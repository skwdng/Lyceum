#!/usr/bin/env python3
"""完整打一场（STANDARD 24 步），把每一步的实际内容抓下来做体检。

关注点（对照真实辩论）：
 1. 席位与环节是否匹配（立论 A1/B1、驳立论 A2/B2、质询 A3/B3 问答、自由辩轮转、总结 A4/B4）
 2. AI 有没有自我引用 / 引用嵌套（"对方刚才说「对方刚才说「…"）
 3. 质询环节有没有真的"一问一答"（问句 → 回答），还是各说各的
 4. 自由辩是否真的在短打、有没有跑题
 5. 同一侧多个 AI 之间是否互相复读同一句
 6. 复盘分数、维度、token、费用是否算出来
"""
import json, random, string, sys, time, urllib.error, urllib.request, re

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
MODE = sys.argv[2] if len(sys.argv) > 2 else "STANDARD"

def call(m, p, b=None, tok=None, t=180):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    try:
        with urllib.request.urlopen(urllib.request.Request(
                B + p, data=json.dumps(b).encode() if b is not None else None,
                headers=h, method=m), timeout=t) as x:
            raw = x.read().decode()
            try:
                return x.status, (json.loads(raw) if raw else {})
            except Exception:
                return x.status, {}
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:
        return 0, {"err": str(e)[:80]}

acc = "flow_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r["token"]
o = call("POST", "/api/pay/orders", {"amountCents": 1500}, tok)[1]
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 1500, "sign": o["sign"]}, tok)

st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": MODE, "tier": "PRO"}, tok)
mid = m["matchId"]
print(f"账号 {acc} · 对局 {mid} · 模式 {MODE}")

st, d0 = call("GET", f"/api/matches/{mid}", None, tok)
steps = d0.get("steps") or []
print(f"赛制 {len(steps)} 步：")
for s in steps:
    print(f"   {s.get('no'):>2}. {s.get('seg'):<4} {s.get('seat')}  {s.get('sec')}s  {s.get('duty')}")

# 打完整场：轮到我（B2）就发言
reply = ("我方回答：复核主体由教务处与校外专家组成的联合组承担，标准公开可查；"
         "若复核未通过则按同一口径重评。另外我要问对方：您方说的『低成本退出』具体到什么程度算低成本？")
t0 = time.time()
my_turns = 0
seen = 0
while time.time() - t0 < 900:
    st, d = call("GET", f"/api/matches/{mid}", None, tok)
    if not isinstance(d, dict):
        break
    if d["match"]["status"] != "RUNNING":
        break
    turns = d.get("turns") or []
    if len(turns) > seen:
        for t in turns[seen:]:
            c = (t.get("content") or "").replace("\n", " ")
            print(f"   [{t.get('step'):>2}] {t.get('seat')} {t.get('seg'):<4} {len(c):>3}字 {t.get('status')} | {c[:60]}")
        seen = len(turns)
    if d.get("waitingForMe"):
        st2, _ = call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, tok)
        if st2 == 200:
            my_turns += 1
    time.sleep(2)

print(f"\n我发言 {my_turns} 次 · 用时 {int(time.time()-t0)} 秒")

st, d = call("GET", f"/api/matches/{mid}", None, tok)
turns = d.get("turns") or []
print(f"总轮次 {len(turns)} · 状态 {d['match']['status']}")

# ---------------- 体检 ----------------
print("\n=== 体检 ===")
issues = []

# 1) 席位 ↔ 环节
for s, t in zip(steps, turns):
    if s.get("seat") != t.get("seat") or s.get("seg") != t.get("seg"):
        issues.append(f"第 {t.get('step')} 条与赛制不符：赛制 {s.get('seg')}{s.get('seat')}，实际 {t.get('seg')}{t.get('seat')}")

# 2) 自我引用 / 嵌套引用
nested = [t for t in turns if "对方刚才说「对方刚才说" in (t.get("content") or "") or "对方说「对方说" in (t.get("content") or "")]
if nested:
    issues.append(f"引用嵌套 {len(nested)} 条（如 step {nested[0].get('step')}：{(nested[0].get('content') or '')[:50]}…）")

# 3) 复读：同一侧相邻两条高度相似
def sim(a, b):
    if not a or not b: return 0
    sa, sb = set(a[:80]), set(b[:80])
    return len(sa & sb) / max(1, len(sa | sb))
for i in range(1, len(turns)):
    a, b = turns[i-1], turns[i]
    if a.get("seat")[0] == b.get("seat")[0] and sim(a.get("content"), b.get("content")) > 0.5:
        issues.append(f"同侧复读：step {a.get('step')}/{b.get('step')} 相似度 {sim(a.get('content'), b.get('content')):.2f}")

# 4) 质询：问句是否有回应
q_steps = [t for t in turns if t.get("seg") == "质询"]
asks = [t for t in q_steps if "？" in (t.get("content") or "") or "?" in (t.get("content") or "")]
if q_steps:
    print(f"质询 {len(q_steps)} 条，其中带问句 {len(asks)} 条")

# 5) 长度分布
lens = [len(t.get("content") or "") for t in turns]
if lens:
    print(f"发言长度：最短 {min(lens)} · 最长 {max(lens)} · 平均 {sum(lens)//len(lens)}")

# 6) 复盘
st, rv = call("GET", f"/api/matches/{mid}/review", None, tok)
if isinstance(rv, dict) and "score" in rv:
    print(f"复盘：总分 {rv['score']['total']} · token {rv.get('billTokens')} · 模板 {sum(1 for t in turns if t.get('status')=='TEMPLATE')} 条")
else:
    issues.append("复盘没出来")

print("\n=== 发现的问题 ===")
if issues:
    for i in issues:
        print("  ✗ " + i)
else:
    print("  无")
