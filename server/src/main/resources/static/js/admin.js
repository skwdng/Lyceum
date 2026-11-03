/* 管理后台（独立页面，不依赖 core.js）
 * 契约：docs/管理接口契约.md
 * 安全：所有来自服务端的字符串一律经 esc() 转义后再拼进 innerHTML（防 XSS）。
 */

const ADMIN_TOKEN_KEY = 'sy_admin_jwt';
const ADMIN_API = (location.pathname.indexOf('/siyige') === 0 ? '/siyige' : '') + '/api/admin';

const A = {
  tab: 'reports',
  stats: null,
  reports: null,   // {items,total,page,size}
  users: null,
  usersQ: '',
  audit: null,   // {items,total,page,size}
  detail: null
};

/* ---------------- 基础工具 ---------------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function $(sel) { return document.querySelector(sel); }

function toast(msg) {
  const host = $('#toastHost');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(function () { el.remove(); }, 2600);
}

function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(Number(ms));
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function adminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (e) { return ''; } }
function setAdminToken(t) { try { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); } catch (e) {} }

async function api(path, opts) {
  const o = opts || {};
  const headers = {};
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const tk = adminToken();
  if (tk) headers['Authorization'] = 'Bearer ' + tk;

  let resp;
  try {
    resp = await fetch(ADMIN_API + path, {
      method: o.method || 'GET',
      headers: headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined
    });
  } catch (e) {
    throw new Error('连不上后端');
  }
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

  // 统一把 code / status 挂到 Error 上，调用方才能按错误码分支（比如改密时 400 不该踢人）
  if (resp.status === 401 || resp.status === 403) {
    if (!o.keepLogin) { setAdminToken(''); showLogin(); }
    throw apiError(data, resp.status, '没有权限，请重新登录');
  }
  if (!resp.ok) throw apiError(data, resp.status, 'HTTP ' + resp.status);
  return data;
}

function apiError(data, status, fallback) {
  const raw = (data && data.message) || fallback;
  const err = new Error(String(raw).replace(/^[A-Z][A-Z0-9_]*:\s*/, ''));
  err.code = (data && data.code) || '';
  err.status = status;
  return err;
}

/* ---------------- 登录 / 登出 ---------------- */

function showLogin() {
  $('#loginView').style.display = 'flex';
  $('#appView').style.display = 'none';
  document.querySelectorAll('#modalHost .mask').forEach(function (m) { m.remove(); });
}

function showApp() {
  $('#loginView').style.display = 'none';
  $('#appView').style.display = 'block';
}

async function adminLogin(e) {
  if (e) e.preventDefault();
  const account = ($('#acc').value || '').trim();
  const password = $('#pwd').value || '';
  if (!account || !password) return toast('请输入账号和密码');
  const btn = $('#loginBtn');
  btn.disabled = true;
  try {
    const res = await api('/auth/login', { method: 'POST', body: { account: account, password: password }, keepLogin: true });
    if (!res || !res.token) throw new Error('登录失败');
    setAdminToken(res.token);
    $('#pwd').value = '';
    showApp();
    await boot();
  } catch (err) {
    toast(err.message || '登录失败');
  } finally {
    btn.disabled = false;
  }
}

function adminLogout() {
  setAdminToken('');
  A.stats = A.reports = A.users = A.detail = null;
  showLogin();
  toast('已退出登录');
}

/* ---------------- 启动 ---------------- */

async function boot() {
  showApp();
  try {
    await Promise.all([loadStats(), loadReports(1)]);
  } catch (e) {
    toast(e.message);
  }
}

function adminTab(tab) {
  A.tab = tab;
  $('#tabReports').classList.toggle('on', tab === 'reports');
  $('#tabUsers').classList.toggle('on', tab === 'users');
  $('#tabAudit').classList.toggle('on', tab === 'audit');
  $('#reportsPanel').style.display = tab === 'reports' ? '' : 'none';
  $('#usersPanel').style.display = tab === 'users' ? '' : 'none';
  $('#auditPanel').style.display = tab === 'audit' ? '' : 'none';
  if (tab === 'users' && !A.users) loadUsers(1);
  if (tab === 'audit' && !A.audit) loadAudit(1);
}

/* ---------------- 统计 ---------------- */

async function loadStats() {
  A.stats = await api('/stats');
  $('#stPending').textContent = A.stats.pendingReports;
  $('#stToday').textContent = A.stats.todayReports;
  $('#stBanned').textContent = A.stats.bannedUsers;
}

