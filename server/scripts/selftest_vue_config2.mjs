// 参数管理第二批自检：7 项新参数（计费 2 + 对局 4 + AI 1）+ DOUBLE 类型
//
// 验收口径（执行提示词第二批 §9）：
//   1. 参数页出现新增 7 行（计费 2 + 对局 4 + AI 1），DOUBLE 显示成小数输入框
//   2. 把 pace.turn-seconds 改成 60 -> 保存 -> 页面来源变「数据库」
//   3. 改成 0.01 被拒（低于下限 0.05）；改成 3601 被拒（超上限）
//   4. 改回 300（默认值）-> 来源回到「默认值」
//   5. 把 pace.time-scale 改成 abc 被拒
//   6. 非超管访问 403
//
// 用法：node server/scripts/selftest_vue_config2.mjs [cdpPort] [baseUrl]
//   前置：后端起着（脚本不重启它）、种子账号 admin/admin123、一个开着的浏览器 CDP 端口

const PORT = process.argv[2] || '9482';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, path, body, token) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt.slice(0, 200) }; }
  return { status: r.status, body: j };
};

const out = [];
const check = async (n, f) => {
  try {
    const v = await f();
    out.push('PASS  ' + n + (v ? '  [' + v + ']' : ''));
  } catch (e) {
    out.push('FAIL  ' + n + '  -> ' + e.message);
  }
};
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

const STAMP = Date.now().toString().slice(-6);
const K = {
  scale: 'pace.time-scale',
  turn: 'pace.turn-seconds',
  think: 'pace.ai-think-ms',
  delay: 'pace.ai-delay-scale',
  cents: 'billing.cents-per-1k-tokens',
  est: 'billing.estimate-tokens',
  speech: 'ai.speech-enabled',
};

const list = async (tok) => (await call('GET', '/api/admin/config', undefined, tok)).body;
const itemOf = (body, key) => (body.items || []).find((x) => x.key === key);
const setCfg = (key, value, tok) => call('POST', '/api/admin/config', { key, value }, tok);

// ==================== 1. 超管登录 ====================
let adminTok = '';
await check('1 超管登录（admin/admin123）', async () => {
  const r = await call('POST', '/api/admin/auth/login', { account: 'admin', password: 'admin123' });
  need(r.status === 200 && r.body && r.body.token, '登录失败：' + r.status + ' ' + JSON.stringify(r.body));
  adminTok = r.body.token;
  return 'SUPER';
});

// ==================== 2. 列表：17 项 + 新增 7 项默认值 ====================
await check('2 列表 17 项、出现「对局」分组、7 项默认值与线上一致', async () => {
  const body = await list(adminTok);
  need(body.total === 17, '应该是 17 项（第一批 10 + 第二批 7），实际 ' + body.total);
  need((body.groups || []).indexOf('对局') >= 0, '新分组「对局」没出现：' + JSON.stringify(body.groups));
  const expect = {
    [K.cents]: '3', [K.est]: '9000', [K.scale]: '0.05', [K.turn]: '300',
    [K.think]: '700', [K.delay]: '1.0', [K.speech]: 'true',
  };
  const wrong = [];
  for (const key of Object.keys(expect)) {
    const it = itemOf(body, key);
    if (!it) { wrong.push(key + ' 不在列表里'); continue; }
    if (it.defaultValue !== expect[key]) wrong.push(key + ' 默认值 ' + it.defaultValue + ' != ' + expect[key]);
    if (it.value !== expect[key]) wrong.push(key + ' 当前值 ' + it.value + ' != ' + expect[key]);
  }
  need(!wrong.length, wrong.join('；'));
  const scale = itemOf(body, K.scale);
  need(scale.type === 'DOUBLE', 'pace.time-scale 类型应为 DOUBLE，实际 ' + scale.type);
  need(Number(scale.min) === 0.05 && Number(scale.max) === 3, 'time-scale 范围应为 0.05-3：' + scale.min + '-' + scale.max);
  return '17 项 · ' + body.groups.join('/');
});

