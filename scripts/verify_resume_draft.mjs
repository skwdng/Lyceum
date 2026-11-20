const PORT = process.argv[2] || 9852;

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
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
    if (m.method === "Page.javascriptDialogOpening") { win.dialogs.push(m.params.message.slice(0, 60)); send("Page.handleJavaScriptDialog", { accept: false }); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((resolve) => pend.set(i, { resolve })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    return r.exceptionDetails ? "EXC" : r.result?.value;
  };
  globalThis.win = { dialogs: [] };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2400);
  const acc = 'rs_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:2000})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:2000, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2200);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(1500);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(700);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(4000);

  const mid = await ev(`localStorage.getItem('sy_match')`);
  console.log("对局:", mid);

  // ① 写一半草稿
  const typed = await ev(`(async()=>{
    const ta=document.querySelector('textarea');
    if(!ta) return 'no-textarea';
    ta.value='我方认为取消期末需要替代评价同等刚性';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    return ta.value.length;
  })()`);
  console.log("写入草稿长度:", typed);
  const draftSaved = await ev(`Object.keys(localStorage).filter(k=>k.startsWith('sy_draft_')).map(k=>k+'='+localStorage.getItem(k).length)`);
  console.log("本地草稿:", JSON.stringify(draftSaved));

  // ② 刷新页面，看草稿是否恢复
  await send("Page.reload"); await sleep(3500);
  const restored = await ev(`(()=>{ const ta=document.querySelector('textarea'); return ta?ta.value.length:0; })()`);
  const turnsAfterReload = await ev(`document.querySelectorAll('.msg').length`);
  console.log("刷新后：草稿长度=" + restored + " · 气泡数=" + turnsAfterReload);

  // ③ 去单人页再点开练：应弹确认，且取消后能回到原对局
  win.dialogs.length = 0;
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/solo" }); await sleep(1800);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(600);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(1200);
  console.log("开新局前的确认弹窗:", JSON.stringify(win.dialogs));
  const urlNow = await ev(`location.hash`);
  console.log("取消后所在页面:", urlNow);
  console.log("异常:", errs.length ? JSON.stringify(errs.slice(0,2)) : "无");
  ws.close(); process.exit(0);
});
