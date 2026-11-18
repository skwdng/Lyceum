const PORT = process.argv[2] || 9716;
const OUT = 'D:\\siyige\\demo\\shots-run3\\';

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
  const go = async (hash, wait = 2300) => { await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#" + hash }); await sleep(wait); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  await go("/login", 2500);
  const acc = 'full_' + Math.floor(Math.random() * 90000 + 10000);
  const token = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:800})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:800, sign:o.sign})});
    return d.token;
  })()`);
  await send('Page.reload'); await sleep(2400);
  console.log("账号:", acc, "· token:", token ? "有" : "无");

  // 打一整场（SPRINT 8 步）
  console.log("\n[完整对局]");
  await go("/solo", 2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2500);

  const t0 = Date.now();
  let myTurns = 0;
  while (Date.now() - t0 < 300000) {
    const st = await ev(`(()=>{
      const ta=document.querySelector('textarea');
      const fin=/复盘|本场得分|再来一场/.test(document.body.innerText||'');
      return { hasTextarea: !!ta, finished: fin, msgs: document.querySelectorAll('.msg').length };
    })()`);
    if (st.finished) break;
    if (st.hasTextarea) {
      const ok = await ev(`(async()=>{
        const ta=document.querySelector('textarea');
        ta.value='我方认为取消期末考试不会降低标准，因为可以改成过程性评价加统一复核。请问对方：谁来复核、怎么保证一致？';
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,200));
        const b=[...document.querySelectorAll('button')].find(x=>/发送|发言/.test(x.textContent) && !x.disabled);
        if(b){ b.click(); return true; }
        return false;
      })()`);
      if (ok) { myTurns++; console.log(`     第 ${myTurns} 次发言已提交（${((Date.now()-t0)/1000).toFixed(0)}s）`); }
    }
    await sleep(1500);
  }
  const endState = await ev(`(()=>({ url: location.hash, fin: /复盘|本场得分|再来一场/.test(document.body.innerText||''), msgs: document.querySelectorAll('.msg').length }))()`);
  console.log("  结束状态:", JSON.stringify(endState), "· 我发言", myTurns, "次 · 用时", ((Date.now()-t0)/1000).toFixed(0), "秒");
  await shot("10-match-done.png");

  // 复盘
  console.log("\n[复盘页]");
  const mid = await ev(`(location.hash.match(/match=([^&]+)/)||[])[1] || (window.__lastMid||'')`);
  const recs = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt');
    const r=await fetch('/api/records',{headers:{'Authorization':'Bearer '+tk}});
    const d=await r.json();
    const l = Array.isArray(d)?d:(d.list||d.items||[]);
    return l[0] ? (l[0].id||l[0].match_id) : '';
  })()`);
  console.log("  最近一场:", recs || mid);
  if (recs) { await go("/review?match=" + recs, 2600); await shot("11-review.png"); }

  // 能力分析
  console.log("\n[能力分析]");
  await go("/diag", 2600);
  console.log("  有数据:", await ev(`!/还没有数据/.test(document.body.innerText||'')`));
  console.log("  六维文字:", await ev(`['立论','论证','表达','应变','论据','协同'].filter(k=>(document.body.innerText||'').includes(k)).join('/')`));
  await shot("12-diag.png");

  // 手机端
  console.log("\n[手机端 390×844]");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  await go("/solo", 2200);
  console.log("  侧栏:", await ev(`getComputedStyle(document.querySelector('.sb')).display`), "· 底部tab:", await ev(`(()=>{const t=document.querySelector('.tabbar'); return t?getComputedStyle(t).display:'无';})()`));
  console.log("  横向溢出:", await ev(`document.documentElement.scrollWidth > innerWidth + 2`));
  await shot("13-mobile.png");

  console.log("\n页面异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
