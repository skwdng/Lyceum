#!/usr/bin/env python3
"""部署后自检：健康 + 新接口 + 多轮赛制 + 钱包/支付/自带key"""
import json, random, string, time, urllib.request, urllib.error

B = "http://127.0.0.1:8090"

def call(method, path, body=None, tok=None, timeout=60):
    headers = {"Content-Type": "application/json"}
    if tok:
        headers["Authorization"] = "Bearer " + tok
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except Exception:
                return r.status, raw[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return 0, str(e)[:120]

print("=== 健康 ===")
st, h = call("GET", "/api/health")
print("  ", st, h if st == 200 else "失败")

print("\n=== 未登录时应 401 的新接口 ===")
for name, path in [("wallet", "/api/wallet"), ("pay", "/api/pay/orders"), ("llm", "/api/llm/profile")]:
    st, _ = call("GET" if name != "pay" else "POST", path, {} if name == "pay" else None)
    print("  %-8s → %s %s" % (name, st, "✓" if st == 401 else "⚠ 期望 401"))

print("\n=== 队友模块是否正常 ===")
for name, path in [("社区", "/api/community/posts"), ("视频", "/api/video/feed?size=3"),
                   ("辩题", "/api/topics"), ("热榜", "/api/hot?n=3")]:
    st, _ = call("GET", path)
    print("  %-6s → %s" % (name, st))

print("\n=== 注册 + 钱包 + 充值（订单/回调）===")
acc = "deploy_" + "".join(random.choices(string.ascii_lowercase, k=6))
st, r = call("POST", "/api/auth/register", {"account": acc, "password": "Test123456"})
tok = r.get("token") if isinstance(r, dict) else None
print("  注册:", st, "token:", bool(tok))
if not tok:
    st, r = call("POST", "/api/auth/login", {"account": acc, "password": "Test123456"})
    tok = r.get("token") if isinstance(r, dict) else None

st, w = call("GET", "/api/wallet", None, tok)
print("  钱包:", st, "余额", w.get("balanceCents"), "分 · 一场预估", w.get("estimateCents"), "分")

st, o = call("POST", "/api/pay/orders", {"amountCents": 300}, tok)
print("  下单:", st, o.get("orderId") if isinstance(o, dict) else o)
if isinstance(o, dict) and o.get("sign"):
    st, cb = call("POST", "/api/pay/callback",
                  {"orderId": o["orderId"], "amountCents": 300, "sign": o["sign"]}, tok)
    print("  回调:", st, cb)
    st, cb2 = call("POST", "/api/pay/callback",
                   {"orderId": o["orderId"], "amountCents": 300, "sign": o["sign"]}, tok)
    print("  重复回调:", st, "already =", cb2.get("already") if isinstance(cb2, dict) else cb2)

print("\n=== 多轮赛制（开局看轮数）===")
st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "FULL"}, tok)
if st == 200 and isinstance(m, dict):
    mid = m["matchId"]
    st2, d = call("GET", "/api/matches/" + mid, None, tok)
    mt = d.get("match", {}) if isinstance(d, dict) else {}
    print("  对局:", mid, "· 质询", mt.get("query_rounds"), "轮/方 · 自由辩", mt.get("free_rounds"), "轮")
else:
    print("  开局失败:", st, m)

print("\n=== 自带 Key 设置 ===")
st, p = call("POST", "/api/llm/profile",
             {"baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat",
              "apiKey": "sk-test-abcdef123456", "enabled": True}, tok)
print("  保存:", st, "掩码:", p.get("keyMask") if isinstance(p, dict) else p)
st, t = call("POST", "/api/llm/test", {}, tok)
print("  测试（假 key 应失败）:", st, t)
