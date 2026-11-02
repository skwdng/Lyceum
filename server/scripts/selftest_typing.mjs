const PORT = process.argv[2] || 9430;
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
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errs.push((d.exception && d.exception.description) || d.text);
    }
  };
  const send = (method, params = {}) => {
    const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej }));
  };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "");
    return r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2500);

  await ev(`S.mode='FULL'; S.mySeats=['A2']; S.pace='normal'; openSeatPanel('t4')`);
  await sleep(300);
  await ev(`startFromPanel()`);

  // 等 A1 说完（第一手 AI），再观察第二条 AI（B1）出现前的时间
  console.log("等待第一条 AI 发言…");
  let t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    if (await ev(`S.turns.length >= 1`)) break;
    await sleep(200);
  }
  // 记录气泡长度变化，检测"突然弹全"
  const samples = [];
  let lastLen = {}, maxJump = 0, jumpInfo = "";
  t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const d = await ev(`(()=>{
      const out=[];
      document.querySelectorAll('.bub[data-key]').forEach(b=>out.push(b.textContent.length + '/' + (b.dataset.full||'').length));
      return JSON.stringify({bubbles:out, turns:S.turns.length, waiting:!!S.waiting, typing:!!S.typingTimer});
    })()`);
    if (typeof d === "string" && d.startsWith("{")) {
      const o = JSON.parse(d);
      o.bubbles.forEach((s, i) => {
        const [cur, full] = s.split('/').map(Number);
        if (lastLen[i] != null && cur - lastLen[i] > maxJump && cur < full) { maxJump = cur - lastLen[i]; jumpInfo = `${lastLen[i]}→${cur}/${full}`; }
        if (lastLen[i] != null && cur === full && lastLen[i] < full - 30) { maxJump = Math.max(maxJump, full - lastLen[i]); jumpInfo = `${lastLen[i]}→${cur}/${full}（一次补全）`; }
        lastLen[i] = cur;
      });
      samples.push(o);
      if (o.waiting) {
        await ev(`(()=>{const e=document.querySelector('#inp'); if(e){e.value='我方判断：取消期末不是取消考核，而是把一次性终结性评价换成可追溯的过程性评价。判准两条：能否守住学业标准，能否让责任可追溯。第一，评分摊到多次任务；第二，每次任务留痕，学生可申诉。'; submitTurn();}})()`);
        await sleep(400);
      }
    }
    await sleep(180);
  }
  console.log("采样:", samples.length, "| 单次最大跳变:", maxJump, "字", jumpInfo ? "(" + jumpInfo + ")" : "");
  console.log("页面异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
