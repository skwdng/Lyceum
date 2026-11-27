// 参数管理（第一批 10 项）自检：改完能不能「不重启就生效」
//
// 验收口径（执行提示词 C4 / 设计方案 §11）：
//   登录超管 -> 改 tag.max-per-post 为 2 -> 不重启 -> 发带 3 个标签的帖子被拒 ->
//   改回 5 -> 同样请求通过 -> 改成 abc 被拒 -> 非超管 403 ->
//   页面显示「来源=数据库」（顺带验生效徽标、历史展开、菜单入口）
//
// 用法：node server/scripts/selftest_vue_config.mjs [cdpPort] [baseUrl]
//   例：node server/scripts/selftest_vue_config.mjs 9482 http://localhost:8080
//
// 前置：
//   · 后端起着 —— 本脚本**不会**重启它，这正是要证明的事；
//   · 管理台种子账号 admin / admin123（见 schema-admin.sql）；
//   · 页面部分要一个开着的浏览器（headless Edge/Chrome 的 CDP 端口）；没有就只跑接口部分。

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

const KEY = 'tag.max-per-post';
const stamp = Date.now().toString().slice(-6);

// ==================== 造数：一个普通用户（发帖用） ====================
const userAcc = 'cfguser' + stamp;
await call('POST', '/api/auth/register', { account: userAcc, password: 'abc12345' });
const userTok = (await call('POST', '/api/auth/login', { account: userAcc, password: 'abc12345' })).body.token;
need(userTok, '普通用户登录失败：拿不到令牌（后端没起？）');

/** 发一篇带 3 个标签的帖子：标题每次都不一样，避免撞业务校验 */
let postSeq = 0;
const postWith3Tags = (prefix) => call('POST', '/api/community/posts', {
  type: 'CHAT',
  title: '参数自检帖 ' + stamp + ' #' + (++postSeq),
  body: '这篇用来验证「每帖最多标签数」改了以后能不能不重启就生效。',
  tags: [prefix + '一', prefix + '二', prefix + '三']
}, userTok);

// ==================== 1. 超管登录 ====================
let adminTok = '';
await check('1 超管登录（admin/admin123）', async () => {
  const r = await call('POST', '/api/admin/auth/login', { account: 'admin', password: 'admin123' });
  need(r.status === 200 && r.body && r.body.token, '登录失败：' + r.status + ' ' + JSON.stringify(r.body));
  adminTok = r.body.token;
  const me = await call('GET', '/api/admin/me', undefined, adminTok);
  need(me.status === 200, '/me 失败：' + me.status);
  need(me.body.role === 'SUPER', '种子账号不是 SUPER：' + me.body.role);
  return me.body.role + ' · ' + (me.body.perms || []).length + ' 个权限点';
});

// ==================== 2. 列表：10 项 + 来源 + 生效时机 ====================
await check('2 参数列表：10 项、按分组、带来源与生效时机', async () => {
  const r = await call('GET', '/api/admin/config', undefined, adminTok);
  need(r.status === 200, '列表失败：' + r.status);
  need(r.body.total >= 10, '第一批至少 10 项，实际 ' + r.body.total);
  need(Array.isArray(r.body.groups) && r.body.groups.length >= 5, '分组不对：' + JSON.stringify(r.body.groups));
  const item = r.body.items.find((x) => x.key === KEY);
  need(item, '列表里没有 ' + KEY);
  need(item.effectLabel === '立即生效', KEY + ' 应该是立即生效：' + item.effectLabel);
  need(item.source === 'DEFAULT' || item.source === 'DB', '来源字段不对：' + item.source);
  const alertItem = r.body.items.find((x) => x.key === 'alert.report.threshold');
  need(alertItem.effectLabel === '下次扫描生效', '告警阈值应该是「下次扫描生效」');
  need(alertItem.defaultValue === '3', '告警阈值默认值必须还是 3（红线 5）：' + alertItem.defaultValue);
  return '10 项 · ' + r.body.groups.join('/') + ' · 告警默认值 ' + alertItem.defaultValue;
});

