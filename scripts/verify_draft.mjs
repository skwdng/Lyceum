const PORT = process.argv[2] || 9854;

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
  const acc = 'dr_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:2000})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:2000, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2200);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(1500);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(700);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);

  // 等到轮到我（textarea 出现）
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    ready = await ev(`!!document.querySelector('textarea')`);
    if (ready) break;
  }
  console.log("轮到我:", ready);
  if (!ready) { ws.close(); process.exit(0); }

  const len = await ev(`(async()=>{
    const ta=document.querySelector('textarea');
    ta.value='我方认为取消期末需要替代评价同等刚性，请问对方复核主体是谁';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return ta.value.length;
  })()`);
  const keys = await ev(`Object.keys(localStorage).filter(k=>k.startsWith('sy_draft_')).map(k=>k+'='+localStorage.getItem(k).length)`);
  console.log("写入", len, "字 · 本地草稿:", JSON.stringify(keys));

  await send("Page.reload"); await sleep(3500);
  const after = await ev(`(()=>{
    const ta=document.querySelector('textarea');
    return { draft: ta?ta.value.length:0, msgs: document.querySelectorAll('.msg').length };
  })()`);
  console.log("刷新后:", JSON.stringify(after), after.draft > 0 ? "✓ 草稿保住了" : "✗ 草稿丢了");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
