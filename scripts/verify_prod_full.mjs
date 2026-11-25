// 上线前自检：在生产站点上跑一遍完整链路，覆盖最近所有改动
// 用法：node scripts/verify_prod_full.mjs <端口> <baseUrl>
const PORT = process.argv[2] || 9870;
const BASE = process.argv[3] || 'http://120.24.204.138:8787/siyige';

import('node:fs').then(async (fs) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`);
  };

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
  const consoleErrors = [];
  const pageErrors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 120));
    }
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resolve) => pend.set(i, { resolve }));
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) return '__EXC__';
    return r && r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('D:/siyige/demo/prod-check', { recursive: true });
    fs.writeFileSync('D:/siyige/demo/prod-check/' + name, Buffer.from(s.data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ---------- 1. 打开站点 ----------
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(3000);
  const title = await ev('document.title');
  const appMounted = await ev(`!!document.querySelector('#app').children.length`);
  ok('站点打开且 Vue 挂载', !!appMounted, String(title));

  // ---------- 2. 注册 + 充值 ----------
  const acc = 'chk_' + Math.floor(Math.random() * 900000 + 10000);
  const reg = await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    if(!d.token) return 'ERR:'+JSON.stringify(d).slice(0,80);
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    localStorage.setItem('sy_mode','SPRINT');
    const o = await (await fetch(base + '/api/pay/orders', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({amountCents:3000})})).json();
    await fetch(base + '/api/pay/callback', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token},
      body: JSON.stringify({orderId:o.orderId, amountCents:3000, sign:o.sign})});
    const w = await (await fetch(base + '/api/wallet',{headers:{'Authorization':'Bearer '+d.token}})).json();
    return 'ok:' + w.balanceCents;
  })()`);
  ok('注册并充值成功', String(reg).startsWith('ok:'), String(reg));

  await send('Page.reload');
  await sleep(2500);

  // ---------- 3. 单人页 → 开一局 ----------
  await send('Page.navigate', { url: BASE + '/v2/index.html#/solo' });
  await sleep(2200);
  const topicCount = await ev(`document.querySelectorAll('.topic').length`);
  ok('题库渲染', topicCount > 0, topicCount + ' 个辩题');

  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(800);
  const sheetOpened = await ev(`!!document.querySelector('.mask')`);
  ok('点辩题后弹出开局面板', !!sheetOpened);

  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(3500);
  const inMatch = await ev(`location.hash.includes('/match')`);
  ok('进入对局页', !!inMatch, await ev('location.hash'));

  const mid = await ev(`localStorage.getItem('sy_match')`);
  ok('对局 id 已本地保存', !!mid, String(mid));

  // ---------- 4. 第一条发言必须逐字 ----------
  let lens = [];
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const len = await ev(`(()=>{const b=document.querySelector('.msg .bub'); return b?(b.textContent||'').length:0;})()`);
    if (len !== last) { lens.push(len); last = len; }
    if (len > 120) break;
  }
  const growthSteps = lens.filter((n) => n > 1 && n < 120).length;
  ok('首条发言逐字出现（不是整段弹出）', growthSteps >= 3, '增长采样点 ' + growthSteps + ' 个: ' + lens.slice(0, 6).join('→'));

  // ---------- 5. 催一下 ----------
  const nudge = await ev(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent));
    if(!b) return {found:false};
    return {found:true, text:b.textContent.trim(), disabled:b.disabled};
  })()`);
  ok('AI 回合能看到「催一下/直接显示全文」', nudge && nudge.found, JSON.stringify(nudge));

  if (nudge && nudge.found && !nudge.disabled) {
    await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent)); if(b) b.click(); })()`);
    await sleep(3000);
    const afterNudge = await ev(`(()=>{
      const b=[...document.querySelectorAll('button')].find(x=>/催一下|直接显示全文/.test(x.textContent));
      return b ? {text:b.textContent.trim(), disabled:b.disabled} : {gone:true};
    })()`);
    ok('催一下点完后按钮置灰/隐藏（每步只生效一次）', !!(afterNudge && (afterNudge.disabled || afterNudge.gone)), JSON.stringify(afterNudge));
  }

  // ---------- 6. 轮到我：提示 + 语音按钮 ----------
  // 输入框现在常驻（对方说话时也能先写），所以判断"轮到我"要看发送按钮变「发送」
  let myTurn = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    myTurn = await ev(`(()=>{
      const b=[...document.querySelectorAll('button')].find(x=>/^发送$|等我回合/.test(x.textContent.trim()));
      return !!(b && b.textContent.trim() === '发送');
    })()`);
    if (myTurn) break;
  }
  ok('轮到我时发送按钮可用（输入框常驻）', myTurn);

  const ui = await ev(`(()=>{
    const chips=[...document.querySelectorAll('.hint-chip')].map(x=>x.textContent.trim());
    const voice=[...document.querySelectorAll('button')].find(x=>/语音/.test(x.textContent));
    const nudge=[...document.querySelectorAll('button')].find(x=>/催一下/.test(x.textContent));
    const SR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    return {chips, voice: voice?{text:voice.textContent.trim(),disabled:voice.disabled}:null,
            nudge: nudge?{text:nudge.textContent.trim(),disabled:nudge.disabled}:null, srSupported: SR};
  })()`);
  ok('轮到我时给反驳提示（1-3 条）', ui.chips.length >= 1 && ui.chips.length <= 3, ui.chips.join(' | '));
  ok('语音按钮存在', !!ui.voice, JSON.stringify(ui.voice) + ' · 浏览器支持=' + ui.srSupported);
  ok('轮到我时催一下置灰常驻（不消失）', !!ui.nudge && ui.nudge.disabled, JSON.stringify(ui.nudge));

  // ---------- 7. 草稿保存 + 发送 ----------
  const typed = await ev(`(async()=>{
    const ta=document.querySelector('textarea');
    ta.value='我方认为替代评价必须同等刚性，请问对方复核主体是谁';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    return Object.keys(localStorage).filter(k=>k.startsWith('sy_draft_')).length;
  })()`);
  ok('草稿写入本地', typed > 0, typed + ' 个草稿键');

  await send('Page.reload');
  await sleep(3000);
  const restored = await ev(`(()=>{
    const ta=document.querySelector('textarea');
    return {draft: ta?ta.value.length:0, msgs: document.querySelectorAll('.msg').length, hash: location.hash};
  })()`);
  ok('刷新后对局与草稿都还在', restored.draft > 0 && restored.msgs > 0, JSON.stringify(restored));

  await ev(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/发送/.test(x.textContent)); if(b) b.click(); })()`);
  await sleep(4000);
  const sent = await ev(`(async()=>{
    const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
    const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
    const mine=(j.turns||[]).filter(t=>t.seat==='B2');
    const steps=(j.turns||[]).map(t=>t.step);
    return {turns:(j.turns||[]).length, mine:mine.length, inputType:mine.length?mine[mine.length-1].input_type:null,
            dupSteps: steps.length - new Set(steps).size, status:(j.match||{}).status};
  })()`);
  ok('提交成功且落库', sent.mine > 0, JSON.stringify(sent));
  ok('没有重复 step（不叠字）', sent.dupSteps === 0, 'dups=' + sent.dupSteps);

  // ---------- 8. 打完 → 复盘 ----------
  let fin = null;
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    fin = await ev(`(async()=>{
      const base='${BASE}'; const tk=localStorage.getItem('sy_jwt');
      const j=await (await fetch(base+'/api/matches/${mid}',{headers:{'Authorization':'Bearer '+tk}})).json();
      if((j.match||{}).status==='RUNNING' && j.waitingForMe){
        await fetch(base+'/api/matches/${mid}/turns',{method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},
          body: JSON.stringify({content:'我方认为取消期末需要替代评价同等刚性，请对方给复核口径。',inputType:'kb'})});
      }
      return {status:(j.match||{}).status, turns:(j.turns||[]).length};
    })()`);
    if (fin && fin.status !== 'RUNNING') break;
  }
  ok('一局能正常打完', fin && fin.status === 'FINISHED', JSON.stringify(fin));

  await sleep(3000);
  const reviewHash = await ev('location.hash');
  const reviewReady = await ev(`(()=>{
    const t=document.body.innerText||'';
    return {hash:location.hash, hasScore: /总分|五维|复盘/.test(t), nodes: document.querySelectorAll('.card,.score,.dim').length};
  })()`);
  ok('自动跳转复盘页并有内容', reviewHash.includes('/review') && reviewReady.nodes > 0, JSON.stringify(reviewReady));
  await shot('review.png');

  // ---------- 9. 控制台干净 ----------
  ok('无未捕获 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' / '));
  ok('无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' / '));

  // ---------- 汇总 ----------
  const failed = results.filter((r) => !r.pass);
  console.log('\n===== 汇总 =====');
  console.log('通过 ' + (results.length - failed.length) + '/' + results.length);
  if (failed.length) {
    console.log('未通过：');
    failed.forEach((f) => console.log('  ✗ ' + f.name + ' · ' + f.detail));
  }
  ws.close();
  process.exit(failed.length ? 1 : 0);
});
