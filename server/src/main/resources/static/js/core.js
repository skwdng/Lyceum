/* 核心：全局状态、请求、路由、渲染分发
 * 归属：见 docs/协作规范.md
 */

const $ = s => document.querySelector(s);

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const sleep = ms => new Promise(r => setTimeout(r, ms));

const fmt = s => { s = Math.max(0, s|0); return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); };

function toast(msg){ const d=document.createElement('div'); d.className='tst'; d.textContent=msg; $('#toast').appendChild(d); setTimeout(()=>d.remove(),2200); }

const API_BASE = location.pathname.indexOf('/siyige') === 0 ? '/siyige' : '';

async function api(path, opts){
  const o = opts || {};
  const headers = o.body ? {'Content-Type':'application/json'} : {};
  // 登录态：有 token 就带上。社区与辩论两侧接口都校验令牌，没带就是 401（SSE 例外，见 match.js 的 ?token=）
  try { const tk = localStorage.getItem('sy_jwt'); if (tk) headers['Authorization'] = 'Bearer ' + tk; } catch (e) {}
  const r = await fetch(API_BASE + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const text = await r.text();
  if (r.status === 401) { try { localStorage.removeItem('sy_jwt'); } catch (e) {} S.user = null; }
  if (!r.ok) throw new Error(text || ('HTTP ' + r.status));
  return text ? JSON.parse(text) : null;
}

const S = {
  view:'solo', topics:[], hot:null, diag:null, records:[],
  mySeats: JSON.parse(localStorage.getItem('sy_seats') || '["A1"]'),
  mode:'FULL',
  pace: localStorage.getItem('sy_pace') || 'normal',
  difficulty: localStorage.getItem('sy_diff') || 'pro',
  flawOffer: null, brief: null, briefSide: null, phase: 'STEP', kind: 'solo', unlimited: false,
  // 身份不再有独立的 userId 字段：一律用 S.user.id（由令牌恢复，见 authRestore）。
  // 旧的 localStorage['sy_uid']（随机 gXXXXXX）已废弃，不再生成也不再读取。
  roomCode:null, room:null, mySeat:null, roomMode:false, rooms:[], roomPoll:null,
  cards:[], cardsTopic:null, matchId:null, match:null, turns:[], waiting:false,
  pollTimer:null, es:null, review:null, typed:new Set(), progress:{}, pauseUntil:{}, remaining:0, extendUsed:0, lastKeep:0,
  // ---- 社区（视图在 js/views/community.js，字段只能由 core 定义）----
  comm: { view:'list', postId:null, reqToken:0, q:'', type:'ALL', topicId:'', range:'ALL',
          sort:'NEW', page:1, size:20, degraded:false },
  posts:[], postTotal:0, postLoading:false, postDetail:null,
  postComments:[], postCommentTotal:0, commentPage:1, postRelated:[],
  replyTarget:null, replyDraft:'', cmNewType:'CHAT',
  // ---- 登录（视图在 js/views/auth.js）----
  user:null, authTab:'login',
  // 登录/注册成功后要回到哪个页面：记录"最近一次真正访问过的页面"。
  // 例：未登录点「开始辩论」被弹去登录，登录完应该回到单人辩论，而不是一律扔到社区。
  lastVisitedView:null
};

const persistSeats = () => localStorage.setItem('sy_seats', JSON.stringify(S.mySeats));

/** 对局侧数据的统一拉取（只有登录才有意义） */
async function loadDash(){
  if (!S.user) { S.diag = null; S.records = []; S.rooms = []; return; }
  try {
    const [diag, records] = await Promise.all([api('/api/diag'), api('/api/records')]);
    S.diag = diag; S.records = records;
  } catch (e) { S.diag = null; S.records = []; }
  await loadRooms();
}

async function boot(){
  try {
    // 顺序很重要：辩论侧接口都要登录，**必须先恢复登录态**再拉数据。
    // 反过来的话，登录用户会带着"还没读到 token"的状态去请求，白白挨一次 401。
    await authRestore();
    authRenderMeBox();

    // 匿名可访问的只有辩题 / 热榜（后端没给这两个注册过滤器）
    const [topics, hot] = await Promise.all([api('/api/topics'), api('/api/hot?n=12')]);
    S.topics = topics; S.hot = hot;

    await loadDash();             // 未登录内部直接置空，页面显示「登录后可见」
    render();
    // 兼容旧链接 /community.html?  以及 /?v=community 深链
    const qv = new URLSearchParams(location.search).get('v');
    if (qv && NAV.some(n => n.k === qv)) go(qv);
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><b>连不上后端</b><p class="sub" style="margin:8px 0 0">${esc(e.message)}</p>
      <p style="font-size:12.5px;color:#6B7280;margin-top:8px">确认服务在跑：<span class="mono">http://localhost:8080/api/health</span></p></div>`;
  }
}

/**
 * 统一的「要登录」守卫 —— 全项目只走这一个，不要各处自己判断身份。
 *
 * @param hint 引导文案，如「登录后才能开始辩论」
 * @returns 已登录返回 true；未登录则提示 + 跳登录页并返回 false
 */
function needLogin(hint){
  if (S.user) return true;
  toast(hint || '请先登录');
  go('me');
  return false;
}

/** 只有登录才能看的页面（未登录时整页显示「登录后可见」，不渲染操作面板） */
const LOGIN_ONLY_VIEWS = { solo:1, room:1, match:1, review:1, diag:1, records:1 };

function loginGateCard(view){
  const what = { solo:'开始一场单人辩论', room:'和朋友开一局多人辩论', match:'查看正在进行的对局',
                 review:'查看复盘', diag:'查看能力诊断', records:'查看辩论记录' }[view] || '继续';
  return `<div class="card" style="max-width:560px;margin:48px auto;text-align:center;padding:32px 28px">
    <div style="font-size:34px;line-height:1;margin-bottom:10px">🔒</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:8px">登录后可见</div>
    <p class="sub" style="margin:0 0 20px">登录后就能${what}。现在未登录，先注册或登录吧。</p>
    <button class="btn primary" onclick="go('me')">去登录 / 注册</button>
  </div>`;
}

const NAV = [
  {g:'训练'}, {k:'solo', n:'单人辩论'}, {k:'room', n:'多人辩论'}, {k:'hotb', n:'热辩榜'},
  {g:'我的'}, {k:'diag', n:'能力诊断'}, {k:'records', n:'辩论记录'}, {g:'社区'}, {k:'community', n:'讨论社区'},
    {g:'视频'}, {k:'video', n:'视频'}
];

function reNav(){
  $('#nav').innerHTML = NAV.map(n => n.g ? `<div class="g">${n.g}</div>`
    : `<a class="${S.view===n.k?'on':''}" onclick="go('${n.k}')">${n.n}</a>`).join('');
}

function go(v){
  if (S.pollTimer && v !== 'match') { stopPoll(); S.matchId = null; S.match = null; S.roomMode = false; }
  // 记下来路：登录/注册成功后要回到这里（'me' 是登录页本身，不算来路）
  if (v !== 'me') S.lastVisitedView = v;
  S.view = v; render();
  // 社区：不再跳独立页（D4），进页面时重置筛选并拉第一页列表
  if (v === 'community') { cmEnterCommunity(); return; }
  if (v === 'records' || v === 'diag' || v === 'hotb' || v === 'solo') refreshDash(v);
}

/**
 * 登录 / 注册成功后的跳转入口（`auth.js` 调用）。
 *
 * <p>回到"被弹去登录之前"的那一页；没有来路（例如一进来就点登录）就回社区。
 * 这样「点开始辩论 → 提示登录 → 登录成功 → 回到单人页」这一串才连得起来。
 */
function goAfterAuth(){
  go(S.lastVisitedView || 'community');
}

/** 打开这些页面时重新拉一次数据，避免展示开机时的旧缓存 */

async function refreshDash(v){
  try {
    S.hot = await api('/api/hot?n=12');
    if (S.user) {
      const [diag, records] = await Promise.all([api('/api/diag'), api('/api/records')]);
      S.diag = diag; S.records = records;
    }
    authRenderMeBox();
    if (S.view === v) render();
  } catch (e) { /* 忽略，保留旧数据 */ }
}

function render(){
  reNav();
  authRenderMeBox();
  // 对局侧页面未登录时整页给「登录后可见」，不留可点的操作面板
  if (!S.user && LOGIN_ONLY_VIEWS[S.view]) {
    $('#main').innerHTML = loginGateCard(S.view);
    return;
  }
  const v = { solo:viewSolo, room:viewRoom, hotb:viewHot, diag:viewDiag, records:viewRecords,
              match:viewMatch, review:viewReview, community:viewCommunity, video:viewVideo, me:viewAuth }[S.view];
  $('#main').innerHTML = v ? v() : viewSolo();
  if (S.view === 'match') {
    renderStrip();
    bindChatScroll();
  }
}

const PACE_BASE = {立论:300, 驳立论:210, 质询:150, 自由辩:90, 总结:240};

const PACE_FACTOR = {tight:0.6, normal:1.0, loose:1.4};

function paceSec(seg){ return Math.max(45, Math.round((PACE_BASE[seg]||180) * (PACE_FACTOR[S.pace]||1))); }

function paceHint(){
  const f = PACE_FACTOR[S.pace] || 1;
  return Math.round(300*f/60) + ' 分钟 / 自由辩 ' + Math.round(90*f) + ' 秒';
}
