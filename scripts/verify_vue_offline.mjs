const PORT = process.argv[2] || 9620;
const OUT = 'D:\\siyige\\demo\\shots-vue\\';

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
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(3500);

  console.log("[0] 入口跳转");
  console.log("  当前 URL:", await ev(`location.href`));

  const acc = 'vue_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return d.token?'ok':'fail';})()`);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/me" }); await sleep(2500);

  console.log("\n[1] 导航里有没有「离线对练」");
  const nav = await ev(`[...document.querySelectorAll('a,button,div')].map(e=>e.textContent.trim()).filter(t=>t==='离线对练').length`);
  console.log("  匹配元素数:", nav);

  console.log("\n[2] 进离线对练页");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/offline" }); await sleep(2000);
  console.log("  标题:", await ev(`(document.querySelector('h1')||{}).textContent || '无'`));
  console.log("  有输入框:", await ev(`!!document.querySelector('textarea')`));
  await shot("offline-empty.png");

  // 写一段立论并提交
  const typed = await ev(`(()=>{const t=document.querySelector('textarea'); if(!t) return 'no-ta'; t.value='我方认为应当取消期末考试，因为一次闭卷只测记忆；改成过程性评价更能反映学习，虽然会增加教师工作量，但可以靠标准化的评分细则约束。'; t.dispatchEvent(new Event('input',{bubbles:true})); return t.value.length;})()`);
  console.log("  输入字数:", typed);
  await sleep(500);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发言并看反馈')); if(b) b.click(); return !!b;})()`);
  await sleep(1200);
  const coach = await ev(`(()=>{const el=[...document.querySelectorAll('b')].find(b=>b.textContent.includes('教练提示')); return el? el.parentElement.innerText.replace(/\\n/g,' | ').slice(0,150):'无';})()`);
  console.log("  教练提示:", coach);
  console.log("  有对手回应:", await ev(`(document.body.innerText||'').includes('对手（模板）')`));
  console.log("  进度:", await ev(`(document.body.innerText||'').match(/进度 \\d+ \\/ \\d+/)?.[0] || '无'`));
  await shot("offline-after.png");

  console.log("\n[3] 单人页有没有离线按钮");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  console.log("  离线对练按钮:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('离线对练'))`));
  await shot("solo.png");

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
