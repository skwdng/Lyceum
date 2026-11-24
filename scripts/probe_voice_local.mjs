// 语音输入本地验证（A1 席位，第一轮就是我）
const PORT = process.argv[2] || 9882;
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
    if (r && r.exceptionDetails) return { __exc: 1 };
    return r && r.result ? r.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  const acc = 'vc_' + Math.floor(Math.random() * 900000 + 10000);
  const prep = await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    if(!d.token) return 'ERR:'+JSON.stringify(d).slice(0,60);
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['A1']));
    localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base+'/api/pay/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({amountCents:2000})})).json();
    await fetch(base+'/api/pay/callback',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({orderId:o.orderId,amountCents:2000,sign:o.sign})});
    const m = await (await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},body:JSON.stringify({topicId:'t4',seats:['A1'],mode:'SPRINT',tier:'PRO'})})).json();
    localStorage.setItem('sy_match', m.matchId);
    return 'ok:'+m.matchId;
  })()`);
  console.log('准备:', prep);

  await send('Page.navigate', { url: BASE + '/v2/index.html#/match' });
  await sleep(3500);

  // 轮询 composer 状态，打印到底卡在哪
  for (let i = 0; i < 30; i++) {
    const st = await ev(`(()=>{
      const ta=document.querySelector('textarea');
      const body=(document.body.innerText||'');
      return {ta:!!ta, text:body.slice(0,60).replace(/\\n/g,' '), thinking:body.includes('对方正在思考'),
              waiting:body.includes('轮到你发言'), prepare:body.includes('准备')};
    })()`);
    if (i % 3 === 0 || st.ta) console.log(`  ${i}s`, JSON.stringify(st));
    if (st.ta) break;
    await sleep(1000);
  }

  const sup = await ev(`!!(window.SpeechRecognition||window.webkitSpeechRecognition)`);
  console.log('语音识别可用:', sup);
  const clicked = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/语音/.test(x.textContent));
    if(!b) return 'no-button';
    b.click();
    return {text:b.textContent.trim(), disabled:b.disabled};
  })()`);
  console.log('点击语音:', JSON.stringify(clicked));
  await sleep(2000);
  const s1 = await ev(`(()=>{ const bar=document.querySelector('.recbar'); const ta=document.querySelector('textarea'); return {bar: bar?bar.textContent.trim():null, draft:(ta?ta.value:'').length, btn:[...document.querySelectorAll('button')].filter(x=>/语音|录音/.test(x.textContent)).map(x=>x.textContent.trim())[0]||null}; })()`);
  console.log('2 秒后:', JSON.stringify(s1));
  await sleep(4000);
  const s2 = await ev(`(()=>{ const bar=document.querySelector('.recbar'); return {bar: bar?bar.textContent.trim():null}; })()`);
  console.log('6 秒后:', JSON.stringify(s2));
  console.log('JS 异常:', errs.length ? JSON.stringify(errs.slice(0, 2)) : '无');
  ws.close();
  process.exit(0);
});
