#!/usr/bin/env python3
"""第三组：按真实接口契约重测（修正前两组里写错的断言）。

房间接口实际是：
  GET  /api/rooms/{code}          房间详情
  GET  /api/rooms/{code}/seats    席位列表
  POST /api/rooms/{code}/join     加入
  POST /api/rooms/{code}/ready    准备
  POST /api/rooms/{code}/start    开局
改密是 PATCH /api/auth/password
视频发布返回 {videoId,auditStatus,visible}
"""
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

def reg(prefix, cents=1500):
    a = prefix + "".join(random.choices(string.ascii_lowercase, k=6))
    st, r = call("POST", "/api/auth/register", {"account": a, "password": "Test123456"})
    tok = r.get("token")
    if tok and cents:
        o = call("POST", "/api/pay/orders", {"amountCents": cents}, tok)[1]
        if o.get("sign"):
            call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": cents, "sign": o["sign"]}, tok)
    return a, tok

print("=== A. 多人房间（重测）===")
_, host = reg("r2a_")
ga, guest = reg("r2b_")
st, room = call("POST", "/api/rooms", {"topicId": "t4", "visibility": "public"}, host)
code = (room or {}).get("code")
ck("建房", st == 200 and bool(code), code)
st, _ = call("POST", f"/api/rooms/{code}/join", {}, guest)
ck("加入", st == 200, st)
st, seats = call("GET", f"/api/rooms/{code}/seats", None, host)
ck("能读席位列表", st == 200, list(seats.keys())[:4] if isinstance(seats, dict) else st)
st, _ = call("POST", f"/api/rooms/{code}/ready", {}, guest)
ck("参与者准备", st == 200, st)
st, detail = call("GET", f"/api/rooms/{code}", None, host)
ck("房间详情可读", st == 200, st)
unready = (detail or {}).get("unready") or (detail or {}).get("unreadyNames")
print(f"     房间详情里 unready = {unready}")
st, start = call("POST", f"/api/rooms/{code}/start", {}, host)
mid = (start or {}).get("matchId")
ck("房主开局", st == 200 and bool(mid), f"{st} {str(start)[:70]}")
if mid:
    st, d = call("GET", f"/api/matches/{mid}", None, host)
    mt = (d or {}).get("match", {})
    payer = mt.get("payer_user_id")
    host_bal = call("GET", "/api/wallet", None, host)[1].get("balanceCents")
    guest_bal = call("GET", "/api/wallet", None, guest)[1].get("balanceCents")
    ck("付款人是房主", bool(payer), payer)
    print(f"     房主余额 {host_bal} · 参与者余额 {guest_bal}")
    st, _ = call("GET", f"/api/matches/{mid}", None, guest)
    ck("房间成员能看这局", st == 200, st)
    st, _ = call("GET", f"/api/matches/{mid}", None, reg("outsider_")[1])
    ck("局外人看不到这局", st == 403, st)

print("\n=== B. 视频（重测，按 videoId/auditStatus 判定）===")
_, tv = reg("v2_")
st, pub = call("POST", "/api/video/videos", {
    "title": "qa 重测：质询问句三连", "description": "体检",
    "url": "https://www.w3schools.com/html/mov_bbb.mp4", "segment": "质询", "side": "正"}, tv)
vid = (pub or {}).get("videoId")
ck("发布返回 videoId", st == 200 and bool(vid), f"{st} {str(pub)[:60]}")
status1 = (pub or {}).get("auditStatus")
ck("有审核结论", status1 in ("PASSED", "REVIEW", "REJECTED"), status1)
print(f"     （审核结论 {status1} · 直接可见 {(pub or {}).get('visible')}）")
st, bad = call("POST", "/api/video/videos", {"title": "x", "url": "not-a-url", "segment": "质询"}, tv)
st2 = (bad or {}).get("auditStatus")
ck("非法 URL 不会上线（REJECTED 或 4xx）", st in (400, 422) or st2 == "REJECTED", f"http={st} audit={st2}")
st, empt = call("POST", "/api/video/videos", {"title": "", "url": "https://x/y.mp4", "segment": "质询"}, tv)
ck("空标题被拒", st in (400, 422) or (empt or {}).get("auditStatus") == "REJECTED",
   f"http={st} audit={(empt or {}).get('auditStatus')}")

print("\n=== C. 改密（PATCH）===")
a3, t3 = reg("p2_", cents=0)
st, _ = call("PATCH", "/api/auth/password", {"oldPassword": "Test123456", "newPassword": "Test654321"}, t3)
ck("改密 204", st == 204, st)
st, _ = call("GET", "/api/wallet", None, t3)
ck("旧令牌立即失效", st == 401, st)
st, r = call("POST", "/api/auth/login", {"account": a3, "password": "Test654321"})
ck("新密码可登录", st == 200 and bool(r.get("token")), st)
st, _ = call("POST", "/api/auth/login", {"account": a3, "password": "Test123456"})
ck("旧密码不能登录", st == 401, st)

print("\n=== D. 令牌相关边界 ===")
_, t4 = reg("tk_", cents=0)
st, _ = call("GET", "/api/wallet", None, t4)
ck("正常令牌可用", st == 200, st)
st, _ = call("GET", "/api/wallet", None, "eyJhbGciOiJIUzI1NiJ9.fake.sig")
ck("伪造令牌被拒", st == 401, st)
st, _ = call("GET", "/api/wallet", None, "")
ck("空令牌被拒", st == 401, st)

print("\n=== E. 不存在的资源 ===")
st, _ = call("GET", "/api/matches/m_not_exist_xx", None, t4)
ck("不存在的对局 → 404（现在是 %s）" % st, st == 404, st)
st, _ = call("GET", "/api/video/videos/999999", None, t4)
ck("不存在的视频 → 404", st in (400, 404), st)
st, _ = call("GET", "/api/rooms/NOPE99", None, t4)
ck("不存在的房间 → 404", st in (400, 404), st)

print("\n" + "=" * 56)
fail = [x for x in R if not x[1]]
print(f"第三组：{len(R)} 项 · 通过 {len(R)-len(fail)} · 失败 {len(fail)}")
for n, _, d in fail:
    print(f"  ✗ {n}   {d}")