/* ---------------- 举报队列 ---------------- */

async function loadReports(page, status) {
  A.reports = await api('/reports?status=' + (status || 'PENDING') + '&page=' + (page || 1) + '&size=20');
  renderReports();
}

function renderReports() {
  const d = A.reports;
  const host = $('#reportsBody');
  if (!d) { host.innerHTML = '<div class="muted" style="padding:20px">加载中…</div>'; return; }
  if (!d.items.length) {
    host.innerHTML = '<div class="muted" style="padding:28px;text-align:center">没有待处理的举报 🎉</div>';
    return;
  }
  const rows = d.items.map(function (it) {
    const typeTag = it.targetType === 'POST'
      ? '<span class="tag blue">帖子</span>' : '<span class="tag orange">评论</span>';
    const multi = it.multiReport ? ' <span class="tag red">多人举报</span>' : '';
    const gone = it.targetExists ? '' : ' <span class="tag">目标已删除</span>';
    return '<tr>'
      + '<td>' + typeTag + '</td>'
      + '<td><div style="font-weight:600">' + esc(it.targetSummary || '（内容已删除）') + '</div>'
      + '<div class="muted" style="font-size:12px;margin-top:2px">'
      + esc(it.targetAuthor || '') + (it.postId ? ' · 帖子 #' + esc(it.postId) : '') + gone + '</div></td>'
      + '<td>' + esc(it.reporterCount) + ' 人' + multi + '</td>'
      + '<td>' + (it.reasons || []).map(function (r) { return '<span class="tag">' + esc(reasonName(r)) + '</span>'; }).join(' ') + '</td>'
      + '<td class="muted">' + fmtTime(it.lastAt) + '</td>'
      + '<td><button class="btn sm primary" onclick="openDetail(' + esc(it.firstReportId) + ')">处理</button></td>'
      + '</tr>';
  }).join('');
  host.innerHTML = '<table><thead><tr>'
    + '<th style="width:72px">类型</th><th>被举报内容</th><th style="width:120px">举报人数</th>'
    + '<th style="width:200px">原因</th><th style="width:130px">最近</th><th style="width:80px"></th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + pager(d, 'loadReports');
}

function reasonName(k) {
  const m = { SPAM: '垃圾广告', ABUSE: '人身攻击', ILLEGAL: '违法违规', OTHER: '其他' };
  return m[k] || k;
}

function actionName(k) {
  const m = { IGNORE: '忽略', DELETE: '删除内容', BAN: '禁言', DELETE_AND_BAN: '删除并禁言' };
  return m[k] || k;
}

function pager(d, fn) {
  const pages = Math.max(1, Math.ceil((d.total || 0) / (d.size || 20)));
  const page = d.page || 1;
  return '<div style="display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:12px 18px">'
    + '<span class="muted" style="font-size:12.5px">共 ' + esc(d.total) + ' 条 · 第 ' + page + '/' + pages + ' 页</span>'
    + '<button class="btn sm" ' + (page <= 1 ? 'disabled' : '') + ' onclick="' + fn + '(' + (page - 1) + ')">上一页</button>'
    + '<button class="btn sm" ' + (page >= pages ? 'disabled' : '') + ' onclick="' + fn + '(' + (page + 1) + ')">下一页</button>'
    + '</div>';
}

/* ---------------- 举报详情 + 处理 ---------------- */

async function openDetail(reportId) {
  try {
    A.detail = await api('/reports/' + reportId);
    renderDetail();
  } catch (e) { toast(e.message); }
}

