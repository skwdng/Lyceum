#!/usr/bin/env python3
"""复现三个问题：环节标签、打字速度、数据是否保留。"""
import json, random, string, sys, threading, time, urllib.request, urllib.error

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
MODE = sys.argv[2] if len(sys.argv) > 2 else "STANDARD"

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

acc = "diag_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r["token"]
o = call("POST", "/api/pay/orders", {"amountCents": 900}, tok)[1]
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 900, "sign": o["sign"]}, tok)

st, m = call("POST", "/api/matches", {
    "topicId": "t4", "seats": ["B2"], "mode": MODE, "tier": "PRO"}, tok)
mid = m["matchId"]
print("账号:", acc, "· 对局:", mid, "· 模式:", MODE)
st, d0 = call("GET", f"/api/matches/{mid}", None, tok)
print("总步数:", d0.get("totalSteps"), "· 赛制:", json.dumps(d0.get("steps") or [], ensure_ascii=False)[:200])

# 听 SSE，收集 token 事件的 seg 和到达时间
evs = []
lock = threading.Lock()

def listen():
    try:
        req = urllib.request.Request(f"{B}/api/matches/{mid}/events?token={tok}",
                                     headers={"Accept": "text/event-stream"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            t0 = time.time(); buf = []
            for raw in resp:
                line = raw.decode("utf-8", "ignore").rstrip("\n")
                if line.startswith("data:"):
                    buf.append(line[5:].strip())
                elif line == "" and buf:
                    p = "\n".join(buf); buf = []
                    try:
                        with lock:
                            evs.append((round(time.time() - t0, 2), json.loads(p)))
                    except Exception:
                        pass
                if time.time() - t0 > 115:
                    break
    except Exception as e:
        with lock:
            evs.append((-1, {"type": "listen-error", "msg": str(e)[:60]}))

threading.Thread(target=listen, daemon=True).start()
time.sleep(2)

# 打完整场（我坐 B2，只在轮到我时发言）
reply = "我方认为取消期末不会降低标准，因为可以改成过程性评价加统一复核。请问对方：复核主体是谁、怎么保证一致？"
t0 = time.time()
while time.time() - t0 < 240:
    st, d = call("GET", f"/api/matches/{mid}", None, tok)
    if not isinstance(d, dict):
        break
    if d["match"]["status"] != "RUNNING":
        break
    if d.get("waitingForMe"):
        call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, tok)
    time.sleep(2)

st, d = call("GET", f"/api/matches/{mid}", None, tok)
print("\n=== 落库结果（数据有没有保留）===")
turns = d.get("turns") or []
print("  轮次数:", len(turns), "· 状态:", d["match"]["status"])
for t in turns:
    c = t.get("content") or ""
    print(f"   step={t.get('step'):>2} seat={t.get('seat')} seg={t.get('seg')} status={t.get('status')} len={len(c):>3} | {c[:26]}")

print("\n=== 流式事件（环节标签 + 速度）===")
with lock:
    snapshot = list(evs)
toks = [e for e in snapshot if e[1].get("type") == "token"]
for e in toks[:3]:
    print(f"  {e[0]:>6.2f}s  token seat={e[1].get('seat')} seg={e[1].get('seg')} delta={ (e[1].get('delta') or '')[:14]!r}")
by_seat = {}
for t, ev in toks:
    k = (ev.get("seat"), ev.get("seg"))
    by_seat.setdefault(k, []).append(t)
print("\n  每个席位的流式批次：")
for (seat, seg), ts in by_seat.items():
    print(f"   seat={seat} seg={seg} 块数={len(ts)} 时长={ts[-1]-ts[0]:.2f}s 速度={len(ts)/max(0.01, ts[-1]-ts[0]):.0f} 块/秒")

# 对照：赛制里每一步该是什么环节
steps = d.get("steps") or []
if steps:
    print("\n  赛制对照:")
    for s in steps[:6]:
        print(f"   step={s.get('step')} seg={s.get('seg')} seat={s.get('seat')}")
