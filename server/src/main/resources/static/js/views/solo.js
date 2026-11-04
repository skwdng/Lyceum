/* 单人辩论：题库、选座、AI 审核、开局
 * 归属：见 docs/协作规范.md
 */

function viewSolo(){
  const myTurns = S.topics.length ? null : null;
  return `
  <h1 class="pg">单人辩论</h1>
  <p class="sub">选一道题（或自己填）→ 选位置 → 直接开打。不建房、不等人，缺的席位由 AI 补齐。</p>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <b style="font-size:13px">自己出一个辩题 <span class="tag b">AI 审核</span></b>
        <div style="font-size:11.5px;color:#8A909C;margin:4px 0 8px">写一句你关心的问题，会先过可辩性审核</div>
        <input id="customTopic" class="btn ghost" style="width:100%;text-align:left;padding:8px 12px"
               placeholder="例如：该不该把 AI 生成内容算作学术不端"
               onkeydown="if(event.key==='Enter')useCustomTopic()">
      </div>
      <button class="btn primary" onclick="useCustomTopic()">用这个题开练</button>
    </div>
    <div class="card">
      <b style="font-size:13px">当前席位</b>
      <div style="font-size:12.5px;color:#4A5568;margin-top:6px;line-height:1.8">
        <b style="color:#2F5BEA">${S.mySeats.join('、')}</b> · 本场发言
        <b style="color:#2F5BEA">${countMyTurns()}</b> 次
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm ghost" onclick="openSeatPanel(null)">改席位</button>
        <select class="btn sm ghost" onchange="S.mode=this.value">
          <option value="FULL" ${S.mode==='FULL'?'selected':''}>全流程 12 步</option>
          <option value="SPRINT" ${S.mode==='SPRINT'?'selected':''}>快速 8 步</option>
        </select>
      </div>
    </div>
  </div>

  <div class="grid g2">
    <div>
      <b style="font-size:13px">题库</b>
      <div class="grid gauto" style="margin-top:10px">
        ${S.topics.map(t => `
          <div class="topic" onclick="openSeatPanel('${t.id}')">
            <h3>${esc(t.title)}</h3>
            <div class="row"><span class="tag">${esc(t.cat)}</span>
              <span class="tag ${t.diff==='竞赛'?'o':t.diff==='进阶'?'b':'g'}">${esc(t.diff)}</span>
              <span class="tag">🔥 ${t.hot}</span></div>
            <div class="meta"><span>已辩 ${t.plays} 场${t.source==='custom'?' · 自定义':''}</span><span class="go">开练 →</span></div>
          </div>`).join('')}
      </div>
    </div>
    <div>
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:10px">
          <b style="font-size:13px">🔥 热辩榜</b>
          <a style="font-size:12px;color:#2F5BEA;cursor:pointer" onclick="go('hotb')">完整榜单 →</a>
        </div>
        <div class="hot">${(S.hot?.list || []).slice(0,5).map((x,i)=>hotRow(x,i)).join('')}</div>
        <div style="font-size:11px;color:#A8ADB8;margin-top:10px">Redis <span class="mono">ZSET · ${esc(S.hot?.key || '')}</span></div>
      </div>
    </div>
  </div>`;
}

function countMyTurns(){
  const steps = S.mode === 'SPRINT'
    ? [1,2,7,8,9,10,11,12] : [1,2,3,4,5,6,7,8,9,10,11,12];
  const seatOf = {1:'A1',2:'B1',3:'A2',4:'B2',5:'A3',6:'B3',7:'A2',8:'B2',9:'A3',10:'B3',11:'B4',12:'A4'};
  return steps.filter(n => S.mySeats.includes(seatOf[n])).length;
}

function hotRow(x, i){
  const cls = i===0?'top1':'';
  return `<div class="hitem ${cls}" onclick="openSeatPanel('${x.topicId}')">
    <div class="rk">${x.rank}</div>
    <div style="flex:1;min-width:0"><div class="tt">${esc(x.title)}</div>
      <div class="heatbar"><i style="width:${Math.min(100, x.score/2)}%"></i></div></div>
    <div class="sc">${x.score}</div>
  </div>`;
}

