const PORT = process.argv[2] || 9664;

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

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);

  const acc = 'dbg_' + Math.floor(Math.random() * 90000 + 10000);
  const mid = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    const r2 = await fetch('/api/matches', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({topicId:'t4', seats:['B2'], mode:'SPRINT', tier:'PRO'})});
    const m = await r2.json();
    return m.matchId;
  })()`);
  console.log("对局:", mid);

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/match?match=" + mid });
  await send('Page.reload'); await sleep(3000);

  for (let i = 1; i <= 8; i++) {
    await sleep(2000);
    const st = await ev(`(()=>{
      const el = document.querySelector('.waiting');
      const btns = [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean);
      return {
        waitingText: el ? el.innerText.replace(/\\s+/g,' ').slice(0,40) : null,
        btns: btns.filter(t=>/催|发送/.test(t)),
        msgs: document.querySelectorAll('.msg').length
      };
    })()`);
    console.log(`  t=${i * 2}s`, JSON.stringify(st));
    if (st.btns && st.btns.some((t) => t.includes('催'))) break;
  }

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
