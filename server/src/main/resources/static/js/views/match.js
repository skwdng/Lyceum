/* 对局：12 步推进、打字机、抢拍、催一下、材料浮窗
 * 归属：见 docs/协作规范.md
 */

function startPoll(){
  stopPoll();
  S.pollTimer = setInterval(() => loadMatch(false), 400);
  openStream();
}

/**
 * SSE：AI 一说完立刻推过来，不用等下一次轮询。
 *
 * <p>`EventSource` **不支持自定义请求头**，所以令牌只能走查询参数
 * （后端只对 `/events` 这个路径接受 `?token=`，其它接口一律只认请求头）。
 * 令牌会出现在 URL 里 —— 这是方案 §1.2 的既定取舍：令牌 2 小时有效，且只在 SSE 端点开口子。
 */
function openStream(){
  closeStream();
  if (!S.matchId || typeof EventSource === "undefined") return;
  if (!S.user) return;                       // 未登录不连，免得反复 401
  let token = '';
  try { token = localStorage.getItem('sy_jwt') || ''; } catch (e) {}
  if (!token) return;
  try {
    S.es = new EventSource(API_BASE + "/api/matches/" + S.matchId + "/events?token=" + encodeURIComponent(token));
    S.es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "flaw") {
          S.flawOffer = { step: d.step, options: d.options || [] };
          render();
          toast("对方这轮发言埋了一处漏洞，指出来");
          return;
        }
      } catch (err) {}
      loadMatch(false);
    };
    S.es.onerror = () => {
      // 断线：轮询会兜底，但**未登录/无权限时不能让它无限重连**（否则一直刷 401/403）
      if (!S.user) { closeStream(); return; }
    };
  } catch (e) {}
}

function closeStream(){ if (S.es) { try { S.es.close(); } catch(e){} S.es = null; } }

function stopPoll(){ if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } closeStream(); }

async function loadMatch(first){
  if (!S.matchId) return;
  try {
    const d = await api('/api/matches/' + S.matchId);
    const prevCount = S.turns.length;
    S.match = d.match; S.turns = d.turns || [];
    S.remaining = d.remainingSec || 0; S.extendUsed = d.extendUsed || 0; S.phase = d.phase || 'STEP';
    S.kind = d.kind || 'solo'; S.unlimited = !!d.unlimited;
    updateCountdown();
    if (d.match && d.match.topic_id && S.cardsTopic !== d.match.topic_id) {
      try {
        const ev = await api('/api/topics/' + d.match.topic_id + '/evidence');
        S.cards = ev.cards || []; S.cardsTopic = d.match.topic_id;
        if (S.view === 'match') render();          // 论据卡是后到的，要补一次渲染
      } catch (e) { S.cards = []; }
    }
    const prevWaiting = S.waiting, prevPhase = S.phase;
    S.waiting = S.roomMode ? (d.waitingSeat && d.waitingSeat === S.mySeat) : d.waitingForMe;
    // 轮次没变但「轮到我 / 抢拍状态」变了，也要重渲染，否则输入框不出来
    const stateChanged = (prevWaiting !== S.waiting) || (prevPhase !== S.phase);
    if (first || prevCount !== S.turns.length || stateChanged || S.view !== 'match') {
      if (S.view !== 'match') return;
      render();
      const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight;
    } else {
      const hint = $('#cHint'); if (hint) hint.textContent = S.waiting ? '轮到你发言' : '等待对方发言…';
    }
    if (d.match.status !== 'RUNNING') {
      stopPoll();
      const [rev, hot, diag, records] = await Promise.all([
        api('/api/matches/' + S.matchId + '/review'),
        api('/api/hot?n=12'),
        api('/api/diag'),
        api('/api/records')
      ]);
      S.review = rev; S.hot = hot; S.diag = diag; S.records = records;
      $('#meSub').textContent = `连续练习 ${diag.streak || 1} 天`;
      S.flawOffer = null; S.view = 'review'; render();
    }
  } catch (e) { window.__loadErr = (e && e.message) || String(e); }
}

