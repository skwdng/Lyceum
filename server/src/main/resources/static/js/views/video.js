/* 视频：辩论短视频（思弈阁内置模块）
 * 归属：这个文件独占；接口 /api/video/**，身份复用思弈阁 JWT
 */

const V = {
  loaded: false,
  list: [],
  cursor: 0,
  stats: {},
  seg: '',
  tab: 'feed',        // feed | publish | audit
  auditList: [],
  auditStatus: 'REVIEW',
  detail: null
};

function videoInit(){
  if (!V.loaded) { V.loaded = true; loadVideoFeed(true); }
}

async function loadVideoFeed(reset){
  try {
    if (reset) { V.list = []; V.cursor = 0; }
    const qs = '/api/video/feed?size=6' + (V.cursor ? '&cursor=' + V.cursor : '') + (V.seg ? '&segment=' + encodeURIComponent(V.seg) : '');
    const d = await api(qs);
    V.list = V.list.concat(d.list || []);
    V.cursor = d.nextCursor || 0;
    V.stats = d.stats || {};
    const st = document.querySelector('#vfStat');
    if (st) st.textContent = '辩论短视频 · ' + (V.stats.passed || 0) + ' 条在架';
    renderVideoFeed();
  } catch (e) {
    const el = document.querySelector('#vfFeed');
    if (el) el.innerHTML = '<div class="vempty">加载失败：' + esc(e.message) + '</div>';
  }
}

function vAuditPill(status, note){
  const map = { PASSED:['ok','已通过'], REVIEW:['warn','待复核'], PENDING:['warn','待初审'], REJECTED:['bad','已驳回'] };
  const m = map[status] || ['warn', status || '-'];
  return `<span class="vpill ${m[0]}" title="${esc(note || '')}">${m[1]}</span>`;
}

function renderVideoFeed(){
  const box = document.querySelector('#vfFeed');
  if (!box) return;
  if (!V.list.length) {
    box.innerHTML = '<div class="vempty">这个筛选下还没有过审的视频</div>';
    return;
  }
  box.innerHTML = V.list.map(v => `
    <div class="vslide">
      <div class="vwater">辩</div>
      <video src="${esc(v.url)}" preload="metadata" playsinline muted loop></video>
      <div class="vside">
        <button onclick="vLike(${v.id}, this)" class="${v.liked ? 'on' : ''}">
          <span>${v.liked ? '♥' : '♡'}</span><i id="vlk${v.id}">${v.likes || 0}</i>
        </button>
        <button onclick="vComments(${v.id})"><span>💬</span><i>${v.comments || 0}</i></button>
        <button onclick="vShare(${v.id})"><span>↗</span><i>分享</i></button>
      </div>
      <div class="vinfo">
        <div class="vtags">
          ${v.segment ? `<span class="vtag">${esc(v.segment)}</span>` : ''}
          ${v.topic ? `<span class="vtag o">${esc(v.topic)}</span>` : ''}
          ${v.side ? `<span class="vtag">${esc(v.side)}方</span>` : ''}
        </div>
        <h3>${esc(v.title)}</h3>
        <div class="vby">${esc(v.author || '匿名辩手')} · ${v.views || 0} 次播放${v.duration_sec ? ' · ' + v.duration_sec + 's' : ''}</div>
      </div>
    </div>`).join('');
  bindVideoPlayers();
}

function bindVideoPlayers(){
  const box = document.querySelector('#vfFeed');
  if (!box) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target.querySelector('video');
      if (!v) return;
      if (e.isIntersecting) v.play().catch(() => {});
      else { v.pause(); }
    });
  }, { threshold: 0.6 });
  box.querySelectorAll('.vslide').forEach(s => io.observe(s));
  box.onscroll = () => {
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 240) loadVideoFeed(false);
  };
}

async function vLike(id, btn){
  if (!S.loggedIn) { toast('先登录再点赞'); return; }
  const v = V.list.find(x => x.id === id);
  const cancel = !!(v && v.liked);
  try {
    const d = await api(`/api/video/videos/${id}/like`, { method:'POST', body:{ cancel } });
    if (v) { v.liked = d.liked; v.likes = d.likes; }
    btn.classList.toggle('on', d.liked);
    btn.querySelector('span').textContent = d.liked ? '♥' : '♡';
    const n = document.querySelector('#vlk' + id);
    if (n) n.textContent = d.likes;
  } catch (e) { toast(e.message); }
}

function vShare(id){
  const url = location.origin + location.pathname + '#v' + id;
  if (navigator.clipboard) navigator.clipboard.writeText(url);
  toast('链接已复制');
}

