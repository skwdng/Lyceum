const PORT = process.argv[2] || 9672;
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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("  shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);

  const acc = 'ng3_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));   // 坐 B2：第 1 步是 AI，能催
    localStorage.setItem('sy_mode', 'SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2500);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2500);

  console.log("[1] 核对席位");
  console.log("  当前席位:", await ev(`[...document.querySelectorAll('.preset.on')].map(e=>e.textContent.trim()).join(',') || '未知'`));

  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(1000);
  const st = await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b){b.click(); return 'started';} return 'no-btn'; })()`);
  console.log("[2] 开始:", st);
  await sleep(3000);
  console.log("  hash:", await ev(`location.hash`));

  console.log("\n[3] 采样催按钮");
  let appeared = null;
  for (let i = 1; i <= 12; i++) {
    await sleep(1500);
    const s2 = await ev(`(()=>{
      const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('催'));
      return { msgs: document.querySelectorAll('.msg').length, has: !!btn, disabled: btn?btn.disabled:null,
               waiting: !!document.querySelector('.waiting'), typing: !!document.querySelector('.pending'),
               bodyHasNudge: (document.body.innerText||'').includes('催一下') };
    })()`);
    if (s2.has || s2.bodyHasNudge) { appeared = s2; console.log(`  t=${(i*1.5).toFixed(1)}s`, JSON.stringify(s2)); break; }
    if (i % 4 === 0) console.log(`  t=${(i*1.5).toFixed(1)}s`, JSON.stringify(s2));
  }

  if (!appeared) { console.log("  ⚠ 没等到"); await shot("nudge-none3.png"); ws.close(); process.exit(0); }

  console.log("\n[4] 连点 5 次");
  const n = await ev(`(async()=>{
    let c=0;
    for(let i=0;i<5;i++){
      const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催'));
      if(b && !b.disabled){ b.click(); c++; }
      await new Promise(r=>setTimeout(r,100));
    }
    return c;
  })()`);
  console.log("  点到:", n, "次");
  await sleep(1200);
  console.log("  点完还在吗:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`));
  await shot("nudge-clicked3.png");

  console.log("\n[5] AI 打字期间按钮应消失");
  let duringTyping = null;
  for (let i = 0; i < 10; i++) {
    await sleep(700);
    const typing = await ev(`!!document.querySelector('.pending')`);
    const hasBtn = await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`);
    if (typing) { duringTyping = { typing, hasBtn }; break; }
  }
  console.log("  打字时:", JSON.stringify(duringTyping || '未捕捉到打字窗口'));
  await shot("nudge-typing3.png");
  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
