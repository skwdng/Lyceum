#!/usr/bin/env python3
"""线上全流程体检：只调用真实接口，逐项判 PASS/FAIL。

覆盖：健康 → 注册/登录 → 钱包充值（订单+回调幂等）→ 开局 → 两段式发言
      → 催一下幂等 → 越权 → 余额不足 → 复盘 → 能力分析（空态/窗口）
      → 视频搜索 → 管理台登录 → 支付篡改
"""
import json, random, string, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://120.24.204.138:8787/siyige"
RESULTS = []

def call(m, p, b=None, tok=None, t=180):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    try:
        with urllib.request.urlopen(urllib.request.Request(
                BASE + p, data=json.dumps(b).encode() if b is not None else None,
                headers=h, method=m), timeout=t) as x:
            raw = x.read().decode()
            try:
                return x.status, json.loads(raw)
            except Exception:
                return x.status, raw[:200]
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"err": str(e)[:120]}

def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("  ✓ " if cond else "  ✗ ") + name + ("   " + str(detail) if detail else ""))

def acc(prefix):
    return prefix + "".join(random.choices(string.ascii_lowercase, k=6))

print("=== 0. 健康检查 ===")
st, d = call("GET", "/api/health")
check("健康接口 200", st == 200 and d.get("ok"), d)

print("\n=== 1. 注册 / 登录 ===")
u1 = acc("qa_")
st, r = call("POST", "/api/auth/register", {"account": u1, "password": "Test123456"})
t1 = r.get("token") if isinstance(r, dict) else None
check("注册成功拿到 token", st == 200 and bool(t1), st)
st, r = call("POST", "/api/auth/login", {"account": u1, "password": "Test123456"})
check("同一账号能再登录", st == 200 and bool(r.get("token")))
st, r = call("POST", "/api/auth/login", {"account": u1, "password": "wrongpass1"})
check("错密码被拒 401", st == 401, st)
st, r = call("POST", "/api/auth/register", {"account": u1, "password": "Test123456"})
check("重复注册被拒", st in (400, 409), st)

print("\n=== 2. 未登录访问受保护接口 ===")
for name, path, method in [("钱包", "/api/wallet", "GET"), ("开局", "/api/matches", "POST"),
                           ("能力分析", "/api/diag", "GET"), ("视频发布", "/api/video/videos", "POST")]:
    st, _ = call(method, path, {} if method == "POST" else None)
    check(f"未登录访问{name} → 401", st == 401, st)

print("\n=== 3. 钱包与充值 ===")
st, w = call("GET", "/api/wallet", None, t1)
check("新用户有钱包且有体验金", st == 200 and w.get("balanceCents", 0) >= 100, w.get("balanceCents"))
st, o = call("POST", "/api/pay/orders", {"amountCents": 800}, t1)
check("下单成功（未入账）", st == 200 and bool(o.get("orderId")))
bal_before = call("GET", "/api/wallet", None, t1)[1]["balanceCents"]
check("下单后余额未变", bal_before == w.get("balanceCents"))
st, cb = call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 800, "sign": o["sign"]}, t1)
check("回调入账", st == 200 and cb.get("ok") and not cb.get("already"))
st, cb2 = call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 800, "sign": o["sign"]}, t1)
check("重复回调幂等（already=true）", st == 200 and cb2.get("already") is True)
st, bad = call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 9999, "sign": o["sign"]}, t1)
check("篡改金额被拒", st == 400, st)
st, bad2 = call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 800, "sign": "deadbeef"}, t1)
check("伪造签名被拒", st == 400, st)

print("\n=== 4. 开局与档位 ===")
st, tiers = call("GET", "/api/ai-tiers", None, t1)
check("档位接口可用", st == 200 and "pro" in tiers, list(tiers.keys()) if isinstance(tiers, dict) else st)
check("基础版未启用（隐藏）", tiers.get("basic", {}).get("available") is False)
st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, t1)
mid = m.get("matchId") if isinstance(m, dict) else None
check("开局成功", st == 200 and bool(mid), st)
st, d = call("GET", f"/api/matches/{mid}", None, t1)
mt = d.get("match", {}) if isinstance(d, dict) else {}
check("档位记录为 PRO", mt.get("tier") == "PRO", mt.get("tier"))
check("质询轮数随机在 2-4", 2 <= int(mt.get("query_rounds") or 0) <= 4, mt.get("query_rounds"))
check("自由辩轮数随机在 3-6", 3 <= int(mt.get("free_rounds") or 0) <= 6, mt.get("free_rounds"))

print("\n=== 5. 催一下幂等 ===")
ok_cnt = 0
reasons = []
for i in range(5):
    st, r = call("POST", f"/api/matches/{mid}/skip", None, t1)
    if isinstance(r, dict) and r.get("ok"):
        ok_cnt += 1
    else:
        reasons.append((r or {}).get("reason"))
    time.sleep(0.2)
check("连点 5 次只成功 1 次", ok_cnt <= 1, f"成功 {ok_cnt} 次 · 其余原因 {set(reasons)}")