function renderDetail() {
  document.querySelectorAll('#modalHost .mask').forEach(function (m) { m.remove(); });
  const d = A.detail;
  if (!d) return;
  const t = d.target || {};
  const isPost = t.targetType === 'POST';
  const body = isPost
    ? '<div class="kv"><span class="k">标题</span><span>' + esc(t.title || '') + '</span></div>'
      + '<pre class="content">' + esc(t.body || '') + '</pre>'
    : '<div class="kv"><span class="k">所属帖子</span><span>#' + esc(t.postId) + '</span></div>'
      + '<pre class="content">' + esc(t.body || '') + '</pre>';

  const reports = (d.reports || []).map(function (r) {
    const st = r.status === 'PENDING' ? '<span class="tag orange">待处理</span>'
      : r.status === 'REJECTED' ? '<span class="tag">已驳回</span>'
        : '<span class="tag ok">已处理</span> <span class="tag">' + esc(actionName(r.action)) + '</span>';
    return '<div class="it"><b>' + esc(r.reporterName || r.reporterId) + '</b>'
      + ' · ' + esc(reasonName(r.reason)) + ' · ' + fmtTime(r.createdAt) + ' ' + st
      + (r.detail ? '<div class="muted" style="margin-top:2px">补充：' + esc(r.detail) + '</div>' : '')
      + '</div>';
  }).join('');

  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'detailMask';
  mask.innerHTML = '<div class="modal">'
    + '<h3>处理举报 · ' + (isPost ? '帖子' : '评论') + ' #' + esc(t.targetType === 'POST' ? t.targetId : t.targetId) + '</h3>'
    + '<div class="body">'
    + '<div class="kv"><span class="k">作者</span><span>' + esc(t.authorName || t.author || '未知') + '</span></div>'
    + (t.deleted ? '<div class="kv"><span class="k">状态</span><span class="tag">内容已被删除</span></div>' : '')
    + body
    + '<div class="rlist"><div style="font-weight:600;margin-bottom:4px">' + (d.reports || []).length + ' 条举报</div>' + reports + '</div>'
    + '<div style="margin-top:14px"><label>处理备注（可选，最多 200 字）</label>'
    + '<textarea id="ddNote" maxlength="200" placeholder="例如：确认人身攻击"></textarea></div>'
    + '</div>'
    + '<div class="foot">'
    + '<div class="field-row"><span class="muted" style="font-size:12.5px">禁言天数</span>'
    + '<select id="ddDays"><option value="1">1 天</option><option value="3">3 天</option><option value="7" selected>7 天</option></select></div>'
    + '<button class="btn" onclick="closeDetail()">取消</button>'
    + '<button class="btn" onclick="resolveReport(\'IGNORE\')">忽略</button>'
    + '<button class="btn warn" onclick="resolveReport(\'BAN\')">禁言</button>'
    + '<button class="btn danger" onclick="resolveReport(\'DELETE\')">删除内容</button>'
    + '<button class="btn danger" onclick="resolveReport(\'DELETE_AND_BAN\')">删除并禁言</button>'
    + '</div></div>';
  $('#modalHost').appendChild(mask);
}

function closeDetail() {
  document.querySelectorAll('#modalHost .mask').forEach(function (m) { m.remove(); });
  A.detail = null;
}

async function resolveReport(action) {
  const d = A.detail;
  if (!d || !d.report) return;
  const noteEl = $('#ddNote');
  const daysEl = $('#ddDays');
  const body = { action: action, note: noteEl ? (noteEl.value || '').trim() || null : null };
  if (action === 'BAN' || action === 'DELETE_AND_BAN') {
    body.banDays = Number(daysEl ? daysEl.value : 7);
  }
  try {
    await api('/reports/' + d.report.reportId + '/resolve', { method: 'POST', body: body });
    closeDetail();
    toast('已处理：' + actionName(action));
    await Promise.all([loadStats(), loadReports(A.reports ? A.reports.page : 1)]);
  } catch (e) {
    toast(e.message);
  }
}

/* ---------------- 处理记录（审计）+ 一键恢复 ---------------- */

async function loadAudit(page) {
  A.audit = await api('/audit?page=' + (page || 1) + '&size=20');
  renderAudit();
}

function auditActionName(row) {
  if (row.action === 'RESTORE') return '<span class="tag blue">撤销处理</span>';
  return '<span class="tag orange">处理举报</span>';
}

function auditVerdictName(v) {
  const m = { IGNORE: '忽略', DELETE: '删除内容', BAN: '禁言', DELETE_AND_BAN: '删除并禁言' };
  return m[v] || v || '';
}

