/* 登录 / 注册 / 我的
 * 归属：见 docs/协作规范.md；契约：docs/认证接口契约.md
 * 约定：
 *   · 唯一渲染入口 viewAuth()（core.js 的 render() 调用）
 *   · 其余 authXxx() 是全局函数，供内联 onclick 使用
 *   · token 存 localStorage['sy_jwt']（决策：接受 XSS 风险换实现简单，且方便 curl 对照调试）
 *   · 401 只提示登录，不自动重试原请求（决策 A5）
 */

const AUTH_TOKEN_KEY = 'sy_jwt';

/* ---------------- token ---------------- */

function authToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (e) { return ''; }
}

function authSetToken(t) {
  try {
    if (t) localStorage.setItem(AUTH_TOKEN_KEY, t);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) { /* 隐私模式等场景忽略 */ }
}

/** 清掉本地登录态（token + S.user）。 */
function authClear() {
  authSetToken('');
  S.user = null;
}

/* ---------------- 请求 ---------------- */

/**
 * 认证接口专用请求：解析 {code,message} 错误体，401 时自动清本地登录态。
 * 不复用 core 的 api()，因为 api() 只抛文本，拿不到机读 code。
 */
async function authApi(path, method, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t = authToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;

  let resp;
  try {
    resp = await fetch(API_BASE + path, {
      method: method || 'GET',
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    const err = new Error('后端未连接'); err.code = 'NETWORK'; throw err;
  }

  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

  if (!resp.ok) {
    const err = new Error((data && data.message) || ('HTTP ' + resp.status));
    err.code = (data && data.code) || ('HTTP_' + resp.status);
    err.status = resp.status;
    if (resp.status === 401) { authClear(); }
    throw err;
  }
  return data;
}

/** 错误码 -> 中文；与认证契约 §4 一致。 */
function authErrText(e) {
  const map = {
    INVALID_PARAM: '参数不合法',
    ACCOUNT_TAKEN: '该用户名已被占用',
    BAD_CREDENTIALS: '用户名或密码错误',
    UNAUTHORIZED: '登录已过期，请重新登录',
    TOO_MANY_ATTEMPTS: '尝试次数过多，请稍后再试',
    SERVICE_UNAVAILABLE: '登录服务暂时不可用，请稍后再试',
    NETWORK: '连不上后端'
  };
  const code = (e && e.code) || '';
  const base = map[code];
  const raw = String((e && e.message) || '');
  const detail = raw.replace(/^[A-Z][A-Z0-9_]*:\s*/, '').trim();
  if (base) return detail && detail !== raw ? base + '（' + detail + '）' : base;
  return detail || raw || '操作失败';
}

/* ---------------- 启动时恢复登录态 ---------------- */

/** boot() 里调用：有 token 就拉一次 /me，失效则自动清掉。 */
async function authRestore() {
  if (!authToken()) { S.user = null; return; }
  try {
    S.user = await authApi('/api/auth/me', 'GET');
  } catch (e) {
    // 401 已在 authApi 里清 token；其它错误（网络/503）保留 token，下次再试
    if ((e && e.code) === 'UNAUTHORIZED') S.user = null;
  }
}

/* ---------------- 动作 ---------------- */

function authTab(which) {
  S.authTab = which === 'register' ? 'register' : 'login';
  render();
}

async function authLogin() {
  const account = (document.querySelector('#authAccount') || {}).value || '';
  const password = (document.querySelector('#authPassword') || {}).value || '';
  if (!account.trim()) return toast('请输入账号');
  if (!password) return toast('请输入密码');
  try {
    const res = await authApi('/api/auth/login', 'POST', { account: account.trim(), password: password });
    if (res && res.token) authSetToken(res.token);
    S.user = res && res.user ? res.user : null;
    toast('欢迎回来，' + (S.user ? S.user.name : ''));
    go('community');
  } catch (e) {
    toast(authErrText(e));
  }
}

async function authRegister() {
  const account = (document.querySelector('#authAccount') || {}).value || '';
  const password = (document.querySelector('#authPassword') || {}).value || '';
  if (!account.trim()) return toast('请输入账号');
  if (!password) return toast('请输入密码');
  try {
    const res = await authApi('/api/auth/register', 'POST', { account: account.trim(), password: password });
    if (res && res.token) authSetToken(res.token);
    S.user = res && res.user ? res.user : null;
    toast('注册成功，' + (S.user ? S.user.name : ''));
    go('community');
  } catch (e) {
    toast(authErrText(e));
  }
}

async function authLogout() {
  try { await authApi('/api/auth/logout', 'POST'); } catch (e) { /* 本地照样退出 */ }
  authClear();
  toast('已退出登录');
  go('community');
}

async function authRename() {
  const input = document.querySelector('#authName');
  const name = input ? String(input.value || '').trim() : '';
  if (!name) return toast('昵称不能为空');
  try {
    S.user = await authApi('/api/auth/me', 'PATCH', { name: name });
    toast('昵称已更新');
    render();
  } catch (e) {
    toast(authErrText(e));
  }
}

/* ---------------- 视图 ---------------- */

function viewAuth() {
  return S.user ? viewMePanel() : viewAuthForms();
}

function viewAuthForms() {
  const isReg = S.authTab === 'register';
  return `
  <div class="card auth-card">
    <div class="auth-tabs">
      <a class="${isReg ? '' : 'on'}" onclick="authTab('login')">登录</a>
      <a class="${isReg ? 'on' : ''}" onclick="authTab('register')">注册</a>
    </div>
    <p class="sub">${isReg
      ? '账号 3–32 位字母 / 数字 / 下划线；密码至少 8 位，且同时含数字和字母。'
      : '登录后即可发帖、评论、点赞；不登录也能浏览社区。'}</p>
    <div class="auth-field">
      <label for="authAccount">账号</label>
      <input id="authAccount" autocomplete="username" placeholder="例如 zhang" maxlength="32">
    </div>
    <div class="auth-field">
      <label for="authPassword">密码</label>
      <input id="authPassword" type="password" autocomplete="${isReg ? 'new-password' : 'current-password'}"
             placeholder="至少 8 位，含数字和字母" maxlength="64"
             onkeydown="if(event.key==='Enter')${isReg ? 'authRegister()' : 'authLogin()'}">
    </div>
    <div class="auth-actions">
      <button class="btn primary" onclick="${isReg ? 'authRegister()' : 'authLogin()'}">${isReg ? '注册并登录' : '登录'}</button>
    </div>
  </div>`;
}

function viewMePanel() {
  const u = S.user || {};
  return `
  <div class="card auth-card">
    <div class="auth-tabs"><a class="on">我的</a></div>
    <p class="sub">账号：<b class="auth-account">${esc(u.account || '')}</b></p>
    <div class="auth-field">
      <label for="authName">昵称</label>
      <input id="authName" value="${esc(u.name || '')}" maxlength="64" placeholder="显示在社区帖子与评论上">
    </div>
    <p class="sub">昵称会显示在社区的所有帖子和评论上，保存后立刻生效。</p>
    <div class="auth-actions">
      <button class="btn primary" onclick="authRename()">保存昵称</button>
      <button class="btn ghost" onclick="authLogout()">退出登录</button>
    </div>
  </div>`;
}
/* ---------------- 左下角账号块（唯一的登录入口） ---------------- */

/**
 * 侧栏左下角那块「头像 + 名字 + 副标题」就是账号入口，不再单独占一个导航项。
 * 未登录：头像「登」、名字「未登录」、副标题「点此登录 / 注册」，点击进登录页；
 * 已登录：头像取昵称首字、名字是昵称、副标题是 @账号，点击进「我的」面板。
 */
function authRenderMeBox() {
  const box = document.getElementById('meBox');
  if (!box) return;
  const av = document.getElementById('meAv');
  const nm = document.getElementById('meName');
  const sub = document.getElementById('meSub');
  const u = S.user;
  const name = u ? String(u.name || u.account || '') : '';

  if (av) av.textContent = u ? (name.slice(0, 1) || '?') : '登';
  if (nm) nm.textContent = u ? name : '未登录';
  if (sub) sub.textContent = u ? '@' + u.account : '点此登录 / 注册';
  box.title = u ? '@' + u.account + ' · 点击管理账号' : '点击登录或注册';
  box.classList.toggle('on', !!u);
}
