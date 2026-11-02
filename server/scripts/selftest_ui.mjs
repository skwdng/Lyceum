const PORT = process.argv[2] || 9400;
const OUT = 'D:\\siyige\\demo\\shots-fullstack\\';
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
  const shot = async n => {
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64"));
    console.log("shot ->", n);
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2200);

  await ev(`S.mode='FULL'; S.mySeats=['A2']; S.pace='normal'; S.difficulty='pro'; openSeatPanel('t4')`);
  await sleep(300);
  await ev(`startFromPanel()`);

  const samples = [];
  let maxEmpty = 0, emptySeen = 0, shotDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 260000) {
    const d = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')];
      const empty=msgs.filter(m=>{const b=m.querySelector('.bub'); return b && b.textContent.trim().length===0;}).length;
      const typing=b=>0;
      return JSON.stringify({n:msgs.length, empty:empty, turns:(S.turns||[]).length, waiting:!!S.waiting, view:S.view, typing:!!S.typingTimer});
    })()`);
    if (typeof d === "string" && d.startsWith("{")) {
      const o = JSON.parse(d);
      samples.push(o);
      if (o.empty > maxEmpty) maxEmpty = o.empty;
      if (o.empty > 0) emptySeen++;
      if (!shotDone && o.n >= 4) { await shot("98-typing-live.png"); shotDone = true; }
      if (o.view === "review") break;
    }
    const waiting = await ev(`!!S.waiting`);
    if (waiting) {
      await ev(`(()=>{const e=document.querySelector('#inp'); if(e){e.value='我方判断：取消期末不是取消考核，而是把一次性终结性评价换成可追溯的过程性评价。判准两条：能否守住学业标准，能否让责任可追溯。第一，评分摊到多次任务，单次失误不再决定结果；第二，每次任务留痕，学生可申诉。所以取消期末不降低标准，反而让标准更可检验。'; submitTurn();}})()`);
      await sleep(500);
    }
    await sleep(280);
  }

  const last = samples[samples.length - 1] || {};
  console.log("采样次数:", samples.length, "| 最大空壳数:", maxEmpty, "| 出现过空壳的采样:", emptySeen);
  console.log("最后状态:", JSON.stringify(last));
  console.log("页面异常:", JSON.stringify(errs.slice(0, 3)));

  // 滚动测试
  const canScroll = await ev(`(()=>{const c=document.querySelector('#chat'); return c? c.scrollHeight>c.clientHeight : false})()`);
  if (canScroll) {
    await ev(`(()=>{const c=document.querySelector('#chat'); c.scrollTop=0; c.dispatchEvent(new Event('scroll'));})()`);
    await sleep(400);
    console.log("上翻后 stickBottom:", await ev(`S.stickBottom`), "| 按钮:", await ev(`(()=>{const t=document.querySelector('#scrollTip');return t?getComputedStyle(t).display!=='none':false})()`));
  } else {
    console.log("内容不足，未触发滚动测试");
  }
  ws.close(); process.exit(0);
});
