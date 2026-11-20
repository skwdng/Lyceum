const PORT = process.argv[2] || 9800;
const OUT = 'D:\\siyige\\demo\\shots-fix-layout\\';

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
    if (r.exceptionDetails) return "EXC:" + JSON.stringify(r.exceptionDetails).slice(0, 80);
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("   shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'lay_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:1500})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:1500, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2500);

  // ── 布局检查：输入框是否贴底 ──
  const layout = await ev(`(()=>{
    const comp = document.querySelector('.composer');
    const chat = document.querySelector('.chat');
    if(!comp) return { err:'no composer' };
    const rc = comp.getBoundingClientRect(), rh = chat ? chat.getBoundingClientRect() : null;
    return {
      viewportH: innerHeight,
      composerTop: Math.round(rc.top), composerBottom: Math.round(rc.bottom),
      gapToBottom: Math.round(innerHeight - rc.bottom),
      chatHeight: rh ? Math.round(rh.height) : null,
      scrollable: chat ? chat.scrollHeight > chat.clientHeight : null
    };
  })()`);
  console.log("布局:", JSON.stringify(layout));
  await shot("layout.png");

  // ── 催一下：思考阶段按钮是否在 ──
  console.log("\n[催一下] 等 AI 思考阶段");
  let sawThinking = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const st = await ev(`(()=>{
      const btns=[...document.querySelectorAll('button')].map(b=>b.textContent.trim());
      const nudge = btns.find(t=>t.includes('催一下')||t.includes('直接显示全文'));
      return { nudge: nudge||'', thinking: (document.body.innerText||'').includes('对方正在思考'), typing: (document.body.innerText||'').includes('对方正在说话') };
    })()`);
    if (st.thinking || st.typing) { sawThinking = st; break; }
  }
  console.log("  状态:", JSON.stringify(sawThinking));

  // 点第一次催（思考阶段）
  if (sawThinking && sawThinking.nudge.includes('催')) {
    const t0 = Date.now();
    await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes('催一下')); if(b) b.click(); })()`);
    // 等出现"说话中"或新气泡
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      const st = await ev(`(()=>{
        const t=(document.body.innerText||'');
        const btns=[...document.querySelectorAll('button')].map(b=>b.textContent.trim());
        return { speaking: t.includes('对方正在说话'), nudge: btns.find(x=>x.includes('催一下')||x.includes('直接显示全文'))||'' };
      })()`);
      if (st.speaking) { console.log(`  催完 ${((Date.now()-t0)/1000).toFixed(1)} 秒后开始说话，按钮变成「${st.nudge}」`); break; }
    }
  }

  // 点第二次催（说话阶段）→ 应立刻显示全文
  const before = await ev(`(()=>{const b=document.querySelectorAll('.msg .bub'); const last=b[b.length-1]; return last?(last.textContent||'').length:0;})()`);
  const hasBtn2 = await ev(`[...document.querySelectorAll('button')].some(x=>x.textContent.trim().includes('直接显示全文'))`);
  if (hasBtn2) {
    await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes('直接显示全文')); if(b) b.click(); })()`);
    await sleep(300);
    const after = await ev(`(()=>{const b=document.querySelectorAll('.msg .bub'); const last=b[b.length-1]; return last?(last.textContent||'').length:0;})()`);
    console.log(`  说话中点催：文本 ${before} → ${after} 字（应立刻补齐）`);
  } else {
    console.log("  说话阶段没找到「直接显示全文」按钮");
  }
  await shot("after-nudge.png");

  // ── 节奏：连续两条 AI 发言的间隔 ──
  console.log("\n[节奏] 观察下一条 AI 发言出现的时间");
  const t1 = Date.now();
  const n0 = await ev(`document.querySelectorAll('.msg').length`);
  let n1 = n0;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    n1 = await ev(`document.querySelectorAll('.msg').length`);
    if (n1 > n0) break;
  }
  console.log(`  新增一条用时 ${((Date.now()-t1)/1000).toFixed(1)} 秒（改前是 10–15 秒）`);
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
