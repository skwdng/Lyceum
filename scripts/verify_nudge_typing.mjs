const PORT = process.argv[2] || 9674;
const OUT = 'D:\\siyige\\demo\\shots-nudge\\';

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
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC";
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);

  const acc = 'ng4_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    localStorage.setItem('sy_mode', 'SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2500);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2500);

  // 等按钮出现
  let ok = false;
  for (let i = 0; i < 20; i++) {
    if (await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`)) { ok = true; break; }
    await sleep(1000);
  }
  console.log("催按钮出现:", ok);
  if (!ok) { ws.close(); process.exit(0); }

  // 点一次，然后每 200ms 采样：打字中是否有按钮
  await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催')); if(b) b.click(); })()`);
  let samples = [];
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    const s = await ev(`(()=>{
      const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('催'));
      return { t: document.querySelectorAll('.pending').length,
               typingShown: [...document.querySelectorAll('.msg')].some(m=>m.querySelector('.pending')),
               hasBtn: !!btn };
    })()`);
    samples.push(s);
    if (s.typingShown && !s.hasBtn) break;
  }
  const typingSamples = samples.filter((s) => s.typingShown);
  console.log("采样数:", samples.length, "· 打字中的采样数:", typingSamples.length);
  console.log("打字期间出现按钮的次数:", typingSamples.filter((s) => s.hasBtn).length);
  console.log("点催后按钮出现过的采样数:", samples.filter((s) => s.hasBtn).length);
  await shot("nudge-typing4.png");
  ws.close(); process.exit(0);
});
