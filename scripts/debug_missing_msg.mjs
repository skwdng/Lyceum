const PORT = process.argv[2] || 9728;
const OUT = 'D:\\siyige\\demo\\shots-dbg\\';

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
  const acc = 'dbg_' + Math.floor(Math.random() * 90000 + 10000);
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
  await sleep(2500);

  console.log("时间    API轮次  DOM气泡  环节（DOM）                    流式中");
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    const d = await ev(`(async()=>{
      const tk = localStorage.getItem('sy_jwt');
      const mid = localStorage.getItem('sy_match');
      const r = await fetch('/api/matches/' + mid, {headers:{'Authorization':'Bearer '+tk}});
      const j = await r.json();
      const apiTurns = (j.turns||[]).map(t => t.step + t.seat + '/' + t.seg);
      const dom = [...document.querySelectorAll('.msg')].map(m => (m.textContent||'').slice(0,20).replace(/\\s+/g,' '));
      const segs = [...document.querySelectorAll('.msg')].map(m => {
        const t = m.textContent||'';
        return (t.match(/(立论|驳立论|质询|自由辩|总结)/)||[])[1] || '?';
      });
      return { apiTurns, domCount: dom.length, segs, streaming: dom.filter(x=>x.includes('生成中')).length, step: j.match && j.match.step };
    })()`);
    if (typeof d === 'string') { console.log("  " + d); break; }
    console.log(`${(i*0.7).toFixed(1)}s   ${String(d.apiTurns.length).padStart(2)}        ${String(d.domCount).padStart(2)}       ${d.segs.join(',')}            ${d.streaming}   [step ${d.step}]`);
    if (d.domCount < d.apiTurns.length) {
      console.log("  ⚠ 少显示了：" + (d.apiTurns.length - d.domCount) + " 条");
      await shot("missing.png");
    }
    if (/复盘/.test(await ev(`document.body.innerText`) || '')) break;
  }
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
