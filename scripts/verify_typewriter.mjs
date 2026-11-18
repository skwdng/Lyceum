const PORT = process.argv[2] || 9760;
const OUT = 'D:\\siyige\\demo\\shots-typewriter\\';

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
  const acc = 'tw_' + Math.floor(Math.random() * 900000 + 10000);
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

  // 观察 60 秒：每 500ms 记录每条气泡长度 + 漏洞卡是否出现 + 是否有"一次性跳很多字"
  console.log("时间   条数  各条长度                       漏洞卡  单步最大跳字");
  let prevLens = [], maxJump = 0, flawEarly = 0, flawShown = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await sleep(500);
    const s = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')];
      const lens=msgs.map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;});
      const flaw=[...document.querySelectorAll('.tag')].some(x=>(x.textContent||'').includes('抓对')) || (document.body.innerText||'').includes('你抓到了吗');
      const typing = msgs.some(m=>(m.textContent||'').includes('…'));
      const step = (document.body.innerText||'').match(/第 (\\d+) 步/);
      return { lens, flaw, step: step?step[1]:'?', n: msgs.length };
    })()`);
    if (typeof s === 'string') break;
    // 单条的最大跳字量（判断有没有"突然弹出"）
    for (let i = 0; i < Math.max(s.lens.length, prevLens.length); i++) {
      const a = prevLens[i] || 0, b = s.lens[i] || 0;
      if (b - a > 40) maxJump = Math.max(maxJump, b - a);
    }
    if (s.flaw) flawShown++;
    // 漏洞卡出现时，检查最后一条是否还在打字（不该在打字中出现）
    if (s.flaw && s.lens.length && prevLens.length === s.lens.length && s.lens[s.lens.length - 1] > (prevLens[prevLens.length - 1] || 0)) flawEarly++;
    console.log(`${((Date.now()-t0)/1000).toFixed(1)}s  ${String(s.n).padStart(2)}    ${JSON.stringify(s.lens).padEnd(30)} ${s.flaw ? '有' : '无'}      ${maxJump}`);
    prevLens = s.lens;
    if (s.n >= 4) break;
  }
  await shot("typing.png");
  console.log(`\n单步最大跳字: ${maxJump}（40 以下正常，几百说明又"突然弹出"）`);
  console.log(`漏洞卡出现时长: ${flawShown * 0.5}s · 打字中误弹: ${flawEarly} 次`);
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