async function vComments(id){
  V.detail = id;
  const d = await api('/api/video/videos/' + id);
  const host = document.querySelector('#vSheetBody');
  document.querySelector('#vSheetTitle').textContent = '评论';
  host.innerHTML = `
    <div class="vcard">
      <b>${esc(d.video.title)}</b>
      <div class="vkv"><span>作者</span><b>${esc(d.video.author || '匿名')}</b></div>
      <div class="vkv"><span>审核</span><b>${vAuditPill(d.video.audit_status, d.video.audit_note)}</b></div>
    </div>
    <div style="display:flex;gap:8px;margin:12px 0">
      <input id="vcInput" class="vinput" placeholder="说点什么…">
      <button class="btn sm primary" onclick="vSendComment(${id})">发送</button>
    </div>
    <div>${(d.comments || []).map(c => `<div class="vcmt"><div class="vwho">${esc(c.author || '匿名')}</div>${esc(c.content)}</div>`).join('') || '<div class="vempty">还没有评论</div>'}</div>`;
  openVideoSheet();
}

async function vSendComment(id){
  const el = document.querySelector('#vcInput');
  const text = (el?.value || '').trim();
  if (!text) return;
  try {
    await api(`/api/video/videos/${id}/comments`, { method:'POST', body:{ content:text } });
    el.value = '';
    vComments(id);
    loadVideoFeed(true);
  } catch (e) { toast(e.message); }
}

// ---------- 发布 ----------
function vOpenPublish(){
  const host = document.querySelector('#vSheetBody');
  document.querySelector('#vSheetTitle').textContent = '发布辩论视频';
  host.innerHTML = `
    <div class="vfield"><label>标题</label><input id="vpTitle" class="vinput" placeholder="例如：质询名场面：三句话逼出对方口径矛盾"></div>
    <div class="vfield"><label>简介（可选）</label><textarea id="vpDesc" class="vinput" placeholder="这场为什么值得看"></textarea></div>
    <div class="vfield"><label>视频地址</label><input id="vpUrl" class="vinput" value="https://www.w3schools.com/html/mov_bbb.mp4"></div>
    <div class="vfield"><label>关联辩题（可选）</label><input id="vpTopic" class="vinput" placeholder="例如：取消期末考试"></div>
    <div class="vrow">
      <div class="vfield" style="flex:1"><label>环节</label>
        <select id="vpSeg" class="vinput"><option>名场面</option><option>立论</option><option>驳立论</option><option>质询</option><option>自由辩</option><option>总结</option></select></div>
      <div class="vfield" style="flex:1"><label>立场</label>
        <select id="vpSide" class="vinput"><option value="正">正方</option><option value="反">反方</option></select></div>
    </div>
    <button class="btn primary" style="width:100%" onclick="vPublish()">提交审核</button>
    <div id="vpResult" style="margin-top:12px"></div>`;
  openVideoSheet();
}

async function vPublish(){
  const body = {
    title: document.querySelector('#vpTitle').value,
    description: document.querySelector('#vpDesc').value,
    url: document.querySelector('#vpUrl').value,
    topic: document.querySelector('#vpTopic').value,
    segment: document.querySelector('#vpSeg').value,
    side: document.querySelector('#vpSide').value,
    durationSec: 30
  };
  const box = document.querySelector('#vpResult');
  box.innerHTML = '<div class="vempty">正在机器初审…</div>';
  try {
    const d = await api('/api/video/videos', { method:'POST', body });
    box.innerHTML = `<div class="vcard">
        <div class="vkv"><span>审核结果</span><b>${vAuditPill(d.auditStatus)}</b></div>
        <div class="vkv"><span>判定依据</span><b style="text-align:right;max-width:62%">${esc(d.reason)}</b></div>
        <div class="vkv"><span>是否上广场</span><b>${d.visible ? '是' : '否'}</b></div>
      </div>`;
    if (d.visible) loadVideoFeed(true);
  } catch (e) {
    box.innerHTML = '<div class="vcard" style="color:#E5484D">' + esc(e.message) + '</div>';
  }
}

// ---------- 审核台 ----------
function vOpenAudit(){
  const host = document.querySelector('#vSheetBody');
  document.querySelector('#vSheetTitle').textContent = '审核台';
  host.innerHTML = `
    <div id="vaStats" class="vcard"></div>
    <div class="vrow" style="margin-bottom:12px">
      <button class="btn sm ghost" onclick="vQueue('REVIEW')">待复核</button>
      <button class="btn sm ghost" onclick="vQueue('PENDING')">待初审</button>
      <button class="btn sm ghost" onclick="vQueue('REJECTED')">已驳回</button>
      <button class="btn sm ghost" onclick="vQueue('PASSED')">已通过</button>
    </div>
    <div id="vaList"></div>`;
  openVideoSheet();
  vQueue('REVIEW');
}

