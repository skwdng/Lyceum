#!/usr/bin/env python3
"""诊断：赛制是否稳定、席位为何与赛制不符。"""
import json, random, string, sys, time, urllib.error, urllib.request

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"

def call(m, p, b=None, tok=None, t=120):
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

acc = "diag2_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r["token"]
o = call("POST", "/api/pay/orders", {"amountCents": 1500}, tok)[1]
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 1500, "sign": o["sign"]}, tok)

st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "STANDARD", "tier": "PRO"}, tok)
mid = m["matchId"]
print("对局:", mid)

# 1) 连续 5 次 GET，看 steps 是否稳定
sigs = []
for i in range(5):
    st, d = call("GET", f"/api/matches/{mid}", None, tok)
    steps = d.get("steps") or []
    sig = "|".join(f"{s.get('no')}:{s.get('seg')}:{s.get('seat')}" for s in steps)
    sigs.append(sig)
    print(f"  第 {i+1} 次 GET：{len(steps)} 步 · query_rounds={d['match'].get('query_rounds')} · free_rounds={d['match'].get('free_rounds')}")
print("  5 次是否完全一致:", len(set(sigs)) == 1)
if len(set(sigs)) > 1:
    print("  ⚠ 赛制每次 GET 都在变！")
    for s in sigs[:3]:
        print("    ", s[:120])

# 2) 打印开场 4 步 + 自由辩 + 总结部分
steps = (call("GET", f"/api/matches/{mid}", None, tok)[1]).get("steps") or []
print("\n赛制明细：")
for s in steps:
    print(f"   {s.get('no'):>2}. {s.get('seg'):<4} {s.get('seat')} {s.get('sec')}s {s.get('duty')}")
print(f"\n共 {len(steps)} 步 · 质询 {sum(1 for s in steps if s.get('seg')=='质询')} 步 · "
      f"自由辩 {sum(1 for s in steps if s.get('seg')=='自由辩')} 步")
