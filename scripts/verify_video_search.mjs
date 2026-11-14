const PORT = process.argv[2] || 9650;
const OUT = 'D:\\siyige\\demo\\shots-video\\';

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

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);
  const acc = 'vid_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await send('Page.reload'); await sleep(2000);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/video" }); await sleep(3000);

  console.log("[1] 顶部区域");
  console.log("  还有「条在架」:", await ev(`(document.body.innerText||'').includes('条在架')`));
  console.log("  还有分类词（立论/名场面）:", await ev(`/全部|名场面/.test((document.querySelector('.vtop,.vwrap')||document.body).innerText||'')`));
  console.log("  有搜索框:", await ev(`!!document.querySelector('.vsearch-input')`));
  console.log("  搜索框 placeholder:", await ev(`(document.querySelector('.vsearch-input')||{}).placeholder || '无'`));
  await shot("video-page.png");

  console.log("\n[2] 搜索「期末」");
  const typed = await ev(`(()=>{
    const i=document.querySelector('.vsearch-input');
    if(!i) return 'no-input';
    i.value='期末';
    i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    return 'enter';
  })()`);
  console.log("  操作:", typed);
  await sleep(2000);
  console.log("  结果条数:", await ev(`document.querySelectorAll('.vslide').length`));
  console.log("  有清除按钮:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('清除'))`));
  await shot("video-search.png");

  console.log("\n[3] 搜索无结果");
  await ev(`(()=>{const i=document.querySelector('.vsearch-input'); i.value='zzzznotfound'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
  await sleep(1800);
  console.log("  空状态文案:", await ev(`(document.querySelector('.vempty')||{}).textContent || '无'`));

  console.log("\n[4] 清除 → 回到信息流");
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('清除')); if(b) b.click();})()`);
  await sleep(2000);
  console.log("  条数:", await ev(`document.querySelectorAll('.vslide').length`));
  await shot("video-cleared.png");

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
