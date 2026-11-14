#!/usr/bin/env python3
"""第五组：联机对局里「谁有权发言」——非当前回合的人提交会怎样。"""
import json, random, string, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"

def call(m, p, b=None, tok=None, t=120):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    try:
        with urllib.request.urlopen(urllib.request.Request(
                BASE + p, data=json.dumps(b).encode() if b is not None else None,
                headers=h, method=m), timeout=t) as x:
            raw = x.read().decode()
            try:
                return x.status, (json.loads(raw) if raw else {})
            except Exception:
                return x.status, {}
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"err": str(e)[:100]}

def reg(prefix, cents=2000):
    a = prefix + "".join(random.choices(string.ascii_lowercase, k=6))
    st, r = call("POST", "/api/auth/register", {"account": a, "password": "Test123456"})
    tok = r.get("token")
    if cents:
        o = call("POST", "/api/pay/orders", {"amountCents": cents}, tok)[1]
        if o.get("sign"):
            call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": cents, "sign": o["sign"]}, tok)
    return a, tok

_, host = reg("w_h_")
_, guest = reg("w_g_")
st, room = call("POST", "/api/rooms", {"topicId": "t4", "visibility": "public"}, host)
code = room["code"]
call("POST", f"/api/rooms/{code}/join", {}, guest)
call("POST", f"/api/rooms/{code}/ready", {"ready": True}, guest)
st, start = call("POST", f"/api/rooms/{code}/start", {}, host)
mid = start["matchId"]
print("房间:", code, "· 对局:", mid, "· 席位:", start.get("seats"))

# 等到某个人的回合
reply_ok = "我方认为应当取消期末考试，因为一次性闭卷只测记忆。请问对方：复核主体是谁？"
for attempt in range(20):
    st, d = call("GET", f"/api/matches/{mid}", None, host)
    if not isinstance(d, dict) or d["match"]["status"] != "RUNNING":
        print("对局已结束"); break
    ws = d.get("waitingSeat")
    step = d["match"]["step"]
    if ws:
        print(f"  第 {step} 步 · 轮到 {ws}")
        # 轮到谁就用谁的令牌；另一个也试着提交，看会不会被接受
        right, wrong = (host, guest) if ws.startswith("A") else (guest, host)
        st_bad, r_bad = call("POST", f"/api/matches/{mid}/turns", {"content": "我不是这轮该说话的人", "inputType": "kb"}, wrong)
        print(f"    非本轮一方提交 → {st_bad} {str(r_bad)[:60]}")
        st_good, r_good = call("POST", f"/api/matches/{mid}/turns", {"content": reply_ok, "inputType": "kb"}, right)
        print(f"    本轮一方提交   → {st_good}")
        break
    time.sleep(3)

# 看看刚落库的那条记在谁头上
st, d2 = call("GET", f"/api/matches/{mid}", None, host)
for t in (d2.get("turns") or [])[-3:]:
    print("    记录:", t.get("step"), t.get("seat"), (t.get("content") or "")[:24])
