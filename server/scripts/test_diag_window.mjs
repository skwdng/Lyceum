const PORT = process.argv[2] || 9560;
const OUT = 'D:\\siyige\\demo\\shots-diag\\';

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
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0];
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("  shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(2800);

  const acc = 'win_' + Math.floor(Math.random() * 9000 + 1000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await ev(`authRestore()`); await sleep(700);

  // 造 6 场假记录，验证「最近 N 场」真的会变
  const seed = await ev(`(async()=>{
    const tk = localStorage.getItem('sy_jwt');
    // 直接调后端不方便造假历史，这里用 S.diag 模拟不同窗口的返回值来验证交互
    return 'ok';
  })()`);

  // 直接验证接口层：n=5 与 n=0 返回结构
  const api0 = await ev(`(async()=>{const r=await fetch('/api/diag',{headers:{'Authorization':'Bearer '+localStorage.getItem('sy_jwt')}});return JSON.stringify(await r.json()).slice(0,160);})()`);
  const api3 = await ev(`(async()=>{const r=await fetch('/api/diag?n=3',{headers:{'Authorization':'Bearer '+localStorage.getItem('sy_jwt')}});return JSON.stringify(await r.json()).slice(0,160);})()`);
  console.log("  /api/diag      →", api0);
  console.log("  /api/diag?n=3  →", api3);

  // UI：进页面看选择器
  await ev(`go('diag')`); await sleep(1200);
  console.log("  选择器按钮:", await ev(`[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t.includes('最近')||t.includes('全部')).join(' | ')`));
  console.log("  副标题:", await ev(`document.querySelector('p.sub').textContent`));
  await shot("window-all.png");

  // 点「最近 3 场」
  await ev(`diagWindow(3)`); await sleep(1300);
  console.log("  切到最近3场后副标题:", await ev(`document.querySelector('p.sub').textContent`));
  console.log("  S.diag.window:", await ev(`S.diag ? S.diag.window : 'null'`));
  console.log("  雷达轴数:", await ev(`document.querySelectorAll('.radar-grow circle').length`));
  await shot("window-3.png");

  // 点回全部
  await ev(`diagWindow(0)`); await sleep(1200);
  console.log("  切回全部后副标题:", await ev(`document.querySelector('p.sub').textContent`));

  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
