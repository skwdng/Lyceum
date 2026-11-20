#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印线上服务某场对局的发言，用来确认 AI 用的是模板还是真模型。"""
import json, sys, urllib.request

def get(path):
    with urllib.request.urlopen("http://127.0.0.1:8090" + path, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))

def post(path, body):
    req = urllib.request.Request("http://127.0.0.1:8090" + path,
                                 data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

import time
m = post("/api/matches", {"userId": "probe2", "topicId": "t4", "seats": ["B2"], "mode": "SPRINT"})
mid = m["matchId"]
print("matchId:", mid)
time.sleep(9)
d = get("/api/matches/" + mid)
turns = d.get("turns", [])
print("turn 数:", len(turns))
for t in turns:
    print("  #%s %s [%s] %s" % (t["step"], t["seat"], t["seg"], str(t["content"])[:46]))

text = " ".join(str(t["content"]) for t in turns)
if "MOCK-LLM" in text:
    print("\n判定：走了真实模型链路（假模型回复）")
elif any(k in text for k in ["我方先把议题拉回现实", "我方立论：判断这道题要先立一个标准", "对方把风险直接推成"]):
    print("\n判定：走的是本地模板（未配置 api-key，符合预期）")
else:
    print("\n判定：无法确定，原文见上")
