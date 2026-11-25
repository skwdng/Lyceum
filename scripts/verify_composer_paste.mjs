const PORT = process.argv[2] || 9896;
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
  const ok = (n, p, d = '') => console.log(`${p ? '✓' : '✗'} ${n}${d ? ' · ' + d : ''}`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  const acc = 'cp_' + Math.floor(Math.random() * 900000 + 10000);
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
  await send('Page.reload');
  await sleep(2500);
  await send('Page.navigate', { url: BASE + '/v2/index.html#/match' });
  // 等页面真正就绪：出现 composer 或超时 30 秒
  for (let i = 0; i < 30; i++) {
    const ready = await ev(`!!document.querySelector('.composer')`);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(800);

  // ① 对方回合（AI 说话）时，输入框是否已经存在
  const inAiTurn = await ev(`(()=>{
    const ta=document.querySelector('textarea');
    const body=document.body.innerText||'';
    return {hasTa:!!ta, placeholder: ta?ta.placeholder:'', sending:(()=>{const b=[...document.querySelectorAll('button')].find(x=>/发送|等我回合/.test(x.textContent)); return b?{text:b.textContent.trim(),disabled:b.disabled}:null;})()};
  })()`);
  ok('AI 回合时输入框已存在（可以先写）', inAiTurn.hasTa, JSON.stringify(inAiTurn));

  // ② 此时粘贴，内容应该进得去
  // 用「假 clipboardData」触发 paste：这样才会走组件的 onPaste（CDP insertText 不走）
  const pasted2 = await ev(`(async()=>{
    const ta=document.querySelector('textarea');
    ta.focus();
    const text='我方判准：看替代评价能否守住学业质量底线。\\u200b\\n\\n\\n\\n据《普通高等学校学生管理规定》，考核形式本由学校规定。';
    const fake={ getData: () => text, types:['text/plain'] };
    const evt=new ClipboardEvent('paste',{ bubbles:true, cancelable:true });
    Object.defineProperty(evt,'clipboardData',{ value: fake });
    ta.dispatchEvent(evt);
    await new Promise(r=>setTimeout(r,300));
    const v=ta.value;
    return { len:v.length, hasZW:/[\\u200b\\ufeff]/.test(v), blankLines:(v.match(/\\n{3,}/g)||[]).length, head:v.slice(0,12) };
  })()`);

  ok('对方回合粘贴成功且已清洗（无零宽、无多空行）', pasted2.len > 10 && !pasted2.hasZW && pasted2.blankLines === 0, JSON.stringify(pasted2));

  // ③ 此刻点发送：应被拦住并提示"还没轮到你"
  const sendNow = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/发送|等我回合/.test(x.textContent));
    return {text:b.textContent.trim(), disabled:b.disabled};
  })()`);
  ok('对方回合发送按钮置灰', sendNow.disabled, JSON.stringify(sendNow));

  // ④ 等轮到我，内容应还在，按钮变成"发送"
  let my = null;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    my = await ev(`(()=>{
      const ta=document.querySelector('textarea');
      const b=[...document.querySelectorAll('button')].find(x=>/发送|等我回合/.test(x.textContent));
      return {len: ta?ta.value.length:0, btn: b?{text:b.textContent.trim(), disabled:b.disabled}:null};
    })()`);
    if (my.btn && my.btn.text === '发送') break;
  }
  ok('轮到我时草稿还在且按钮变「发送」', my && my.len > 10 && my.btn.text === '发送', JSON.stringify(my));

  // ⑤ 发送
  await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/发送/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(3000);
  const sent = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    const mine=(j.turns||[]).filter(t=>t.seat==='B2');
    return {mine:mine.length, last: mine.length?{len:(mine[mine.length-1].content||'').length, status:mine[mine.length-1].status}:null};
  })()`);
  ok('粘贴内容发送成功并落库', sent.mine > 0, JSON.stringify(sent));
  console.log('JS 异常:', errs.length ? JSON.stringify(errs.slice(0, 2)) : '无');
  ws.close();
  process.exit(0);
});
