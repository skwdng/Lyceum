const PORT = process.argv[2] || 9504;
const MID = process.argv[3];
const OUT = 'D:\\siyige\\demo\\shots-panel\\';
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
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") errs.push(((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || "").split("\n")[0]);
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0]; return r.result?.value; };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2800);

  console.log("登录:", await ev(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'panel_ui',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return 'ok';})()`));

  // 载入已完成的对局并进复盘
  console.log("载入对局:", await ev(`(async()=>{ S.matchId='${MID}'; await loadMatch(true); go('review'); return S.view + '/' + (S.review?'has-review':'no-review'); })()`));
  await sleep(1200);
  console.log("评审团按钮:", await ev(`!!document.querySelector('#panelBtnBox button')`));
  await ev(`runPanel()`);

  let t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const n = await ev(`(document.querySelector('#panelBody')||{}).innerText?.length || 0`);
    if (n > 120) break;
    await sleep(1200);
  }
  console.log("面板内容长度:", await ev(`(document.querySelector('#panelBody')||{}).innerText?.length || 0`));
  console.log("平均分显示:", await ev(`(document.querySelector('#panelBody .big')||{}).innerText || '-'`));
  await shot("panel.png");
  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