// ==================== 3. 改成 60（不重启） ====================
await check('3 把 pace.turn-seconds 改成 60 -> 来源变数据库', async () => {
  const r = await setCfg(K.turn, '60', adminTok);
  need(r.status === 200, '改参数失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.item.value === '60', '值没改到 60：' + r.body.item.value);
  need(r.body.item.source === 'DB', '改完来源应为数据库：' + r.body.item.source);
  const body = await list(adminTok);
  need(itemOf(body, K.turn).value === '60', '列表里应该已经是 60');
  return '60 · 来源=' + r.body.item.sourceLabel;
});

// ==================== 4. 边界与坏值 ====================
await check('4 pace.time-scale=0.01 被拒（低于下限 0.05）', async () => {
  const r = await setCfg(K.scale, '0.01', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(r.body.code === 'INVALID_PARAM', '错误码应为 INVALID_PARAM：' + JSON.stringify(r.body));
  need(String(r.body.message).indexOf('0.05') >= 0, '文案要点出下限：' + r.body.message);
  return r.body.message;
});

await check('5 pace.turn-seconds=3601 被拒（超上限 3600）', async () => {
  const r = await setCfg(K.turn, '3601', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(String(r.body.message).indexOf('3600') >= 0, '文案要点出上限：' + r.body.message);
  const body = await list(adminTok);
  need(itemOf(body, K.turn).value === '60', '被拒之后不该改动库里既有的 60，实际 ' + itemOf(body, K.turn).value);
  return r.body.message;
});

await check('6 pace.time-scale=abc 被拒（必须是数字）', async () => {
  const r = await setCfg(K.scale, 'abc', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(String(r.body.message).indexOf('数字') >= 0, '文案要说清是数字：' + r.body.message);
  const body = await list(adminTok);
  need(itemOf(body, K.scale).source === 'DEFAULT', '坏值不该落库');
  return r.body.message;
});

await check('7 DOUBLE 端点可写：time-scale=1.0 -> 1.5', async () => {
  const ok1 = await setCfg(K.scale, '1.0', adminTok);
  need(ok1.status === 200, '1.0 应该能写：' + ok1.status + ' ' + JSON.stringify(ok1.body));
  const ok2 = await setCfg(K.scale, '1.5', adminTok);
  need(ok2.status === 200 && ok2.body.item.value === '1.5', '1.5 应该能写：' + JSON.stringify(ok2.body && ok2.body.item));
  return '1.0 -> 1.5 都能写';
});

// ==================== 8. 改回默认值 = 删行 ====================
await check('8 改回 300（默认值）-> 来源回到「默认值」且库里那条行被删掉', async () => {
  const r = await setCfg(K.turn, '300', adminTok);
  need(r.status === 200, '改回 300 失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.item.source === 'DEFAULT', '改回默认值后来源应回到默认值：' + r.body.item.source);
  need(r.body.item.value === '300', '值应为 300：' + r.body.item.value);
  const log = await call('GET', '/api/admin/config/log?key=' + encodeURIComponent(K.turn) + '&limit=5', undefined, adminTok);
  need(log.body.items.length >= 1, '改回去也要留一笔历史：' + log.body.items.length);
  const back = await setCfg(K.scale, '0.05', adminTok);
  need(back.status === 200 && back.body.item.source === 'DEFAULT', 'time-scale 也要能回默认（不落行）');
  return '300 / 默认值 · 历史 ' + log.body.items.length + ' 条';
});

// ==================== 9. 非超管 403 ====================
await check('9 非超管（OPS）读/写参数都 403', async () => {
  const opsAcc = 'ops2' + STAMP;
  const created = await call('POST', '/api/admin/admins', { account: opsAcc, role: 'OPS' }, adminTok);
  need(created.status === 200, '建 OPS 账号失败：' + created.status);
  const oneTime = created.body.password;
  const login = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: oneTime });
  need(login.status === 200, 'OPS 登录失败：' + login.status);
  const pwd = await call('PATCH', '/api/admin/auth/password',
    { oldPassword: oneTime, newPassword: 'opsCfgTwo123' }, login.body.token);
  need(pwd.status === 200 || pwd.status === 204, 'OPS 改密失败：' + pwd.status);
  const relogin = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: 'opsCfgTwo123' });
  const opsTok = relogin.body.token;
  const write = await setCfg(K.think, '1000', opsTok);
  need(write.status === 403 && write.body.code === 'FORBIDDEN_PERM', '写应 403 FORBIDDEN_PERM：' + write.status + ' ' + JSON.stringify(write.body));
  const read = await call('GET', '/api/admin/config', undefined, opsTok);
  need(read.status === 403, '读也应 403：' + read.status);
  const body = await list(adminTok);
  need(itemOf(body, K.think).value === '700', 'OPS 的越权写不该改到值');
  return 'OPS: 写 403 / 读 403';
});

// ==================== 10-12. 页面 ====================
async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(250);
  }
  throw new Error('没有可用的浏览器（CDP 端口 ' + PORT + '）');
}

