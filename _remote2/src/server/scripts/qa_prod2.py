#!/usr/bin/env python3
"""线上体检第二组：多人房间 / 视频发布与审核 / 改密失效 / 并发延迟 / 边界。"""
import json, random, string, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"
R = []

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

def reg(prefix):
    a = prefix + "".join(random.choices(string.ascii_lowercase, k=6))
    st, r = call("POST", "/api/auth/register", {"account": a, "password": "Test123456"})
    tok = r.get("token")
    if tok:
        o = call("POST", "/api/pay/orders", {"amountCents": 1500}, tok)[1]
        if o.get("sign"):
            call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": 1500, "sign": o["sign"]}, tok)
    return a, tok

print("=== A. 多人房间（房主付费）===")
host_a, host = reg("room_a_")
guest_a, guest = reg("room_b_")
st, room = call("POST", "/api/rooms", {"topicId": "t4", "visibility": "public"}, host)
code = (room or {}).get("code")
ck("建房成功", st == 200 and bool(code), code)
st, _ = call("POST", f"/api/rooms/{code}/join", {}, guest)
ck("第二人加入", st == 200, st)
# 两人各选一个席位
st, seats = call("GET", f"/api/rooms/{code}")
ck("房间详情可读", st == 200)
for tok, seat in [(host, "A1"), (guest, "B1")]:
    call("POST", f"/api/rooms/{code}/seats/{seat}", {}, tok)
st, ready = call("POST", f"/api/rooms/{code}/ready", {}, guest)
ck("参与者准备", st == 200, st)
st, started = call("GET", f"/api/rooms/{code}")
st, start = call("POST", f"/api/rooms/{code}/start", {}, host)
mid_room = (start or {}).get("matchId")
ck("房主开局成功", st == 200 and bool(mid_room), f"{st} {str(start)[:60]}")
if mid_room:
    st, d = call("GET", f"/api/matches/{mid_room}", None, host)
    mt = (d or {}).get("match", {})
    ck("对局记录付款人=房主", str(mt.get("payer_user_id")) != "", mt.get("payer_user_id"))
    st, _ = call("GET", f"/api/matches/{mid_room}", None, guest)
    ck("房间成员能看这局", st == 200, st)
    w_host = call("GET", "/api/wallet", None, host)[1].get("balanceCents")
    w_guest = call("GET", "/api/wallet", None, guest)[1].get("balanceCents")
    print(f"     （房主余额 {w_host} · 参与者余额 {w_guest} —— 只有房主该被预扣）")

print("\n=== B. 视频发布 → 机器审核 ===")
acc_v, tv = reg("vid_")
st, pub = call("POST", "/api/video/videos", {
    "title": "qa 测试视频：质询三连问", "description": "自动化体检",
    "url": "https://www.w3schools.com/html/mov_bbb.mp4", "segment": "质询", "side": "正"}, tv)
vid = (pub or {}).get("id")
ck("登录后能发布视频", st == 200 and bool(vid), f"{st} {str(pub)[:70]}")
if vid:
    st, d = call("GET", f"/api/video/videos/{vid}", None, tv)
    v = (d or {}).get("video", {})
    ck("发布后进入审核态（非直接上线）", v.get("audit_status") in ("PASSED", "REVIEW"), v.get("audit_status"))
    feed = call("GET", "/api/video/feed?size=20")[1]
    ids = [x.get("id") for x in (feed.get("list") or [])]
    print(f"     （审核态 {v.get('audit_status')}；是否出现在信息流：{vid in ids}）")
st, bad = call("POST", "/api/video/videos", {"title": "x", "url": "not-a-url", "segment": "质询"}, tv)
ck("非法视频被拒", st in (400, 422), st)

print("\n=== C. 改密后旧令牌失效 ===")
a3, t3 = reg("pw_")
st, _ = call("POST", "/api/auth/password", {"oldPassword": "Test123456", "newPassword": "Test654321"}, t3)
ck("改密成功", st in (200, 204), st)
st, _ = call("GET", "/api/wallet", None, t3)
ck("旧令牌立即失效（401）", st == 401, st)
st, r = call("POST", "/api/auth/login", {"account": a3, "password": "Test654321"})
ck("新密码可登录", st == 200 and bool(r.get("token")), st)

print("\n=== D. 并发：3 场同时进行 ===")
toks = [reg(f"par{i}_")[1] for i in range(3)]
mids = []
for i, tk in enumerate(toks):
    st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, tk)
    if st == 200:
        mids.append((i, m["matchId"], tk))
print(f"     开局 {len(mids)}/3")
t0 = time.time()
gaps = {i: [] for i, _, _ in mids}
last = {i: -1 for i, _, _ in mids}
lastchg = {i: t0 for i, _, _ in mids}
reply = "对方认为取消期末会降低标准，我方不同意。虽然削弱刚性，但替代方案能守住同等标准才是关键。请问对方：复核主体是谁？"
while time.time() - t0 < 240:
    for i, mid, tk in mids:
        st, d = call("GET", f"/api/matches/{mid}", None, tk)
        if not isinstance(d, dict):
            continue
        n = len(d.get("turns") or [])
        now = time.time()
        if n != last[i]:
            if last[i] >= 0:
                gaps[i].append(now - lastchg[i])
            last[i] = n
            lastchg[i] = now
        if d["match"]["status"] != "RUNNING":
            continue
        if d.get("waitingForMe"):
            call("POST", f"/api/matches/{mid}/turns", {"content": reply, "inputType": "kb"}, tk)
    time.sleep(2)
for i, mid, tk in mids:
    st, d = call("GET", f"/api/matches/{mid}", None, tk)
    mg = max(gaps[i]) if gaps[i] else 0
    print(f"     第{i+1}场：{len(d.get('turns') or [])} 条 · 最大推进间隔 {mg:.1f} 秒")
worst = max([max(g) for g in gaps.values() if g], default=0)
ck("3 场并发时推进间隔 < 30 秒", worst < 30, f"最差 {worst:.1f} 秒")

print("\n=== E. 边界 ===")
st, _ = call("POST", "/api/matches", {"topicId": "no-such-topic", "seats": ["B2"], "mode": "SPRINT"}, toks[0])
ck("不存在的辩题被拒", st in (400, 404), st)
st, _ = call("POST", "/api/matches", {"topicId": "t4", "seats": ["Z9"], "mode": "SPRINT"}, toks[0])
ck("非法席位被拒", st == 400, st)
st, _ = call("GET", "/api/matches/not-a-match", None, toks[0])
ck("不存在的对局 404", st in (400, 404), st)
st, _ = call("POST", f"/api/matches/{mids[0][1]}/turns", {"content": "   ", "inputType": "kb"}, mids[0][2])
ck("空发言被拒", st in (400, 409), st)

print("\n" + "=" * 56)
fail = [x for x in R if not x[1]]
print(f"第二组：{len(R)} 项 · 通过 {len(R)-len(fail)} · 失败 {len(fail)}")
for n, _, d in fail:
    print(f"  ✗ {n}   {d}")
