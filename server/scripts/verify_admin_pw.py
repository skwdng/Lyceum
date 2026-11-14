#!/usr/bin/env python3
"""验证：管理员改密后，重启不会被打回 admin123。"""
import json, secrets, sys, urllib.error, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"

def call(m, p, b=None, tok=None, t=30):
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

mode = sys.argv[2] if len(sys.argv) > 2 else "rotate"

if mode == "rotate":
    st, r = call("POST", "/api/admin/auth/login", {"account": "admin", "password": "admin123"})
    print("用 admin123 登录:", st, "(200 = 还是默认密码，需要改)")
    tok = r.get("token")
    if st != 200:
        sys.exit(0)
    newpw = "Sy" + secrets.token_urlsafe(9).replace("-", "").replace("_", "") + "!7"
    st2, _ = call("PATCH", "/api/admin/auth/password", {"oldPassword": "admin123", "newPassword": newpw}, tok)
    print("改密:", st2, "(204 = 成功)")
    st3, _ = call("POST", "/api/admin/auth/login", {"account": "admin", "password": newpw})
    print("新密码登录:", st3)
    if st3 == 200:
        print("新密码: " + newpw)
        open("D:/siyige/.admin_pw", "w").write(newpw)
else:
    pw = open("D:/siyige/.admin_pw").read().strip()
    st, _ = call("POST", "/api/admin/auth/login", {"account": "admin", "password": pw})
    st2, _ = call("POST", "/api/admin/auth/login", {"account": "admin", "password": "admin123"})
    print("重启后用改过的密码:", st, "(200 = 密码保住了)")
    print("重启后 admin123:", st2, "(401 = 没被重置)")
