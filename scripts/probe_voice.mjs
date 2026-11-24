// 语音输入探测：点「语音」后是否进入录音态、有没有 JS 异常、出错时是否优雅回退
const PORT = process.argv[2] || 9876;
const BASE = process.argv[3] || 'http://120.24.204.138:8787/siyige';

import('node:fs').then(async (fs) => {
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
  const errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 120));
    }
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resolve) => pend.set(i, { resolve }));
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) return { __exc: JSON.stringify(r.exceptionDetails).slice(0, 120) };
    return r && r.result ? r.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  const acc = 'voice_' + Math.floor(Math.random() * 900000 + 10000);
  const token = await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    if(!d.token) return 'ERR';
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base+'/api/pay/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({amountCents:2000})})).json();
    await fetch(base+'/api/pay/callback',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({orderId:o.orderId,amountCents:2000,sign:o.sign})});
    const m = await (await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'})})).json();
    localStorage.setItem('sy_match', m.matchId);
    return d.token ? 'ok' : 'ERR';
  })()`);
  console.log('准备:', token);

  await send('Page.navigate', { url: BASE + '/v2/index.html#/match' });
  await sleep(3000);

  // 等到轮到我
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    ready = await ev(`!!document.querySelector('textarea')`);
    if (ready) break;
  }
  console.log('轮到我说:', ready);
  if (!ready) { ws.close(); process.exit(0); }

  const sup = await ev(`!!(window.SpeechRecognition || window.webkitSpeechRecognition)`);
  console.log('浏览器支持语音识别:', sup);

  const clicked = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/语音/.test(x.textContent));
    if(!b) return 'no-button';
    b.click();
    return {text:b.textContent.trim(), disabled:b.disabled};
  })()`);
  console.log('点击语音:', JSON.stringify(clicked));
  await sleep(2500);

  const state = await ev(`(()=>{
    const bar=document.querySelector('.recbar');
    const ta=document.querySelector('textarea');
    return {bar: bar?bar.textContent.trim():null, draft:(ta?ta.value:'').length};
  })()`);
  console.log('录音状态:', JSON.stringify(state));

  // 等 3 秒看计时是否在走 / 是否已经回退
  await sleep(3000);
  const state2 = await ev(`(()=>{
    const bar=document.querySelector('.recbar');
    return {bar: bar?bar.textContent.trim():null};
  })()`);
  console.log('3 秒后:', JSON.stringify(state2));

  console.log('JS 异常:', errs.length ? JSON.stringify(errs.slice(0, 2)) : '无');
  ws.close();
  process.exit(0);
});