print("\n=== 6. 越权访问 ===")
u2 = acc("qa2_")
st, r = call("POST", "/api/auth/register", {"account": u2, "password": "Test123456"})
t2 = r.get("token")
st, _ = call("GET", f"/api/matches/{mid}", None, t2)
check("别人看不到我的对局（403）", st == 403, st)
st, _ = call("POST", f"/api/matches/{mid}/turns", {"content": "偷说一句", "inputType": "kb"}, t2)
check("别人不能替我发言", st in (403, 400), st)

print("\n=== 7. 余额不足 ===")
u3 = acc("qa3_")
st, r = call("POST", "/api/auth/register", {"account": u3, "password": "Test123456"})
t3 = r.get("token")
# 体验金 100，一场预估 57：连开两场就该被拦
for i in range(3):
    st, r = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, t3)
    last = (st, r)
check("余额不足时拒绝开局（409）", last[0] == 409, f"第 3 次 {last[0]} {str(last[1])[:60]}")

print("\n=== 8. 打一场到结束（SPRINT 快速局）===")
reply = ("对方认为取消期末会降低标准，我方不同意。虽然削弱刚性，但替代方案能守住同等标准才是关键。"
         "因为期末占比大，所以必须重建同等刚性替代评价。请问对方：复核主体是谁？")
t0 = time.time()
mine = 0
while time.time() - t0 < 420:
    st, d = call("GET", f"/api/matches/{mid}", None, t1)
    if not isinstance(d, dict) or d["match"]["status"] != "RUNNING":
        break
    if d.get("waitingForMe"):
        call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, t1)
        mine += 1
    time.sleep(2)
st, rv = call("GET", f"/api/matches/{mid}/review", None, t1)
check("对局能打完并出复盘", st == 200 and isinstance(rv, dict) and "score" in rv)
if isinstance(rv, dict) and "score" in rv:
    turns = rv.get("turns", [])
    temps = [x for x in turns if x.get("status") == "TEMPLATE"]
    check("没有整场降级成模板", len(temps) < max(1, len(turns) // 2), f"模板 {len(temps)}/{len(turns)} 轮")
    check("token 已计量", (rv.get("billTokens") or 0) > 0, rv.get("billTokens"))
    check("按席位评分有数据", bool(rv.get("seatScores")), list((rv.get("seatScores") or {}).keys()))
    print(f"     （我发言 {mine} 次 · 本场 {rv.get('billTokens')} token · 分数 {rv['score']['total']} · 用时 {int(time.time()-t0)} 秒）")

print("\n=== 9. 能力分析 ===")
u4 = acc("qa4_")
st, r = call("POST", "/api/auth/register", {"account": u4, "password": "Test123456"})
t4 = r.get("token")
st, dg = call("GET", "/api/diag", None, t4)
check("新用户画像为空（不伪造）", st == 200 and not dg.get("dims"), dg.get("dims"))
st, dg2 = call("GET", "/api/diag", None, t1)
check("打完的用户有六维", st == 200 and len(dg2.get("dims") or {}) == 6, list((dg2.get("dims") or {}).keys()))
st, dg3 = call("GET", "/api/diag?n=1", None, t1)
check("支持「最近 1 场」", st == 200 and dg3.get("window") == 1, dg3.get("window"))

print("\n=== 10. 视频模块 ===")
st, feed = call("GET", "/api/video/feed?size=6")
check("视频信息流可匿名浏览", st == 200 and "list" in feed, len(feed.get("list") or []))
st, sr = call("GET", "/api/video/search?q=%E6%9C%9F%E6%9C%AB")
check("视频搜索可用", st == 200 and "list" in sr, len(sr.get("list") or []))

print("\n=== 11. 管理台 ===")
st, adm = call("GET", "/admin")
check("/admin 跳转到 Vue 管理台（200/302）", st in (200, 302), st)
st, _ = call("GET", "/api/admin/stats")
check("未登录访问管理接口被拒", st in (401, 403), st)
st, lg = call("POST", "/api/admin/auth/login", {"account": "admin", "password": "admin123"})
check("默认密码 admin123 已失效（线上已改密）", st == 401, st)

print("\n=== 12. 社区（队友模块）===")
st, posts = call("GET", "/api/community/posts")
check("社区列表可匿名浏览", st == 200 and "items" in (posts or {}), list(posts.keys())[:4] if isinstance(posts, dict) else st)
st, _ = call("POST", "/api/community/posts", {"type": "CHAT", "title": "qa 测试帖", "body": "体检"})
check("未登录不能发帖", st == 401, st)

print("\n" + "=" * 60)
fail = [x for x in RESULTS if not x[1]]
print(f"总计 {len(RESULTS)} 项 · 通过 {len(RESULTS) - len(fail)} · 失败 {len(fail)}")
if fail:
    print("\n失败项：")
    for n, _, d in fail:
        print(f"  ✗ {n}   {d}")
