const PORT = process.argv[2] || 9894;
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
    if (r && r.exceptionDetails) return { __exc: 1 };
    return r && r.result ? r.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  const acc = 'gap_' + Math.floor(Math.random() * 900000 + 10000);
  const mid = await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base+'/api/pay/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({amountCents:2000})})).json();
    await fetch(base+'/api/pay/callback',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({orderId:o.orderId,amountCents:2000,sign:o.sign})});
    const m = await (await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'})})).json();
    localStorage.setItem('sy_match', m.matchId);
    return m.matchId;
  })()`);
  console.log('对局:', mid);

  // 用接口直接量「上一条出现 → 下一条出现」的间隔（不受前端打字机影响）
  const t0 = Date.now();
  let seen = 0;
  const gaps = [];
  let lastAt = null;
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    const n = await ev(`(async()=>{
      const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
      const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
      return (j.turns||[]).length;
    })()`);
    if (typeof n === 'number' && n > seen) {
      const now = Date.now();
      if (lastAt) gaps.push(Math.round((now - lastAt) / 100) / 10);
      lastAt = now;
      seen = n;
      if (seen >= 4) break;
    }
  }
  console.log('相邻发明间隔（秒）:', JSON.stringify(gaps));
  console.log('均值:', gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : 'n/a');
  ws.close();
  process.exit(0);
});
