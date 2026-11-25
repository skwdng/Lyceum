// 复现「粘贴后发送不了」
const PORT = process.argv[2] || 9890;
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
      errs.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 140));
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

  const acc = 'pst_' + Math.floor(Math.random() * 900000 + 10000);
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
  console.log('对局:', prep);

  await send('Page.reload');
  await sleep(2500);
  await send('Page.navigate', { url: BASE + '/v2/index.html#/match' });
  await sleep(3500);

  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await ev(`!!document.querySelector('textarea')`);
    if (ready) break;
    await sleep(1000);
  }
  console.log('输入框可用:', ready);
  if (!ready) { ws.close(); process.exit(0); }

  // 聚焦输入框
  await ev(`(()=>{ const ta=document.querySelector('textarea'); ta.focus(); return true; })()`);

  // 模拟"粘贴"：多行 + 全角空格 + 零宽字符（从网页复制常见）
  const pasted = '我方判准：看替代评价能否守住学业质量的底线。\u200b\n\n第二，据《普通高等学校学生管理规定》，考核形式本由学校规定。\u3000请问对方：复核主体是谁？';
  await send('Input.insertText', { text: pasted });
  await sleep(600);

  const afterPaste = await ev(`(()=>{
    const ta=document.querySelector('textarea');
    const v=ta?ta.value:'';
    return {len:v.length, hasZW:/[\\u200b\\ufeff]/.test(v), preview:v.slice(0,30)};
  })()`);
  console.log('粘贴后输入框:', JSON.stringify(afterPaste));

  // 点发送
  const clicked = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/发送/.test(x.textContent));
    if(!b) return 'no-button';
    b.click();
    return {disabled:b.disabled};
  })()`);
  console.log('点发送:', JSON.stringify(clicked));
  await sleep(3500);

  const after = await ev(`(()=>{
    const toasts=[...document.querySelectorAll('.toast,.tip,.alert')].map(x=>x.textContent.trim()).filter(Boolean);
    const ta=document.querySelector('textarea');
    return {draftLen: ta?ta.value.length:-1, toasts: toasts.slice(0,3)};
  })()`);
  console.log('发送后:', JSON.stringify(after));

  const api = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch(base+'/api/matches/'+localStorage.getItem('sy_match'),{headers:{'Authorization':'Bearer '+tk}})).json();
    const mine=(j.turns||[]).filter(t=>t.seat==='A1');
    return {turns:(j.turns||[]).length, mine:mine.length,
            last: mine.length?{len:(mine[mine.length-1].content||'').length, status:mine[mine.length-1].status}:null};
  })()`);
  console.log('接口结果:', JSON.stringify(api));
  console.log('JS 异常:', errs.length ? JSON.stringify(errs.slice(0, 2)) : '无');
  ws.close();
  process.exit(0);
});
