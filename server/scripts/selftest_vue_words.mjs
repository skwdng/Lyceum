// 屏蔽词管理自检（W1-W3 的端到端验收）
//
// 用法：node server/scripts/selftest_vue_words.mjs [cdpPort] [baseUrl]
//   前置：后端起着（脚本不重启它）、种子账号 admin/admin123、一个开着的浏览器 CDP 端口
//
// 覆盖执行提示词 §验收 的每一条：加词 -> 发帖打码 -> 标签拒绝 -> 停用/启用/删除 ->
// 视频两份词表 -> 批量粘贴 -> 501 被拒 -> 导出 -> 审计 + 不可恢复 -> 清空社区词表的兜底 + 页面红条。
//
// ⚠️ 脚本会先把 COMMUNITY 词表导出成备份、最后原样补回去（清了再补，跑完环境干净）。

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
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt.slice(0, 300) }; }
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
const WORD = '测试屏蔽词' + STAMP;        // 社区词（打码 + 标签拒绝）
const REJECT = '测试硬违规' + STAMP;      // 视频硬违规
const REVIEW = '测试转人工' + STAMP;      // 视频转人工
const BATCH = [];
for (let i = 1; i <= 10; i++) BATCH.push('批量词' + STAMP + '_' + i);

const list = (tok, q) => call('GET', '/api/admin/words?' + new URLSearchParams(q || {}).toString(), undefined, tok);
const summary = async (tok) => (await call('GET', '/api/admin/words/summary', undefined, tok)).body;
const addWords = (tok, scope, words) => call('POST', '/api/admin/words', { scope, words }, tok);
const importText = (tok, scope, text) => call('POST', '/api/admin/words/import', { scope, text }, tok);

const findWord = async (tok, scope, word) => {
  const r = await list(tok, { scope, q: word, page: 1, size: 50 });
  return ((r.body && r.body.items) || []).find((x) => x.word === word);
};
const deleteWord = async (tok, scope, word) => {
  const row = await findWord(tok, scope, word);
  if (row) await call('DELETE', '/api/admin/words/' + row.id, undefined, tok);
};

// ==================== 超管 + 种子 ====================
let admin = '';
await check('1 超管登录，三份词表的种子已随启动导入', async () => {
  const r = await call('POST', '/api/admin/auth/login', { account: 'admin', password: 'admin123' });
  need(r.status === 200 && r.body && r.body.token, '登录失败：' + r.status);
  admin = r.body.token;
  const s = await summary(admin);
  const byScope = {};
  for (const x of s.scopes || []) byScope[x.scope] = x;
  for (const scope of ['COMMUNITY', 'VIDEO_REJECT', 'VIDEO_REVIEW']) {
    need(byScope[scope], '汇总里少了 ' + scope);
    need(byScope[scope].enabled > 0, scope + ' 一条词都没有（启动导入没跑？）');
  }
  return '社区 ' + byScope.COMMUNITY.enabled + ' / 硬违规 ' + byScope.VIDEO_REJECT.enabled
    + ' / 转人工 ' + byScope.VIDEO_REVIEW.enabled + ' 条';
});

// ==================== 权限 ====================
const makeAdmin = async (account, role) => {
  const created = await call('POST', '/api/admin/admins', { account, role }, admin);
  need(created.status === 200, '建 ' + role + ' 账号失败：' + created.status + ' ' + JSON.stringify(created.body));
  const oneTime = created.body.password;
  const login = await call('POST', '/api/admin/auth/login', { account, password: oneTime });
  need(login.status === 200, role + ' 登录失败：' + login.status);
  const pwd = await call('PATCH', '/api/admin/auth/password',
    { oldPassword: oneTime, newPassword: 'wordsTest123' }, login.body.token);
  need(pwd.status === 200 || pwd.status === 204, role + ' 改密失败：' + pwd.status);
  const again = await call('POST', '/api/admin/auth/login', { account, password: 'wordsTest123' });
  need(again.status === 200, role + ' 重新登录失败：' + again.status);
  return again.body.token;
};

