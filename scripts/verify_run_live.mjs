const PORT = process.argv[2] || 9710;
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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("     shot -> " + n); };
  const go = async (hash, wait = 2200) => { await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#" + hash }); await sleep(wait); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  // ---------- 1 登录页 ----------
  console.log("[1] 登录页");
  await go("/login");
  console.log("    标题:", await ev(`document.querySelector('h1,h2,.title,.logo b')?.textContent?.trim() || '(无)'`));
  await shot("01-login.png");

  // ---------- 2 注册一个账号，进主流程 ----------
  const acc = 'run_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2500);
  console.log("    账号:", acc, "· 余额已充 8 元");

  // ---------- 3 单人辩论页 ----------
  console.log("[2] 单人辩论页");
  await go("/solo");
  console.log("    辩题数:", await ev(`document.querySelectorAll('.topic').length`));
  console.log("    席位:", await ev(`[...document.querySelectorAll('.preset.on')].map(e=>e.textContent.trim()).join(',') || 'B2'`));
  await shot("02-solo.png");

  // ---------- 4 开一局，看流式 ----------
  console.log("[3] 开局 → 看流式");
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  const t0 = Date.now();
  let firstStream = null, maxLen = 0, sawStream = false;
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    const st = await ev(`(()=>{
      const s=[...document.querySelectorAll('.msg')].find(m=>(m.textContent||'').includes('生成中'));
      const bub = s ? s.querySelector('.bub') : null;
      return { has: !!s, len: bub?(bub.textContent||'').length:0, msgs: document.querySelectorAll('.msg').length };
    })()`);
    if (st.has) { sawStream = true; if (firstStream === null) firstStream = (Date.now()-t0)/1000; maxLen = Math.max(maxLen, st.len); }
    if (sawStream && st.msgs >= 2) break;
  }
  console.log("    流式气泡出现:", sawStream, firstStream !== null ? "(" + firstStream.toFixed(1) + " 秒)" : "");
  console.log("    最长一次:", maxLen, "字");
  await shot("03-streaming.png");

  // 等落库 + 我发言
  await sleep(2500);
  console.log("    消息条数:", await ev(`document.querySelectorAll('.msg').length`));
  const submitted = await ev(`(async()=>{
    const ta=document.querySelector('textarea');
    if(!ta) return 'no-textarea';
    ta.value='我方认为应该取消期末考试，因为一次性闭卷只考记忆。请问对方：怎么保证标准不降？';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const b=[...document.querySelectorAll('button')].find(x=>/发送|发言/.test(x.textContent) && !x.disabled);
    if(b){ b.click(); return 'sent'; }
    return 'no-button';
  })()`);
  console.log("    提交我的发言:", submitted);
  await sleep(3000);
  console.log("    发言后条数:", await ev(`document.querySelectorAll('.msg').length`));
  await shot("04-my-turn.png");

  // ---------- 5 催一下（幂等） ----------
  console.log("[4] 催一下按钮");
  let hasNudge = false;
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    if (await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`)) { hasNudge = true; break; }
  }
  console.log("    出现催按钮:", hasNudge);
  if (hasNudge) {
    const clicks = await ev(`(async()=>{
      let n=0;
      for(let i=0;i<5;i++){
        const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催'));
        if(b && !b.disabled){ b.click(); n++; }
        await new Promise(r=>setTimeout(r,120));
      }
      return n;
    })()`);
    console.log("    连点 5 次实际点到:", clicks, "次");
    await sleep(1500);
    console.log("    点完按钮还在:", await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'))`));
  }

  // ---------- 6 视频页（搜索收起） ----------
  console.log("[5] 视频页");
  await go("/video", 2500);
  console.log("    常驻搜索框:", await ev(`!!document.querySelector('.vsearch-input')`), "(应为 false)");
  console.log("    右上角搜索按钮:", await ev(`[...document.querySelectorAll('.vtop button')].some(b=>b.textContent.includes('搜索'))`));
  await shot("05-video.png");

  // ---------- 7 能力分析 ----------
  console.log("[6] 能力分析");
  await go("/diag", 2500);
  console.log("    雷达图:", await ev(`!!document.querySelector('svg')`));
  console.log("    空态提示:", await ev(`(document.body.innerText||'').includes('还没有数据') ? '显示' : '不显示（已有对局数据）'`));
  await shot("06-diag.png");

  // ---------- 8 手机端 ----------
  console.log("[7] 手机端（390×844）");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  await go("/solo", 2200);
  console.log("    侧栏:", await ev(`getComputedStyle(document.querySelector('.sb')).display`));
  console.log("    底部 tab:", await ev(`(()=>{const t=document.querySelector('.tabbar'); return t?getComputedStyle(t).display:'无';})()`));
  console.log("    横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));
  await shot("07-mobile.png");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  console.log("\n页面异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
