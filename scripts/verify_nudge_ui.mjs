const PORT = process.argv[2] || 9660;
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
  const acc = 'ndg_' + Math.floor(Math.random() * 90000 + 10000);
  const mid = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    const r2 = await fetch('/api/matches', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({topicId:'t4', seats:['B2'], mode:'SPRINT', tier:'PRO'})});
    const m = await r2.json();
    return m.matchId;
  })()`);
  console.log("对局:", mid);

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/match?match=" + mid });
  await send('Page.reload'); await sleep(3000);

  // 等到「对方正在思考…」并出现催一下按钮
  let sawBtn = false;
  for (let i = 0; i < 8; i++) {
    const has = await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='催一下')`);
    if (has) { sawBtn = true; break; }
    await sleep(1500);
  }
  console.log("  AI 思考时出现「催一下」:", sawBtn);

  // 连点 5 次（模拟恶意连点）
  const clicks = await ev(`(async()=>{
    const get = () => [...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('催'));
    let n = 0;
    for (let i=0;i<5;i++){
      const b = get();
      if (!b || b.disabled) { await new Promise(r=>setTimeout(r,150)); continue; }
      b.click(); n++;
      await new Promise(r=>setTimeout(r,150));
    }
    return n;
  })()`);
  console.log("  实际点到按钮次数:", clicks);
  await sleep(1500);
  console.log("  按钮是否还在:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`));
  console.log("  提示信息:", await ev(`(document.querySelector('.toast, [class*=toast]')||{}).innerText || '（无）'`));
  await shot("nudge-after.png");

  // 等 AI 开始说话（进入打字），确认按钮不再出现
  let typingSeen = false, btnDuringTyping = false;
  for (let i = 0; i < 14; i++) {
    await sleep(1000);
    const typing = await ev(`!!document.querySelector('.pending') || (document.querySelectorAll('.msg').length>0 && [...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催')))`);
    const hasBtn = await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`);
    if (hasBtn) { btnDuringTyping = true; }
    if (await ev(`!!document.querySelector('.pending')`)) { typingSeen = true; break; }
  }
  console.log("\n  打字期间还出现催按钮:", btnDuringTyping);
  await shot("nudge-typing.png");
  console.log("  异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
