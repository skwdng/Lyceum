const PORT = process.argv[2] || 9670;
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
  const acc = 'ng2_' + Math.floor(Math.random() * 90000 + 10000);

  // 用 fetch 注册并充钱（不进 UI），token 存本地
  const reg = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return d.token ? 'ok' : 'fail';
  })()`);
  console.log("注册+充值:", reg);
  await send('Page.reload'); await sleep(2500);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2500);

  // 点题库第一张卡（@click="openSeat(t.id)"）→ 弹选座面板 → 开始
  console.log("\n[1] 点题库卡片");
  const clicked = await ev(`(()=>{
    const card = document.querySelector('.topic');
    if(!card) return 'no-card';
    card.click(); return 'clicked';
  })()`);
  console.log("  ", clicked);
  await sleep(1200);
  console.log("  选座面板:", await ev(`!!document.querySelector('.mask')`));

  // 面板里的「开始」
  const startBtn = await ev(`(()=>{
    const btns=[...document.querySelectorAll('.mask button, .mask .btn')];
    const b=btns.find(x=>/开始|开练|进入/.test(x.textContent));
    if(!b) return 'no-start-btn:' + btns.map(x=>x.textContent.trim()).join('|').slice(0,60);
    b.click(); return 'started';
  })()`);
  console.log("  点开始:", startBtn);
  await sleep(4000);
  console.log("  hash:", await ev(`location.hash`), "· 消息:", await ev(`document.querySelectorAll('.msg').length`));

  console.log("\n[2] 采样「催一下」按钮");
  let appeared = null;
  for (let i = 1; i <= 14; i++) {
    await sleep(1500);
    const st = await ev(`(()=>{
      const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('催'));
      return { msgs: document.querySelectorAll('.msg').length, has: !!btn,
               disabled: btn? btn.disabled : null, text: btn? btn.textContent.trim():'',
               waiting: !!document.querySelector('.waiting'), typing: !!document.querySelector('.pending') };
    })()`);
    if (st.has) { appeared = st; console.log(`  t=${(i * 1.5).toFixed(1)}s 出现按钮`, JSON.stringify(st)); break; }
    if (i % 3 === 0) console.log(`  t=${(i * 1.5).toFixed(1)}s`, JSON.stringify(st));
  }

  if (!appeared) {
    console.log("  ⚠ 没等到按钮（可能 AI 已经说完/在打字）");
    await shot("nudge-none2.png");
  } else {
    console.log("\n[3] 连点 5 次");
    const n = await ev(`(async()=>{
      let c=0;
      for(let i=0;i<5;i++){
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催'));
        if(b && !b.disabled){ b.click(); c++; }
        await new Promise(r=>setTimeout(r,120));
      }
      return c;
    })()`);
    console.log("  实际点到:", n, "次");
    await sleep(1500);
    console.log("  点完按钮是否还在:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`));
    await shot("nudge-clicked.png");
  }

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
