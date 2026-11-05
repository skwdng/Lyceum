const PORT = process.argv[2] || 9516;
const MID = process.argv[3];

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
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0];
    return r.result?.value;
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2800);

  await ev(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'panel_ui',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return 'ok';})()`);
  await ev(`authRestore()`); await sleep(800);
  await ev(`(async()=>{ S.matchId='${MID}'; S.view='match'; await loadMatch(true); })()`);
  await sleep(1200);

  console.log("点评审团…");
  const t0 = Date.now();
  await ev(`runPanel()`);
  let ok = false;
  while (Date.now() - t0 < 120000) {
    const n = await ev(`(document.querySelector('#panelBody')||{}).innerText?.length || 0`);
    if (n > 150) { ok = true; break; }
    await sleep(1200);
  }
  console.log("耗时: " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒 · 有内容: " + ok);
  console.log("平均分: " + await ev(`(document.querySelector('#panelBody .big')||{}).innerText || '-'`));
  console.log("裁判行数: " + await ev(`document.querySelectorAll('#panelBody .dim').length`));
  console.log("共识问题数: " + await ev(`(document.querySelector('#panelBody')||{}).innerText?.match(/多位裁判都提到的问题/g)?.length || 0`));

  const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.mkdirSync("D:\\siyige\\demo\\shots-panel\\", { recursive: true });
  fs.writeFileSync("D:\\siyige\\demo\\shots-panel\\panel.png", Buffer.from(s.data, "base64"));
  console.log("shot -> panel.png");
  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
