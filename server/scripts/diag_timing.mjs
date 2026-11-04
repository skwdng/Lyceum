const PORT = process.argv[2] || 9466;
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
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
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

  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await ev(`!!S.waiting`)) break;
    await sleep(300);
  }
  // 等所有已有 AI 发言打完（模拟真人看清楚再说话）
  t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if ((await ev(`document.querySelectorAll('.bub[data-key]').length`)) === 0) break;
    await sleep(300);
  }
  console.log("已读完全部历史，当前轮到我：step=" + await ev(`S.match.step`));

  await ev(`(()=>{const e=document.querySelector('#inp'); e.value='我方认为内卷弊大于利，它把竞争成本转嫁给个体，收益却不可持续。';})()`);
  await sleep(1500);
  const turnsBefore = await ev(`S.turns.filter(t=>!S.mySeats.includes(t.seat)).length`);
  const submitAt = Date.now();
  await ev(`submitTurn()`);

  // 检测「数据里新增一条 AI 发言」的耗时（真·接话时间）
  let aiAt = null;
  for (let i = 0; i < 300; i++) {
    const n = await ev(`S.turns.filter(t=>!S.mySeats.includes(t.seat)).length`);
    if (n > turnsBefore) { aiAt = (Date.now() - submitAt) / 1000; break; }
    await sleep(200);
  }
  console.log("AI 真正接话耗时: " + (aiAt === null ? "超时未接" : aiAt.toFixed(1) + " 秒"));

  // 等它打完，看顺序
  await sleep(9000);
  const rows = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.msg')].map(m=>{
     const b=m.querySelector('.bub'); const h=m.querySelector('.hd');
     return { who:(h?h.textContent.trim().slice(0,12):'?'), len:(b?b.textContent.length:0) };
  }))`));
  console.log("\n== 界面从上到下 ==");
  rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.who} · ${r.len} 字`));
  const turns = JSON.parse(await ev(`JSON.stringify((S.turns||[]).map(t=>({step:t.step,seat:t.seat})))`));
  console.log("\n== 发言顺序 ==");
  turns.forEach(t => console.log(`  step=${t.step} ${t.seat}`));
  const orderOk = rows.length === turns.length;
  console.log("\n界面条数 = 发言条数: " + (orderOk ? "✓" : `✗ 界面 ${rows.length} / 数据 ${turns.length}`));
  ws.close(); process.exit(0);
});
