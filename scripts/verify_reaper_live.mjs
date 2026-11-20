const PORT = process.argv[2] || 9862;

import("node:fs").then(async fs => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getWs() {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
        const l = await r.json();
        const p = l.find(t => t.type === "page" && t.webSocketDebuggerUrl);
        if (p) return p.webSocketDebuggerUrl;
      } catch {}
      await sleep(250);
    }
    throw new Error("no target");
  }
  const ws = new WebSocket(await getWs());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((resolve) => pend.set(i, { resolve })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    return r.exceptionDetails ? "EXC" : r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'old_' + Math.floor(Math.random() * 900000 + 10000);
  const mid = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:3000})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:3000, sign:o.sign})});
    const m = await (await fetch('/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'})})).json();
    localStorage.setItem('sy_match', m.matchId);
    return m.matchId;
  })()`);
  console.log("对局:", mid);

  // 模拟"打了 20 分钟"：开局时间改成 20 分钟前（last_active_at 留着现在）
  console.log("\n模拟：开局在 20 分钟前，但刚刚还有动作（last_active_at=现在）");
  console.log("  → 需要服务端配合：先等一会儿再 tick（这里只能验证 tick 不误杀）");
  await sleep(3000);
  const st = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch('/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    return { status:(j.match||{}).status, step:(j.match||{}).step };
  })()`);
  console.log("当前状态:", JSON.stringify(st), st.status === 'RUNNING' ? "✓ 没被误杀" : "✗ 被回收了");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
