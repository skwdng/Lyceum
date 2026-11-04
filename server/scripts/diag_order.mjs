const PORT = process.argv[2] || 9462;
import("node:fs").then(async fs => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getWs() {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
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
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === "Runtime.exceptionThrown") errs.push("EXC");
  };
  const send = (m, p = {}) => {
    const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p }));
    return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej }));
  };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC";
    return r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2500);

  await ev(`S.mode='FULL'; S.mySeats=['B2']; openSeatPanel('t4')`);
  await sleep(400);
  await ev(`startFromPanel()`);

  // 等到我发言
  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await ev(`!!S.waiting`)) break;
    await sleep(400);
  }
  console.log("轮到我，开始慢速打字（模拟真人 8 秒）");
  await ev(`(()=>{const e=document.querySelector('#inp'); e.value='我方认为内卷弊大于利，因为它把竞争成本转嫁给个体。';})()`);
  await sleep(3000);
  await ev(`onTyping()`);            // 触发续时（验证单人不应改截止时间）
  await sleep(5000);

  const before = await ev(`JSON.stringify([...document.querySelectorAll('.msg')].map(m=>{
     const b=m.querySelector('.bub'); const h=m.querySelector('.hd');
     return (h?h.textContent.trim().slice(0,14):'?') + '|' + (b?b.textContent.length:0);
  }))`);

  const submitAt = Date.now();
  await ev(`submitTurn()`);
  console.log("已提交，开始采样 DOM 变化");

  let sawNewAi = null, timeline = [];
  for (let i = 0; i < 260; i++) {
    const s = await ev(`JSON.stringify([...document.querySelectorAll('.msg')].map(m=>{
        const b=m.querySelector('.bub'); const h=m.querySelector('.hd');
        return (h?h.textContent.trim().slice(0,10):'?') + ':' + (b?b.textContent.length:0);
    }))`);
    const n = JSON.parse(s).length;
    timeline.push(n);
    const pre = JSON.parse(before).length;
    if (sawNewAi === null && n > pre) sawNewAi = (Date.now() - submitAt) / 1000;
    if (sawNewAi !== null && i > 40) break;
    await sleep(200);
  }
  console.log("提交后新 AI 气泡出现耗时: " + (sawNewAi === null ? "未出现" : sawNewAi + " 秒"));

  const after = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.msg')].map(m=>{
     const b=m.querySelector('.bub'); const h=m.querySelector('.hd');
     return { who:(h?h.textContent.trim().slice(0,12):'?'), len:(b?b.textContent.length:0) };
  }))`));
  console.log("\n== DOM 里气泡从上到下 ==");
  after.forEach((x, i) => console.log(`  ${i + 1}. ${x.who} · ${x.len} 字`));

  const turns = JSON.parse(await ev(`JSON.stringify((S.turns||[]).map(t=>({step:t.step,seat:t.seat,seg:t.seg})))`));
  console.log("\n== 数据库顺序 ==");
  turns.forEach(t => console.log(`  step=${t.step} ${t.seat} ${t.seg}`));

  console.log("\n异常:", JSON.stringify(errs));
  ws.close(); process.exit(0);
});