function viewMatch(){
  const m = S.match;
  if (!m) return '<div class="empty">加载中…</div>';
  const steps = S.mode === 'SPRINT'
    ? [1,2,7,8,9,10,11,12] : [1,2,3,4,5,6,7,8,9,10,11,12];
  const seatOf = {1:'A1',2:'B1',3:'A2',4:'B2',5:'A3',6:'B3',7:'A2',8:'B2',9:'A3',10:'B3',11:'B4',12:'A4'};
  const segOf = {1:'立论',2:'立论',3:'驳立论',4:'驳立论',5:'质询',6:'质询',7:'自由辩',8:'自由辩',9:'自由辩',10:'自由辩',11:'总结',12:'总结'};
  const stepNo = Number(m.step) + 1;
  return `
  <div class="row" style="justify-content:space-between;margin-bottom:10px">
    <div><h1 class="pg">${esc(m.topic_title)}</h1>
      <p class="sub" style="margin:0">${m.mode === 'SPRINT' ? '快速 8 步' : '标准版 12 步'} · 你占 ${esc(m.my_seats)} ·
      <span class="dot"></span>${m.status === 'RUNNING' ? '进行中' : m.status}</p></div>
    <div class="row">
      <span class="tag mono">第 ${stepNo} 步</span>
      <button class="btn sm ghost" onclick="go('solo')">退出</button>
    </div>
  </div>
        ${S.brief ? `<button class="btn sm ghost" style="position:fixed;right:22px;bottom:22px;z-index:70;box-shadow:0 6px 18px rgba(0,0,0,.14)" onclick="toggleBrief()">📋 材料</button>` : ""}
      ${(S.brief && S.showBrief) ? `<div class="mask" onclick="if(event.target===this)toggleBrief()">
        <div class="panel" style="width:min(720px,100%)">
          <div class="row" style="justify-content:space-between">
            <h2 style="margin:0">作战卡 · ${esc(S.brief.side || '')}</h2>
            <button class="btn sm ghost" onclick="toggleBrief()">收起</button>
          </div>
          <div class="desc">${esc(S.brief.topic || '')}</div>

          <b style="font-size:12.5px">① 先把词定清楚</b>
          <div style="margin:6px 0 12px">
            ${(S.brief.definitions || []).map(d => `<div style="font-size:12.5px;margin:4px 0"><b>${esc(d.term)}</b>：${esc(d.def)}</div>`).join('') || '<div class="empty">暂无</div>'}
          </div>

          <b style="font-size:12.5px">② 立论骨架（按这个顺序说）</b>
          <div style="margin:6px 0 12px">
            ${(S.brief.case || []).map(c => `<div style="font-size:12.5px;margin:4px 0;padding-left:10px;border-left:2px solid #E6E3DC">${esc(c)}</div>`).join('')}
          </div>

          <b style="font-size:12.5px">③ 对方最可能怎么打，你怎么接</b>
          <div style="margin:6px 0 12px">
            ${(S.brief.attacks || []).map(a => `<div style="font-size:12.5px;margin:4px 0">${esc(a)}</div>`).join('')}
          </div>

          <b style="font-size:12.5px">④ 回应句式</b>
          <div style="margin:6px 0 12px">
            ${(S.brief.rebuttals || []).map(r => `<div style="font-size:12.5px;margin:4px 0">${esc(r)}</div>`).join('')}
          </div>

          <b style="font-size:12.5px">⑤ 可引用论据（点一下插入发言框）</b>
          <div style="margin-top:6px">
            ${(S.brief.evidence || []).map((c, i) => `<div style="border:1px solid #EFEDE6;border-radius:8px;padding:7px 9px;margin-bottom:6px;cursor:pointer" onclick="insertCard(${i})">
              <div style="font-size:11.5px;line-height:1.6">${esc(c.claim)}</div>
              <div style="font-size:10.5px;color:#A8ADB8;margin-top:2px">${esc(c.source)} ${c.year || ''}</div>
            </div>`).join('') || '<div class="empty">这道题暂无卡片</div>'}
          </div>

          <div style="font-size:11.5px;color:#A8ADB8;margin-top:10px">材料只给结构，句子还是你自己组织——照抄会被抓漏洞。</div>
        </div>
      </div>` : ""}
<div class="strip" id="strip">${stripHTML()}</div>
  <div class="stage">
    <div>
      <div style="position:relative">
        <div class="chat" id="chat">${chatHTML()}</div>
        <button id="scrollTip" class="btn sm primary"
          style="display:none;position:absolute;right:14px;bottom:12px;box-shadow:0 6px 16px rgba(0,0,0,.16)"
          onclick="(()=>{const c=document.querySelector('#chat');c.scrollTop=c.scrollHeight;S.stickBottom=true;document.querySelector('#scrollTip').style.display='none';})()">↓ 回到底部</button>
      </div>
      ${S.phase === 'BUZZ' ? `<div class="card" style="margin-top:12px;border-color:#2F5BEA;background:#F2F5FF;text-align:center">
        <div style="font-size:13px;font-weight:600;color:#2F5BEA">自由辩 · 抢话中</div>
        <div style="font-size:11.5px;color:#6B7280;margin:4px 0 10px">谁说都行，抢到话筒就归你。窗口 ${Math.max(0,S.remaining)} 秒</div>
        <button class="btn primary" style="width:100%;padding:12px;font-size:15px" onclick="buzz()">抢 ！</button>
      </div>` : ""}
      ${S.flawOffer ? `<div class="card" style="margin-top:12px;border-color:#E3C08A;background:#FFF9F0"><div class="row" style="justify-content:space-between"><b style="font-size:12.5px">这一轮对方发言有逻辑问题 —— 你抓到了吗？</b><span class="tag o">抓对 +3</span></div><div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${(S.flawOffer.options||[]).map(o => `<button class="btn sm ghost" data-f="${o}" onclick="answerFlaw(this.dataset.f)">${o}</button>`).join("")}<button class="btn sm ghost" style="color:#A8ADB8" onclick="S.flawOffer=null;render()">跳过</button></div></div>` : ""}
      <div class="composer">
        <div class="hint"><span id="cHint">${S.waiting ? '轮到你发言' : '等待对方发言…'}</span>
          <span id="cdown" style="font-family:ui-monospace,monospace">${S.unlimited ? (S.waiting ? '不限时' : '') : (S.waiting ? fmt(S.remaining) : '')}</span></div>
        ${S.waiting ? `
          <textarea id="inp" placeholder="写下你的发言…" oninput="onTyping()"></textarea>
          <div class="row" style="margin-top:8px">
            <span style="font-size:11.5px;color:#A8ADB8">${S.extendUsed ? '已自动续命 ' + S.extendUsed + ' 次' : '打字时会自动续时'}</span>
            <span style="flex:1"></span>
            <button class="btn sm primary" onclick="submitTurn()">发送</button>
          </div>` : `<div class="waiting">对方正在思考…${S.kind === 'solo' ? ' <button class="btn sm ghost" style="margin-left:10px" onclick="skipAi()">催一下</button>' : ''}</div>`}
      </div>
    </div>
    <div>
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b style="font-size:12.5px">赛制进度</b><span style="font-size:11.5px;color:#8A909C">${stepNo}/${steps.length}</span></div>
        <div class="steps">
          ${steps.map((n,i) => `<div class="st ${i+1 < stepNo ? 'done':''} ${i+1 === stepNo ? 'cur':''}">
            <span class="no">${i+1}</span><span>${segOf[n]} · ${seatOf[n]}${S.mySeats.includes(seatOf[n])?' · 你':''}</span></div>`).join('')}
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="row" style="justify-content:space-between">
          <b style="font-size:12.5px">论据卡</b>
          <span class="tag">${(S.cards || []).length} 张</span>
        </div>
        <div style="font-size:11.5px;color:#8A909C;margin:6px 0 8px">
          点一下插入到发言框。标「需核实」的自己查证过再用。
        </div>
        <div style="max-height:230px;overflow:auto">
          ${(S.cards || []).map((c, i) => `
            <div style="border:1px solid #EFEDE6;border-radius:8px;padding:7px 9px;margin-bottom:6px;cursor:pointer"
                 onclick="insertCard(${i})">
              <div style="font-size:11.5px;line-height:1.6">${esc(c.claim)}</div>
              <div style="font-size:10.5px;color:#A8ADB8;margin-top:3px">
                ${esc(c.source)} ${c.year || ''}
                ${c.verified ? '<span class="tag g" style="font-size:9.5px">已核实</span>'
                             : '<span class="tag o" style="font-size:9.5px">需核实</span>'}
              </div>
            </div>`).join('') || '<div class="empty">这道题暂无论据卡</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <b style="font-size:12.5px">本场</b>
        <div style="margin-top:8px">
          <div class="kv"><span>你的席位</span><b>${esc(m.my_seats)}</b></div>
          <div class="kv"><span>已记录发言</span><b>${S.turns.length}</b></div>
        </div>
      </div>
    </div>
  </div>`;
}

