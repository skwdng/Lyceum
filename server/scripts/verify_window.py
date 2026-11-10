#!/usr/bin/env python3
"""验证「最近 N 场」：打 3 场风格不同的发言，看窗口切换是否真的改变均值。"""
import json, random, string, time, urllib.error, urllib.request

B = "http://localhost:8080"

def call(m, p, b=None, tok=None, t=300):
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

acc = "window_" + "".join(random.choices(string.ascii_lowercase, k=5))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r["token"]
st, o = call("POST", "/api/pay/orders", {"amountCents": 1500}, tok)
call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 1500, "sign": o["sign"]}, tok)
print("账号:", acc)

# 三种风格：差的 / 中等的 / 好的 —— 分数应该明显不同
REPLIES = [
    "我觉得应该取消。",
    "对方说的不对。取消期末更好一些，因为大家压力太大了，所以应该取消。",
    ("对方认为取消期末会降低标准，我方不同意。虽然这会削弱刚性约束，但问题在替代方案能否守住同等标准。"
     "因为期末成绩通常占课程总评较大比重，所以取消后必须重建同等刚性的替代评价。"
     "我方判准有两条：第一，替代评价能否达到同等刚性；第二，责任链能否追到具体主体。"
     "请问对方：你们的替代方案里，谁来承担复核责任？"),
]

scores = []
for i, reply in enumerate(REPLIES):
    st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT"}, tok)
    if st != 200:
        print("  第%d场开局失败:" % (i + 1), m)
        break
    mid = m["matchId"]
    t0 = time.time()
    while time.time() - t0 < 600:
        st2, d = call("GET", "/api/matches/" + mid, None, tok)
        if not isinstance(d, dict) or d["match"]["status"] != "RUNNING":
            break
        if d.get("waitingForMe"):
            call("POST", "/api/matches/" + mid + "/turns", {"content": reply, "inputType": "kb"}, tok)
        time.sleep(1)
    st, rv = call("GET", "/api/matches/" + mid + "/review", None, tok)
    total = rv["score"]["total"] if isinstance(rv, dict) else "?"
    scores.append(total)
    print("  第%d场: 总分 %s · 用时 %d 秒" % (i + 1, total, time.time() - t0))

print("\n== 窗口切换对比 ==")
for n in [0, 1, 2, 3]:
    st, d = call("GET", "/api/diag" + ("?n=%d" % n if n else ""), None, tok)
    dims = d.get("dims", {})
    print("  n=%-2s window=%-2s total=%-2s  dims=%s" % (
        n, d.get("window"), d.get("total"),
        " ".join("%s%s" % (k, v) for k, v in dims.items())))

# 记录表确认每场都存了六维
st, recs = call("GET", "/api/records", None, tok)
print("\n  记录条数:", len(recs) if isinstance(recs, list) else recs)
