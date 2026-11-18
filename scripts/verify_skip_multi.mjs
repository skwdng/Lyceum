const PORT = process.argv[2] || 9754;
const OUT = 'D:\\siyige\\demo\\shots-skip2\\';

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
  const acc = 'sk2_' + Math.floor(Math.random() * 900000 + 10000);
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
  await sleep(1500);

  const snap = async () => ev(`(async()=>{
    const tk = localStorage.getItem('sy_jwt'), mid = localStorage.getItem('sy_match');
    const j = await (await fetch('/api/matches/' + mid, {headers:{'Authorization':'Bearer '+tk}})).json();
    const msgs = [...document.querySelectorAll('.msg')].map(m => {
      const r = m.getBoundingClientRect(); const t = m.textContent||'';
      return { y: Math.round(r.top), seat: (t.match(/[AB]\\d/)||['?'])[0], len: (m.querySelector('.bub')?(m.querySelector('.bub').textContent||'').length:0), stream: t.includes('生成中') };
    });
    const nudge = [...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('催'));
    return { turns:(j.turns||[]).length, msgs, nudge, step:(j.match||{}).step, fin:/复盘/.test(document.body.innerText||'') };
  })()`);

  let prev = null, jumps = 0, nudges = 0, mySaid = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await sleep(500);
    const s = await snap();
    if (typeof s === 'string') break;
    // 位置跳变检测：同一条文本长度变大时 y 不该变
    if (prev && s.msgs.length) {
      const baseA = prev.msgs[0].y, baseB = s.msgs[0].y;
      for (let i = 0; i < Math.min(s.msgs.length, prev.msgs.length); i++) {
        const a = prev.msgs[i], b = s.msgs[i];
        const relA = a.y - baseA, relB = b.y - baseB;
        if (a && b && b.len >= a.len && Math.abs(relB - relA) > 40) {
          jumps++;
          console.log(`   ⚠ 相对位置变了：第 ${i + 1} 条 ${relA}→${relB}（len ${a.len}→${b.len}）`);
        }
      }
    }
    if (s.nudge) {
      await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('催')); if(b) b.click(); })()`);
      nudges++;
      console.log(`   点了第 ${nudges} 次催（step ${s.step}，当前 ${s.msgs.length} 条）`);
      await sleep(1500);
      continue;
    }
    // 轮到我就发言
    const hasTa = await ev(`!!document.querySelector('textarea')`);
    if (hasTa) {
      const ok = await ev(`(async()=>{
        const ta=document.querySelector('textarea');
        ta.value='我方认为取消期末不会降低标准：把一次性闭卷换成过程性评价加统一复核，标准反而更清楚。请问对方：复核主体是谁？';
        ta.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,150));
        const b=[...document.querySelectorAll('button')].find(x=>/发送|发言/.test(x.textContent) && !x.disabled);
        if(b){ b.click(); return true; } return false;
      })()`);
      if (ok) { mySaid++; console.log(`   发言第 ${mySaid} 次（step ${s.step}）`); }
    }
    if (s.turns >= 6) { await shot("six.png"); break; }
    if (s.fin) break;
    prev = s;
  }
  console.log(`\n结果：催 ${nudges} 次 · 我发言 ${mySaid} 次 · 位置跳变 ${jumps} 次`);
  console.log(jumps === 0 ? "位置稳定 ✓" : "仍有跳变 ← 继续查");
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
