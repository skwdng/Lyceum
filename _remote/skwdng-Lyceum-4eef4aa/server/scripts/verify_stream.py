#!/usr/bin/env python3
"""验证流式：直接对 SSE 端点发请求，看 token 事件是否逐块到达。"""
import json, random, string, sys, threading, time, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"

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
        return e.code, {}

# 注册 + 充钱
acc = "stream_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r.get("token")
o = call("POST", "/api/pay/orders", {"amountCents": 800}, tok)[1]
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 800, "sign": o["sign"]}, tok)
print("账号:", acc)

st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, tok)
mid = m["matchId"]
print("对局:", mid)

# 订阅 SSE（带令牌查询参数，和后端约定一致）
events = []
lock = threading.Lock()

def listen():
    url = f"{BASE}/api/matches/{mid}/events?token={tok}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        with urllib.request.urlopen(req, timeout=90) as resp:
            t0 = time.time()
            data_buf = []
            for raw in resp:
                line = raw.decode("utf-8", "ignore").rstrip("\n")
                if line.startswith("data:"):
                    data_buf.append(line[5:].strip())
                elif line == "" and data_buf:
                    payload = "\n".join(data_buf)
                    data_buf = []
                    try:
                        ev = json.loads(payload)
                        with lock:
                            events.append({"t": time.time() - t0, "ev": ev})
                    except Exception:
                        pass
                if time.time() - t0 > 85:
                    break
    except Exception as e:
        with lock:
            events.append({"t": -1, "ev": {"type": "listen-error", "msg": str(e)[:80]}})

th = threading.Thread(target=listen, daemon=True)
th.start()
time.sleep(2)

# 触发 AI 发言：我扮 B2，第 1 步是 A1（AI），等它自己说
t0 = time.time()
first_token = None
done_turn = None
while time.time() - t0 < 70:
    with lock:
        toks = [e for e in events if e["ev"].get("type") == "token"]
        turns = [e for e in events if e["ev"].get("type") == "turn"]
    if toks and first_token is None:
        first_token = toks[0]["t"]
    if turns:
        done_turn = turns[0]["t"]
        break
    time.sleep(0.2)

with lock:
    all_ev = list(events)

token_evs = [e for e in all_ev if e["ev"].get("type") == "token"]
turn_evs = [e for e in all_ev if e["ev"].get("type") == "turn"]
startup = [e for e in all_ev if e["ev"].get("type") == "match.start"]

print("\n=== 事件统计 ===")
print("  token 事件数:", len(token_evs))
print("  turn 事件数:", len(turn_evs))
if token_evs:
    print("  首个 token 到达: %.1f 秒" % token_evs[0]["t"])
    print("  末个 token 到达: %.1f 秒" % token_evs[-1]["t"])
    print("  流式总时长: %.1f 秒" % (token_evs[-1]["t"] - token_evs[0]["t"]))
    print("  拼起来的文本长度:", sum(len(e["ev"].get("delta") or "") for e in token_evs))
    print("\n  前 3 块:", " | ".join((e["ev"].get("delta") or "")[:12] for e in token_evs[:3]))
if turn_evs:
    print("  整段落库事件: %.1f 秒（比首字晚 %.1f 秒）" %
          (turn_evs[0]["t"], turn_evs[0]["t"] - (token_evs[0]["t"] if token_evs else 0)))

# 对照：接口里拿到的最终文本
st, d = call("GET", f"/api/matches/{mid}", None, tok)
turns = (d or {}).get("turns") or []
if turns:
    print("\n  服务端落库文本前 40 字:", (turns[0].get("content") or "")[:40])