function renderAudit() {
  const d = A.audit;
  const host = $('#auditBody');
  if (!d) { host.innerHTML = '<div class="muted" style="padding:20px">加载中…</div>'; return; }
  if (!d.items.length) {
    host.innerHTML = '<div class="muted" style="padding:28px;text-align:center">还没有处理记录</div>';
    return;
  }
  const rows = d.items.map(function (r) {
    const obj = r.targetType ? (r.targetType === 'POST' ? '帖子' : '评论') + ' #' + esc(r.targetId) : '-';
    // 状态列只对「处理举报」有意义：RESTORE 行本身就是一次撤销动作，谈不上"生效中"。
    let state;
    let op;
    if (r.action === 'RESTORE') {
      state = '<span class="muted" style="font-size:12px">—</span>';
      op = '';
    } else if (r.undone) {
      state = '<span class="tag">已撤销</span><div class="muted" style="font-size:11.5px">' + fmtTime(r.undoAt) + '</div>';
      op = '<span class="muted" style="font-size:12px">已撤销</span>';
    } else {
      state = '<span class="tag ok">生效中</span>';
      op = r.canRestore
        ? '<button class="btn sm danger" onclick="restoreAudit(' + esc(r.id) + ')">恢复</button>'
        : '<span class="muted" style="font-size:12px">不可恢复</span>';
    }
    return '<tr>'
      + '<td class="muted" style="white-space:nowrap">' + fmtTime(r.createdAt) + '</td>'
      + '<td>' + esc(r.adminName || ('#' + r.adminId)) + '</td>'
      + '<td style="white-space:nowrap">' + auditActionName(r)
      + (r.verdict ? '<div class="muted" style="font-size:11.5px">' + esc(auditVerdictName(r.verdict)) + '</div>' : '')
      + '</td>'
      + '<td style="white-space:nowrap">' + esc(obj) + '</td>'
      + '<td>' + esc(r.detail || '') + '</td>'
      + '<td>' + state + '</td>'
      + '<td style="text-align:right">' + op + '</td>'
      + '</tr>';
  }).join('');
  host.innerHTML = '<table><thead><tr>'
    + '<th style="width:130px">时间</th><th style="width:90px">操作人</th><th style="width:140px">动作</th>'
    + '<th style="width:110px">对象</th><th>详情</th><th style="width:100px">状态</th><th style="width:90px"></th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + pager(d, 'loadAudit');
}

/**
 * 一键恢复：撤销某一次「删除内容」。
 *
 * <p>二次确认是硬要求（用户决策 C）：恢复意味着被删内容重新对所有用户可见。
 * 失败一律 409（已撤销 / 无内容可恢复 / 目标已不存在），直接 toast 给管理员看，不假装成功。
 */
