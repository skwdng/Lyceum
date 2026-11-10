const PORT = process.argv[2] || 9540;
const OUT = 'D:\\siyige\\demo\\shots-scroll\\';

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2800);

  const acc = 'scroll_' + Math.floor(Math.random() * 9000 + 1000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return d.token?'ok':'fail';})()`);
  await ev(`authRestore()`); await sleep(900);
  console.log("登录:", await ev(`S.user ? S.user.account : 'null'`));

  // 开一场快速对局（SPRINT）
  await ev(`(async()=>{ S.mode='SPRINT'; S.mySeats=['B2']; const r=await api('/api/matches',{method:'POST',body:{topicId:'t4',seats:['B2'],mode:'SPRINT'}}); S.matchId=r.matchId; S.turns=[]; S.view='match'; render(); startPoll(); await loadMatch(true); })()`);
  await sleep(1500);
  console.log("对局:", await ev(`S.matchId`), "· 视图:", await ev(`S.view`));

  // 等 AI 说第一句（进入打字状态）
  let waited = 0;
  while (waited < 60000) {
    const typing = await ev(`!!document.querySelector('.bub[data-key]:not([data-done])') || (S.typed && S.typed.size === 0)`);
    const n = await ev(`S.turns.length`);
    if (n >= 2) break;
    await sleep(1000); waited += 1000;
  }
  console.log("轮数:", await ev(`S.turns.length`), "· 等待", waited / 1000, "秒");

  // === 测试 1：打字过程中用户往上滚，位置是否被保住 ===
  console.log("\n[测试1] AI 打字过程中往上滚");
  await ev(`(()=>{const c=document.querySelector('#chat'); c.scrollTop = 0; c.dispatchEvent(new Event('wheel')); return c.scrollTop;})()`);
  await sleep(200);
  const t1 = await ev(`document.querySelector('#chat').scrollTop`);
  await sleep(1500);
  const t2 = await ev(`document.querySelector('#chat').scrollTop`);
  const stick = await ev(`S.stickBottom`);
  console.log("  滚到 0 后立刻:", t1, "· 1.5 秒后:", t2, "· stickBottom:", stick);
  console.log("  结论:", t2 <= 5 ? "✓ 没被拽回底部" : "✗ 被拽回去了");
  console.log("  滚动提示条:", await ev(`document.querySelector('#scrollTip') ? document.querySelector('#scrollTip').style.display : '无'`));

  // === 测试 2：切走再回来，对局是否还在 ===
  console.log("\n[测试2] 切到别的页面再回来");
  const beforeId = await ev(`S.matchId`);
  const beforeTurns = await ev(`S.turns.length`);
  await ev(`go('records')`); await sleep(800);
  console.log("  切走后 S.matchId:", await ev(`S.matchId`), "· 轮询:", await ev(`!!S.pollTimer`), "· SSE:", await ev(`!!S.es`));
  await ev(`go('match')`); await sleep(2500);
  const afterId = await ev(`S.matchId`);
  const afterTurns = await ev(`S.turns.length`);
  console.log("  回来后 S.matchId:", afterId, "· 轮数:", beforeTurns, "→", afterTurns, "· 轮询:", await ev(`!!S.pollTimer`));
  console.log("  结论:", (afterId === beforeId && afterTurns >= beforeTurns) ? "✓ 对局还在且能继续" : "✗ 对局丢了");

  // === 测试 3：回到单人页有「继续这一场」===
  console.log("\n[测试3] 单人页是否提示继续");
  await ev(`go('solo')`); await sleep(900);
  console.log("  solo 页有继续按钮:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续这一场'))`));
  await shot("resume.png");
  await ev(`go('match')`); await sleep(1200);

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
