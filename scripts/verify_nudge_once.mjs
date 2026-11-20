const PORT = process.argv[2] || 9808;
const OUT = 'D:\\siyige\\demo\\shots-nudge3\\';

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
  const btn = () => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent)); return b?b.textContent.trim():'';})()`);

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'once_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:1500})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:1500, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(900);

  console.log("阶段 1：AI 思考中");
  console.log("  按钮:", await btn());
  await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='催一下'); if(b) b.click(); })()`);
  await sleep(600);
  console.log("  点完后按钮:", (await btn()) || "(已隐藏)");

  // 等到出字，再看按钮是否还是隐藏
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const len = await ev(`(()=>{const b=document.querySelectorAll('.msg .bub'); return b.length?(b[b.length-1].textContent||'').length:0;})()`);
    if (len > 20) break;
  }
  console.log("  出字后按钮:", (await btn()) || "(已隐藏)");

  // 等到下一阶段（步骤推进）→ 按钮应重新出现
  console.log("\n阶段 2：等进入下一步");
  let reappeared = null;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const b = await btn();
    if (b) { reappeared = { at: ((i + 1) * 0.5).toFixed(1), label: b }; break; }
  }
  console.log("  按钮重新出现:", reappeared ? `是（${reappeared.at} 秒，文案「${reappeared.label}」）` : "否");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0, 2)) : "无");
  ws.close(); process.exit(0);
});