async function restoreAudit(id) {
  if (!confirm('确认撤销这次处理？内容会重新可见')) return;
  try {
    await api('/audit/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
    toast('已恢复：内容重新可见（禁言不会一并解除）');
    await Promise.all([
      loadAudit(A.audit ? A.audit.page : 1),
      loadStats(),
      loadReports(A.reports ? A.reports.page : 1)
    ]);
  } catch (e) {
    toast(e.message || '恢复失败');
  }
}

/* ---------------- 用户管理 ---------------- */

function adminSearchUsers() {
  A.usersQ = ($('#userQ').value || '').trim();
  loadUsers(1);
}

async function loadUsers(page) {
  A.users = await api('/users?q=' + encodeURIComponent(A.usersQ) + '&page=' + (page || 1) + '&size=20');
  renderUsers();
}

function renderUsers() {
  const d = A.users;
  const host = $('#usersBody');
  if (!d) { host.innerHTML = '<div class="muted" style="padding:20px">加载中…</div>'; return; }
  if (!d.items.length) { host.innerHTML = '<div class="muted" style="padding:28px;text-align:center">没有匹配的用户</div>'; return; }
  const rows = d.items.map(function (u) {
    const disabled = u.disabled ? '<span class="tag red">全站封禁</span>' : '<span class="tag ok">正常</span>';
    const banned = u.banned ? '<span class="tag orange">禁言至 ' + fmtTime(u.banUntil) + '</span>' : '<span class="tag">未禁言</span>';
    const pend = u.pendingReports > 0 ? '<span class="tag red">' + esc(u.pendingReports) + '</span>' : '<span class="muted">0</span>';
    return '<tr>'
      + '<td><div style="font-weight:600">' + esc(u.name || u.account) + '</div>'
      + '<div class="muted" style="font-size:12px">' + esc(u.account) + '</div></td>'
      + '<td>' + disabled + '</td>'
      + '<td>' + banned + '</td>'
      + '<td>' + pend + '</td>'
      + '<td style="text-align:right;white-space:nowrap">'
      + '<select id="bd_' + esc(u.id) + '" style="width:82px;display:inline-block">'
      + '<option value="1">1 天</option><option value="3">3 天</option><option value="7" selected>7 天</option></select> '
      + '<button class="btn sm warn" onclick="banUser(\'' + esc(u.id) + '\')">禁言</button> '
      + '<button class="btn sm" onclick="unbanUser(\'' + esc(u.id) + '\')">解禁</button> '
      + (u.disabled
        ? '<button class="btn sm" onclick="setStatus(\'' + esc(u.id) + '\',1)">解封</button>'
        : '<button class="btn sm danger" onclick="setStatus(\'' + esc(u.id) + '\',0)">全站封禁</button>')
      + '</td></tr>';
  }).join('');
  host.innerHTML = '<table><thead><tr><th>用户</th><th style="width:110px">全站</th>'
    + '<th style="width:190px">社区禁言</th><th style="width:90px">待处理举报</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>' + pager(d, 'loadUsers');
}

async function banUser(id) {
  const sel = document.getElementById('bd_' + id);
  const days = Number(sel ? sel.value : 7);
  try {
    await api('/users/' + encodeURIComponent(id) + '/ban', { method: 'POST', body: { days: days, reason: '管理员操作' } });
    toast('已禁言 ' + days + ' 天');
    await Promise.all([loadStats(), loadUsers(A.users ? A.users.page : 1)]);
  } catch (e) { toast(e.message); }
}

async function unbanUser(id) {
  try {
    await api('/users/' + encodeURIComponent(id) + '/unban', { method: 'POST' });
    toast('已解除禁言');
    await Promise.all([loadStats(), loadUsers(A.users ? A.users.page : 1)]);
  } catch (e) { toast(e.message); }
}

async function setStatus(id, status) {
  if (status === 0 && !confirm('确定要全站封禁这个用户吗？封了之后他立刻无法登录、也无法使用社区。')) return;
  try {
    await api('/users/' + encodeURIComponent(id) + '/status', { method: 'POST', body: { status: status } });
    toast(status === 0 ? '已全站封禁' : '已解封');
    await Promise.all([loadStats(), loadUsers(A.users ? A.users.page : 1)]);
  } catch (e) { toast(e.message); }
}

/* ---------------- 修改密码（B3） ---------------- */

function adminOpenPassword() {
  document.querySelectorAll('#modalHost .mask').forEach(function (m) { m.remove(); });
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'pwdMask';
  mask.innerHTML = '<div class="modal" style="width:420px">'
    + '<h3>修改密码</h3>'
    + '<div class="body">'
    + '<p class="muted" style="font-size:12.5px;margin:0 0 12px">'
    + '8–64 位，必须同时包含数字和字母。改完后所有设备上的登录都会失效，需要重新登录。</p>'
    + '<label>当前密码</label>'
    + '<input id="apwdOld" type="password" autocomplete="current-password" maxlength="64">'
    + '<label>新密码</label>'
    + '<input id="apwdNew" type="password" autocomplete="new-password" maxlength="64">'
    + '<label>确认新密码</label>'
    + '<input id="apwdNew2" type="password" autocomplete="new-password" maxlength="64"'
    + ' onkeydown="if(event.key===\'Enter\')adminSubmitPassword()">'
    + '</div>'
    + '<div class="foot">'
    + '<button class="btn" onclick="closePwdModal()">取消</button>'
    + '<button class="btn primary" onclick="adminSubmitPassword()">确认修改</button>'
    + '</div></div>';
  $('#modalHost').appendChild(mask);
}

function closePwdModal() {
  document.querySelectorAll('#pwdMask').forEach(function (m) { m.remove(); });
}

async function adminSubmitPassword() {
  const oldPwd = ($('#apwdOld') || {}).value || '';
  const newPwd = ($('#apwdNew') || {}).value || '';
  const again = ($('#apwdNew2') || {}).value || '';

  if (!oldPwd) return toast('请输入当前密码');
  if (newPwd.length < 8 || newPwd.length > 64) return toast('新密码需 8–64 位');
  if (!/[0-9]/.test(newPwd) || !/[A-Za-z]/.test(newPwd)) return toast('新密码必须同时包含数字和字母');
  if (newPwd !== again) return toast('两次输入的新密码不一致');
  if (newPwd === oldPwd) return toast('新密码不能与旧密码相同');

  try {
    // keepLogin：400 是表单校验失败，不该把人踢下线
    await api('/auth/password', { method: 'PATCH', body: { oldPassword: oldPwd, newPassword: newPwd }, keepLogin: true });
    closePwdModal();
    setAdminToken('');
    showLogin();
    toast('密码已更新，请重新登录');
  } catch (e) {
    if (e.status === 401) {
      // 令牌已失效（比如别处改过密码）：清理并回登录页
      closePwdModal();
      setAdminToken('');
      showLogin();
    }
    toast(e.message || '修改失败');
  }
}

/* ---------------- 启动入口 ---------------- */

(function init() {
  if (!adminToken()) { showLogin(); return; }
  // 有令牌就先拉一次统计，失效会自动回登录页
  boot();
})();
