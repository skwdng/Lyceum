#!/usr/bin/env python3
"""验证「催一下」幂等：连点 5 次，只应生效一次。"""
import json, random, string, time, urllib.error, urllib.request

B = "http://localhost:8080"

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
                return x.status, json.loads(raw)
            except Exception:
                return x.status, raw[:150]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]

acc = "nudge_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r["token"]
st, o = call("POST", "/api/pay/orders", {"amountCents": 600}, tok)
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 600, "sign": o["sign"]}, tok)

# 我坐 B2：第 1 步是 A1（AI），正好可以催
st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, tok)
mid = m["matchId"]
print("对局:", mid)

print("\n== 连点 5 次 ==")
for i in range(5):
    st2, r2 = call("POST", f"/api/matches/{mid}/keepalive" if False else f"/api/matches/{mid}/skip", None, tok)
    print("  第%d次: %s %s" % (i + 1, st2, r2 if not isinstance(r2, dict) else json.dumps(r2, ensure_ascii=False)))
    time.sleep(0.3)

print("\n== 立即再点（冷却期内）==")
st3, r3 = call("POST", f"/api/matches/{mid}/skip", None, tok)
print("  ", st3, json.dumps(r3, ensure_ascii=False) if isinstance(r3, dict) else r3)

print("\n== 等 AI 说完这一轮，进入我的回合 ==")
t0 = time.time()
while time.time() - t0 < 90:
    st4, d = call("GET", f"/api/matches/{mid}", None, tok)
    if isinstance(d, dict) and d.get("waitingForMe"):
        print("  轮到我（第 %s 步）" % d["match"]["step"])
        break
    time.sleep(2)

print("\n== 我的回合点催（应被拒绝）==")
st5, r5 = call("POST", f"/api/matches/{mid}/skip", None, tok)
print("  ", st5, json.dumps(r5, ensure_ascii=False) if isinstance(r5, dict) else r5)
