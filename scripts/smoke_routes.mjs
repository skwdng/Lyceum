// 全站冒烟：逐个路由打开，检查是否渲染出内容、有没有 JS 异常 / console.error
// 用法：node scripts/smoke_routes.mjs <端口> <baseUrl>
const PORT = process.argv[2] || 9874;
const BASE = process.argv[3] || 'http://120.24.204.138:8787/siyige';

const ROUTES = [
  ['/login', '登录页'],
  ['/solo', '单人辩论'],
  ['/hot', '热辩榜'],
  ['/records', '辩论记录'],
  ['/diag', '能力分析'],
  ['/wallet', '钱包'],
  ['/community', '社区'],
  ['/video', '短视频'],
  ['/offline', '离线对练'],
  ['/room', '多人房间'],
  ['/friends', '好友'],
  ['/notify', '通知'],
  ['/me', '个人中心'],
  ['/admin/login', '管理台登录'],
];

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
  let errs = [];
  let cerrs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 100));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      cerrs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 100));
    }
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resolve) => pend.set(i, { resolve }));
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r && r.result ? r.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);

  // 先注册一个账号，让需要登录的页面有数据可渲染
  const acc = 'smoke_' + Math.floor(Math.random() * 900000 + 10000);
  await ev(`(async()=>{
    const base='${BASE}';
    const r = await fetch(base + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json();
    if (d.token) localStorage.setItem('sy_jwt', d.token);
    return d.token ? 'ok' : 'fail';
  })()`);
  await send('Page.reload');
  await sleep(2000);

  const results = [];
  for (const [route, name] of ROUTES) {
    errs = [];
    cerrs = [];
    await send('Page.navigate', { url: BASE + '/v2/index.html#' + route });
    await sleep(2200);
    const info = await ev(`(()=>{
      const main=document.querySelector('#main')||document.querySelector('.app-main')||document.body;
      const text=(main.innerText||'').trim();
      return {len:text.length, head:text.slice(0,40).replace(/\\n/g,' '), nodes:main.querySelectorAll('*').length};
    })()`);
    const pass = info && info.len > 20 && errs.length === 0;
    results.push({ route, name, pass, len: info ? info.len : 0, head: info ? info.head : '', errs: errs.slice(0, 2), cerrs: cerrs.slice(0, 1) });
    console.log(`${pass ? '✓' : '✗'} ${route.padEnd(12)} ${name} · 文本 ${info ? info.len : 0} 字 · ${info ? info.head : ''}${errs.length ? ' · 异常: ' + errs[0] : ''}${cerrs.length ? ' · console: ' + cerrs[0] : ''}`);
  }

  // 语音输入：点一下应该进入录音态
  await send('Page.navigate', { url: BASE + '/v2/index.html#/solo' });
  await sleep(2000);
  const failed = results.filter((r) => !r.pass);
  console.log('\n===== 冒烟汇总 =====');
  console.log('通过 ' + (results.length - failed.length) + '/' + results.length);
  if (failed.length) failed.forEach((f) => console.log('  ✗ ' + f.route + ' ' + f.name + ' ' + JSON.stringify(f.errs)));
  ws.close();
  process.exit(failed.length ? 1 : 0);
});
