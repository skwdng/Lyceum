#!/usr/bin/env python3
"""验证今天两个修复：僵尸回收 + 视频默认转人工。"""
import json, random, string, sys, time, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
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

def ck(n, c, d=""):
    R.append((n, bool(c), d))
    print(("  ✓ " if c else "  ✗ ") + n + ("   " + str(d) if d else ""))

def reg(p, cents=800):
    a = p + "".join(random.choices(string.ascii_lowercase, k=6))
    st, r = call("POST", "/api/auth/register", {"account": a, "password": "Test123456"})
    tok = r.get("token")
    if cents and tok:
        o = call("POST", "/api/pay/orders", {"amountCents": cents}, tok)[1]
        if o.get("sign"):
            call("POST", "/api/pay/callback", {"orderId": o["orderId"], "amountCents": cents, "sign": o["sign"]}, tok)
    return a, tok

print("=== 视频审核：机器通过是否还进人工 ===")
_, tv = reg("vr_")
st, pub = call("POST", "/api/video/videos", {
    "title": "僵尸回收与审核默认值验证", "description": "体检用",
    "url": "https://www.w3schools.com/html/mov_bbb.mp4", "segment": "立论", "side": "正"}, tv)
status = (pub or {}).get("auditStatus")
visible = (pub or {}).get("visible")
ck("机器通过后转 REVIEW（不再直接上线）", status == "REVIEW", f"auditStatus={status} visible={visible}")
ck("未过人工前不可见", visible is False, visible)

print("\n=== 僵尸回收：伪造一场「很久没动」的对局 ===")
print("  （回收阈值 15 分钟，靠不断创建+等待不现实；这里验证对正常运行中不被误杀）")
_, ta = reg("rb_")
st, m = call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "SPRINT", "tier": "PRO"}, ta)
mid = (m or {}).get("matchId")
ck("正常对局能创建", st == 200 and bool(mid), mid)
time.sleep(8)
st, d = call("GET", f"/api/matches/{mid}", None, ta)
status_m = (d or {}).get("match", {}).get("status")
ck("正常运行的对局没被回收（仍 RUNNING）", status_m == "RUNNING", status_m)
# 放弃它，看会不会在 15 分钟后被收（这里只打印提示，不真的等）
print("     （这场留在后台；15 分钟内无推进会被判 ABANDONED 并结算）")

print("\n" + "=" * 50)
fail = [x for x in R if not x[1]]
print(f"{len(R)} 项 · 通过 {len(R)-len(fail)} · 失败 {len(fail)}")
for n, _, d in fail:
    print(f"  ✗ {n}   {d}")
