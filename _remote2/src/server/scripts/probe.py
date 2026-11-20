#!/usr/bin/env python3
import json, urllib.request, urllib.error

B = "http://127.0.0.1:8090"

def call(m, p, b=None, tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            return x.status, x.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
    except Exception as e:
        return 0, str(e)[:200]

st, r = call("POST", "/api/auth/register", {"account": "probe1", "password": "Test123456"})
tok = None
if st == 200:
    tok = json.loads(r)["token"]
else:
    st, r = call("POST", "/api/auth/login", {"account": "probe1", "password": "Test123456"})
    if st == 200:
        tok = json.loads(r)["token"]
print("register/login:", st, "token:", bool(tok))

print("wallet:", call("GET", "/api/wallet", None, tok))
print("pay:", call("POST", "/api/pay/orders", {"amountCents": 300}, tok))
print("llm:", call("GET", "/api/llm/profile", None, tok))
print("match:", call("POST", "/api/matches", {"topicId": "t4", "seats": ["B2"], "mode": "FULL"}, tok))
