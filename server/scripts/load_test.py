#!/usr/bin/env python3
"""并发对局压力测试：N 场同时进行，测每场推进间隔与总时长。

用途：证明当前 tick 轮询 + 同步 AI 调用在并发下的真实表现。
"""
import json, random, string, sys, threading, time, urllib.error, urllib.request

B = "http://localhost:8080"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
MODE = sys.argv[2] if len(sys.argv) > 2 else "SPRINT"

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
        return e.code, e.read().decode()[:150]
    except Exception as e:
        return 0, str(e)[:120]

REPLY = ("对方认为取消期末会降低标准，我方不同意。虽然削弱刚性，但替代方案能守住同等标准才是关键；"
         "因为期末占比大，所以必须重建同等刚性的替代评价。请问对方：复核主体是谁？")

def make_user(i):
    acc = "load_%d_%s" % (i, "".join(random.choices(string.ascii_lowercase, k=4)))
    st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
    tok = r.get("token") if isinstance(r, dict) else None
    if not tok:
        st, r = call("POST", "/api/auth/login", {"account": acc, "password": "Test123456"})
        tok = r.get("token") if isinstance(r, dict) else None
    # 充值，避免余额不足
    st, o = call("POST", "/api/pay/orders", {"amountCents": 1000}, tok)
    if isinstance(o, dict) and o.get("sign"):
        call("POST", "/api/pay/callback",
             {"orderId": o["orderId"], "amountCents": 1000, "sign": o["sign"]}, tok)
    return acc, tok

results = []
lock = threading.Lock()

def run_one(i):
    acc, tok = make_user(i)
    st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": MODE}, tok)
    if st != 200:
        with lock:
            results.append({"i": i, "err": "开局失败 %s %s" % (st, m)})
        return
    mid = m["matchId"]
    t0 = time.time()
    gaps = []
    last_turns = -1
    last_change = t0
    my_turns = 0
    while time.time() - t0 < 900:
        st2, d = call("GET", "/api/matches/" + mid, None, tok)
        if not isinstance(d, dict):
            time.sleep(1)
            continue
        n = len(d.get("turns", []))
        now = time.time()
        if n != last_turns:
            if last_turns >= 0:
                gaps.append(now - last_change)
            last_turns = n
            last_change = now
        if d["match"]["status"] != "RUNNING":
            break
        if d.get("waitingForMe"):
            call("POST", "/api/matches/" + mid + "/turns", {"content": REPLY, "inputType": "kb"}, tok)
            my_turns += 1
        time.sleep(0.5)
    total = time.time() - t0
    st3, rv = call("GET", "/api/matches/" + mid + "/review", None, tok)
    toks = rv.get("billTokens") if isinstance(rv, dict) else 0
    with lock:
        results.append({
            "i": i, "mid": mid, "total": round(total, 1),
            "steps": len(rv.get("turns", [])) if isinstance(rv, dict) else 0,
            "tokens": toks, "my": my_turns,
            "maxGap": round(max(gaps), 1) if gaps else 0,
            "avgGap": round(sum(gaps) / len(gaps), 1) if gaps else 0,
        })
    print("  [%d] 完成 %s · %.0f 秒 · %d 步 · 最大间隔 %.1f 秒 · %s token"
          % (i, mid, total, len(rv.get("turns", [])) if isinstance(rv, dict) else 0,
             max(gaps) if gaps else 0, toks), flush=True)

print("=== 并发 %d 场（%s）===" % (N, MODE))
t0 = time.time()
ths = [threading.Thread(target=run_one, args=(i,)) for i in range(N)]
for t in ths: t.start()
for t in ths: t.join()
wall = time.time() - t0

ok = [r for r in results if "total" in r]
print("\n=== 汇总 ===")
print("  墙钟总时长: %.0f 秒" % wall)
if ok:
    print("  完成场次: %d / %d" % (len(ok), N))
    print("  单场耗时: 平均 %.0f 秒 · 最慢 %.0f 秒" % (
        sum(r["total"] for r in ok) / len(ok), max(r["total"] for r in ok)))
    print("  推进最大间隔: 平均 %.1f 秒 · 最差 %.1f 秒" % (
        sum(r["maxGap"] for r in ok) / len(ok), max(r["maxGap"] for r in ok)))
    print("  每场 token: 平均 %d" % (sum(r["tokens"] for r in ok) / len(ok)))
for r in results:
    if "err" in r:
        print("  失败:", r)
