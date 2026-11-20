const PORT = process.argv[2] || 9830;
const OUT = 'D:\\siyige\\demo\\shots-dupe\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("   shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'dup_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:1500})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:1500, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(1500);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(700);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(1500);

  console.log("=== 连点空白区域 15 次 ===");
  for (let i = 0; i < 15; i++) {
    await ev(`(()=>{
      const el = document.querySelector('.chat') || document.body;
      const r = el.getBoundingClientRect();
      const ev = new MouseEvent('click', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 });
      el.dispatchEvent(ev);
    })()`);
    await sleep(150);
  }
  await sleep(2000);

  const api = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt'), mid=localStorage.getItem('sy_match');
    const j=await (await fetch('/api/matches/'+mid,{headers:{'Authorization':'Bearer '+tk}})).json();
    return { turns:(j.turns||[]).map(t=>({step:t.step, seat:t.seat, seg:t.seg, len:(t.content||'').length,
             dup:(t.content||'').split('判断标准先立住').length-1})) };
  })()`);
  console.log("接口轮次:", JSON.stringify(api, null, 0).slice(0, 400));

  const dom = await ev(`(()=>{
    const b=[...document.querySelectorAll('.msg')];
    return b.map(m=>({ len: (m.querySelector('.bub')?.textContent||'').length,
                       dup: ((m.querySelector('.bub')?.textContent||'').split('判断标准先立住').length-1) }));
  })()`);
  console.log("DOM 气泡:", JSON.stringify(dom));

  const pinia = await ev(`(()=>{
    const st=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.debate;
    return { turns:(st.turns||[]).length, typed:Object.keys(st.typed||{}), shown:st.shown };
  })()`);
  console.log("store:", JSON.stringify(pinia).slice(0, 300));
  await shot("after-clicks.png");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
