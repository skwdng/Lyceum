const PORT = process.argv[2] || 9700;
const OUT = 'D:\\siyige\\demo\\shots-stream\\';

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
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0];
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("  shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);

  const acc = 'st_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2200);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);

  // 每 300ms 采样：流式气泡是否在"逐字变长"，并记录首次出现时间
  const t0 = Date.now();
  let firstSeen = null, maxLen = 0, samples = [];
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    const st = await ev(`(()=>{
      const el=document.querySelector('.msg .tag')?.parentElement?.parentElement?.parentElement;
      const stream = [...document.querySelectorAll('.msg')].find(m=>(m.textContent||'').includes('生成中'));
      const bub = stream ? stream.querySelector('.bub') : null;
      return { has: !!stream, len: bub ? (bub.textContent||'').length : 0,
               text: bub ? (bub.textContent||'').slice(0, 16) : '' };
    })()`);
    if (st.has && firstSeen === null) firstSeen = (Date.now() - t0) / 1000;
    if (st.len > maxLen) maxLen = st.len;
    if (i % 4 === 0) samples.push(`${((Date.now() - t0) / 1000).toFixed(1)}s:${st.len}字`);
    if (st.has && maxLen > 30 && i > 6) { await shot("streaming.png"); break; }
  }
  const elapsed = (Date.now() - t0) / 1000;
  console.log("流式气泡首次出现:", firstSeen === null ? "未出现" : firstSeen.toFixed(1) + " 秒");
  console.log("最大长度:", maxLen, "字");
  console.log("采样轨迹:", samples.join(" → "));
  console.log("观察时长:", elapsed.toFixed(1), "秒");
  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
