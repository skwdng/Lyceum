const PORT = process.argv[2] || 9432;
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
  const shot = async (name, w, h) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync('D:\\siyige\\demo\\shots-mobile\\' + name, Buffer.from(s.data, "base64"));
    console.log("shot ->", name);
  };

  fs.mkdirSync('D:\\siyige\\demo\\shots-mobile', { recursive: true });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2500);

  // 手机竖屏 390x844
  await shot("m1-lobby.png", 390, 844);

  await ev(`openSeatPanel('t4')`); await sleep(500);
  await shot("m2-seat.png", 390, 844);
  await ev(`S.mySeats=['A2']; closeSeat(); startFromPanel()`); await sleep(3000);
  await shot("m3-match.png", 390, 844);

  // 串行打字验证：观察是否只有一条气泡在增长
  let samples = [], t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const d = await ev(`(()=>{
      const out=[];
      document.querySelectorAll('.bub[data-key]').forEach(b=>out.push(b.textContent.length));
      return JSON.stringify({lens:out, turns:(S.turns||[]).length});
    })()`);
    if (typeof d === "string" && d.startsWith("{")) samples.push(JSON.parse(d));
    const waiting = await ev(`!!S.waiting`);
    if (waiting) {
      await ev(`(()=>{const e=document.querySelector('#inp'); if(e){e.value='我方判断：取消期末不是取消考核。判准两条：能否守住学术标准，能否让责任可追溯。'; submitTurn();}})()`);
      await sleep(300);
    }
    await sleep(400);
  }
  // 计算有多少采样里同时有 ≥2 条气泡在增长
  let overlap = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].lens, b = samples[i].lens;
    let growing = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (b[k] > a[k]) growing++;
    if (growing >= 2) overlap++;
  }
  console.log("采样:", samples.length, "| 两条同时增长的采样数:", overlap, "（应为 0）");
  await ev(`(()=>{const c=document.querySelector('#chat'); if(c) c.scrollTop=0;})()`);
  await shot("m4-match-2.png", 390, 844);
  console.log("页面异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
