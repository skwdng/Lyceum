const PORT = process.argv[2] || 9668;
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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("  shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);
  const acc = 'nd4_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await send('Page.reload'); await sleep(3000);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2500);

  // 点题库第一题的「开练」
  const started = await ev(`(()=>{
    const cards=[...document.querySelectorAll('div')].filter(d=>/开练/.test(d.textContent||'') && d.textContent.length<200);
    const card = cards[cards.length-1];
    if(!card) return 'no-card';
    const target=[...card.querySelectorAll('*')].find(e=>e.textContent.trim()==='开练'||e.textContent.trim()==='开练 →');
    (target||card).click();
    return 'clicked';
  })()`);
  console.log("点开练:", started);
  await sleep(4000);
  console.log("  hash:", await ev(`location.hash`));

  // 观察「催一下」按钮的出现在何时
  let log = [];
  for (let i = 0; i < 12; i++) {
    await sleep(1500);
    const st = await ev(`(()=>{
      const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('催'));
      return {
        msgs: document.querySelectorAll('.msg').length,
        hasNudge: !!btn,
        nudgeDisabled: btn ? btn.disabled : null,
        nudgeText: btn ? btn.textContent.trim() : '',
        waitingBox: !!document.querySelector('.waiting'),
        typing: !!document.querySelector('.pending')
      };
    })()`);
    log.push(st);
    console.log(`  t=${(i + 1) * 1.5}s`, JSON.stringify(st));
    if (st.hasNudge) break;
  }

  const first = log.find(x => x.hasNudge);
  if (first) {
    console.log("\n出现催按钮时: 打字中=" + first.typing + " 等待框=" + first.waitingBox);
    // 连点 5 次
    const n = await ev(`(async()=>{
      let c=0;
      for(let i=0;i<5;i++){
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催'));
        if(b && !b.disabled){ b.click(); c++; }
        await new Promise(r=>setTimeout(r,120));
      }
      return c;
    })()`);
    console.log("  连点实际生效次数:", n);
    await sleep(1200);
    console.log("  点完后按钮还在:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`));
    await shot("nudge-clicked.png");
  } else {
    console.log("\n⚠ 12 次采样内没出现催按钮");
    await shot("nudge-none.png");
  }

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
