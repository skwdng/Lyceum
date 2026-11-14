const PORT = process.argv[2] || 9666;

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
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
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

  const acc = 'dbg2_' + Math.floor(Math.random() * 90000 + 10000);
  const mid = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    const r2 = await fetch('/api/matches', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({topicId:'t4', seats:['B2'], mode:'SPRINT', tier:'PRO'})});
    const m = await r2.json();
    return m.matchId;
  })()`);
  console.log("对局:", mid, "· token 在:", await ev(`!!localStorage.getItem('sy_jwt')`));

  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/match?match=" + mid });
  await send('Page.reload'); await sleep(4000);
  console.log("  URL:", await ev(`location.href`));
  console.log("  正文前 160:", (await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,160)`)));
  console.log("  页面里有 .msg:", await ev(`document.querySelectorAll('.msg').length`));
  console.log("  有 chat 容器:", await ev(`!!document.querySelector('.chat, .vfeed, .stage')`));
  ws.close(); process.exit(0);
});
