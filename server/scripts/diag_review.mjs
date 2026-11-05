const PORT = process.argv[2] || 9512;
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
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]);
    }
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
  const shot = async n => {
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.mkdirSync("D:\\siyige\\demo\\shots-panel\\", { recursive: true });
    fs.writeFileSync("D:\\siyige\\demo\\shots-panel\\" + n, Buffer.from(s.data, "base64"));
    console.log("shot ->", n);
  };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2800);

  const login = `(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'panel_ui',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return 'ok';})()`;
  console.log("登录:", await ev(login));
  await ev(`authRestore()`);
  await sleep(800);

  const load = `(async()=>{ S.matchId='${MID}'; S.view='match'; await loadMatch(true); return S.view; })()`;
  console.log("进复盘:", await ev(load));
  await sleep(1500);

  console.log("页面文本前 80 字:", JSON.stringify(await ev(`(document.querySelector('#main').innerText||'').slice(0,80)`)));
  console.log("含「AI 评审团」:", await ev(`(document.querySelector('#main').innerText||'').includes('评审团')`));
  console.log("panelBtnBox 存在:", await ev(`!!document.querySelector('#panelBtnBox')`));
  console.log("按钮 onclick:", await ev(`[...document.querySelectorAll('button')].map(b=>b.getAttribute('onclick')).filter(Boolean).join(' | ')`));
  console.log("viewReview 类型:", await ev(`typeof viewReview`));
  console.log("runPanel 类型:", await ev(`typeof runPanel`));
  console.log("JS 异常:", JSON.stringify(errs.slice(0, 4)));

  await shot("review-page.png");
  ws.close(); process.exit(0);
});
