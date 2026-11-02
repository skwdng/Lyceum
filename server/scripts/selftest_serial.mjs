const PORT = process.argv[2] || 9442;
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
    if (r.exceptionDetails) return "EXC";
    return r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2500);
  await ev(`S.mode='FULL'; S.mySeats=['A2']; S.pace='normal'; openSeatPanel('t4')`);
  await sleep(300);
  await ev(`startFromPanel()`);

  const t0 = Date.now();
  let maxTyping = 0, violations = 0, samples = 0, seenMsgMax = 0;
  while (Date.now() - t0 < 150000) {
    const d = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')];
      let typing=0;
      msgs.forEach(m=>{
        const b=m.querySelector('.bub');
        if(!b) return;
        const full=(b.dataset.full||'').length;
        const cur=b.textContent.length;
        if(full>0 && cur>0 && cur<full) typing++;
      });
      return JSON.stringify({msgs:msgs.length, typing:typing});
    })()`);
    if (typeof d === "string" && d.startsWith("{")) {
      const o = JSON.parse(d);
      samples++;
      if (o.typing > maxTyping) maxTyping = o.typing;
      if (o.typing >= 2) violations++;
      if (o.msgs > seenMsgMax) seenMsgMax = o.msgs;
      if (await ev(`!!S.waiting`)) {
        await ev(`(()=>{const e=document.querySelector('#inp'); if(e){e.value='我方判断：取消期末不是取消考核，而是把一次性终结性评价换成可追溯的过程性评价。判准两条：能否守住学术标准，能否让责任可追溯。'; submitTurn();}})()`);
        await sleep(300);
      }
    }
    await sleep(200);
  }
  console.log("采样:", samples, "| 消息数峰值:", seenMsgMax);
  console.log("同时'打到一半'的气泡峰值:", maxTyping, "（必须 ≤1）");
  console.log("出现 ≥2 条同时打字的采样:", violations);
  console.log("页面异常:", JSON.stringify(errs.slice(0, 2)));
  ws.close(); process.exit(0);
});
