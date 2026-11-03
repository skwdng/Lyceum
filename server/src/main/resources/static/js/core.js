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
  // 登录态：有 token 就带上（辩论侧接口不校验，带了也无害）
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
  userId: localStorage.getItem('sy_uid') || (()=>{ const u='g'+Math.random().toString(36).slice(2,8); localStorage.setItem('sy_uid',u); return u; })(),
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
  user:null, authTab:'login'
};

const persistSeats = () => localStorage.setItem('sy_seats', JSON.stringify(S.mySeats));

async function boot(){
  try {
    const [topics, hot, diag, records] = await Promise.all([
      api('/api/topics'), api('/api/hot?n=12'), api('/api/diag?userId=' + S.userId), api('/api/records?userId=' + S.userId)
    ]);
    S.topics = topics; S.hot = hot; S.diag = diag; S.records = records;
    await loadRooms();
    await authRestore();          // 有 token 就恢复登录态（无效会自动清掉）
    authRenderMeBox();
    render();
    // 兼容旧链接 /community.html?  以及 /?v=community 深链
    const qv = new URLSearchParams(location.search).get('v');
    if (qv && NAV.some(n => n.k === qv)) go(qv);
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><b>连不上后端</b><p class="sub" style="margin:8px 0 0">${esc(e.message)}</p>
      <p style="font-size:12.5px;color:#6B7280;margin-top:8px">确认服务在跑：<span class="mono">http://localhost:8080/api/health</span></p></div>`;
  }
}

const NAV = [
  {g:'训练'}, {k:'solo', n:'单人辩论'}, {k:'room', n:'多人辩论'}, {k:'hotb', n:'热辩榜'},
  {g:'我的'}, {k:'diag', n:'能力诊断'}, {k:'records', n:'辩论记录'}, {g:'社区'}, {k:'community', n:'讨论社区'}
];

function reNav(){
  $('#nav').innerHTML = NAV.map(n => n.g ? `<div class="g">${n.g}</div>`
    : `<a class="${S.view===n.k?'on':''}" onclick="go('${n.k}')">${n.n}</a>`).join('');
}

function go(v){
  if (S.pollTimer && v !== 'match') { stopPoll(); S.matchId = null; S.match = null; S.roomMode = false; }
  S.view = v; render();
  // 社区：不再跳独立页（D4），进页面时重置筛选并拉第一页列表
  if (v === 'community') { cmEnterCommunity(); return; }
  if (v === 'records' || v === 'diag' || v === 'hotb' || v === 'solo') refreshDash(v);
}

/** 打开这些页面时重新拉一次数据，避免展示开机时的旧缓存 */

async function refreshDash(v){
  try {
    const [hot, diag, records] = await Promise.all([
      api('/api/hot?n=12'), api('/api/diag?userId=' + S.userId), api('/api/records?userId=' + S.userId)
    ]);
    S.hot = hot; S.diag = diag; S.records = records;
    authRenderMeBox();
    if (S.view === v) render();
  } catch (e) { /* 忽略，保留旧数据 */ }
}

function render(){
  reNav();
  authRenderMeBox();
  const v = { solo:viewSolo, room:viewRoom, hotb:viewHot, diag:viewDiag, records:viewRecords,
              match:viewMatch, review:viewReview, community:viewCommunity, me:viewAuth }[S.view];
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
