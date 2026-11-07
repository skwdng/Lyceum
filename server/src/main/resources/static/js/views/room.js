/* 多人房间：建房、加入、准备、开局
 * 归属：见 docs/协作规范.md
 *
 * 身份规则（2026-11-04 接入账号后）：**前端不再传 userId / userName**，
 * 全部由后端从令牌与账号表决定。这里只负责「未登录就引导去登录」。
 */

async function loadRooms(){
  if (!S.user) { S.rooms = []; return; }          // 未登录不请求（否则白挨 401）
  try { S.rooms = await api('/api/rooms'); } catch (e) { S.rooms = []; }
}

function viewRoom(){
  if (!S.roomCode) {
    const list = S.rooms || [];
    return `
    <h1 class="pg">多人辩论</h1>
    <p class="sub">8 席房间：建房 → 把房间号发给队友 → 全员准备 → 房主开局。空位自动补 AI。</p>
    <div class="grid g3" style="max-width:1000px">
      <div class="card">
        <b style="font-size:13px">① 创建房间</b>
        <p style="font-size:12px;color:#8A909C;margin:8px 0 12px">随机抽一道题，你坐 A1，房主免准备。</p>
        <button class="btn primary" style="width:100%" onclick="createRoom()">＋ 建房</button>
      </div>
      <div class="card">
        <b style="font-size:13px">② 房间号加入</b>
        <input id="joinCode" class="btn ghost" style="width:100%;margin:10px 0;text-align:left;padding:8px 12px"
               placeholder="SY-XXXX">
        <button class="btn ghost" style="width:100%" onclick="joinRoom(document.querySelector('#joinCode').value)">加入</button>
      </div>
      <div class="card">
        <b style="font-size:13px">③ 公开房间</b>
        <div style="font-size:12.5px;color:#4A5568;line-height:2;margin-top:8px">
          ${list.length ? list.map(r => `<div class="row" style="justify-content:space-between">
            <span class="mono">${esc(r.code)}</span>
            <span style="flex:1;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.topic_title)}</span>
            <a style="color:#2F5BEA;cursor:pointer" onclick="joinRoom('${r.code}')">加入</a></div>`).join('')
            : '<div class="empty">现在没有公开房间</div>'}
        </div>
      </div>
    </div>`;
  }

  const room = S.room || {};
  const seats = room.seats || [];
  const r = room.room || {};
  const hostId = room.host || r.host_user || '';

  /** 昵称旁边的小标签：房主 / 玩家（不再把「房主」当名字用） */
  const roleTag = s => {
    if (s.occupant !== 'USER') return '';
    return String(s.user_id) === String(hostId)
      ? '<span class="tag">房主</span>'
      : '<span class="tag g">玩家</span>';
  };
  const seatName = s => s.user_name || '未知';

  return `
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <div>
      <h1 class="pg">${esc(r.topic_title || '房间')}</h1>
      <p class="sub" style="margin:0">房间 <span class="mono">${esc(S.roomCode)}</span> · ${r.status || ''} ·
        真人 ${room.humans || 0}/8 ${room.isHost ? '· 你是房主' : ''}</p>
    </div>
    <div class="row">
      <button class="btn ghost" onclick="copyRoom()">复制房间号</button>
      ${room.isHost ? `<button class="btn ghost" onclick="roomInviteOpen()">邀请好友</button>` : ''}
      <button class="btn ghost" onclick="leaveRoom()">退出</button>
      ${room.isHost
        ? `<button class="btn primary" ${room.canStart ? '' : 'disabled'} onclick="startRoom()">开始辩论${room.canStart ? '' : `（${(room.unready||[]).length} 人未准备）`}</button>`
        : `<button class="btn primary" onclick="toggleReady()">${mySeatReady() ? '取消准备' : '准备'}</button>`}
    </div>
  </div>
  <div class="card" style="margin-bottom:12px">
    <b style="font-size:12.5px">房间号</b>
    <span class="mono" style="margin-left:10px;font-size:16px;letter-spacing:2px;color:#2F5BEA;background:#EDF1FE;border-radius:7px;padding:3px 10px">${esc(S.roomCode)}</span>
    <span style="margin-left:12px;font-size:11.5px;color:#8A909C">队友在「多人辩论 → 房间号加入」里输入这一串</span>
  </div>
  <div class="strip">${seats.map(s => {
    const me = s.seat_key === room.mySeat;
    const label = s.occupant === 'USER' ? seatName(s) : s.occupant === 'AI' ? (s.user_name || 'AI') : '空位';
    return `<div class="sp ${me ? 'me' : ''}">
      <div class="av ${s.side === 'A' ? 'a' : 'b'}">${me ? '我' : esc(label.slice(0,1))}</div>
      <div><div class="nm">${esc(label)} ${roleTag(s)}</div>
        <div class="rl">${s.side === 'A' ? '正方' : '反方'}${esc(s.role)}${s.ready ? ' · 已准备' : ''}</div></div>
    </div>`; }).join('')}</div>
  <div class="card">
    <b style="font-size:12.5px">席位</b>
    <table class="t" style="margin-top:8px">
      <tr><th>席位</th><th>辩位</th><th>占位</th><th>准备</th></tr>
      ${seats.map(s => `<tr>
        <td class="mono">${s.seat_key}</td><td>${esc(s.role)}</td>
        <td>${s.occupant === 'USER'
             ? esc(seatName(s)) + ' ' + roleTag(s) + (s.seat_key === room.mySeat ? ' <span class="tag">你</span>' : '')
             : s.occupant === 'AI' ? 'AI' : '<span style="color:#A8ADB8">空位（开局补 AI）</span>'}</td>
        <td>${s.occupant === 'AI' ? '<span class="tag g">就绪</span>'
             : s.ready ? '<span class="tag g">已准备</span>' : '<span class="tag">未准备</span>'}</td>
      </tr>`).join('')}
    </table>
  </div>
  ${roomInviteModal()}`;
}

