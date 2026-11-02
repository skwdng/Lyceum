const PORT = process.argv[2] || 9434;
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
  const send = (method, params = {}) => {
    const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej }));
  };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC";
    return r.result?.value;
  };
  // 只截可视区域（fixed 元素位置才真实）
  const shotView = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync('D:\\siyige\\demo\\shots-mobile\\' + name, Buffer.from(s.data, "base64"));
    console.log("shot ->", name);
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2500);
  await shotView("v1-lobby.png");

  await ev(`openSeatPanel('t4')`); await sleep(500);
  await shotView("v2-seat.png");
  await ev(`S.mySeats=['A2']; closeSeat(); startFromPanel()`); await sleep(4000);
  await shotView("v3-match.png");

  // 等 AI 打完第一段，再看聊天区
  let t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    if (await ev(`S.turns.length >= 1 && !document.querySelector('.bub[data-key]')`)) break;
    await sleep(500);
  }
  await shotView("v4-chat.png");
  ws.close(); process.exit(0);
});
