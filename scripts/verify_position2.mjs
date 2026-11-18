const PORT = process.argv[2] || 9748;
const OUT = 'D:\\siyige\\demo\\shots-pos2\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("   shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'pos2_' + Math.floor(Math.random() * 900000 + 10000);
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
  await sleep(1200);

  // 每 800ms 只看一个窗口：流式气泡的席位 vs 当前步骤应有席位
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    await sleep(800);
    const d = await ev(`(async()=>{
      const tk = localStorage.getItem('sy_jwt'), mid = localStorage.getItem('sy_match');
      const j = await (await fetch('/api/matches/' + mid, {headers:{'Authorization':'Bearer '+tk}})).json();
      const steps = j.steps || []; const step = (j.match||{}).step;
      const expect = steps[step] ? steps[step].seat : '?';
      const msgs = [...document.querySelectorAll('.msg')];
      const stream = msgs.filter(m => (m.textContent||'').includes('生成中'));
      const seat = stream.length ? ((stream[0].textContent||'').match(/[AB]\\d/)||['?'])[0] : '';
      return { step, expect, seat, dom: msgs.length, turns: (j.turns||[]).length,
               empty: (document.body.innerText||'').includes('等待第一条发言') };
    })()`);
    if (typeof d === 'string') break;
    samples.push(d);
    if (d.dom >= 6) break;
  }
  const wrongSeat = samples.filter(s => s.seat && s.expect !== '?' && s.seat !== s.expect);
  const wrongEmpty = samples.filter(s => s.empty && s.turns > 0);
  console.log(`采样 ${samples.length} 次`);
  console.log(`  预览席位 ≠ 当前步骤席位: ${wrongSeat.length} 次`);
  if (wrongSeat.length) console.log("  例:", JSON.stringify(wrongSeat.slice(0, 3)));
  console.log(`  空状态但已有轮次: ${wrongEmpty.length} 次`);
  if (wrongEmpty.length) console.log("  例:", JSON.stringify(wrongEmpty.slice(0, 3)));
  console.log(`  最后一帧: step=${samples.at(-1)?.step} expect=${samples.at(-1)?.expect} preview=${samples.at(-1)?.seat || '-'} dom=${samples.at(-1)?.dom} turns=${samples.at(-1)?.turns}`);
  await shot("final.png");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
