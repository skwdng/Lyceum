const PORT = process.argv[2] || 9732;
const OUT = 'D:\\siyige\\demo\\shots-dbg2\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'dbg2_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:900})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:900, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2000);

  console.log("时间   turns  bubbles  streaming  streamedKeys  streamDone  streamRawLen");
  for (let i = 0; i < 70; i++) {
    await sleep(600);
    const d = await ev(`(()=>{
      const app = document.querySelector('#app');
      const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
      const st = pinia && pinia.state.value && pinia.state.value.debate;
      const dom = document.querySelectorAll('.msg').length;
      if (!st) return { err: 'no pinia state' };
      return {
        turns: (st.turns || []).length,
        dom,
        streaming: Object.keys(st.streaming || {}),
        streamedKeys: Object.keys(st.streamedKeys || {}),
        streamDone: Object.keys(st.streamDone || {}),
        rawLen: Object.fromEntries(Object.entries(st.streamRaw || {}).map(([k, v]) => [k, (v || '').length])),
        shown: Object.fromEntries(Object.entries(st.streamShown || {})),
        typed: Object.keys(st.typed || {}),
        view: (st.turnsView || []).length,
        viewKeys: (st.turnsView || []).map((x) => x.seat + '@' + x.step + (x.typing ? '(打字)' : ''))
      };
    })()`);
    if (d.err) { console.log("  " + d.err); break; }
    console.log(`${(i*0.6).toFixed(1)}s  turns=${d.turns} view=${d.view} dom=${d.dom}  stream=${JSON.stringify(d.streaming)} done=${JSON.stringify(d.streamDone)} | ${JSON.stringify(d.viewKeys)}`);
    if (d.view > d.dom) { await shot("mismatch.png"); console.log("  ⚠ turns>dom"); break; }
  }
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
