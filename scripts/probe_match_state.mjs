const PORT = process.argv[2] || 9884;
const BASE = process.argv[3] || 'http://localhost:8080';

import('node:fs').then(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function getWs() {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const l = await r.json();
        const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (p) return p.webSocketDebuggerUrl;
      } catch {}
      await sleep(250);
    }
    throw new Error('no target');
  }
  const ws = new WebSocket(await getWs());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); }
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resolve) => pend.set(i, { resolve }));
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) return { __exc: JSON.stringify(r.exceptionDetails).slice(0, 200) };
    return r && r.result ? r.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  const acc = 'dbg_' + Math.floor(Math.random() * 900000 + 10000);
  const prep = await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['A1']));
    localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base+'/api/pay/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({amountCents:2000})})).json();
    await fetch(base+'/api/pay/callback',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({orderId:o.orderId,amountCents:2000,sign:o.sign})});
    const m = await (await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({topicId:'t4',seats:['A1'],mode:'SPRINT',tier:'PRO'})})).json();
    localStorage.setItem('sy_match', m.matchId);
    return m.matchId;
  })()`);
  console.log('mid:', prep);

  await send('Page.navigate', { url: BASE + '/v2/index.html#/match' });
  await sleep(4000);
  const dbg = await ev(`(()=>{
    const pinia=document.querySelector('#app').__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.debate || {};
    return {hash: location.hash, mid: pinia.matchId, hasMatch: !!pinia.match,
            status: pinia.match && pinia.match.status, step: pinia.match && pinia.match.step,
            waiting: pinia.waiting, turns: (pinia.turns||[]).length,
            ls: localStorage.getItem('sy_match'),
            bodyHead: (document.body.innerText||'').replace(/\\n/g,' ').slice(0,120)};
  })()`);
  console.log('状态:', JSON.stringify(dbg, null, 0));
  ws.close();
  process.exit(0);
});
