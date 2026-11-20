const PORT = process.argv[2] || 9822;
const OUT = 'D:\\siyige\\demo\\shots-typecheck2\\';

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
    if (r.exceptionDetails) return "EXC";
    return r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'tc2_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:1500})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:1500, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);

  // 用接口直接开一局（拿到 mid），然后直接访问 #/match?match=mid —— 模拟"刷新/直接进来"
  const mid = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt');
    const r=await fetch('/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},
      body: JSON.stringify({topicId:'t4',seats:['B2'],mode:'STANDARD',tier:'PRO'})});
    return (await r.json()).matchId;
  })()`);
  console.log("对局:", mid);

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/match?match=" + mid });
  console.log("\n直接进入对局页（模拟刷新/直接打开），采样第一条气泡：");
  let prev = -1;
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    const st = await ev(`(()=>{
      const b=document.querySelectorAll('.msg .bub');
      const first=b[0]?(b[0].textContent||'').length:0;
      const pinia=document.querySelector('#app').__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.debate || {};
      return { first, timer: !!pinia.typeTimer, typed: Object.keys(pinia.typed||{}).length, shown: JSON.stringify(pinia.shown||{}) };
    })()`);
    if (st.first !== prev) { console.log(`  ${(i*0.3).toFixed(1)}s  长度=${st.first}  timer=${st.timer} typed=${st.typed} shown=${st.shown}`); prev = st.first; }
    if (st.first > 120 && i > 10) break;
  }
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
