const PORT = process.argv[2] || 9640;
const OUT = 'D:\\siyige\\demo\\shots-run\\';

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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  console.log("[1] 首页跳转");
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(3000);
  console.log("  URL:", await ev(`location.href`));
  console.log("  标题:", await ev(`document.title`));

  console.log("\n[2] 注册并登录态");
  const acc = 'run_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return d.token?'ok':'fail';})()`);
  await send('Page.reload'); await sleep(2500);
  console.log("  账号:", acc, "· 侧栏有名字:", await ev(`(document.body.innerText||'').includes('${acc}')`));

  console.log("\n[3] 侧栏功能（含新管理台入口）");
  const navItems = await ev(`[...document.querySelectorAll('aside a, aside button, nav a')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,20)`);
  console.log("  " + JSON.stringify(navItems));

  console.log("\n[4] 离线对练页");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/offline" }); await sleep(2000);
  console.log("  标题:", await ev(`(document.querySelector('h1')||{}).textContent||'无'`));
  console.log("  有输入框:", await ev(`!!document.querySelector('textarea')`));

  console.log("\n[5] 管理台");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/admin" }); await sleep(2500);
  console.log("  标题:", await ev(`document.title`));
  console.log("  有登录框:", await ev(`document.querySelectorAll('input').length > 0`));
  await shot("admin-login.png");

  // 用 admin/admin123 登录（本机内存库种子里有）
  const filled = await ev(`(()=>{
    const inputs=[...document.querySelectorAll('input')];
    if(inputs.length<2) return 'inputs='+inputs.length;
    inputs[0].value='admin'; inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
    inputs[1].value='admin123'; inputs[1].dispatchEvent(new Event('input',{bubbles:true}));
    const btn=[...document.querySelectorAll('button')].find(b=>/登录|进入/.test(b.textContent));
    if(btn){ btn.click(); return 'clicked'; }
    return 'no-btn';
  })()`);
  console.log("  登录操作:", filled);
  await sleep(3000);
  console.log("  登录后正文:", (await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,140)`)));
  await shot("admin-dashboard.png");

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
