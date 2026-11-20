#!/usr/bin/env python3
"""服务器上的端到端验证：注册 → 充值 → 打一场 → 账单 → AI 评审团"""
import json, random, string, time, urllib.request, urllib.error

B = "http://127.0.0.1:8090"

def call(m, p, b=None, tok=None, timeout=300):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as x:
            raw = x.read().decode()
            try:
                return x.status, json.loads(raw)
            except Exception:
                return x.status, raw[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return 0, str(e)[:150]

acc = "e2e_" + "".join(random.choices(string.ascii_lowercase, k=6))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r.get("token") if isinstance(r, dict) else None
if not tok:
    st, r = call("POST", "/api/auth/login", {"account": acc, "password": "Test123456"})
    tok = r.get("token") if isinstance(r, dict) else None
print("账号:", acc, "· 注册", st, "· token", bool(tok))

# 充值走订单流程
st, o = call("POST", "/api/pay/orders", {"amountCents": 500}, tok)
st2, cb = call("POST", "/api/pay/callback",
               {"orderId": o["orderId"], "amountCents": 500, "sign": o["sign"]}, tok)
print("充值:", cb.get("balanceCents"), "分（回调 already=%s）" % cb.get("already"))

# 打一场 SPRINT（步数少，验证快）
st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT"}, tok)
if st != 200:
    print("开局失败:", st, m); raise SystemExit(1)
mid = m["matchId"]
st, d = call("GET", "/api/matches/" + mid, None, tok)
mt = d["match"]
print("对局:", mid, "· 质询", mt.get("query_rounds"), "· 自由辩", mt.get("free_rounds"),
      "· 余额(预扣后)", call("GET", "/api/wallet", None, tok)[1]["balanceCents"])

reply = ("对方认为取消期末会降低标准，我方不同意。虽然这会削弱刚性约束，"
         "但问题在替代方案能否守住同等标准；因为期末占比大，所以必须重建同等刚性的替代评价。"
         "请问对方：复核主体是谁、申诉通道在哪？")

t0 = time.time()
n = 0
while time.time() - t0 < 900:
    st2, dd = call("GET", "/api/matches/" + mid, None, tok)
    if not isinstance(dd, dict) or dd["match"]["status"] != "RUNNING":
        break
    if dd.get("waitingForMe"):
        call("POST", "/api/matches/" + mid + "/turns", {"content": reply, "inputType": "kb"}, tok)
        n += 1
    time.sleep(1)

print("打完：我发言 %d 次 · 用时 %d 秒" % (n, time.time() - t0))
st, rv = call("GET", "/api/matches/" + mid + "/review", None, tok)
print("复盘: 分数", rv["score"]["total"], "· 本场 token", rv.get("billTokens"),
      "· 席位", list(rv.get("seatScores", {}).keys()))
for x in call("GET", "/api/wallet/history?limit=3", None, tok)[1]["list"]:
    print("  %-8s %+5d → 余 %d ｜ %s" % (x["kind"], x["amount_cents"], x["balance_after"], (x["note"] or "")[:52]))

# AI 评审团
t0 = time.time()
st, p = call("GET", "/api/matches/" + mid + "/panel", None, tok)
if st == 200 and p.get("ok"):
    pn = p["panel"]
    print("评审团: %d 分（%d–%d）· %.1f 秒 · 共识问题 %d 条" %
          (pn["average"], pn["min"], pn["max"], time.time() - t0, len(pn["consensus"])))
    for j in pn["judges"]:
        print("   %-6s %s 分" % (j["name"], j["score"]))
else:
    print("评审团:", st, p)
