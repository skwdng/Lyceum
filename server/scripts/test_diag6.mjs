const PORT = process.argv[2] || 9550;
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

  // 直接用假数据渲染，测动画本身（不需要真打一场）
  const acc = 'diag_' + Math.floor(Math.random() * 9000 + 1000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await ev(`authRestore()`); await sleep(800);

  // 注入六维数据后进页面
  await ev(`(()=>{ S.diag={dims:{立论:74,论证:66,表达:71,应变:58,论据:49,协同:67},delta:{立论:4,论证:-3,表达:7,应变:2,论据:-5,协同:3},flaws:{'未证前提':3,'以偏概全':1},streak:5,samples:6}; go('diag'); })()`);
  await sleep(250);
  const mid = await ev(`(()=>{const f=document.querySelector('.dim-fill'); return f?f.style.width:'无';})()`);
  const numMid = await ev(`(()=>{const n=document.querySelector('.dim-num'); return n?n.textContent:'无';})()`);
  const scaleMid = await ev(`(()=>{const g=document.querySelector('.radar-grow'); return g?getComputedStyle(g).transform:'无';})()`);
  console.log("动画中途  条宽:", mid, "· 数字:", numMid, "· 雷达 transform:", scaleMid ? scaleMid.slice(0, 30) : '无');

  await sleep(1400);
  const end = await ev(`(()=>{const f=document.querySelector('.dim-fill'); const n=document.querySelector('.dim-num'); const g=document.querySelector('.radar-grow'); return {w:f.style.width, num:n.textContent, tf:getComputedStyle(g).transform};})()`);
  console.log("动画结束  条宽:", end.w, "· 数字:", end.num, "· 雷达矩阵:", String(end.tf).slice(0, 30));

  console.log("标题:", await ev(`document.querySelector('h1.pg').textContent`));
  console.log("导航文案:", await ev(`[...document.querySelectorAll('#nav *')].map(e=>e.textContent).filter(t=>t.includes('能力')).join(' / ')`));
  console.log("雷达轴数:", await ev(`document.querySelectorAll('.radar-grow circle').length`));
  console.log("条形条数:", await ev(`document.querySelectorAll('.dim-fill').length`));
  await shot("diag6.png");
  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