function stripHTML(){
  const cur = S.match ? Number(S.match.step) + 1 : 0;
  const seatOf = {1:'A1',2:'B1',3:'A2',4:'B2',5:'A3',6:'B3',7:'A2',8:'B2',9:'A3',10:'B3',11:'B4',12:'A4'};
  const curSeat = seatOf[cur];
  return SEATS.map(s => {
    const me = S.mySeats.includes(s.k);
    return `<div class="sp ${me?'me':''} ${curSeat===s.k?'cur':''}">
      <div class="av ${s.side.toLowerCase()}">${me?'我':(s.side==='A'?'AI':'AI')}</div>
      <div><div class="nm">${me?'你':'AI'}</div><div class="rl">${s.side==='A'?'正方':'反方'}${s.role}</div></div>
    </div>`;
  }).join('');
}

function renderStrip(){ const el = $('#strip'); if (el) el.innerHTML = stripHTML(); }

function chatHTML(){
  if (!S.turns.length) return '<div class="sys"><span>对局开始，等待第一条发言…</span></div>';

  // 找到第一条还没打完的 AI 发言；它后面的先不显示，
  // 否则会出现「上一个人还在打，下一个人已经冒出来」的错觉。
  const keyOf = t => t.step + '|' + t.seat + '|' + (((t.content || '').trim()) || '（这一轮没有说出内容）').length;
  let firstUntyped = -1;
  for (let i = 0; i < S.turns.length; i++) {
    const t = S.turns[i];
    if (S.mySeats.includes(t.seat) || t.status === 'TIMEOUT') continue;
    if (!S.typed.has(keyOf(t))) { firstUntyped = i; break; }
  }
  const list = S.turns.filter((t, idx) =>
    S.mySeats.includes(t.seat) || t.status === 'TIMEOUT' || firstUntyped === -1 || idx <= firstUntyped);

  return list.map(t => {
    const me = S.mySeats.includes(t.seat);
    const side = String(t.seat).startsWith('A') ? 'a' : 'b';
    const timeout = t.status === 'TIMEOUT';
    const text = (t.content || '').trim() || '（这一轮没有说出内容）';
    const key = keyOf(t);

    let body = esc(text), attr = '';
    if (!me && !timeout && !S.typed.has(key)) {
      const prog = S.progress[key] || 0;
      // 还没轮到它打字：显示省略号，避免看着像空壳
      body = prog > 0 ? esc(text.slice(0, prog)) : '<span class="pending">…</span>';
      attr = ' data-key="' + key + '" data-full="' + esc(text) + '"';
    }
    return `<div class="msg ${side} ${me?'me':''}">
      <div class="ava ${me?'me':side}">${me?'我':(String(t.seat).startsWith('A')?'正':'反')}</div>
      <div class="bd"><div class="hd"><b>${me?'你':'AI 辩手'}</b><span>${t.seat}</span><span>·</span><span>${t.seg}</span>
        ${timeout?'<span class="tag r">超时</span>':''}</div>
        <div class="bub"${attr}>${body}</div></div>
    </div>`;
  }).join('');
}