const SEATS = [
  {k:'A1',side:'A',role:'一辩'},{k:'A2',side:'A',role:'二辩'},{k:'A3',side:'A',role:'三辩'},{k:'A4',side:'A',role:'四辩'},
  {k:'B1',side:'B',role:'一辩'},{k:'B2',side:'B',role:'二辩'},{k:'B3',side:'B',role:'三辩'},{k:'B4',side:'B',role:'四辩'}
];

function openSeatPanel(topicId){
  document.querySelectorAll('#seatMask').forEach(m => m.remove());
  S.pendingTopicId = topicId;
  const box = document.createElement('div');
  box.className = 'mask'; box.id = 'seatMask';
  const grid = side => SEATS.filter(s => s.side === side).map(s => `
    <div class="seat ${S.mySeats.includes(s.k)?'on':''}" onclick="toggleSeat('${s.k}')">
      <div class="k">${s.k}</div><div class="r">${s.role}</div>
    </div>`).join('');
  box.innerHTML = `
    <div class="panel">
      <h2>你要坐哪几个位置？</h2>
      <div class="desc">选中的席位由你发言，其余自动由 AI 占满。多个位置 = 一个人分饰多角。</div>
      <div class="seats">
        <div><div class="row" style="margin-bottom:7px"><span class="tag b">正方</span></div><div class="seat-grid">${grid('A')}</div></div>
        <div><div class="row" style="margin-bottom:7px"><span class="tag o">反方</span></div><div class="seat-grid">${grid('B')}</div></div>
      </div>
      <div class="presets">
        <button class="preset" onclick="preset(['A1'])">只练一辩</button>
        <button class="preset" onclick="preset(['A2'])">只练二辩</button>
        <button class="preset" onclick="preset(['A1','A2'])">一辩 + 二辩</button>
        <button class="preset" onclick="preset(['A1','A2','A3','A4'])">己方四人</button>
        <button class="preset" onclick="preset(['A1','A2','A3','A4','B1','B2','B3','B4'])">正反全占</button>
      </div>
      <div class="row" style="margin-top:14px;gap:8px">
        <span style="font-size:12.5px;color:#4A5568">节奏</span>
        ${[['tight','紧凑','赶时间，练单点'],['normal','标准','一次完整论证'],['loose','宽松','慢慢想、写足']].map(([k,n,d]) => `
          <button class="preset" title="${d}"
            style="${S.pace===k?'border-color:#2F5BEA;color:#2F5BEA;background:#EDF1FE':''}"
            onclick="setPace('${k}')">${n}</button>`).join('')}
        <span style="font-size:11.5px;color:#8A909C">各环节时长不同：立论 ${paceHint()}</span>
      </div>
      <div class="row" style="margin-top:10px;gap:8px">
        <span style="font-size:12.5px;color:#4A5568">陪练强度</span>
        ${[["novice","新手","给你台阶，不抓漏洞"],["pro","进阶","正常对抗"],["contest","竞赛","专抓你的漏洞，会埋雷"]].map(([k,n,d]) => `
          <button class="preset" title="${d}"
            style="${S.difficulty===k?'border-color:#2F5BEA;color:#2F5BEA;background:#EDF1FE':''}"
            onclick="setDifficulty('${k}')">${n}</button>`).join('')}
        <span style="font-size:11.5px;color:#8A909C">竞赛难度会故意犯逻辑错误，等你抓</span>
      </div>
      <div class="sum" id="sumBox"></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" onclick="closeSeat()">取消</button>
        <button class="btn primary" onclick="startFromPanel()">进入对局</button>
      </div>
    </div>`;
  $('#modalHost').appendChild(box);
  syncSum();
}

function toggleSeat(k){
  const i = S.mySeats.indexOf(k);
  if (i >= 0) { if (S.mySeats.length === 1) return toast('至少保留一个席位'); S.mySeats.splice(i,1); }
  else S.mySeats.push(k);
  persistSeats(); openSeatPanel(S.pendingTopicId); syncSum();
}

function preset(list){ S.mySeats = list.slice(); persistSeats(); openSeatPanel(S.pendingTopicId); syncSum(); }

