const PORT = process.argv[2] || 9712;
const OUT = 'D:\\siyige\\demo\\shots-run2\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("     shot -> " + n); };
  const go = async (hash, wait = 2300) => { await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#" + hash }); await sleep(wait); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  await go("/login", 2500);
  const acc = 'run2_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2400);
  console.log("账号:", acc);

  // 开一局
  await go("/solo", 2100);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);

  // 采样：流式出现 → 消失 → 落库后文本是否完整（关键：不再"退回去重打"）
  const t0 = Date.now();
  let sawStream = null, streamGoneAt = null, finalLens = [], lastStreamLen = 0;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    const st = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')];
      const streaming = msgs.filter(m=>(m.textContent||'').includes('生成中'));
      const bubbles = msgs.map(m=>{ const b=m.querySelector('.bub'); return { streaming:(m.textContent||'').includes('生成中'), len: b?(b.textContent||'').length:0 }; });
      return { streamingCount: streaming.length, bubbles };
    })()`);
    if (st.streamingCount > 0) {
      if (sawStream === null) sawStream = (Date.now() - t0) / 1000;
      lastStreamLen = Math.max(...st.bubbles.filter(b => b.streaming).map(b => b.len));
    } else if (sawStream !== null && streamGoneAt === null) {
      streamGoneAt = (Date.now() - t0) / 1000;
    }
    finalLens = st.bubbles.map(b => b.len);
    if (streamGoneAt && st.bubbles.length >= 1) {
      // 落库后再观察 3 秒，确认文本长度没"缩回去"
      if (i > 8) break;
    }
  }
  const after = await ev(`(()=>{
    const msgs=[...document.querySelectorAll('.msg')];
    return { count: msgs.length, lens: msgs.map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;}), streaming: msgs.filter(m=>(m.textContent||'').includes('生成中')).length };
  })()`);
  console.log("流式出现:", sawStream !== null ? sawStream.toFixed(1) + " 秒" : "未出现", "· 最长", lastStreamLen, "字");
  console.log("流式气泡消失:", streamGoneAt !== null ? streamGoneAt.toFixed(1) + " 秒" : "未消失 ← 有问题");
  console.log("落库后气泡数:", after.count, "· 各条长度:", JSON.stringify(after.lens), "· 仍标生成中:", after.streaming);
  await shot("stream-settled.png");

  // 等 4 秒再看一次：确认没有"重打字"
  await sleep(4000);
  const later = await ev(`(()=>{
    const msgs=[...document.querySelectorAll('.msg')];
    return { lens: msgs.map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;}), streaming: msgs.filter(m=>(m.textContent||'').includes('生成中')).length };
  })()`);
  console.log("4 秒后各条长度:", JSON.stringify(later.lens), "· 仍标生成中:", later.streaming);
  console.log("判断: 文本有没有缩水/重打 →", JSON.stringify(after.lens) === JSON.stringify(later.lens) ? "没有，稳定 ✓" : "有变化 ← 还在打字");
  await shot("stream-stable.png");
  console.log("页面异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
