const PORT = process.argv[2] || 9740;
const OUT = 'D:\\siyige\\demo\\shots-ok\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("   shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'ok_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:900})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:900, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(2000);

  // 连打 6 轮（我在 B2，轮到我时自动发言），每 700ms 校验 dom==turns
  let checks = 0, drops = 0, myTurns = 0, maxSeg = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const d = await ev(`(async()=>{
      const tk = localStorage.getItem('sy_jwt'), mid = localStorage.getItem('sy_match');
      const r = await fetch('/api/matches/' + mid, {headers:{'Authorization':'Bearer '+tk}});
      const j = await r.json();
      const dom = [...document.querySelectorAll('.msg')].map(m => (m.textContent||'').slice(0,18).replace(/\\s+/g,' '));
      const ta = document.querySelector('textarea');
      return { turns:(j.turns||[]).length, dom: dom.length, segs:[...document.querySelectorAll('.msg')].map(m=>((m.textContent||'').match(/(立论|驳立论|质询|自由辩|总结)/)||[])[1]||'?'),
               waitingMe: !!j.waitingForMe, hasTa: !!ta, step: (j.match||{}).step, fin: /复盘/.test(document.body.innerText||'') };
    })()`);
    checks++;
    if (d.turns > d.dom) { drops++; console.log(`   ⚠ ${((Date.now()-t0)/1000).toFixed(0)}s turns=${d.turns} dom=${d.dom} 少 ${d.turns-d.dom} 条`); }
    maxSeg = Math.max(maxSeg, d.dom);
    if (d.hasTa && d.waitingMe) {
      const ok = await ev(`(async()=>{
        const ta=document.querySelector('textarea');
        ta.value='我方认为取消期末不会降低标准：把一次性闭卷换成过程性评价加统一复核，标准反而更清楚。请问对方：复核主体是谁？';
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,150));
        const b=[...document.querySelectorAll('button')].find(x=>/发送|发言/.test(x.textContent) && !x.disabled);
        if(b){ b.click(); return true; } return false;
      })()`);
      if (ok) { myTurns++; console.log(`   我发言第 ${myTurns} 次（${((Date.now()-t0)/1000).toFixed(0)}s）· 当前 ${d.dom} 条`); }
      await sleep(1200);
    }
    if (d.fin) { console.log("   对局结束"); break; }
    if (d.dom >= 8) { console.log("   已到 8 条，截图"); await shot("eight-turns.png"); break; }
    await sleep(700);
  }
  console.log(`\n校验 ${checks} 次 · 少显示 ${drops} 次 · 最多 ${maxSeg} 条气泡 · 我发言 ${myTurns} 次`);
  console.log("结论:", drops === 0 ? "全程没有吞消息 ✓" : "仍有丢失 ← 需继续查");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
