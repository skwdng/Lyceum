const PORT = process.argv[2] || 9764;
const OUT = 'D:\\siyige\\demo\\shots-flaw\\';

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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("   shot -> " + n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'fl_' + Math.floor(Math.random() * 900000 + 10000);
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
  await sleep(1200);

  // 一边打一边盯漏洞卡：记录它出现的时刻，以及那一刻最后一条是否还在打字
  let flawSeen = 0, flawWhileTyping = 0, myTurns = 0, shotDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    await sleep(400);
    const s = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')];
      const last = msgs[msgs.length-1];
      const lastLen = last ? ((last.querySelector('.bub')||{}).textContent||'').length : 0;
      const flawCard = (document.body.innerText||'').includes('你抓到了吗');
      const flawTarget = (document.body.innerText||'').match(/[AB]\\d · (立论|驳立论|质询|自由辩|总结)/);
      const ta = !!document.querySelector('textarea');
      return { n: msgs.length, lastLen, flawCard, target: flawTarget?flawTarget[0]:'', ta, fin:/复盘/.test(document.body.innerText||'') };
    })()`);
    if (typeof s === 'string') break;
    if (s.flawCard) {
      flawSeen++;
      // 判断：卡出现时，最后一条是不是还在变长（说明还在打字 → 不该出现）
      const prevLen = (await ev(`window.__lastLen || 0`));
      await ev(`window.__lastLen = ${s.lastLen}`);
      if (flawSeen === 1) {
        console.log(`   漏洞卡首次出现：${((Date.now()-t0)/1000).toFixed(1)}s · 目标「${s.target}」· 最后一条 ${s.lastLen} 字`);
        if (!shotDone) { await shot("flaw-card.png"); shotDone = true; }
      }
    }
    if (s.ta) {
      const ok = await ev(`(async()=>{
        const ta=document.querySelector('textarea');
        ta.value='我方认为考研选择有明确目标即可视为理性，但盲目跟风确实存在。请问对方：如何区分两者？';
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,150));
        const b=[...document.querySelectorAll('button')].find(x=>/发送|发言/.test(x.textContent) && !x.disabled);
        if(b){ b.click(); return true; } return false;
      })()`);
      if (ok) { myTurns++; console.log(`   发言 ${myTurns} 次（${((Date.now()-t0)/1000).toFixed(0)}s）`); }
    }
    if (s.n >= 5) break;
    if (s.fin) break;
  }
  console.log(`\n漏洞卡出现采样数: ${flawSeen} · 我发言 ${myTurns} 次`);
  await shot("end.png");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
