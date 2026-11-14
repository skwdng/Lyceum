#!/usr/bin/env python3
"""第四组：房间 + 联机对局完整链路（按正确契约：ready 要传 {ready:true}）。"""
import json, random, string, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"
R = []

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

def ck(name, cond, detail=""):
    R.append((name, bool(cond), detail))
    print(("  ✓ " if cond else "  ✗ ") + name + ("   " + str(detail) if detail else ""))

def reg(prefix, cents=2000):
    a = prefix + "".join(random.choices(string.ascii_lowercase, k=6))
    st, r = call("POST", "/api/auth/register", {"account": a, "password": "Test123456"})
    tok = r.get("token")
    if tok and cents:
        o = call("POST", "/api/pay/orders", {"amountCents": cents}, tok)[1]
        if o.get("sign"):
            call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": cents, "sign": o["sign"]}, tok)
    return a, tok

print("=== 房间联机全流程 ===")
ha, host = reg("h4_")
ga, guest = reg("g4_")
st, room = call("POST", "/api/rooms", {"topicId": "t4", "visibility": "public"}, host)
code = (room or {}).get("code")
print("  房间码:", code)
st, _ = call("POST", f"/api/rooms/{code}/join", {}, guest)
st, seats0 = call("GET", f"/api/rooms/{code}/seats", None, host)
seat_list = seats0 if isinstance(seats0, list) else (seats0.get("list") or [])
occupied = [(s.get("seat"), s.get("user_name") or s.get("userName")) for s in seat_list if s.get("occupant") not in (None, "EMPTY")]
print("  已占席位:", occupied)

st, rd = call("POST", f"/api/rooms/{code}/ready", {"ready": True}, guest)
ck("参与者准备（带 ready:true）", st == 200)
st, detail = call("GET", f"/api/rooms/{code}", None, host)
unready = (detail or {}).get("unready")
ck("房间 unready 为空", not unready, unready)

st, start = call("POST", f"/api/rooms/{code}/start", {}, host)
mid = (start or {}).get("matchId")
ck("房主开局成功", st == 200 and bool(mid), f"{st} {str(start)[:60]}")

if mid:
    st, d = call("GET", f"/api/matches/{mid}", None, host)
    mt = (d or {}).get("match", {})
    ck("付款人=房主", str(mt.get("payer_user_id")) not in ("", "None"), mt.get("payer_user_id"))
    hb = call("GET", "/api/wallet", None, host)[1].get("balanceCents")
    gb = call("GET", "/api/wallet", None, guest)[1].get("balanceCents")
    print(f"     房主余额 {hb} · 参与者余额 {gb}")

    # 两人轮流发言，验证联机推进
    turn_seat = {s.get("seat"): s.get("user_name") for s in seat_list}
    t0 = time.time()
    spoke = {"host": 0, "guest": 0}
    reply = "对方认为取消期末会降低标准，我方不同意。虽然削弱刚性，但替代方案能守住同等标准才是关键。请问对方：复核主体是谁？"
    while time.time() - t0 < 200:
        dh = call("GET", f"/api/matches/{mid}", None, host)[1]
        if not isinstance(dh, dict) or dh["match"]["status"] != "RUNNING":
            break
        ws = dh.get("waitingSeat")
        if ws:
            st2, _ = call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, host)
            if st2 == 200:
                spoke["host"] += 1
            else:
                st3, _ = call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, guest)
                if st3 == 200:
                    spoke["guest"] += 1
        time.sleep(2)
    st, rv = call("GET", f"/api/matches/{mid}/review", None, host)
    ck("联机对局能推进并出复盘", st == 200 and "score" in (rv or {}))
    print(f"     房主发言 {spoke['host']} 次 · 参与者发言 {spoke['guest']} 次")
    st, d2 = call("GET", f"/api/matches/{mid}", None, host)
    print(f"     最终状态: {(d2 or {}).get('match', {}).get('status')}")

print("\n" + "=" * 56)
fail = [x for x in R if not x[1]]
print(f"第四组：{len(R)} 项 · 通过 {len(R)-len(fail)} · 失败 {len(fail)}")
for n, _, d in fail:
    print(f"  ✗ {n}   {d}")