let ws = null;
try {
  ws = new WebSocket(await getWs());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map();
  const errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id);
      pend.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      errs.push((d.exception && d.exception.description) || d.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pend.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result.value;
  };
  const waitFor = async (expr, label, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await ev(expr)) return true;
      await sleep(150);
    }
    throw new Error('timeout:' + label);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // 造一个「已改过」的值，页面才有「数据库」来源可看（改回默认值会删行）
  await setCfg(K.scale, '0.2', adminTok);

  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
  await sleep(900);
  await ev('localStorage.clear(); true');
  await ev('localStorage.setItem("sy_admin_jwt", ' + JSON.stringify(adminTok) + '); true');
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/config' });
  await sleep(1600);

  await check('10 参数页 17 行、出现「对局」分组、DOUBLE 是小数输入框', async () => {
    await waitFor('!!document.querySelector(\'[data-panel="config"]\')', '参数页');
    await waitFor('document.querySelectorAll(\'[data-cfg-key]\').length === 17', '17 行参数');
    const groups = await ev('Array.prototype.map.call(document.querySelectorAll(".cfg-group"), function(s){return s.getAttribute("data-group");})');
    need(groups.indexOf('对局') >= 0, '页面没有「对局」分组：' + JSON.stringify(groups));

    const TR = '[data-cfg-key="' + K.scale + '"]';
    const st = await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");var src=tr.querySelector(".cfg-src");'
      + 'return { type: i.getAttribute("type"), step: i.getAttribute("step"), value: i.value,'
      + ' src: src ? src.textContent.trim() : "" };})()');
    need(st.type === 'number', 'DOUBLE 应该是 number 输入框，实际 ' + st.type);
    need(st.step === '0.05', 'DOUBLE 的 step 应为 0.05，实际 ' + st.step);
    need(st.value === '0.2', '页面上的值应为刚设的 0.2，实际 ' + st.value);
    need(st.src === '数据库', '来源应显示「数据库」，实际「' + st.src + '」');
    return '17 行 · 分组含对局 · DOUBLE step=0.05 · 来源=数据库';
  });

  await check('11 页面里把 pace.turn-seconds 改成 60 并保存 -> 来源变数据库', async () => {
    const TR = '[data-cfg-key="' + K.turn + '"]';
    const before = await ev('(document.querySelector(\'' + TR + ' .cfg-src\')||{}).textContent.trim()');
    need(before === '默认值', '改之前应该是默认值，实际 ' + before);
    await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");'
      + 'i.value="60"; i.dispatchEvent(new Event("input",{bubbles:true})); return true;})()');
    await ev('document.querySelector(\'' + TR + ' [data-cfg-save]\').click(); true');
    await waitFor('(document.querySelector(\'' + TR + ' .cfg-src\')||{}).textContent.trim()==="数据库"', '来源变数据库');
    return '60 · 来源=数据库';
  });

  await check('12 页面里改成 3601 被行内校验拦住（不发请求）', async () => {
    const TR = '[data-cfg-key="' + K.turn + '"]';
    await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");'
      + 'i.value="3601"; i.dispatchEvent(new Event("input",{bubbles:true})); return true;})()');
    await ev('document.querySelector(\'' + TR + ' [data-cfg-save]\').click(); true');
    await sleep(600);
    const err = await ev('(document.querySelector(\'' + TR + ' [data-cfg-error]\')||{}).textContent');
    need(err && err.indexOf('3600') >= 0, '行内应提示不能大于 3600，实际 ' + err);
    const body = await list(adminTok);
    need(itemOf(body, K.turn).value === '60', '被行内拦住时不该发请求改库');
    // 改回合法值再保存，页面上仍然显示 60（等于没改）
    await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");'
      + 'i.value="60"; i.dispatchEvent(new Event("input",{bubbles:true})); return true;})()');
    return err;
  });

  await check('13 全程零 JS 异常', async () => {
    need(!errs.length, errs.slice(0, 2).join(' | '));
    return '无异常';
  });
} catch (e) {
  out.push('FAIL  页面部分（10-13）  -> ' + e.message);
} finally {
  if (ws) { try { ws.close(); } catch (e) { /* 忽略 */ } }
}

// ==================== 收尾 ====================
try {
  for (const key of [K.scale, K.turn]) {
    const log = await call('GET', '/api/admin/config/log?key=' + encodeURIComponent(key) + '&limit=50', undefined, adminTok);
    const seeds = ((log.body && log.body.items) || []).filter((x) => x.oldValue === null);
    const first = seeds[seeds.length - 1];
    if (first) await call('POST', '/api/admin/config/rollback', { logId: first.id }, adminTok);
  }
  const body = await list(adminTok);
  const left = (body.items || []).filter((x) => x.source === 'DB').map((x) => x.key);
  out.push('CLEAN 收尾：已改过的参数 ' + (left.length ? left.join('/') : '无') + '（本脚本只动 time-scale / turn-seconds）');
} catch (e) {
  out.push('CLEAN 收尾失败（不影响结论）：' + e.message);
}

console.log(out.join('\n'));
const pass = out.filter((l) => l.indexOf('PASS') === 0).length;
const total = out.filter((l) => l.indexOf('PASS') === 0 || l.indexOf('FAIL') === 0).length;
console.log('\n汇总：' + pass + '/' + total + ' 通过');
process.exit(out.some((l) => l.indexOf('FAIL') === 0) ? 1 : 0);
