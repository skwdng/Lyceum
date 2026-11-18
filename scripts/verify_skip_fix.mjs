const PORT = process.argv[2] || 9750;
const OUT = 'D:\\siyige\\demo\\shots-skip\\';

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
  const acc = 'skip_' + Math.floor(Math.random() * 900000 + 10000);
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
  await sleep(1500);

  // 每次采样记录：气泡的 y 坐标 + 文本长度，用来判断"有没有跳位置 / 有没有一次性补齐"
  const sample = async () => ev(`(()=>{
    const msgs=[...document.querySelectorAll('.msg')];
    return msgs.map(m=>{
      const r=m.getBoundingClientRect();
      const b=m.querySelector('.bub');
      const t=m.textContent||'';
      return { y: Math.round(r.top), h: Math.round(r.height), len: b?(b.textContent||'').length:0,
               seat: (t.match(/[AB]\\d/)||['?'])[0], stream: t.includes('生成中') };
    });
  })()`);

  console.log("等第一个 AI 说完，然后点催一下，看位置和文本");
  // 等到出现"催一下"按钮（对方思考中）
  let clicked = false, beforeClick = [], frames = [];
  for (let i = 0; i < 60; i++) {
    await sleep(700);
    const snap = await sample();
    const hasNudge = await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`);
    const last = snap[snap.length - 1];
    frames.push({ t: (i * 0.7).toFixed(1), n: snap.length, lastY: last ? last.y : -1, lastLen: last ? last.len : 0, stream: last ? last.stream : false });
    if (hasNudge && !clicked && snap.length >= 1) {
      beforeClick = snap;
      await shot("before-skip.png");
      await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催')); if(b) b.click(); })()`);
      clicked = true;
      console.log("  已点催一下（当前气泡 " + snap.length + " 条，最后一条 y=" + (last ? last.y : '?') + " len=" + (last ? last.len : '?') + "）");
      await sleep(400);
      const after = await sample();
      await shot("after-skip.png");
      const jump = last && after[after.length - 1] ? (after[after.length - 1].y - last.y) : 0;
      console.log("  点完 0.4 秒：气泡 " + after.length + " 条，最后一条 y=" + (after[after.length - 1] ? after[after.length - 1].y : '?')
        + " len=" + (after[after.length - 1] ? after[after.length - 1].len : '?') + " · y 变化 " + jump + "px");
      break;
    }
  }
  // 点完之后连续 12 秒观察：位置是否稳定、长度是否匀速增长
  console.log("\n点催之后的位置/长度变化：");
  let prevY = null, prevLen = null, jumps = 0, bigJumps = 0;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    const snap = await sample();
    const last = snap[snap.length - 1];
    if (!last) continue;
    if (prevY !== null && Math.abs(last.y - prevY) > 40) { jumps++; if (Math.abs(last.y - prevY) > 120) bigJumps++; }
    const grow = prevLen === null ? 0 : last.len - prevLen;
    if (i % 3 === 0 || grow > 60) {
      console.log(`   ${(i * 0.4 + 0.4).toFixed(1)}s  条数=${snap.length} y=${last.y} len=${last.len} 增长=${grow} 流式=${last.stream}`);
    }
    prevY = last.y; prevLen = last.len;
  }
  console.log(`\n位置跳变（>40px）: ${jumps} 次 · 大跳（>120px）: ${bigJumps} 次`);
  await shot("after-12s.png");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