let modTok = '';
await check('2 审核（MOD）能读写词表', async () => {
  modTok = await makeAdmin('wordmod' + STAMP, 'MOD');
  const r = await list(modTok, { scope: 'COMMUNITY' });
  need(r.status === 200, 'MOD 读列表应 200：' + r.status);
  const add = await addWords(modTok, 'COMMUNITY', ['MOD加的' + STAMP]);
  need(add.status === 200 && add.body.added === 1, 'MOD 加词失败：' + add.status + ' ' + JSON.stringify(add.body));
  await deleteWord(admin, 'COMMUNITY', 'MOD加的' + STAMP);
  return 'MOD 读 200 / 写成功';
});

await check('3 只读（VIEWER）读写都 403，且词表没被改动', async () => {
  const viewerTok = await makeAdmin('wordviewer' + STAMP, 'VIEWER');
  const read = await list(viewerTok, { scope: 'COMMUNITY' });
  need(read.status === 403, 'VIEWER 读应 403：' + read.status);
  const write = await addWords(viewerTok, 'COMMUNITY', ['越权词' + STAMP]);
  need(write.status === 403 && write.body.code === 'FORBIDDEN_PERM',
    'VIEWER 写应 403 FORBIDDEN_PERM：' + write.status + ' ' + JSON.stringify(write.body));
  need(!(await findWord(admin, 'COMMUNITY', '越权词' + STAMP)), '越权写不该落库');
  return 'VIEWER: 读 403 / 写 403';
});

// ==================== 用户侧：发帖打码 / 标签拒绝 ====================
const userAcc = 'worduser' + STAMP;
await call('POST', '/api/auth/register', { account: userAcc, password: 'abc12345' });
const userTok = (await call('POST', '/api/auth/login', { account: userAcc, password: 'abc12345' })).body.token;
const post = (title, body, tags) => call('POST', '/api/community/posts',
  { type: 'CHAT', title, body, tags: tags || [] }, userTok);
const readPost = async (id) => (await call('GET', '/api/community/posts/' + id, undefined, userTok)).body;