/** 用户往上翻的时候不要抢滚动条 */

function nearBottom(el){
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

/**
 * 打字机：全局一个循环，同时推进所有未播完的 AI 气泡。
 * 关键改进：进度存在 S.progress[key]，任何一次重渲染都从这里接着打，
 * 不会因为“来了新消息”而让上一条整段弹出来。
 */

setInterval(function(){
  const nodes = [...document.querySelectorAll('.bub[data-key]')];
  if (!nodes.length) return;
  const now = Date.now();
  const chat = $('#chat');

  // 串行：只推进最靠前的那一条，保证「上一个人说完，下一个才开口」
  let node = null;
  for (const n of nodes) {
    const k = n.getAttribute('data-key');
    if (!k || S.typed.has(k)) continue;
    node = n;
    break;
  }
  if (!node) return;

  const key = node.getAttribute('data-key');
  const full = node.getAttribute('data-full') || '';
  if (!full) { S.typed.add(key); return; }
  if (now < (S.pauseUntil[key] || 0)) return;

  let idx = (S.progress[key] || 0) + 1;
  S.progress[key] = idx;
  node.textContent = full.slice(0, idx);
  if (S.stickBottom !== false && chat) chat.scrollTop = chat.scrollHeight;

  if (idx >= full.length) { S.typed.add(key); return; }

  const ch = full.charAt(idx - 1);
  const per = Math.min(150, Math.max(28, Math.round(11000 / Math.max(1, full.length))));
  let d = per;
  if (ch === '。' || ch === '！' || ch === '？') d = Math.min(800, per * 8);
  else if (ch === '，' || ch === '；' || ch === '：') d = Math.min(380, per * 3);
  else if (ch === '「' || ch === '」') d = Math.round(per * 1.5);
  S.pauseUntil[key] = now + d;
}, 40);

/** 聊天区滚动：用户往上翻就暂停自动跟随，翻回底部再恢复 */

function bindChatScroll(){
  const chat = $('#chat');
  if (!chat || chat.dataset.bound) return;
  chat.dataset.bound = '1';
  chat.addEventListener('scroll', () => {
    S.stickBottom = nearBottom(chat);
    const tip = $('#scrollTip');
    if (tip) tip.style.display = S.stickBottom ? 'none' : 'block';
  });
}

function updateCountdown(){
  const el = $('#cdown');
  if (!el) return;
  if (S.unlimited) {
    el.textContent = S.waiting ? '不限时' : '';
    el.style.color = '#0E9F6E';
    el.style.fontWeight = '600';
    return;
  }
  el.textContent = S.waiting ? fmt(S.remaining) : '';
  el.style.color = S.remaining <= 30 ? '#C0392B' : (S.remaining <= 60 ? '#C2671E' : '#6B7280');
  el.style.fontWeight = S.remaining <= 30 ? '700' : '400';
}

async function onTyping(){
  if (!S.matchId || !S.waiting) return;
  const now = Date.now();
  if (S.remaining > 120) return;
  if (S.extendUsed >= 3) return;
  if (now - S.lastKeep < 15000) return;
  S.lastKeep = now;
  try {
    const r = await api('/api/matches/' + S.matchId + '/keepalive', {method:'POST'});
    if (r && r.extended) {
      S.extendUsed = r.used;
      S.remaining += r.addSec;
      updateCountdown();
      toast('已自动续时 ' + r.addSec + ' 秒（' + r.used + '/' + r.max + '）');
    }
  } catch (e) {}
}

/** 每秒刷一次倒计时；最后 30 秒变红 */

setInterval(function(){
  if (S.view !== 'match' || !S.waiting) return;
  if (S.remaining > 0) { S.remaining -= 1; updateCountdown(); }
}, 1000);

async function buzz(){
  if (!S.matchId) return;
  try {
    const r = await api('/api/matches/' + S.matchId + '/buzz', {method:'POST'});
    if (r && r.ok) {
      // 抢到就立刻拿到话筒：本地先切状态并渲染，不等下一轮轮询
      S.phase = 'STEP';
      S.waiting = true;
      S.remaining = r.seconds || 90;
      S.extendUsed = 0;
      toast('抢到了，你有 ' + r.seconds + ' 秒');
      render();
      await loadMatch(false);
    } else {
      toast((r && r.reason) ? r.reason : '没抢到');
    }
  } catch (e) { toast('抢拍失败：' + e.message); }
}

/** 材料浮窗开关 */
/** 材料浮窗：第一次点开才去拉（模型生成要几秒，不能卡住开局） */

async function toggleBrief(){
  S.showBrief = !S.showBrief;
  render();
  if (!S.showBrief || S.brief) return;
  const m = S.match;
  if (!m || !m.topic_id) return;
  const side = String(m.my_seats || "A1").charAt(0);
  toast("正在生成作战卡…");
  try {
    S.brief = await api("/api/topics/" + m.topic_id + "/brief?side=" + side);
  } catch (e) { S.brief = null; }
  render();
}

async function skipAi(){
  if (!S.matchId) return;
  try {
    const r = await api('/api/matches/' + S.matchId + '/skip', {method:'POST'});
    if (r && r.ok) { toast('已催，对方开始回应'); await loadMatch(false); }
    else toast((r && r.reason) ? r.reason : '现在不能催');
  } catch (e) { toast('催失败：' + e.message); }
}

function insertCard(i){
  const c = (S.cards || [])[i];
  if (!c) return;
  const el = $('#inp');
  if (!el) return toast('还没轮到你发言，先把卡片记下来');
  const text = c.claim + '（据' + c.source + '）';
  el.value = (el.value.trim() ? el.value.trim() + ' ' : '') + text + '。';
  el.focus();
  toast(c.verified ? '已插入（可信来源）' : '已插入，注意这条标了「需核实」');
}

async function submitTurn(){
  const el = $('#inp');
  const text = (el?.value || '').trim();
  if (!text) return toast('说点什么再发');
  el.value = '';
  try {
    await api(`/api/matches/${S.matchId}/turns`, {method:'POST', body:{content:text, inputType:'kb'}});
    await loadMatch(false);
  } catch (e) { toast('提交失败：' + e.message); }
}