function mySeatReady(){
  const seats = S.room?.seats || [];
  const mine = seats.find(s => s.seat_key === S.room?.mySeat);
  return !!(mine && mine.ready);
}

async function createRoom(){
  if (!needLogin('登录后才能建房')) return;
  try {
    const r = await api('/api/rooms', {method:'POST', body:{topicId:S.topics[0]?.id}});
    S.roomCode = r.code; S.room = r.detail; S.mySeat = r.detail.mySeat;
    startRoomPoll(); render();
    toast('房间已创建：' + r.code);
  } catch (e) { toast('建房失败：' + e.message); }
}

async function joinRoom(code){
  if (!needLogin('登录后才能加入房间')) return;
  const c = (code || '').trim().toUpperCase();
  if (!c) return toast('填房间号');
  try {
    S.room = await api(`/api/rooms/${c}/join`, {method:'POST', body:{}});
    S.roomCode = c; S.mySeat = S.room.mySeat;
    startRoomPoll(); render();
    toast('已加入 ' + c + ' · 你坐 ' + S.mySeat);
  } catch (e) { toast('加入失败：' + (e.message || '').slice(0, 60)); }
}

async function leaveRoom(){
  try { await api(`/api/rooms/${S.roomCode}/leave`, {method:'POST', body:{}}); } catch (e) {}
  stopRoomPoll(); S.roomCode = null; S.room = null; S.mySeat = null;
  await loadRooms(); render();
}

async function toggleReady(){
  try {
    S.room = await api(`/api/rooms/${S.roomCode}/ready`, {method:'POST', body:{ready: !mySeatReady()}});
    render();
  } catch (e) { toast('操作失败：' + e.message); }
}

async function startRoom(){
  try {
    const r = await api(`/api/rooms/${S.roomCode}/start`, {method:'POST', body:{}});
    stopRoomPoll();
    S.matchId = r.matchId; S.roomMode = true;
    await loadMatch(true);
    startPoll(); go('match');
  } catch (e) { toast('开局失败：' + (e.message || '').slice(0, 60)); }
}

function copyRoom(){
  try { navigator.clipboard?.writeText(S.roomCode)?.catch(()=>{}); } catch (e) {}
  toast('已复制：' + S.roomCode);
}

