const PORT = process.argv[2] || 9766;
const OUT = 'D:\\siyige\\demo\\shots-flaw2\\';

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
  const acc = 'fl2_' + Math.floor(Math.random() * 900000 + 10000);
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

  // 等到第 2 条正在打字（typing），注入 flawOffer 针对它 → 卡片不该出现
  console.log("等第 2 条开始打字…");
  let typingStep = null;
  for (let i = 0; i < 80; i++) {
    await sleep(400);
    const d = await ev(`(()=>{
      const app=document.querySelector('#app');
      const st=app&&app.__vue_app__&&app.__vue_app__.config.globalProperties.$pinia.state.value.debate;
      if(!st) return null;
      const tv=(st.turnsView||[]);
      const t=tv.find(x=>x.typing);
      return t?{step:t.step,seat:t.seat,shown:t.shown,len:t.text.length,turns:(st.turns||[]).length}:null;
    })()`);
    if (d && d.step) { typingStep = d; break; }
  }
  if (!typingStep) { console.log("没等到打字状态"); ws.close(); process.exit(0); }
  console.log(`  正在打字：step=${typingStep.step} seat=${typingStep.seat} shown=${typingStep.shown}/${typingStep.len}`);

  await ev(`(()=>{
    const app=document.querySelector('#app');
    const pinia=app.__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.debate.flawOffer = { step: ${typingStep.step}, seat: '${typingStep.seat}', options: ['诉诸权威','以偏概全','循环论证'] };
  })()`);
  await sleep(500);
  const during = await ev(`(document.body.innerText||'').includes('你抓到了吗')`);
  console.log(`  打字中注入漏洞卡 → 卡片显示: ${during}（应为 false）`);

  // 等这条打完
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const typing = await ev(`(()=>{
      const app=document.querySelector('#app');
      const st=app.__vue_app__.config.globalProperties.$pinia.state.value.debate;
      return (st.turnsView||[]).some(x=>x.typing);
    })()`);
    if (!typing) break;
  }
  await sleep(600);
  const after = await ev(`(document.body.innerText||'').includes('你抓到了吗')`);
  const target = await ev(`(document.body.innerText||'').match(/[AB]\\d · (立论|驳立论|质询|自由辩|总结)/)`);
  console.log(`  打完后再看 → 卡片显示: ${after}（应为 true）· 目标标注: ${JSON.stringify(target)}`);
  await shot("flaw-after-typing.png");
  console.log(during === false && after === true ? "\n✓ 漏洞卡时机正确" : "\n⚠ 时机不对");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
