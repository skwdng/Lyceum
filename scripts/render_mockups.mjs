const PORT = process.argv[2] || 9780;
const OUT = 'D:\\siyige\\demo\\ui-mockups\\';
const pages = [
  ['a-paper.html', 'sheet-a-paper.png'],
  ['b-dark.html', 'sheet-b-dark.png'],
  ['c-editorial.html', 'sheet-c-editorial.png'],
  ['d-glass.html', 'sheet-d-glass.png'],
];

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
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((resolve) => pend.set(i, { resolve })); };

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  for (const [file, out] of pages) {
    await send("Page.navigate", { url: "file:///" + (OUT + file).replace(/\\/g, '/') });
    await sleep(1200);
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(OUT + out, Buffer.from(s.data, "base64"));
    console.log("  已生成", out);
  }
  ws.close();
  process.exit(0);
});