async function vQueue(status){
  V.auditStatus = status;
  const d = await api('/api/video/audit/queue?status=' + status + '&size=50');
  const st = d.stats || {};
  const s = document.querySelector('#vaStats');
  if (s) s.innerHTML = `
    <div class="vkv"><span>视频总数</span><b>${st.videos ?? 0}</b></div>
    <div class="vkv"><span>已通过</span><b>${st.passed ?? 0}</b></div>
    <div class="vkv"><span>待处理</span><b style="color:#E8B279">${st.pending ?? 0}</b></div>
    <div class="vkv"><span>已驳回</span><b>${st.rejected ?? 0}</b></div>`;
  const l = document.querySelector('#vaList');
  if (!l) return;
  l.innerHTML = (d.list || []).length ? d.list.map(v => `
    <div class="vcard vrowitem" onclick="vAuditDetail(${v.id})">
      <div class="vthumb">🎬</div>
      <div style="flex:1;min-width:0">
        <b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title)}</b>
        <div style="font-size:12px;color:#9AA0AE;margin-top:3px">${esc(v.author || '匿名')} · ${vAuditPill(v.audit_status, v.audit_note)}</div>
        <div style="font-size:12px;color:#9AA0AE">${esc(v.audit_note || '')}</div>
      </div>
    </div>`).join('') : '<div class="vempty">这个队列是空的</div>';
}

async function vAuditDetail(id){
  const d = await api(`/api/video/audit/${id}/logs`);
  const v = d.video || {};
  const host = document.querySelector('#vSheetBody');
  document.querySelector('#vSheetTitle').textContent = '审核详情';
  host.innerHTML = `
    <div class="vcard">
      <b>${esc(v.title || '')}</b>
      <div class="vkv"><span>作者</span><b>${esc(v.author || '匿名')}</b></div>
      <div class="vkv"><span>环节 / 辩题</span><b>${esc(v.segment || '-')} / ${esc(v.topic || '-')}</b></div>
      <div class="vkv"><span>当前状态</span><b>${vAuditPill(v.audit_status, v.audit_note)}</b></div>
    </div>
    <div class="vrow" style="margin-bottom:12px">
      <button class="btn sm" style="background:#0E9F6E;color:#fff" onclick="vDecide(${id},'PASS')">通过</button>
      <button class="btn sm" style="background:#E5484D;color:#fff" onclick="vDecide(${id},'REJECT')">驳回</button>
      <button class="btn sm ghost" onclick="vRestore(${id})">一键恢复</button>
      <button class="btn sm ghost" onclick="vQueue('${V.auditStatus}')">返回队列</button>
    </div>
    <b style="font-size:12.5px;color:#9AA0AE">审核记录（可追溯）</b>
    <div style="margin-top:8px">${(d.list || []).map(a => `
      <div class="vcmt"><div class="vwho">${a.stage === 'MACHINE' ? '机器' : esc(a.operator || '人工')} · ${esc(a.result)}${a.restored ? ' · 已恢复' : ''}</div>${esc(a.reason || '')}</div>`).join('') || '<div class="vempty">没有记录</div>'}</div>`;
}

async function vDecide(id, decision){
  let reason = '';
  if (decision === 'REJECT') reason = prompt('驳回理由（会记进审核记录）', '内容与辩论无关') || '人工驳回';
  try {
    await api(`/api/video/audit/${id}/decide`, { method:'POST', body:{ decision, reason } });
    toast(decision === 'PASS' ? '已通过，已上广场' : '已驳回');
    loadVideoFeed(true);
    vQueue(V.auditStatus);
  } catch (e) { toast(e.message); }
}

async function vRestore(id){
  try {
    const d = await api(`/api/video/audit/${id}/restore`, { method:'POST' });
    toast('已恢复至 ' + d.restoredTo);
    loadVideoFeed(true);
    vQueue(V.auditStatus);
  } catch (e) { toast(e.message); }
}

// ---------- 视图 ----------
function viewVideo(){
  const segs = ['', '立论', '驳立论', '质询', '自由辩', '总结', '名场面'];
  setTimeout(() => { videoInit(); }, 0);
  return `
  <div class="vwrap">
    <div class="vtop">
      <b style="font-size:16px">视频</b>
      <span id="vfStat" style="font-size:12.5px;color:#9AA0AE">辩论短视频 · ${V.stats.passed ?? 0} 条在架</span>
      <span style="flex:1"></span>
      <button class="btn sm ghost" onclick="vOpenPublish()">发布</button>
      <button class="btn sm ghost" onclick="vOpenAudit()">审核台</button>
    </div>
    <div class="vfilter">
      ${segs.map(s => `<button class="vseg ${V.seg === s ? 'on' : ''}" onclick="V.seg='${s}';render();loadVideoFeed(true)">${s || '全部'}</button>`).join('')}
    </div>
    <div class="vfeed" id="vfFeed"><div class="vempty">加载中…</div></div>
  </div>

  <div class="vmask" id="vSheet" onclick="if(event.target===this)closeVideoSheet()">
    <div class="vsheet">
      <div class="vshd"><b id="vSheetTitle">视频</b><span style="flex:1"></span>
        <button class="btn sm ghost" onclick="closeVideoSheet()">关闭</button></div>
      <div class="vsbd" id="vSheetBody"></div>
    </div>
  </div>`;
}

function openVideoSheet(){ document.querySelector('#vSheet').classList.add('show'); }
function closeVideoSheet(){ document.querySelector('#vSheet').classList.remove('show'); }
