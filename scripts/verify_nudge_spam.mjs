const PORT = process.argv[2] || 9860;
const OUT = 'D:\\siyige\\demo\\shots-nudge-spam\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'sp_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:3000})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:3000, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2200);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(1500);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(700);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2500);

  const mid = await ev(`localStorage.getItem('sy_match')`);
  const stat = async () => ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch('/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    return { status:(j.match||{}).status, step:(j.match||{}).step, turns:(j.turns||[]).length };
  })()`);
  console.log("对局:", mid, "初始:", JSON.stringify(await stat()));

  // 狂点催一下（不管是否 disabled）：100 次
  console.log("\n=== 狂点「催一下」100 次 ===");
  const clicked = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent));
    if(!b) return 'no-button';
    let n=0;
    for(let i=0;i<100;i++){
      b.click();          // disabled 时浏览器会忽略，但这里直接调 .click()
      n++;
    }
    return { disabled: b.disabled, n };
  })()`);
  console.log("点击结果:", JSON.stringify(clicked));
  await sleep(2000);
  console.log("点完状态:", JSON.stringify(await stat()));

  // 再等 10 秒，看对局是否被"直接结束"
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const s = await stat();
    if (s.status !== 'RUNNING') { console.log(`  ${i+1}s 后状态变为`, JSON.stringify(s)); break; }
    if (i === 9) console.log("  10 秒后仍在进行:", JSON.stringify(s));
  }

  // 再模拟"按键没有 disabled 保护"的极端情况：连续 30 次真实点击 + 每次 50ms
  console.log("\n=== 再点 30 次（间隔 50ms）===");
  for (let i = 0; i < 30; i++) {
    await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent)); if(b) b.click(); })()`);
    await sleep(50);
  }
  await sleep(3000);
  console.log("最终状态:", JSON.stringify(await stat()));
  await shot("after-spam.png");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
