import json, time, urllib.request

B = "http://localhost:8080"

def post(p, b=None, timeout=120):
    r = urllib.request.Request(B + p, data=json.dumps(b or {}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r, timeout=timeout) as x:
        return json.loads(x.read().decode())

def get(p, timeout=30):
    with urllib.request.urlopen(B + p, timeout=timeout) as x:
        return json.loads(x.read().decode())

# 清零统计
post("/api/usage/reset")
print("== 单场完整对局用量（你占 A2，其余 7 席 AI）==")

m = post("/api/matches", {"userId": "tok1", "topicId": "t4", "seats": ["A2"],
                          "mode": "FULL", "pace": "normal", "difficulty": "pro", "kind": "solo"})
mid = m["matchId"]

t0 = time.time()
while time.time() - t0 < 900:
    d = get(f"/api/matches/{mid}")
    if d["match"]["status"] != "RUNNING":
        break
    if d.get("waitingForMe"):
        post(f"/api/matches/{mid}/turns",
             {"content": "我方判断：取消期末不是取消考核，而是把一次性终结性评价换成可追溯的过程性评价。判准两条：能否守住学业标准，能否让责任可追溯。", "inputType": "kb"})
    else:
        time.sleep(0.5)

u = get("/api/usage")
print(f"  模型调用: {u['calls']} 次")
print(f"  输入 token: {u['promptTokens']:,}")
print(f"  输出 token: {u['completionTokens']:,}")
print(f"  合计 token: {u['totalTokens']:,}")
if u["calls"]:
    print(f"  平均每次: 输入 {u['promptTokens']//u['calls']:,} / 输出 {u['completionTokens']//u['calls']:,}")

print()
print("== 单次辩题审核 + 作战卡的额外消耗 ==")
post("/api/usage/reset")
try:
    post("/api/topics/audit", {"title": "人工智能是否应当拥有法律人格"}, timeout=120)
except Exception as e:
    print("  审核失败:", e)
a = get("/api/usage")
print(f"  辩题审核: {a['calls']} 次调用 · {a['totalTokens']:,} token")

post("/api/usage/reset")
try:
    get(f"/api/topics/t4/brief?side=A&userId=tok1", timeout=180)
except Exception as e:
    print("  作战卡失败:", e)
b2 = get("/api/usage")
print(f"  作战卡: {b2['calls']} 次调用 · {b2['totalTokens']:,} token")
