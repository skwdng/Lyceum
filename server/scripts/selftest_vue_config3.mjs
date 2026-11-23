// 参数管理第三批自检：7 项（视频审核 4 + AI 模型名 1 + 标签名长度 2）
//
// 验收口径（执行提示词第三批 §8）：
//   1. 参数页总数 24，分组「审核 / AI / 社区」项数齐
//   2. 改 video.audit.title-max 为 10 -> 来源变「数据库」；改成 0 被拒（低于 1）
//   3. 改 tag.name-max-cp 为 30 -> 被拒（上限 24，页面提示写明数据库列宽）
//   4. 改 ai.tiers.basic.model 为空 -> 被拒
//   5. 全部改回默认值 -> 来源回「默认值」，「已改过 N 项」归零
//   6. 非超管访问 403
//
// 用法：node server/scripts/selftest_vue_config3.mjs [cdpPort] [baseUrl]
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
  tmin: 'video.audit.title-min',
  tmax: 'video.audit.title-max',
  local: 'video.audit.allow-local-upload',
  review: 'video.audit.pass-requires-review',
  model: 'ai.tiers.basic.model',
  nmin: 'tag.name-min-cp',
  nmax: 'tag.name-max-cp',
};
const EXPECT = {
  [K.tmin]: '4', [K.tmax]: '60', [K.local]: 'true', [K.review]: 'true',
  [K.model]: 'qwen2.5:7b', [K.nmin]: '1', [K.nmax]: '12',
};
// 实际分组项数（2/5/5/4/4/4 = 24）；执行提示词里写的 4/4/3 只是新增项的粗略数，
// 这里以「总数 24 + 7 个键齐全 + 分组项数 = 实际值」为准
const GROUP_COUNT = { '告警': 2, '审核': 5, 'AI': 5, '计费': 4, '对局': 4, '社区': 4 };

const list = async (tok) => (await call('GET', '/api/admin/config', undefined, tok)).body;
const itemOf = (body, key) => (body.items || []).find((x) => x.key === key);
const setCfg = (key, value, tok) => call('POST', '/api/admin/config', { key, value }, tok);

// ==================== 1. 超管登录 + 列表 ====================
let adminTok = '';
await check('1 超管登录（admin/admin123）', async () => {
  const r = await call('POST', '/api/admin/auth/login', { account: 'admin', password: 'admin123' });
  need(r.status === 200 && r.body && r.body.token, '登录失败：' + r.status);
  adminTok = r.body.token;
  return 'SUPER';
});

await check('2 列表 24 项：分组项数正确 + 7 个新键默认值正确', async () => {
  const body = await list(adminTok);
  need(body.total === 24, '总数应为 24（10 + 7 + 7），实际 ' + body.total);
  const cnt = {};
  for (const it of body.items) cnt[it.group] = (cnt[it.group] || 0) + 1;
  const wrong = [];
  for (const g of Object.keys(GROUP_COUNT)) {
    if ((cnt[g] || 0) !== GROUP_COUNT[g]) wrong.push(g + ' 应为 ' + GROUP_COUNT[g] + ' 项，实际 ' + (cnt[g] || 0));
  }
  need(!wrong.length, wrong.join('；') + '（全部：' + JSON.stringify(cnt) + '）');
  const bad = [];
  for (const key of Object.keys(EXPECT)) {
    const it = itemOf(body, key);
    if (!it) { bad.push(key + ' 缺失'); continue; }
    if (it.value !== EXPECT[key]) bad.push(key + ' 当前值 ' + it.value + ' != ' + EXPECT[key]);
    if (it.defaultValue !== EXPECT[key]) bad.push(key + ' 默认值 ' + it.defaultValue + ' != ' + EXPECT[key]);
  }
  need(!bad.length, bad.join('；'));
  // 词表与死配置都不该出现
  for (const gone of ['video.audit.reject-words', 'video.audit.review-words', 'audit.llm-enabled', 'siyige.audit.llm-enabled']) {
    need(!itemOf(body, gone), gone + ' 不该出现在参数表里');
  }
  return '24 项 · ' + JSON.stringify(cnt);
});