function startRoomPoll(){
  stopRoomPoll();
  S.roomPoll = setInterval(async () => {
    if (!S.roomCode || !S.user) return;          // 未登录不轮询
    try {
      const d = await api(`/api/rooms/${S.roomCode}`);
      S.room = d;
      if (d.room && d.room.status === 'RUNNING' && d.room.match_id) {
        stopRoomPoll(); S.matchId = d.room.match_id; S.roomMode = true;
        await loadMatch(true); startPoll(); go('match'); return;
      }
      if (S.view === 'room') render();
    } catch (e) { /* 静默 */ }
  }, 1200);
}

function stopRoomPoll(){ if (S.roomPoll) { clearInterval(S.roomPoll); S.roomPoll = null; } }

// ==================== 邀请组队（V4） ====================
//
// 只给**房主**用：队友自己拉人容易出现"房间被塞满、房主不知道"的情况。
// 邀请走的是私聊消息（type=INVITE），所以接收方在聊天窗里看到一张卡片，
// 点「加入房间」直接 joinRoom —— 和手动输房间号是同一条路径，不特殊。

/** 打开好友选择弹窗（先渲染空壳，再异步填好友列表，点了就有反馈） */
async function roomInviteOpen(){
  if (!needLogin('登录后才能邀请好友')) return;
  S.roomInvite = { open:true, friends:[], sent:{}, loading:true, error:null };
  render();
  try {
    const r = await api('/api/social/friends');
    S.roomInvite.friends = (r && r.items) || [];
  } catch (e) {
    S.roomInvite.error = (e && e.message) || '好友列表加载失败';
  }
  S.roomInvite.loading = false;
  if (S.view === 'room') render();
}

function roomInviteClose(){
  S.roomInvite = { open:false, friends:[], sent:{} };
  render();
}

/** 给某个好友发一张邀请卡片 */
async function roomInviteSend(userId){
  if (!S.roomCode) return toast('先建房或进房间');
  const title = (S.room && S.room.room && S.room.room.topic_title) || '';
  try {
    await api('/api/social/messages', {method:'POST',
      body:{toId:userId, type:'INVITE', roomCode:S.roomCode, topicTitle:title}});
    S.roomInvite.sent[userId] = true;
    toast('邀请已发出');
    render();
  } catch (e) {
    const raw = String((e && e.message) || '');
    let code = '';
    try { code = JSON.parse(raw).code || ''; } catch (ignore) {}
    const map = {
      NOT_FRIEND: '你们不是好友，不能邀请',
      INVALID_ROOM_CODE: '房间号格式不对',
      INVALID_TARGET: '邀请对象不对'
    };
    toast(map[code] || ('邀请失败：' + (code || raw).slice(0, 60)));
  }
}

/** 弹窗本体：没有好友时给一句能照做的话，而不是空白 */
function roomInviteModal(){
  const s = S.roomInvite || {};
  if (!s.open) return '';
  const list = s.friends || [];
  const body = s.loading
    ? '<div class="empty" style="padding:24px">加载好友…</div>'
    : s.error
      ? `<div class="empty" style="padding:24px">${esc(s.error)}</div>`
      : list.length
        ? list.map(f => `
          <div class="fr-row">
            <div class="fr-av">${esc(String(f.name || '?').slice(0, 1))}</div>
            <div class="fr-main">
              <div class="fr-name">${esc(f.name)}</div>
              <div class="fr-id">@${esc(f.id)}</div>
            </div>
            <div class="fr-act">
              ${s.sent && s.sent[f.id]
                ? '<button class="btn ghost" disabled>已邀请</button>'
                : `<button class="btn primary" onclick="roomInviteSend(${jsq(f.id)})">邀请</button>`}
            </div>
          </div>`).join('')
        : `<div class="empty" style="padding:24px">还没有好友<br>
             <span class="sub">先去「好友」页搜人加好友，再回来邀请</span></div>`;

  return `<div class="mask" onclick="if(event.target===this) roomInviteClose()">
    <div class="iv-box">
      <div class="iv-head">
        <b>邀请好友加入</b>
        <button class="btn ghost sm" onclick="roomInviteClose()">关闭</button>
      </div>
      <p class="sub" style="margin:0 0 10px">
        房间 <span class="mono">${esc(S.roomCode || '')}</span> · 对方会收到一张卡片，点一下就能进
      </p>
      <div class="iv-list">${body}</div>
    </div>
  </div>`;
}
