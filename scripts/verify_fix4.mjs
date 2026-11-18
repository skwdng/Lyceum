const PORT = process.argv[2] || 9722;
const OUT = 'D:\\siyige\\demo\\shots-fix4\\';

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
  const state = async () => ev(`(()=>{
    const msgs=[...document.querySelectorAll('.msg')].map(m=>{
      const b=m.querySelector('.bub');
      const t=m.textContent||'';
      return { seg:(t.match(/(立论|驳立论|质询|自由辩|总结)/)||[])[1]||'?',
               who:(t.match(/AI 辩手|你/)||[])[0]||'?',
               len:b?(b.textContent||'').length:0, streaming:t.includes('生成中') };
    });
    return { n: msgs.length, msgs, body:(document.body.innerText||'') };
  })()`);

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await go("/login", 2400);
  const acc = 'fx4_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:900})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:900, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  console.log("账号:", acc);

  await go("/solo", 2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);

  // 等到出现 2 条（A1 说完、B1 在说）——这一刻最容易暴露"中间那条被吞"
  console.log("\n[观察 1] 等到第 2 条出现，检查 A1/B1 都在");
  let s = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    s = await state();
    if (s.n >= 2) break;
  }
  console.log("  气泡数:", s.n);
  s.msgs.forEach((m, k) => console.log(`     #${k + 1} ${m.who}/${m.seg} len=${m.len} 流式中=${m.streaming}`));
  await shot("two-turns.png");

  // 打字速度：连续采样最长那条的长度增长
  console.log("\n[观察 2] 打字速度（每 500ms 采一次）");
  const speeds = [];
  for (let i = 0; i < 26; i++) {
    await sleep(500);
    const cur = await state();
    const lens = cur.msgs.map(m => m.len);
    speeds.push(((i + 1) * 0.5).toFixed(1) + "s:[" + lens.join(',') + "]");
    if (/复盘/.test(cur.body)) break;
  }
  console.log("  " + speeds.join("  "));
  await shot("paced.png");

  // 刷新页面：数据是否保留
  console.log("\n[观察 3] 刷新页面后数据是否还在");
  const beforeReload = await state();
  await send("Page.reload"); await sleep(3000);
  const afterReload = await state();
  console.log("  刷新前气泡:", beforeReload.n, "· 刷新后气泡:", afterReload.n);
  console.log("  刷新后环节:", afterReload.msgs.map(m => m.seg).join(' → '));
  console.log("  数据保留:", afterReload.n >= beforeReload.n - 1 ? "是 ✓" : "否 ← 丢了");
  await shot("after-reload.png");
  console.log("\n页面异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