// ==================== 3. 改成 2（不重启） ====================
await check('3 超管把 tag.max-per-post 改成 2', async () => {
  const r = await call('POST', '/api/admin/config', { key: KEY, value: '2' }, adminTok);
  need(r.status === 200, '改参数失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.item.value === '2', '值没改到 2：' + r.body.item.value);
  need(r.body.item.source === 'DB', '改完来源应该是数据库：' + r.body.item.source);
  return '2 · 来源=' + r.body.item.sourceLabel + ' · 生效=' + r.body.item.effectLabel;
});

// ==================== 4. 发 3 个标签被拒（进程没重启） ====================
await check('4 不重启：发带 3 个标签的帖子被拒（TAG_LIMIT，文案写 2）', async () => {
  const r = await postWith3Tags('上限二');
  need(r.status === 400, '应该 400，实际 ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 160));
  need(r.body && r.body.code === 'TAG_LIMIT', '错误码应为 TAG_LIMIT：' + JSON.stringify(r.body));
  need(String(r.body.message).indexOf('最多 2 个') >= 0, '报错文案要用当前上限 2：' + r.body.message);
  return r.body.message;
});

// ==================== 5. 改回 5 ====================
await check('5 超管改回 5', async () => {
  const r = await call('POST', '/api/admin/config', { key: KEY, value: '5' }, adminTok);
  need(r.status === 200, '改回 5 失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.item.value === '5', '值没改回 5：' + r.body.item.value);
  return '5';
});

await check('6 同样那 3 个标签的请求通过', async () => {
  const r = await postWith3Tags('上限五');
  need(r.status === 200, '应该 200，实际 ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 160));
  need(r.body && r.body.postId, '没有返回 postId');
  need((r.body.tags || []).length === 3, '标签数不是 3：' + JSON.stringify(r.body.tags));
  return 'postId=' + r.body.postId + ' · ' + r.body.tags.map((t) => t.name).join('/');
});

// ==================== 7. 非法值被拒 ====================
await check('7 改成 abc 被拒（400 INVALID_PARAM），库里仍是 5', async () => {
  const bad = await call('POST', '/api/admin/config', { key: KEY, value: 'abc' }, adminTok);
  need(bad.status === 400, '应该 400，实际 ' + bad.status);
  need(bad.body.code === 'INVALID_PARAM', '错误码应为 INVALID_PARAM：' + JSON.stringify(bad.body));
  const list = await call('GET', '/api/admin/config', undefined, adminTok);
  const item = list.body.items.find((x) => x.key === KEY);
  need(item.value === '5', '坏值不该落库，现在是 ' + item.value);
  return bad.body.message + ' · 库里仍 ' + item.value;
});

// ==================== 8. 非超管 403 ====================
await check('8 非超管（OPS）改参数 403 FORBIDDEN_PERM，读也 403', async () => {
  const opsAcc = 'ops' + stamp;
  const created = await call('POST', '/api/admin/admins', { account: opsAcc, role: 'OPS' }, adminTok);
  need(created.status === 200, '建 OPS 账号失败：' + created.status + ' ' + JSON.stringify(created.body).slice(0, 160));
  const oneTime = created.body.password;
  need(oneTime, '创建响应里没有一次性密码');

  const login = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: oneTime });
  need(login.status === 200 && login.body.token, 'OPS 登录失败：' + login.status);

  // 首登必须先改密（后端会 403 PASSWORD_CHANGE_REQUIRED），改完才走到真正的权限判定
  const pwd = await call('PATCH', '/api/admin/auth/password',
    { oldPassword: oneTime, newPassword: 'opsCfg12345' }, login.body.token);
  need(pwd.status === 200 || pwd.status === 204, 'OPS 改密失败：' + pwd.status + ' ' + JSON.stringify(pwd.body));
  const relogin = await call('POST', '/api/admin/auth/login', { account: opsAcc, password: 'opsCfg12345' });
  need(relogin.status === 200 && relogin.body.token, 'OPS 重新登录失败：' + relogin.status);
  const opsTok = relogin.body.token;

  const write = await call('POST', '/api/admin/config', { key: KEY, value: '3' }, opsTok);
  need(write.status === 403, 'OPS 改参数应该 403，实际 ' + write.status + ' ' + JSON.stringify(write.body));
  need(write.body.code === 'FORBIDDEN_PERM', '403 的 code 应为 FORBIDDEN_PERM：' + JSON.stringify(write.body));

  const read = await call('GET', '/api/admin/config', undefined, opsTok);
  need(read.status === 403, 'OPS 读参数也应该 403，实际 ' + read.status);

  const list = await call('GET', '/api/admin/config', undefined, adminTok);
  need(list.body.items.find((x) => x.key === KEY).value === '5', 'OPS 的越权请求不该改动值');
  return 'OPS: 写 403 / 读 403 · ' + write.body.message;
});

// ==================== 9. 历史（接口） ====================
await check('9 历史可查：老值/新值/操作人都在，最早一条旧值为 null', async () => {
  const r = await call('GET', '/api/admin/config/log?key=' + encodeURIComponent(KEY) + '&limit=10', undefined, adminTok);
  need(r.status === 200, '历史接口失败：' + r.status);
  need(r.body.items.length >= 2, '至少应该有两三条历史：' + r.body.items.length);
  const newest = r.body.items[0];
  need(newest.newValue === '5', '最新一条应该是改成 5：' + JSON.stringify(newest));
  need(newest.operator === 'admin', '操作人应该是 admin：' + newest.operator);
  const oldest = r.body.items[r.body.items.length - 1];
  need(oldest.oldValue === null, '最早一条的旧值应为 null（= 当时用的默认值）：' + JSON.stringify(oldest));
  return r.body.items.length + ' 条 · 最新 ' + newest.oldValue + '→' + newest.newValue;
});


// ==================== 10-12. 页面：来源=数据库 / 生效徽标 / 历史 / 菜单 ====================
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  // 页面要看到「来源=数据库」，就得先留一个**非默认值**的覆盖行：
  // 从 4eef4aa 起「改回默认值 = 删掉那一行」，删了行来源就会回到默认值。
  await call('POST', '/api/admin/config', { key: KEY, value: '3' }, adminTok);

  // 先清场：别的自检脚本会留下 sy_jwt / sy_admin_jwt，混着用会串号
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
  await sleep(900);
  await ev('localStorage.clear(); true');
  await ev('localStorage.setItem("sy_admin_jwt", ' + JSON.stringify(adminTok) + '); true');
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/config' });
  await sleep(1500);

  const ROW = '[data-cfg-key="' + KEY + '"]';

  await check('10 参数页：来源显示「数据库」、生效徽标、历史可展开', async () => {
    await waitFor('!!document.querySelector(\'[data-panel="config"]\')', '参数页');
    await waitFor('document.querySelectorAll(\'[data-cfg-key]\').length >= 10', '参数行');

    const st = await ev('(function(){var tr=document.querySelector(\'' + ROW + '\');'
      + 'var src=tr.querySelector(".cfg-src");var tag=tr.querySelector(".tag");var inp=tr.querySelector("[data-cfg-input]");'
      + 'return { srcText: src?src.textContent.trim():"", srcAttr: src?src.getAttribute("data-source"):"",'
      + ' effect: tag?tag.textContent.trim():"", value: inp?inp.value:"" };})()');
    need(st.srcText === '数据库', '来源应显示「数据库」，实际「' + st.srcText + '」');
    need(st.srcAttr === 'DB', '来源属性应为 DB，实际 ' + st.srcAttr);
    need(st.effect === '立即生效', '生效徽标不对：' + st.effect);
    need(st.value === '3', '页面上的值应为刚设的 3，实际 ' + st.value);

    const alertEffect = await ev('(document.querySelector(\'[data-cfg-key="alert.report.threshold"] .tag\')||{}).textContent.trim()');
    need(alertEffect === '下次扫描生效', '告警阈值应显示「下次扫描生效」，实际 ' + alertEffect);

    // 展开历史：应该能看到 admin 改过的那几条（老值 -> 新值 -> 回滚按钮）
    await ev('document.querySelector(\'' + ROW + ' [data-cfg-history]\').click(); true');
    await waitFor('document.querySelectorAll(\'[data-cfg-hist="' + KEY + '"] [data-cfg-log]\').length > 0', '历史列表');
    const rows = await ev('document.querySelectorAll(\'[data-cfg-hist="' + KEY + '"] [data-cfg-log]\').length');
    need(rows >= 2, '历史条数不对：' + rows);

    return '来源=数据库 · 生效=' + st.effect + ' · 历史 ' + rows + ' 条';
  });

  await check('11 菜单：超管能看到「参数管理」', async () => {
    const has = await ev('Array.prototype.some.call(document.querySelectorAll(".adm-nav a"), function(a){return a.getAttribute("href")==="#/admin/config";})');
    need(has, '侧栏没有参数管理入口');
    return '系统 → 参数管理';
  });

  await check('12 全程零 JS 异常', async () => {
    need(!errs.length, errs.slice(0, 2).join(' | '));
    return '无异常';
  });
} catch (e) {
  out.push('FAIL  页面部分（10-12）  -> ' + e.message);
} finally {
  if (ws) { try { ws.close(); } catch (e) { /* 忽略 */ } }
}

// ==================== 收尾：把参数回到默认值 ====================
try {
  const r = await call('GET', '/api/admin/config/log?key=' + encodeURIComponent(KEY) + '&limit=50', undefined, adminTok);
  const seeds = (r.body.items || []).filter((x) => x.oldValue === null);
  const first = seeds[seeds.length - 1];
  if (first) {
    const back = await call('POST', '/api/admin/config/rollback', { logId: first.id }, adminTok);
    out.push('CLEAN 已回滚 ' + KEY + ' 到默认值（删掉库里那一行，行为与改造前一致）：'
      + (back.body && back.body.item ? back.body.item.value + '/' + back.body.item.sourceLabel : back.status));
  } else {
    out.push('CLEAN ' + KEY + ' 没有「从默认值改起」的历史，无需回滚');
  }
} catch (e) {
  out.push('CLEAN 收尾失败（不影响上面的结论）：' + e.message);
}

console.log(out.join('\n'));
const pass = out.filter((l) => l.indexOf('PASS') === 0).length;
const total = out.filter((l) => l.indexOf('PASS') === 0 || l.indexOf('FAIL') === 0).length;
console.log('\n汇总：' + pass + '/' + total + ' 通过');
process.exit(out.some((l) => l.indexOf('FAIL') === 0) ? 1 : 0);