// ==================== 3. 改 title-max ====================
await check('3 改 video.audit.title-max=10 -> 来源变数据库', async () => {
  const r = await setCfg(K.tmax, '10', adminTok);
  need(r.status === 200, '改参数失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.item.value === '10' && r.body.item.source === 'DB', JSON.stringify(r.body.item));
  return '10 · 来源=' + r.body.item.sourceLabel;
});

await check('4 title-max=0 被拒（低于下限 1）', async () => {
  const r = await setCfg(K.tmax, '0', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(String(r.body.message).indexOf('不能小于 1') >= 0, r.body.message);
  const body = await list(adminTok);
  need(itemOf(body, K.tmax).value === '10', '被拒后库里仍是 10，实际 ' + itemOf(body, K.tmax).value);
  return r.body.message;
});

await check('5 tag.name-max-cp=30 被拒（上限 24）', async () => {
  const r = await setCfg(K.nmax, '30', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(String(r.body.message).indexOf('24') >= 0, r.body.message);
  const body = await list(adminTok);
  need(itemOf(body, K.nmax).source === 'DEFAULT', '被拒的值不该落库');
  need(String(itemOf(body, K.nmax).hint).indexOf('列宽') >= 0, '提示里要写明数据库列宽：' + itemOf(body, K.nmax).hint);
  return r.body.message + ' · hint=' + itemOf(body, K.nmax).hint;
});

await check('6 ai.tiers.basic.model 为空被拒（STRING 不能为空）', async () => {
  const r = await setCfg(K.model, '   ', adminTok);
  need(r.status === 400, '应该 400，实际 ' + r.status);
  need(String(r.body.message).indexOf('不能为空') >= 0, r.body.message);
  return r.body.message;
});

await check('7 改 tag.name-max-cp=4 能写进去（合法区间）', async () => {
  const r = await setCfg(K.nmax, '4', adminTok);
  need(r.status === 200 && r.body.item.value === '4', JSON.stringify(r.body && r.body.item));
  return '4 · 来源=' + r.body.item.sourceLabel;
});

// ==================== 8-10. 页面 ====================
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
  const openPage = async () => {
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
    await sleep(900);
    await ev('localStorage.clear(); true');
    await ev('localStorage.setItem("sy_admin_jwt", ' + JSON.stringify(adminTok) + '); true');
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/config' });
    await sleep(1600);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await openPage();

  await check('8 参数页 24 行，7 个新键都在页面上（审核/AI/社区）', async () => {
    await waitFor('!!document.querySelector(\'[data-panel="config"]\')', '参数页');
    await waitFor('document.querySelectorAll(\'[data-cfg-key]\').length === 24', '24 行参数');
    const missing = await ev('(function(keys){var have={};var trs=document.querySelectorAll("[data-cfg-key]");'
      + 'for(var i=0;i<trs.length;i++){have[trs[i].getAttribute("data-cfg-key")]=1;}'
      + 'return keys.filter(function(k){return !have[k];});})(' + JSON.stringify(Object.values(K)) + ')');
    need(!missing.length, '页面上找不到：' + JSON.stringify(missing));
    const groups = await ev('Array.prototype.map.call(document.querySelectorAll(".cfg-group"), function(s){return s.getAttribute("data-group");})');
    need(groups.indexOf('审核') >= 0, '没有审核分组：' + JSON.stringify(groups));
    return '24 行 · ' + groups.join('/');
  });

  await check('9 页面上 title-max 那行显示了刚改的 10（来源=数据库）', async () => {
    const TR = '[data-cfg-key="' + K.tmax + '"]';
    const st = await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");var src=tr.querySelector(".cfg-src");'
      + 'return { value: i.value, type: i.getAttribute("type"), src: src ? src.textContent.trim() : "" };})()');
    need(st.value === '10', '页面上的值应为 10，实际 ' + st.value);
    need(st.type === 'number', 'INT 应该是 number 输入框：' + st.type);
    need(st.src === '数据库', '来源应显示「数据库」，实际「' + st.src + '」');
    return '10 · 来源=数据库';
  });

  await check('10 页面里把 title-max 改回 60 -> 来源回「默认值」、头部计数归零', async () => {
    const TR = '[data-cfg-key="' + K.tmax + '"]';
    await ev('(function(){var tr=document.querySelector(\'' + TR + '\');'
      + 'var i=tr.querySelector("[data-cfg-input]");'
      + 'i.value="60"; i.dispatchEvent(new Event("input",{bubbles:true})); return true;})()');
    await ev('document.querySelector(\'' + TR + ' [data-cfg-save]\').click(); true');
    await waitFor('(document.querySelector(\'' + TR + ' .cfg-src\')||{}).textContent.trim()==="默认值"', '来源回默认值');

    // 再把 name-max-cp=4 也改回 12（默认），然后整页刷新看「已改过 N 项」
    const nmax = await setCfg(K.nmax, '12', adminTok);
    need(nmax.status === 200 && nmax.body.item.source === 'DEFAULT', 'name-max-cp 应回到默认值');
    await send('Page.reload');
    await sleep(2200);
    await waitFor('!!document.querySelector(\'[data-panel="config"]\')', '参数页');
    const head = await ev('(document.querySelector(\'[data-panel="config"] h2 .muted\')||{}).textContent.trim()');
    need(/0 \/ 24/.test(head || ''), '头部应显示 0 / 24 项已改过，实际「' + head + '」');
    return head;
  });

  await check('11 全程零 JS 异常', async () => {
    need(!errs.length, errs.slice(0, 2).join(' | '));
    return '无异常';
  });
} catch (e) {
  out.push('FAIL  页面部分（8-11）  -> ' + e.message);
} finally {
  if (ws) { try { ws.close(); } catch (e) { /* 忽略 */ } }
}

// ==================== 12. 非超管 ====================
await check('12 非超管（OPS）读/写参数都 403', async () => {
  const opsAcc = 'ops3' + STAMP;
  const created = await call('POST', '/api/admin/admins', { account: opsAcc, role: 'OPS' }, adminTok);
  need(created.status === 200, '建 OPS 账号失败：' + created.status);
  const oneTime = created.body.password;
  const login = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: oneTime });
  need(login.status === 200, 'OPS 登录失败：' + login.status);
  const pwd = await call('PATCH', '/api/admin/auth/password',
    { oldPassword: oneTime, newPassword: 'opsCfgThree123' }, login.body.token);
  need(pwd.status === 200 || pwd.status === 204, 'OPS 改密失败：' + pwd.status);
  const relogin = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: 'opsCfgThree123' });
  const opsTok = relogin.body.token;
  const write = await setCfg(K.tmin, '6', opsTok);
  need(write.status === 403 && write.body.code === 'FORBIDDEN_PERM',
    '写应 403 FORBIDDEN_PERM：' + write.status + ' ' + JSON.stringify(write.body));
  const read = await call('GET', '/api/admin/config', undefined, opsTok);
  need(read.status === 403, '读也应 403：' + read.status);
  const body = await list(adminTok);
  need(itemOf(body, K.tmin).value === '4', 'OPS 的越权写不该改到值');
  return 'OPS: 写 403 / 读 403';
});

// ==================== 收尾 ====================
try {
  const body = await list(adminTok);
  for (const it of body.items) {
    if (it.source === 'DB') {
      const log = await call('GET', '/api/admin/config/log?key=' + encodeURIComponent(it.key) + '&limit=50', undefined, adminTok);
      const seeds = ((log.body && log.body.items) || []).filter((x) => x.oldValue === null);
      const first = seeds[seeds.length - 1];
      if (first) await call('POST', '/api/admin/config/rollback', { logId: first.id }, adminTok);
    }
  }
  const after = await list(adminTok);
  const left = (after.items || []).filter((x) => x.source === 'DB').map((x) => x.key);
  out.push('CLEAN 收尾：仍被改过的参数 ' + (left.length ? left.join('/') : '无'));
} catch (e) {
  out.push('CLEAN 收尾失败（不影响结论）：' + e.message);
}

console.log(out.join('\n'));
const pass = out.filter((l) => l.indexOf('PASS') === 0).length;
const total = out.filter((l) => l.indexOf('PASS') === 0 || l.indexOf('FAIL') === 0).length;
console.log('\n汇总：' + pass + '/' + total + ' 通过');
process.exit(out.some((l) => l.indexOf('FAIL') === 0) ? 1 : 0);
