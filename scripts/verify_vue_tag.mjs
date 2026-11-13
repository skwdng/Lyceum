const PORT = process.argv[2] || 9632;
const OUT = 'D:\\siyige\\demo\\shots-vue\\';

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

  const acc = 'mv_' + Math.floor(Math.random() * 90000 + 10000);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);

  // 注册 + 直接开局（API），再用 ?match= 进入对局页（MatchView 支持 route.query.match）
  const mid = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    const r2 = await fetch('/api/matches', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({topicId:'t4', seats:['B2'], mode:'SPRINT', tier:'PRO'})});
    const m = await r2.json();
    return m.matchId || ('fail:'+JSON.stringify(m));
  })()`);
  console.log("开局:", mid);

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/match?match=" + mid });
  await send('Page.reload'); await sleep(3000);
  console.log("  hash:", await ev(`location.hash`));

  let sawTag = false, n = 0;
  for (let i = 0; i < 12; i++) {
    await sleep(4000);
    n = await ev(`document.querySelectorAll('.msg').length`);
    if (await ev(`(document.body.innerText||'').includes('离线草稿')`)) { sawTag = true; break; }
    if (!mid.startsWith('fail') && n === 0 && i === 5) await shot("match-debug.png");
  }
  console.log("  消息条数:", n, "· 出现「离线草稿」标签:", sawTag);
  console.log("  正文片段:", (await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,180)`)));
  await shot("match-template-final.png");
  console.log("  异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