function setDifficulty(d){ S.difficulty = d; localStorage.setItem('sy_diff', d); openSeatPanel(S.pendingTopicId); }

function setPace(p){ S.pace = p; localStorage.setItem('sy_pace', p); openSeatPanel(S.pendingTopicId); }

/** 各环节实际秒数（与后端 Pace 表保持一致） */

function syncSum(){
  const box = $('#sumBox');
  if (!box) return;
  box.innerHTML = `已选：<b>${[...S.mySeats].sort().join(' ')}</b> · 本场你将发言 <b>${countMyTurns()}</b> 次 · 节奏 <b>${S.pace==='tight'?'紧凑':S.pace==='loose'?'宽松':'标准'}</b>`;
}

function closeSeat(){ document.querySelectorAll('#seatMask').forEach(m => m.remove()); }

async function startFromPanel(){
  closeSeat();
  if (!needLogin('登录后才能开始辩论')) return;
  const topicId = S.pendingTopicId;
  await createMatch(topicId ? {topicId} : {});
}

async function useCustomTopic(){
  const el = $('#customTopic');
  const title = (el?.value || '').trim();
  if (!title) return toast('先写一个辩题');
  if (!needLogin('登录后才能提交自定义辩题')) return;
  showAudit(title, null);
  try {
    const r = await api('/api/topics/audit', {method:'POST', body:{title}});
    showAudit(title, r);
  } catch (e) { showAudit(title, {result:'ERROR', reason:e.message}); }
}

function showAudit(title, r){
  document.querySelectorAll('#auditMask').forEach(m => m.remove());
  if (r && r.result === 'PASS') {  // 通过就直接开局
    toast('审核通过，开始选位置');
    S.pendingTitle = title;
    openSeatPanel(null);
    return;
  }
  const m = document.createElement('div');
  m.className = 'mask'; m.id = 'auditMask';
  const loading = !r;
  const color = loading ? '#8A909C' : r.result === 'REJECT' ? '#C0392B' : '#C2671E';
  m.innerHTML = `
    <div class="panel" style="width:min(560px,100%)">
      <div class="row" style="gap:10px;margin-bottom:6px">
        <span style="font-size:22px">${loading ? '⏳' : r.result === 'REJECT' ? '⛔' : '✏️'}</span>
        <h2 style="margin:0;color:${color}">${loading ? 'AI 审核中…' : '需要修改'}</h2>
        ${r?.cached ? '<span class="tag">命中缓存</span>' : ''}
      </div>
      <div class="desc">「${esc(title)}」</div>
      ${loading ? '<div class="sum">正在判断：是否可辩 · 正反是否平衡 · 是否合规</div>'
        : `<div class="sum"><b>结论：</b>${esc(r.reason)}</div>
           ${(r.suggestions||[]).length ? '<div style="margin-top:12px;font-size:12.5px;color:#6B7280">试试这些改写：</div>' : ''}
           ${(r.suggestions||[]).map(s => `<div class="row" style="margin-top:6px">
             <span style="flex:1;font-size:13px">${esc(s)}</span>
             <button class="btn sm ghost" onclick="adopt('${esc(s).replace(/'/g,'')}')">用这个</button></div>`).join('')}`}
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" onclick="document.querySelectorAll('#auditMask').forEach(m=>m.remove())">关闭</button>
      </div>
    </div>`;
  $('#modalHost').appendChild(m);
}

function adopt(t){ $('#customTopic').value = t; useCustomTopic(); }

async function createMatch(body){
  try {
    // 身份由令牌携带，payload 里不再需要 userId（后端也不认了）
    const payload = Object.assign({seats:S.mySeats, mode:S.mode, pace:S.pace, difficulty:S.difficulty}, body);
    if (!payload.topicId && S.pendingTitle) payload.title = S.pendingTitle;
    const r = await api('/api/matches', {method:'POST', body:payload});
    S.matchId = r.matchId; S.pendingTitle = null;
    await loadMatch(true);
    startPoll();
    go('match');
  } catch (e) {
    toast('开局失败：' + e.message);
  }
}
