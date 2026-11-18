const PORT = process.argv[2] || 9768;
const OUT = 'D:\\siyige\\demo\\shots-flaw3\\';

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
  const acc = 'fl3_' + Math.floor(Math.random() * 900000 + 10000);
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

  // 用 DOM 长度变化判断"正在打字"
  console.log("等一条正在打字的发言…");
  let prev = [], typingInfo = null;
  for (let i = 0; i < 90; i++) {
    await sleep(400);
    const lens = await ev(`[...document.querySelectorAll('.msg')].map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;})`);
    if (Array.isArray(lens) && prev.length && lens.length) {
      const k = lens.length - 1;
      if (lens[k] > (prev[k] || 0) && lens[k] > 30 && lens[k] < 250) { typingInfo = { idx: k, len: lens[k] }; break; }
    }
    prev = lens || [];
  }
  if (!typingInfo) { console.log("没捕捉到打字窗口"); ws.close(); process.exit(0); }

  const stepInfo = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt'), mid=localStorage.getItem('sy_match');
    const j=await (await fetch('/api/matches/'+mid,{headers:{'Authorization':'Bearer '+tk}})).json();
    const t=(j.turns||[]).pop() || {};
    return { step: t.step, seat: t.seat, seg: t.seg, turns:(j.turns||[]).length };
  })()`);
  console.log(`  打字中：第 ${typingInfo.idx + 1} 条 · ${typingInfo.len} 字 · 最近落库 step=${stepInfo.step} ${stepInfo.seat} ${stepInfo.seg}`);

  await ev(`(()=>{
    const pinia=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.debate.flawOffer={ step: ${stepInfo.step}, seat: '${stepInfo.seat}', options: ['诉诸权威','以偏概全','循环论证'] };
  })()`);
  await sleep(500);
  const during = await ev(`(document.body.innerText||'').includes('你抓到了吗')`);
  console.log(`  打字中注入 → 卡片出现: ${during}（应为 false）`);

  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const lens = await ev(`[...document.querySelectorAll('.msg')].map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;})`);
    if (Array.isArray(lens) && lens.length && lens[lens.length - 1] === prev[lens.length - 1]) {
      // 连续两次不变视为打完
      const again = await (async () => { await sleep(600); return ev(`[...document.querySelectorAll('.msg')].map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;})`); })();
      if (Array.isArray(again) && again[again.length - 1] === lens[lens.length - 1]) break;
    }
    prev = lens || prev;
  }
  const after = await ev(`(document.body.innerText||'').includes('你抓到了吗')`);
  const target = await ev(`(document.body.innerText||'').match(/[AB]\\d · (立论|驳立论|质询|自由辩|总结)/)`);
  console.log(`  打完后再看 → 卡片出现: ${after}（应为 true）· 标注: ${JSON.stringify(target)}`);
  await shot("flaw-after.png");
  console.log(during === false && after === true ? "\n✓ 漏洞卡只在对方那句打完后出现" : "\n⚠ 时机不对");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
