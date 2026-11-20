const PORT = process.argv[2] || 9840;
const BASE = process.argv[3] || 'http://120.24.204.138:8787/siyige';

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
    return r.exceptionDetails ? "EXC:" + JSON.stringify(r.exceptionDetails).slice(0, 120) : r.result?.value;
  };

  console.log("目标:", BASE);
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "/v2/index.html#/login" }); await sleep(3000);

  const acc = 'pr_' + Math.floor(Math.random() * 900000 + 10000);
  const r1 = await ev(`(async()=>{
    const base = '${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base + '/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:1500})})).json();
    await fetch(base + '/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:1500, sign:o.sign})});
    return d.token ? 'ok' : 'no-token';
  })()`);
  console.log("注册:", r1);
  await send('Page.reload'); await sleep(2500);

  // 用接口开一局，然后进对局页（复刻用户路径）
  const mid = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const r=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},
      body: JSON.stringify({topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'})});
    const d=await r.json(); return d.matchId || JSON.stringify(d).slice(0,80);
  })()`);
  console.log("对局:", mid);
  await send("Page.navigate", { url: BASE + "/v2/index.html#/match?match=" + mid });
  await sleep(3000);

  const before = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    return (j.turns||[]).map(t=>t.step+':'+t.seat+':'+(t.content||'').length);
  })()`);
  console.log("点击前 turns:", JSON.stringify(before));

  console.log("\n=== 连点空白 20 次（模拟用户操作）===");
  for (let i = 0; i < 20; i++) {
    await ev(`(()=>{
      const el = document.querySelector('#main') || document.body;
      const r = el.getBoundingClientRect();
      ['mousedown','mouseup','click'].forEach(t =>
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: r.left + 30, clientY: r.top + 30 })));
    })()`);
    await sleep(120);
  }
  await sleep(2500);

  const after = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    const rows=(j.turns||[]);
    const byStep={}; rows.forEach(t=>{ byStep[t.step]=(byStep[t.step]||0)+1; });
    return { count: rows.length, byStep, lens: rows.map(t=>t.step+':'+t.seat+':'+(t.content||'').length) };
  })()`);
  console.log("点击后 turns:", JSON.stringify(after));

  const dom = await ev(`(()=>{
    const bs=[...document.querySelectorAll('.msg')];
    return bs.map(m=>({len:(m.querySelector('.bub')?.textContent||'').length}));
  })()`);
  console.log("DOM 气泡:", JSON.stringify(dom));

  const ui = await ev(`(()=>{
    const t=document.body.innerText||'';
    const btns=[...document.querySelectorAll('button')].map(b=>b.textContent.trim());
    const box=document.querySelector('.composer');
    return { myTurn: t.includes('轮到你发言'), thinking: t.includes('对方正在思考'),
             speaking: t.includes('对方正在说话'),
             nudge: btns.filter(x=>/催一下|直接显示全文/.test(x)).join('/'),
             composerVisible: !!box && box.getBoundingClientRect().height > 0 };
  })()`);
  console.log("UI 状态:", JSON.stringify(ui));
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
