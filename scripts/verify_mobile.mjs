const PORT = process.argv[2] || 9680;
const OUT = 'D:\\siyige\\demo\\shots-mobile\\';

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
  // iPhone 12 尺寸 + 触屏
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    screenWidth: 390, screenHeight: 844
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);
  const acc = 'mb_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2500);

  console.log("[1] 侧栏是否收起 / 底部 tab 是否出现");
  console.log("  视口:", await ev(`innerWidth + 'x' + innerHeight`));
  console.log("  侧栏 display:", await ev(`getComputedStyle(document.querySelector('.sb')).display`));
  console.log("  底部 tab display:", await ev(`(()=>{const t=document.querySelector('.tabbar'); return t?getComputedStyle(t).display:'无';})()`));
  console.log("  tab 项:", await ev(`[...document.querySelectorAll('.tabbar a')].map(a=>a.textContent.trim()).join(' / ')`));
  await shot("mobile-login.png");

  console.log("\n[2] 单人辩论页");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await shot("mobile-solo.png");
  console.log("  有横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));

  console.log("\n[3] 开一局看对局页");
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(5000);
  await shot("mobile-match.png");
  console.log("  有横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));
  console.log("  输入框字号:", await ev(`(()=>{const t=document.querySelector('textarea'); return t?getComputedStyle(t).fontSize:'无';})()`));

  console.log("\n[4] 视频页");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/video" }); await sleep(2500);
  await shot("mobile-video.png");
  console.log("  有横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));
  console.log("  搜索框存在:", await ev(`!!document.querySelector('.vsearch-input')`));

  console.log("\n[5] 能力分析");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/diag" }); await sleep(2000);
  await shot("mobile-diag.png");
  console.log("  有横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