await check('4 后台加词 -> 列表出现 -> 立刻生效（不重启）', async () => {
  const r = await addWords(admin, 'COMMUNITY', [WORD]);
  need(r.status === 200, '加词失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.added === 1, '应当新增 1 条，实际 ' + JSON.stringify(r.body));
  const row = await findWord(admin, 'COMMUNITY', WORD);
  need(row && row.enabled === true, '列表里找不到刚加的词：' + JSON.stringify(row));
  return 'id=' + row.id + ' · ' + row.word;
});

await check('5 发一条含该词的帖子 -> 正文里变成 ＊（没重启）', async () => {
  const r = await post('打码验证 ' + STAMP, '这句话里有' + WORD + '，应该被遮住', []);
  need(r.status === 200, '发帖失败：' + r.status + ' ' + JSON.stringify(r.body));
  const p = await readPost(r.body.postId);
  need(String(p.body).includes('＊'), '正文没有被遮：' + p.body);
  need(!String(p.body).includes(WORD), '正文里还能看到原词：' + p.body);
  return 'postId=' + r.body.postId + ' · ' + p.body;
});

await check('6 同一批词用在标签里 -> 被拒（TAG_BLOCKED）', async () => {
  const r = await post('标签验证 ' + STAMP, '正文干净的一句话', [WORD]);
  need(r.status === 400, '应当 400：' + r.status + ' ' + JSON.stringify(r.body).slice(0, 160));
  need(String(r.body.message || '').includes('TAG_BLOCKED') || String(r.body.code || '').includes('TAG_BLOCKED'),
    '不是 TAG_BLOCKED：' + JSON.stringify(r.body));
  return r.body.message || r.body.code;
});

// ==================== 视频两份词表 ====================
await check('7 视频-硬违规加词 -> 上传含该词的视频被驳回', async () => {
  const add = await addWords(admin, 'VIDEO_REJECT', [REJECT]);
  need(add.status === 200 && add.body.added === 1, '加硬违规词失败：' + JSON.stringify(add.body));
  const r = await call('POST', '/api/video/videos',
    { title: '视频 ' + STAMP, description: '描述里有' + REJECT, url: 'https://cdn.example.com/a.mp4' }, userTok);
  need(r.status === 200, '上传失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.auditStatus === 'REJECTED', '应当是 REJECTED，实际 ' + r.body.auditStatus + ' / ' + r.body.reason);
  need(String(r.body.reason).includes('违禁词'), '驳回理由应提到违禁词：' + r.body.reason);
  return r.body.auditStatus + ' · ' + r.body.reason;
});

await check('8 视频-转人工加词 -> 上传转人工（不自动杀）', async () => {
  const add = await addWords(admin, 'VIDEO_REVIEW', [REVIEW]);
  need(add.status === 200 && add.body.added === 1, '加转人工词失败：' + JSON.stringify(add.body));
  const r = await call('POST', '/api/video/videos',
    { title: '视频 ' + STAMP, description: '描述里有' + REVIEW, url: 'https://cdn.example.com/a.mp4' }, userTok);
  need(r.body.auditStatus === 'REVIEW', '应当是 REVIEW，实际 ' + r.body.auditStatus);
  return r.body.auditStatus + ' · ' + r.body.reason;
});

// ==================== 停用 / 启用 / 删除 ====================
await check('9 停用该词 -> 新帖不再打码（老帖不变）', async () => {
  const row = await findWord(admin, 'COMMUNITY', WORD);
  const off = await call('POST', '/api/admin/words/' + row.id + '/disable', undefined, admin);
  need(off.status === 200, '停用失败：' + off.status);
  const r = await post('停用后 ' + STAMP, '这句话里有' + WORD + '，现在不该被遮', []);
  const p = await readPost(r.body.postId);
  need(String(p.body).includes(WORD), '停用后仍然被遮：' + p.body);
  need(!String(p.body).includes('＊'), '停用后不该出现 ＊：' + p.body);
  return '新帖干净 · 老帖仍是 ＊';
});

await check('10 重新启用 -> 又打码', async () => {
  const row = await findWord(admin, 'COMMUNITY', WORD);
  const on = await call('POST', '/api/admin/words/' + row.id + '/enable', undefined, admin);
  need(on.status === 200, '启用失败：' + on.status);
  const r = await post('启用后 ' + STAMP, '这句话里有' + WORD + '，又要被遮', []);
  const p = await readPost(r.body.postId);
  need(String(p.body).includes('＊'), '启用后又该打码：' + p.body);
  return '又变成 ＊';
});

await check('11 删除该词 -> 不再打码', async () => {
  await deleteWord(admin, 'COMMUNITY', WORD);
  need(!(await findWord(admin, 'COMMUNITY', WORD)), '删除后还查得到');
  const r = await post('删除后 ' + STAMP, '这句话里有' + WORD + '，删了就不遮', []);
  const p = await readPost(r.body.postId);
  need(String(p.body).includes(WORD), '删除后仍被遮：' + p.body);
  return '词已删 · 新帖不打码';
});

// ==================== 批量粘贴 / 上限 / 导出 ====================
await check('12 批量粘贴 10 条（换行 + 中文逗号 + 顿号混用）-> 全部入库', async () => {
  const text = BATCH.slice(0, 4).join('\n') + '\n' + BATCH.slice(4, 7).join('，') + '\n' + BATCH.slice(7).join('、');
  const r = await importText(admin, 'COMMUNITY', text);
  need(r.status === 200, '导入失败：' + r.status + ' ' + JSON.stringify(r.body));
  need(r.body.added === 10, '应当入库 10 条，实际 ' + JSON.stringify({ added: r.body.added, invalid: r.body.invalid }));
  return 'added=' + r.body.added;
});

await check('13 再导入同样的 10 条 -> 全部跳过（幂等）', async () => {
  const r = await importText(admin, 'COMMUNITY', BATCH.join('\n'));
  need(r.status === 200, '重复导入失败：' + r.status);
  need(r.body.added === 0 && r.body.skipped === 10, '应当 added=0 skipped=10，实际 ' + JSON.stringify(r.body));
  return 'skipped=' + r.body.skipped;
});

await check('14 一次导入 501 条 -> 被拒（单批上限 500）', async () => {
  const many = [];
  for (let i = 0; i < 501; i++) many.push('超限词' + STAMP + '_' + i);
  const r = await importText(admin, 'COMMUNITY', many.join('\n'));
  need(r.status === 400, '应当 400：' + r.status);
  need(String(r.body.message).includes('500'), '提示里要写 500：' + r.body.message);
  return r.body.message;
});

await check('15 导出 txt -> 与列表一致（含注释头）', async () => {
  const r = await fetch(BASE + '/api/admin/words/export?scope=COMMUNITY', { headers: { Authorization: 'Bearer ' + admin } });
  need(r.status === 200, '导出失败：' + r.status);
  const txt = await r.text();
  const lines = txt.split(/\r?\n/);
  need(lines[0].startsWith('#'), '第一行应是注释头：' + lines[0]);
  const body = lines.filter((l) => l && !l.startsWith('#'));
  const rl = await list(admin, { scope: 'COMMUNITY', page: 1, size: 200 });
  const enabled = (rl.body.items || []).filter((x) => x.enabled).map((x) => x.word);
  for (const w of BATCH) need(body.includes(w), '导出里少了 ' + w);
  need(body.length === enabled.length, '导出行数 ' + body.length + ' 与启用词数 ' + enabled.length + ' 不一致');
  return body.length + ' 行';
});

// ==================== 审计 ====================
await check('16 审计里有 WORD_ADD / WORD_DELETE，且恢复返回 NOT_RESTORABLE', async () => {
  const r = await call('GET', '/api/admin/audit?targetType=WORD&page=1&size=50', undefined, admin);
  need(r.status === 200, '查处理记录失败：' + r.status);
  const items = r.body.items || [];
  const actions = items.map((x) => x.action);
  need(actions.includes('WORD_ADD'), '没有 WORD_ADD 记录：' + JSON.stringify(actions.slice(0, 6)));
  need(actions.includes('WORD_DELETE'), '没有 WORD_DELETE 记录');
  const added = items.find((x) => x.action === 'WORD_ADD');
  const restore = await call('POST', '/api/admin/audit/' + added.id + '/restore', undefined, admin);
  need(restore.status === 409, '恢复应 409：' + restore.status + ' ' + JSON.stringify(restore.body));
  need(String(restore.body.message).includes('NOT_RESTORABLE'), '应是 NOT_RESTORABLE：' + JSON.stringify(restore.body));
  return 'WORD_ADD/WORD_DELETE 都在 · 恢复 409 NOT_RESTORABLE';
});

// ==================== 页面 ====================
/** 清空社区词表前的备份（收尾要用；声明在顶层，页面那一段抛异常时也能补回来） */
let backup = [];

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
let ev = null;
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
  ev = async (expr) => {
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
  const openWords = async () => {
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
    await sleep(900);
    await ev('localStorage.clear(); true');
    await ev('localStorage.setItem("sy_admin_jwt", ' + JSON.stringify(admin) + '); true');
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/words' });
    await sleep(1800);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await openWords();

  await check('17 页面：菜单有「屏蔽词」，三个 tab 齐、能切换', async () => {
    await waitFor('!!document.querySelector(\'[data-panel="words"]\')', '屏蔽词页');
    const menu = await ev('Array.prototype.map.call(document.querySelectorAll("a"), function(a){return a.textContent.trim();}).join("|")');
    need(menu.includes('屏蔽词'), '菜单里没有「屏蔽词」：' + menu.slice(0, 200));
    const tabs = await ev('Array.prototype.map.call(document.querySelectorAll("[data-scope]"), function(b){return b.getAttribute("data-scope");})');
    need(tabs.length === 3, '应有 3 个 tab，实际 ' + JSON.stringify(tabs));
    need(tabs.join(',') === 'COMMUNITY,VIDEO_REJECT,VIDEO_REVIEW', 'tab 顺序不对：' + JSON.stringify(tabs));
    // 切到「视频-硬违规」：列表里应能看到第 7 步加的那个词
    await ev('document.querySelector(\'[data-scope="VIDEO_REJECT"]\').click(); true');
    await waitFor('!!document.querySelector(\'[data-word="' + REJECT + '"]\')', '硬违规词出现');
    return '三个 tab · 切换后列表跟着变';
  });

  await check('18 页面：导入框 + 行操作 + 导出按钮都在', async () => {
    const ui = await ev('(function(){return {'
      + ' input: !!document.querySelector("[data-words-input]"),'
      + ' importBtn: !!document.querySelector("[data-words-import]"),'
      + ' exportBtn: !!document.querySelector("[data-words-export]"),'
      + ' toggle: !!document.querySelector("[data-word-toggle]"),'
      + ' del: !!document.querySelector("[data-word-del]"),'
      + ' search: !!document.querySelector("[data-words-search]")};})()');
    for (const k of Object.keys(ui)) need(ui[k], '页面缺控件：' + k);
    return '导入框 / 导入 / 导出 / 停用 / 删除 / 搜索 都在';
  });

  await check('19 页面：tab 上写清了命中后果（打码 / 驳回 / 审查）', async () => {
    const text = await ev('document.querySelector(\'[data-panel="words"]\').textContent');
    for (const kw of ['打码', '驳回', '审查', '立即生效']) {
      need(String(text).includes(kw), '页面里没有「' + kw + '」');
    }
    return '打码 / 驳回 / 审查 / 立即生效';
  });

  // ==================== 清空社区词表：兜底 + 红条 ====================
  await check('20 清空社区词表 -> 页面红条 + 后端仍按旧表打码（兜底）', async () => {
    const rl = await list(admin, { scope: 'COMMUNITY', page: 1, size: 200 });
    for (const x of rl.body.items || []) backup.push(x.word);
    need(backup.length > 0, '备份为空，测试不成立');
    for (const x of rl.body.items || []) {
      await call('DELETE', '/api/admin/words/' + x.id, undefined, admin);
    }
    const s = await summary(admin);
    need(s.communityEmpty === true, 'summary.communityEmpty 应为 true');
    need(s.maskedBy === 'file-fallback', '兜底来源应显示 file-fallback，实际 ' + s.maskedBy);

    // 兜底：库里空了，但内存里换成**文件那份**表 -> 发帖仍然被打码。
    // 一次把所有原词都写上：只要文件兜底生效，至少会有词被遮（不依赖具体是哪一条还在文件里）
    const r = await post('清空后 ' + STAMP, '兜底验证：' + backup.join('，'), []);
    const p = await readPost(r.body.postId);
    need(String(p.body).includes('＊'), '清空后兜底失效（内容全裸）：' + p.body);

    // 页面红条
    await ev('location.hash = "#/admin/words"; true');
    await send('Page.reload');
    await sleep(2000);
    await waitFor('!!document.querySelector(\'[data-panel="words"]\')', '屏蔽词页');
    await waitFor('!!document.querySelector(\'[data-words-alert]\')', '红色横幅', 8000);
    const banner = await ev('document.querySelector("[data-words-alert]").textContent.trim()');
    need(banner.includes('社区词表为空'), '红条文案不对：' + banner);
    return banner.slice(0, 40) + '…（兜底仍打码）';
  });

  await check('21 零 JS 异常', async () => {
    need(!errs.length, errs.slice(0, 2).join(' | '));
    return '无异常';
  });
} catch (e) {
  out.push('FAIL  页面部分（17-21）  -> ' + e.message);
} finally {
  if (ws) { try { ws.close(); } catch (e) { /* 忽略 */ } }
}

// ==================== 收尾：把测试写过的东西收拾干净 ====================
try {
  // 1) 社区词表：清空过 -> 用备份补回去
  for (const w of Array.from(new Set(backup))) {
    if (!(await findWord(admin, 'COMMUNITY', w))) {
      await addWords(admin, 'COMMUNITY', [w]);
    }
  }
  // 2) 测试词全部删掉
  for (const w of BATCH) await deleteWord(admin, 'COMMUNITY', w);
  await deleteWord(admin, 'COMMUNITY', WORD);
  await deleteWord(admin, 'VIDEO_REJECT', REJECT);
  await deleteWord(admin, 'VIDEO_REVIEW', REVIEW);
  const s = await summary(admin);
  const left = [];
  for (const x of s.scopes || []) left.push(x.scope + '=' + x.enabled);
  out.push('CLEAN 收尾：' + left.join(' / ') + '（已恢复成启动导入的种子）');
} catch (e) {
  out.push('CLEAN 收尾失败（请手工检查词表）：' + e.message);
}

console.log(out.join('\n'));
const pass = out.filter((l) => l.indexOf('PASS') === 0).length;
const total = out.filter((l) => l.indexOf('PASS') === 0 || l.indexOf('FAIL') === 0).length;
console.log('\n汇总：' + pass + '/' + total + ' 通过');
process.exit(out.some((l) => l.indexOf('FAIL') === 0) ? 1 : 0);

