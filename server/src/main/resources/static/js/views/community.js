/* 社区（讨论区）：列表 / 详情 / 楼中楼 / 点赞 / 发帖 / 编辑 / 删除 / 筛选 / 排序 / 分页
 * 归属：见 docs/协作规范.md；契约：docs/社区接口契约.md
 * 来源：参考仓 A static/index.html 社区段（原 924-2097 行），已摘除本地 mock 层
 * 约定：
 *   · 唯一渲染入口 viewCommunity() 同步返回 HTML 字符串（core.js render() 调用）
 *   · 其余 cmXxx() 是全局函数，供内联 onclick 使用
 *   · 异步一律「先渲染占位 -> await -> 再 render()」，与 views/match.js 同一套路
 *   · 样式见 css/app.css 的 .cm-* 段
 */
const CM_LOG = [];

/* §18 R-COM-01 类型枚举 / R-COM-12 排序枚举 / R-COM-11 日期范围枚举 */
const CM_TYPES = [{k:'ALL',n:'全部'},{k:'CHAT',n:'闲聊'},{k:'GUIDE',n:'教程'},{k:'HELP',n:'求助'}];
const CM_SORTS = [{k:'NEW',n:'最新发布'},{k:'COMMENTS',n:'最多评论'},{k:'LIKES',n:'最多点赞'},{k:'HOT',n:'最热门'}];
const CM_RANGES = [{k:'ALL',n:'全部时间'},{k:'3D',n:'3 天内'},{k:'7D',n:'7 天内'},{k:'OLDER',n:'更早'}];

function cmPad(n){ return String(n).padStart(2, '0'); }
function cmTypeName(k){ const t = CM_TYPES.filter(function(x){ return x.k === k; })[0]; return t ? t.n : '闲聊'; }
function cmRangeName(k){ const r = CM_RANGES.filter(function(x){ return x.k === k; })[0]; return r ? r.n : '全部时间'; }
function cmInitial(name){ const s = String(name == null ? '' : name).trim(); return s ? s.slice(0, 1) : '?'; }
function cmFmt(ts){
  if (!ts) return '—';
  const d = new Date(ts);
  return cmPad(d.getMonth() + 1) + '-' + cmPad(d.getDate()) + ' ' + cmPad(d.getHours()) + ':' + cmPad(d.getMinutes());
}
function cmExcerpt(body){
  const plain = String(body == null ? '' : body).replace(/[#*_>-]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 200 ? plain.slice(0, 200) + '…' : plain;
}
function cmErr(code, msg){ const e = new Error(msg || code); e.code = code; return e; }
function cmTopicName(id){
  if (!id) return '';
  const t = (S.topics || []).filter(function(x){ return String(x.id) === String(id); })[0];
  return t ? t.title : '';
}
/* 契约 §4.4：按 code 分支，不猜 HTTP 状态；CONTENT_BLOCKED 已废弃（§18 R-COM-39 / D5） */
function cmErrText(e){
  const code = String((e && e.code) || '');
  const msg = String((e && e.message) || '');
  const map = {
    INVALID_PARAM:'参数不合法',
    UNAUTHORIZED:'请先登录',
    SERVICE_UNAVAILABLE:'服务暂时不可用，请稍后再试',
    POST_NOT_FOUND:'帖子已删除或不存在',
    COMMENT_NOT_FOUND:'评论已删除',
    NOT_AUTHOR:'只能操作自己的内容',
    MUTED:'你已被禁言，暂时不能发内容',
    ALREADY_REPORTED:'你已经举报过这条内容',
    ACCOUNT_DISABLED:'账号已被封禁',
    NOT_ADMIN:'没有管理员权限',
    INTERNAL_ERROR:'服务异常，请重试',
    TIMEOUT:'请求超时，请重试',
    NETWORK:'后端未连接'
  };
  const detail = msg.replace(/^[A-Z][A-Z0-9_]*:\s*/, '').trim();
  const base = map[code];
  if (base) return (detail && detail !== msg) ? base + '（' + detail + '）' : base;
  if (/^HTTP_\d+$/.test(code)) return '后端接口异常（' + code + '）';
  return detail || msg || '操作失败';
}
/* §18 R-COM-06 正文是 Markdown；只允许外链图片，先转义再套有限语法 */
/**
 * 把正文里的 `@昵称` 包成浅蓝色（决策 2：**只变色，不加链接**，也不做任何跳转）。
 *
 * <p>入参必须是**已经 esc 过**的 HTML：昵称只可能由中英文/数字/下划线/短横组成，
 * 不会带 `<` `&` 这类字符，所以这一步不会破坏转义。
 * 前端只负责"显示得像被 @ 了"，**不当身份用**——谁能收到通知完全由后端的 userId 决定。
 */
function cmMentionify(html){
  return String(html == null ? '' : html).replace(
    /@([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g,
    '<span class="mention">@$1</span>'
  );
}

function cmInline(s){
  let t = cmMentionify(esc(s));
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  return t;
}
function cmMD(text){
  const src = String(text == null ? '' : text).replace(/\r/g, '');
  return src.split(/\n{2,}/).map(function(b){
    const lines = b.split('\n').filter(function(l){ return l.trim() !== ''; });
    if (!lines.length) return '';
    const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
    if (h && lines.length === 1) {
      const lv = Math.min(h[1].length + 1, 3);
      return '<h' + lv + '>' + cmInline(h[2]) + '</h' + lv + '>';
    }
    if (lines.every(function(l){ return /^[-*]\s+/.test(l); }))
      return '<ul>' + lines.map(function(l){ return '<li>' + cmInline(l.replace(/^[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>';
    if (lines.every(function(l){ return /^\d+\.\s+/.test(l); }))
      return '<ol>' + lines.map(function(l){ return '<li>' + cmInline(l.replace(/^\d+\.\s+/, '')) + '</li>'; }).join('') + '</ol>';
    return '<p>' + lines.map(function(l){ return cmInline(l); }).join('<br>') + '</p>';
  }).join('');
}
function cmHl(text, q){
  const s = esc(text);
  const qq = String(q || '').trim();
  if (!qq) return s;
  const qe = esc(qq);
  const i = s.toLowerCase().indexOf(qe.toLowerCase());
  if (i < 0) return s;
  return s.slice(0, i) + '<mark>' + s.slice(i, i + qe.length) + '</mark>' + s.slice(i + qe.length);
}

/* ---------------- 本地 mock（相当于后端的 §8 三张表 + §18 全部规则） ---------------- */
function cmQuery(params){
  const out = [];
  Object.keys(params).forEach(function(k){
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    out.push(k + '=' + encodeURIComponent(v));
  });
  return out.length ? '?' + out.join('&') : '';
}
// 昵称不再由前端提交：统一取 sy_user.name（登录后在「我的」里改名，社区立刻生效）
async function cmRequest(method, path, opts){
  const o = opts || {};
  const hasBody = (method === 'POST' || method === 'PATCH') && o.body !== undefined;
  CM_LOG.push({method:method, path:path, body:hasBody ? o.body : null});
  if (CM_LOG.length > 200) CM_LOG.shift();

  const headers = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  // 身份改走 JWT（契约 §1：Authorization: Bearer，sub=userId）
  try { const tk = localStorage.getItem('sy_jwt'); if (tk) headers['Authorization'] = 'Bearer ' + tk; } catch (e) {}

  // 附加项：15s 超时 + AbortController（A 原先没有，卡住会一直转圈）
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, 15000);
  let resp;
  try {
    resp = await fetch(API_BASE + path, {
      method: method,
      headers: headers,
      body: hasBody ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal
    });
  } catch (netErr) {
    clearTimeout(timer);
    if (netErr && netErr.name === 'AbortError') throw cmErr('TIMEOUT', '请求超时（15 秒）');
    throw cmErr('NETWORK', '后端未连接（' + ((netErr && netErr.message) || 'network error') + '）');
  }
  clearTimeout(timer);
  const text = await resp.text();
  if (!resp.ok) {
    // B2：404 不再当成“后端未实现”，一律按错误体里的 {code} 判定（契约 §4.4）
    let code = 'HTTP_' + resp.status;
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j && j.code) { code = String(j.code); msg = String(j.message || j.code); }
    } catch (e) { /* 非 JSON 错误体（如参数绑定失败）：保留原文 */ }
    const err = new Error(msg);
    err.code = code; err.status = resp.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}
/* 响应结构在规格里没定义（第 18 节只写了用途），这里兼容数组与常见包装 */
/* 契约 §4.1：列表响应包固定 {items,total,page,size}，不再猜 list/records/content 等别名 */
function cmNormalizeList(res){
  const r = res || {};
  const items = Array.isArray(r.items) ? r.items : [];
  return {items:items, total:Number(r.total) || 0,
          page:Number(r.page) || 1, size:Number(r.size) || items.length};
}
function cmNum(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function cmTime(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}
function cmName(x){
  if (!x) return '';
  if (typeof x === 'string') return x;
  return x.name || x.nickname || x.nickName || x.userName || '';
}
/* 契约 §4.2：后端只输出 camelCase，前端只读 camelCase（不再做 snake_case 双兼容） */
function cmPost(raw){
  const r = raw || {};
  return {
    id:r.id,
    type:r.type || 'CHAT',
    title:r.title || '',
    body:r.body != null ? r.body : '',
    excerpt:r.excerpt != null ? r.excerpt : cmExcerpt(r.body || ''),
    topicId:r.topicId != null ? r.topicId : null,
    topicTitle:r.topicTitle || '',
    authorId:r.authorId,
    authorName:r.authorName || '匿名',
    commentCount:cmNum(r.commentCount),
    likeCount:cmNum(r.likeCount),
    viewCount:cmNum(r.viewCount),
    lastCommentAt:cmTime(r.lastCommentAt),
    createdAt:cmTime(r.createdAt),
    updatedAt:cmTime(r.updatedAt),
    liked:!!r.liked,
    status:r.status
  };
}
function cmComment(raw){
  const r = raw || {};
  const kids = Array.isArray(r.replies) ? r.replies : [];
  return {
    id:r.id,
    postId:r.postId,
    authorId:r.authorId,
    authorName:r.authorName || '匿名',
    isBot:!!r.isBot,
    rootId:r.rootId != null ? r.rootId : null,
    replyObjectType:r.replyObjectType || 'POST',
    replyObjectCommentId:r.replyObjectCommentId != null ? r.replyObjectCommentId : null,
    replyObjectUserName:r.replyObjectUserName || '',
    body:r.body != null ? r.body : '',
    likeCount:cmNum(r.likeCount),
    liked:!!r.liked,
    createdAt:cmTime(r.createdAt),
    replies:kids.map(cmComment),
    replyCount:cmNum(r.replyCount)
  };
}


/* ---------------- 社区视图（结构与样式对齐 思弈阁-原型.html 社区段） ---------------- */
function viewCommunity(){
  return '<div class="cm">' + (S.comm.view === 'post' ? viewPostDetail() : viewPostList()) + '</div>';
}
function cmEnterCommunity(){
  S.comm.view = 'list'; S.comm.postId = null; S.comm.page = 1;
  S.postDetail = null; S.postComments = []; S.postCommentTotal = 0;
  S.postRelated = []; S.replyTarget = null; S.replyDraft = '';
  cmReloadList();
  // 进社区顺手拉一次禁言状态（被禁言时顶部显示黄条）；失败不影响列表
  cmLoadMyBan().then(function(){ if (cmMuteInfo && cmMuteInfo.banned) render(); });
}
async function cmLoadPosts(){
  const c = S.comm;
  try {
    const qs = cmQuery({
      type: c.type === 'ALL' ? '' : c.type,
      title: c.q.trim(),
      topicId: c.topicId,
      range: c.range,
      sort: c.sort,
      page: c.page,
      size: c.size
    });
    const res = await cmRequest('GET', '/api/community/posts' + qs, {});
    const norm = cmNormalizeList(res);
    S.posts = norm.items.map(cmPost);
    S.postTotal = norm.total;
  } catch (e) {
    S.posts = []; S.postTotal = 0;
    toast('社区列表加载失败：' + cmErrText(e));
  }
}
async function cmReloadList(){
  S.postLoading = true;
  if (S.view === 'community') render();
  await cmLoadPosts();
  S.postLoading = false;
  if (S.view === 'community') render();
}
function cmRefreshListArea(){
  const wrap = $('#postListWrap'); if (wrap) wrap.innerHTML = cmPostListHTML();
  const pager = $('#postPager'); if (pager) pager.innerHTML = cmPagerHTML();
  const cnt = $('#postCount'); if (cnt) cnt.textContent = '共 ' + S.postTotal + ' 篇';
  const chips = $('#filterChips'); if (chips) chips.innerHTML = cmChips();
  const clr = $('#searchClr'); if (clr) clr.style.display = S.comm.q ? '' : 'none';
}
let cmSearchTimer = null;
function cmOnSearch(v){
  S.comm.q = v;
  const clr = $('#searchClr'); if (clr) clr.style.display = v ? '' : 'none';
  clearTimeout(cmSearchTimer);
  cmSearchTimer = setTimeout(async function(){
    S.comm.page = 1;
    await cmLoadPosts();
    cmRefreshListArea();
  }, 280);
}
function cmClearSearch(){
  S.comm.q = ''; S.comm.page = 1;
  const el = $('#postSearch'); if (el) el.value = '';
  cmLoadPosts().then(cmRefreshListArea);
}
function cmSetFilter(k, v){
  S.comm[k] = v;
  S.comm.page = 1;
  cmReloadList();
}
function cmRemoveFilter(k){
  if (k === 'type') S.comm.type = 'ALL';
  else if (k === 'topicId') S.comm.topicId = '';
  else if (k === 'range') S.comm.range = 'ALL';
  else if (k === 'q') S.comm.q = '';
  S.comm.page = 1;
  cmReloadList();
}
function cmClearFilters(){
  S.comm.q = ''; S.comm.type = 'ALL'; S.comm.topicId = ''; S.comm.range = 'ALL'; S.comm.page = 1;
  cmReloadList();
}
function cmGoPage(p){ S.comm.page = p; cmReloadList(); }
function cmChips(){
  const c = S.comm, out = [];
  if (c.type !== 'ALL') out.push(['type', '类型：' + cmTypeName(c.type)]);
  if (c.topicId) out.push(['topicId', '辩题：' + (cmTopicName(c.topicId) || c.topicId)]);
  if (c.range !== 'ALL') out.push(['range', '时间：' + cmRangeName(c.range)]);
  if (c.q.trim()) out.push(['q', '关键词：' + c.q.trim()]);
  if (!out.length) return '';
  return out.map(function(x){
    return '<span class="fchip"><b>' + esc(x[1]) + '</b><i onclick="cmRemoveFilter(&#39;' + x[0] + '&#39;)">✕</i></span>';
  }).join('');
}
function cmPagerHTML(){
  const total = S.postTotal, size = S.comm.size, page = S.comm.page;
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return '';
  return '<div class="pager">'
    + '<button class="btn btn-sm" ' + (page <= 1 ? 'disabled' : '') + ' onclick="cmGoPage(' + (page - 1) + ')">上一页</button>'
    + '<span>第 ' + page + ' / ' + pages + ' 页</span>'
    + '<button class="btn btn-sm" ' + (page >= pages ? 'disabled' : '') + ' onclick="cmGoPage(' + (page + 1) + ')">下一页</button>'
    + '</div>';
}
function cmPostListHTML(){
  if (S.postLoading) return '<div class="ccard" style="padding:48px;text-align:center;color:#86909C">正在加载…</div>';
  if (!S.posts.length) {
    return '<div class="empty-box">没有匹配的帖子' + (S.comm.q ? '：搜索「' + esc(S.comm.q) + '」' : '')
      + '<br><button class="btn btn-sm" style="margin-top:14px" onclick="cmClearFilters()">清除筛选条件</button></div>';
  }
  return S.posts.map(cmPostCard).join('');
}
function cmPostCard(p){
  const topic = p.topicTitle || cmTopicName(p.topicId);
  return `<div class="post" onclick="cmOpenPost(${cmJsArg(p.id)})">
    <div class="post-main">
      <div class="post-title"><span class="${cmTypeClass(p.type)}">${cmTypeName(p.type)}</span><em>${cmHl(p.title, S.comm.q)}</em></div>
      <div class="post-excerpt">${cmHl(p.excerpt, S.comm.q)}</div>
      <div class="post-meta">
        <span class="au"><i class="mini-av">${esc(cmInitial(p.authorName))}</i>${esc(p.authorName)}</span>
        ${topic ? `<span class="mini-tag">辩题 · ${esc(topic)}</span>` : ''}
        <span>👁 ${p.viewCount}</span>
        <span>👍 ${p.likeCount}</span>
        <span>发布 ${cmFmt(p.createdAt)}</span>
        <span style="margin-left:auto">最后回复 · ${p.lastCommentAt ? cmFmt(p.lastCommentAt) : '暂无'}</span>
      </div>
    </div>
    <div class="post-reply"><b>${p.commentCount}</b><small>回复</small></div>
  </div>`;
}
function cmTopicOptions(selected){
  return (S.topics || []).map(function(t){
    return '<option value="' + esc(t.id) + '"' + (String(selected) === String(t.id) ? ' selected' : '') + '>' + esc(t.title) + '</option>';
  }).join('');
}
function cmHotTopicIds(){
  const cnt = {};
  S.posts.forEach(function(p){ if (p.topicId) cnt[p.topicId] = (cnt[p.topicId] || 0) + 1; });
  return Object.keys(cnt).sort(function(a, b){ return cnt[b] - cnt[a]; }).slice(0, 8);
}
function cmTodayNew(){
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return S.posts.filter(function(p){ return p.createdAt >= start; }).length;
}

function viewPostList(){
  const c = S.comm;
  const hotTopics = cmHotTopicIds();
  const viewsSum = S.posts.reduce(function(a, p){ return a + p.viewCount; }, 0);
  return `
  <div class="page-head">
    <div>
      <div class="page-title">社区</div>
      <div class="page-desc">${S.postTotal} 篇帖子 · 闲聊 / 教程 / 求助，辩完之后来这聊聊
        <span class="mini-tag" style="margin-left:6px">接口已接通</span></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn" onclick="cmOpenMyReports()">我的举报</button>
      <button class="btn btn-primary" onclick="cmOpenNewPost()">＋ 发布帖子</button>
    </div>
  </div>
  ${cmMuteBanner()}

  <div class="comm">
    <div class="comm-main">
      <div class="ccard" style="padding:14px 16px;margin-bottom:14px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <div class="sbox">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
            <input id="postSearch" value="${esc(c.q)}" placeholder="搜索帖子标题…" oninput="cmOnSearch(this.value)">
            <button class="clr" id="searchClr" style="${c.q ? '' : 'display:none'}" onclick="cmClearSearch()">✕</button>
          </div>
          <div class="tabs">
            ${CM_TYPES.map(function(t){ return `<button class="tab ${c.type === t.k ? 'active' : ''}" onclick="cmSetFilter('type','${t.k}')">${t.n}</button>`; }).join('')}
          </div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px dashed #F2F3F5">
          <div class="tabs">
            ${CM_SORTS.map(function(s){ return `<button class="tab ${c.sort === s.k ? 'active' : ''}" onclick="cmSetFilter('sort','${s.k}')">${s.n}</button>`; }).join('')}
          </div>
          <select class="sel" onchange="cmSetFilter('range', this.value)">
            ${CM_RANGES.map(function(r){ return `<option value="${r.k}" ${c.range === r.k ? 'selected' : ''}>${r.n}</option>`; }).join('')}
          </select>
          <select class="sel" onchange="cmSetFilter('topicId', this.value)">
            <option value="">全部辩题</option>
            ${cmTopicOptions(c.topicId)}
          </select>
          <span id="postCount" style="font-size:12.5px;color:#86909C">共 ${S.postTotal} 篇</span>
          <div id="filterChips" style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">${cmChips()}</div>
          <button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="cmClearFilters()">清除全部</button>
        </div>
      </div>

      <div id="postListWrap">${cmPostListHTML()}</div>
      <div id="postPager">${cmPagerHTML()}</div>
    </div>

    <div class="comm-side">
      <div class="ccard" style="padding:16px 18px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">社区概览</div>
        <div class="cm-stat"><span>帖子总数</span><b>${S.postTotal}</b></div>
        <div class="cm-stat"><span>本页今日新增</span><b style="color:#00B42A">＋${cmTodayNew()}</b></div>
        <div class="cm-stat"><span>本页浏览合计</span><b style="color:#165DFF">${viewsSum}</b></div>
      </div>

      <div class="ccard" style="padding:16px 18px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:11px">热门辩题
          <span style="font-size:11.5px;color:#A9AEB8;font-weight:400">点击筛选</span></div>
        <div>
          ${hotTopics.length
            ? hotTopics.map(function(id){ return `<span class="htag ${String(c.topicId) === String(id) ? 'on' : ''}" onclick="cmSetFilter('topicId', ${cmJsArg(id)})">${esc(cmTopicName(id) || id)}</span>`; }).join('')
            : '<span style="font-size:12.5px;color:#A9AEB8">当前列表没有关联辩题的帖子</span>'}
        </div>
      </div>

      <div class="ccard" style="padding:16px 18px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">发帖须知</div>
        <div style="font-size:12.5px;color:#86909C;line-height:1.85">
          只显示昵称，不显示段位 / 积分 / 场次。<br>
          搜索只匹配标题。<br>
          正文支持 Markdown，图片只能用外链。<br>
          点赞只影响热度，不进入任何评分。
        </div>
      </div>
    </div>
  </div>`;
}
function viewPostDetail(){
  const p = S.postDetail;
  if (!p) return '<div class="ccard" style="padding:48px;text-align:center;color:#86909C">正在加载帖子…</div>';
  const mine = cmIsMine(p.authorId);
  const topic = p.topicTitle || cmTopicName(p.topicId);
  return `
  <div class="page-head" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-sm" onclick="backToPosts()">← 返回社区</button>
      <span class="${cmTypeClass(p.type)}">${cmTypeName(p.type)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-size:12.5px;color:#86909C">${p.viewCount} 次浏览 · 最后回复 ${p.lastCommentAt ? cmFmt(p.lastCommentAt) : '暂无'}</div>
      ${mine ? '' : `<button class="btn btn-sm" onclick="cmOpenReport('POST', ${cmJsArg(p.id)})">⋯ 举报</button>`}
    </div>
  </div>
  ${cmMuteBanner()}

  <div class="comm">
    <div class="comm-main">
      <div class="ccard" style="padding:24px 26px">
        <h2 style="font-size:20px;font-weight:700;line-height:1.5;margin-bottom:16px">${esc(p.title)}</h2>
        <div style="display:flex;align-items:center;gap:10px;padding-bottom:16px;border-bottom:1px solid #F2F3F5;margin-bottom:18px">
          <div class="reply-av" style="width:34px;height:34px;border-radius:9px">${esc(cmInitial(p.authorName))}</div>
          <div>
            <div style="font-size:13px;font-weight:600">${esc(p.authorName)}</div>
            <div style="font-size:11.5px;color:#A9AEB8;margin-top:1px">发布于 ${cmFmt(p.createdAt)}${topic ? ' · 辩题「' + esc(topic) + '」' : ''}</div>
          </div>
          ${mine ? `<div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn btn-sm" onclick="cmOpenEditPost()">编辑</button>
            <button class="btn btn-sm" onclick="cmDeletePost()">删除</button>
          </div>` : ''}
        </div>

        <div class="post-body">${cmMD(p.body)}</div>

        <div style="display:flex;gap:10px;margin-top:22px;padding-top:18px;border-top:1px solid #F2F3F5">
          <button class="btn ${p.liked ? 'btn-primary' : ''}" onclick="cmLikePost()">👍 ${p.liked ? '已赞' : '点赞'} ${p.likeCount}</button>
        </div>
      </div>

      <div class="ccard" style="padding:20px 24px;margin-top:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:6px">全部回复
          <span style="color:#86909C;font-size:12.5px;font-weight:400">（${p.commentCount}）</span></div>
        ${S.postComments.length
          ? S.postComments.map(cmRootHTML).join('')
          : '<div style="padding:26px 0;text-align:center;color:#86909C;font-size:13px">还没有回复，来抢沙发</div>'}
        ${cmCommentPager()}
      </div>

      <div class="ccard" style="padding:20px 24px;margin-top:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">写回复</div>
        ${S.replyTarget ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span class="fchip"><b>回复 ${esc(S.replyTarget.name)}</b><i onclick="cmCancelReply()">✕</i></span></div>` : ''}
        <textarea id="replyInput" maxlength="1000" placeholder="说说你的看法…（输入 @ 可以 @ 人）"
                  oninput="cmDraft(this.value);cmMentionInput(this)" onkeydown="cmMentionKey(event, this)"
                  onblur="setTimeout(cmMentionClose, 120)"
          style="width:100%;min-height:96px;border:1px solid #E5E6EB;border-radius:9px;padding:12px 14px;font-size:14px;line-height:1.7;outline:none;resize:vertical;font-family:inherit">${esc(S.replyDraft)}</textarea>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
          <span id="replyCount" style="font-size:11.5px;color:#A9AEB8">${String(S.replyDraft || '').length} / 1000</span>
          <button class="btn btn-primary btn-sm" onclick="cmPostReply()">发布回复</button>
        </div>
      </div>
    </div>

    <div class="comm-side">
      <div class="ccard" style="padding:16px 18px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">本帖数据</div>
        <div class="cm-stat"><span>浏览</span><b>${p.viewCount}</b></div>
        <div class="cm-stat"><span>回复</span><b>${p.commentCount}</b></div>
        <div class="cm-stat"><span>点赞</span><b>${p.likeCount}</b></div>
      </div>
      <div class="ccard" style="padding:16px 18px">
        <div style="font-size:13px;font-weight:600;margin-bottom:11px">相关帖子</div>
        ${S.postRelated.length
          ? S.postRelated.map(function(x){ return `<div class="side-item" style="cursor:pointer;align-items:flex-start;line-height:1.5" onclick="cmOpenPost(${cmJsArg(x.id)})">
              <span class="${cmTypeClass(x.type)}" style="transform:scale(.9)">${cmTypeName(x.type)}</span>
              <span style="flex:1">${esc(String(x.title || '').slice(0, 18))}…</span></div>`; }).join('')
          : '<div style="font-size:12.5px;color:#A9AEB8">暂无</div>'}
      </div>
    </div>
  </div>`;
}

function cmCommentPager(){
  const total = S.postCommentTotal, size = 10, page = S.commentPage || 1;
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return '';
  return '<div class="pager">'
    + '<button class="btn btn-sm" ' + (page <= 1 ? 'disabled' : '') + ' onclick="cmGoCommentPage(' + (page - 1) + ')">上一页</button>'
    + '<span>第 ' + page + ' / ' + pages + ' 页</span>'
    + '<button class="btn btn-sm" ' + (page >= pages ? 'disabled' : '') + ' onclick="cmGoCommentPage(' + (page + 1) + ')">下一页</button>'
    + '</div>';
}
function cmGoCommentPage(p){ if (S.comm.postId) cmLoadComments(S.comm.postId, p); }
function cmSafeType(t){
  return ['CHAT','GUIDE','HELP'].indexOf(t) >= 0 ? t : 'CHAT';
}
function cmTypeClass(t){ return 'ptype ptype-' + cmSafeType(t); }
function cmJsArg(v){
  return esc(JSON.stringify(String(v)));
}
/** 当前登录用户的社区身份（= 账号，来自 JWT 的 sub；匿名时为空串）。 */
function cmMe(){ return (S.user && S.user.id) ? String(S.user.id) : ''; }

/**
 * 是不是我发的内容。
 *
 * <p>注意**不能**再用 `S.userId`——那是辩论侧的随机 gXXXXXX id；
 * 社区身份在 2026-11-03 已改为登录账号，拿旧 id 比会让「编辑/删除」永远不出现。
 */
function cmIsMine(authorId){
  const me = cmMe();
  return !!me && authorId != null && String(authorId) === me;
}

/**
 * 「AI」徽章：AI 账号（isBot=true）昵称后面挂一个小标签，像普通用户但看得出是 AI。
 * 只做展示，不影响任何权限——AI 就是普通用户行。
 */
function cmAiBadge(c){
  return c && c.isBot ? '<span class="ai-badge">AI</span>' : '';
}

/**
 * @ 了 DeepSeek 之后静默刷新评论（决策 5：不做「正在思考」占位、不做「已呼叫」提示）。
 *
 * <p>为什么是 5s / 12s / 25s 三次：实测模型往返 4~6 秒，
 * 20% 左右会因为思考链更长到 10 秒以上；三次覆盖到 25 秒，
 * 再往后就是模型挂了（后端不重试），刷新也没意义。
 *
 * <p>刷新只重拉评论列表、并保持当前页码，不打断用户输入、不弹任何提示。
 * 若用户已经离开这个帖子 / 已经切走视图，就静默放弃。
 */
const CM_AI_WAITS = [5000, 12000, 25000];
const CM_AI_TIMERS = [];
function cmAiCancel(){
  while (CM_AI_TIMERS.length) clearTimeout(CM_AI_TIMERS.pop());
}
function cmAwaitAi(postId){
  cmAiCancel();
  CM_AI_WAITS.forEach(function(ms){
    const t = setTimeout(async function(){
      if (!S.comm || S.comm.postId !== postId) return;   // 已经离开这个帖子
      try {
        await cmLoadComments(postId, S.commentPage || 1);
        render();
      } catch (e) {
        // 静默：AI 没答也没关系
      }
    }, ms);
    CM_AI_TIMERS.push(t);
  });
}

function cmRootHTML(c){
  const mine = cmIsMine(c.authorId);
  const all = c.replies || [];
  const preview = c.expanded ? all : all.slice(0, 3);
  const total = c.replyCount || all.length;
  return `<div class="reply-item" data-cid="${c.id}">
    <div class="reply-av">${esc(cmInitial(c.authorName))}</div>
    <div class="reply-body">
      <div class="reply-head"><b style="color:#1D2129;font-weight:600">${esc(c.authorName)}</b>${cmAiBadge(c)}
        <span class="reply-time">${cmFmt(c.createdAt)}</span></div>
      <div class="reply-text">${cmMentionify(esc(c.body))}</div>
      <div class="reply-like">
        <span onclick="cmLikeComment(${cmJsArg(c.id)})">👍 ${c.likeCount}${c.liked ? ' · 已赞' : ''}</span>
        <span onclick="cmStartReply(${cmJsArg(c.id)})">回复</span>
        ${mine
          ? `<span onclick="cmDeleteComment(${cmJsArg(c.id)})">删除</span>`
          : `<span onclick="cmOpenReport('COMMENT', ${cmJsArg(c.id)})">举报</span>`}
      </div>
      ${preview.map(cmReplyHTML).join('')}
      ${!c.expanded && total > preview.length ? `<div style="margin-top:9px;font-size:12px;color:#165DFF;cursor:pointer" onclick="cmExpandReplies(${cmJsArg(c.id)})">展开全部 ${total} 条回复</div>` : ''}
    </div>
  </div>`;
}
function cmReplyHTML(r){
  const mine = cmIsMine(r.authorId);
  return `<div class="reply-sub" data-cid="${r.id}">
    <div class="reply-av">${esc(cmInitial(r.authorName))}</div>
    <div class="reply-body">
      <div class="reply-head">
        <b style="color:#1D2129;font-weight:600">${esc(r.authorName)}</b>${cmAiBadge(r)}
        <span style="color:#86909C">回复了</span>
        <b style="color:#4E5969;font-weight:600">${esc(r.replyObjectUserName || '')}</b>
        <span class="reply-time">${cmFmt(r.createdAt)}</span>
      </div>
      <div class="reply-text">${cmMentionify(esc(r.body))}</div>
      <div class="reply-like">
        <span onclick="cmLikeComment(${cmJsArg(r.id)})">👍 ${r.likeCount}${r.liked ? ' · 已赞' : ''}</span>
        <span onclick="cmStartReply(${cmJsArg(r.id)})">回复</span>
        ${mine
          ? `<span onclick="cmDeleteComment(${cmJsArg(r.id)})">删除</span>`
          : `<span onclick="cmOpenReport('COMMENT', ${cmJsArg(r.id)})">举报</span>`}
      </div>
    </div>
  </div>`;
}
function cmFindComment(id){
  let found = null;
  (S.postComments || []).forEach(function(c){
    if (String(c.id) === String(id)) found = c;
    (c.replies || []).forEach(function(r){ if (String(r.id) === String(id)) found = r; });
  });
  return found;
}
function cmStartReply(id){
  const c = cmFindComment(id);
  if (!c) return;
  S.replyTarget = {commentId: c.id, name: c.authorName};
  render();
  setTimeout(function(){ const el = $('#replyInput'); if (el) el.focus(); }, 0);
}
function cmCancelReply(){ S.replyTarget = null; render(); }
function cmDraft(v){
  S.replyDraft = v;
  const n = $('#replyCount'); if (n) n.textContent = String(v || '').length + ' / 1000';
}
async function cmLoadComments(postId, page, aroundCommentId){
  S.commentPage = page || 1;
  try {
    const qs = cmQuery(aroundCommentId
      ? {page: S.commentPage, size: 10, aroundCommentId: aroundCommentId}
      : {page: S.commentPage, size: 10});
    const res = await cmRequest('GET', '/api/community/posts/' + postId + '/comments' + qs, {});
    if (String(S.comm.postId) !== String(postId)) return;
    const norm = cmNormalizeList(res);
    S.postComments = norm.items.map(cmComment);
    S.postCommentTotal = norm.total;
    // 后端可能替我们算了页码（aroundCommentId 定位时），必须写回去，否则分页器和 S.commentPage 会对不上
    if (res && res.page) S.commentPage = Number(res.page) || S.commentPage;
    // 通知跳楼层：后端把「目标评论所在的那一页」连 focus 一起给了
    if (aroundCommentId) {
      S.cmFocus = (res && res.focus) ? res.focus : null;
      if (!S.cmFocus) toast('该评论可能已被删除，已跳到第一页');
    }
  } catch (e) {
    if (String(S.comm.postId) !== String(postId)) return;
    S.postComments = []; S.postCommentTotal = 0;
    toast('评论加载失败：' + cmErrText(e));
  }
  if (S.view === 'community' && S.comm.view === 'post') render();
  if (aroundCommentId && S.cmFocus) cmFocusJump();
}

/**
 * 滚到被点的那一楼并高亮 2 秒。
 *
 * <p>目标若是**楼中楼**（commentId != rootId），先把那一楼的楼中楼展开，
 * 否则它可能还在「展开全部」后面，滚过去也看不见。
 */
async function cmFocusJump(){
  const f = S.cmFocus;
  if (!f) return;
  const rootId = f.rootId;
  const cid = f.commentId;

  if (String(cid) !== String(rootId)) {
    const root = (S.postComments || []).find(function(c){ return String(c.id) === String(rootId); });
    if (root && !root.expanded) {
      await cmExpandReplies(rootId);       // 会重渲染
    }
  }

  setTimeout(function(){
    const el = document.querySelector('[data-cid="' + cid + '"]')
            || document.querySelector('[data-cid="' + rootId + '"]');
    if (!el) return;
    try { el.scrollIntoView({block: 'center', behavior: 'smooth'}); } catch (e) { el.scrollIntoView(); }
    el.classList.add('cm-focus');
    setTimeout(function(){ el.classList.remove('cm-focus'); }, 2000);
  }, 80);
}
async function cmLoadRelated(type, exceptId){
  try {
    const res = await cmRequest('GET', '/api/community/posts' + cmQuery({type: type, sort: 'HOT', page: 1, size: 6}), {});
    const norm = cmNormalizeList(res);
    S.postRelated = norm.items.map(cmPost)
      .filter(function(p){ return String(p.id) !== String(exceptId); })
      .slice(0, 3);
  } catch (e) { S.postRelated = []; }
  if (S.view === 'community' && S.comm.view === 'post') render();
}
async function cmReloadDetail(id){
  try {
    const res = await cmRequest('GET', '/api/community/posts/' + id, {});
    S.postDetail = cmPost(res && res.post ? res.post : (res && res.data ? res.data : res));
  } catch (e) {}
}
/**
 * 打开帖子详情。
 *
 * @param id 帖子 id
 * @param opts {aroundCommentId} —— 传了就直接定位到那一楼（通知跳楼层用，后端返回该评论所在页）
 */
async function cmOpenPost(id, opts){
  const o = opts || {};
  const token = (S.comm.reqToken || 0) + 1;
  S.comm.reqToken = token;
  S.comm.view = 'post'; S.comm.postId = id;
  S.postDetail = null; S.postComments = []; S.postCommentTotal = 0; S.postRelated = [];
  S.replyTarget = null; S.replyDraft = '';
  S.cmFocus = o.aroundCommentId ? { commentId: o.aroundCommentId, rootId: null } : null;
  if (S.view === 'community') render();
  const main = $('#main'); if (main) main.scrollTop = 0;
  // B3：先 POST /view 再拉详情。A 的顺序是先读后计，导致每次进详情都“少算一次”。
  // R-COM-37：浏览计数失败不影响详情展示，一律吞掉。
  try { await cmRequest('POST', '/api/community/posts/' + id + '/view', {}); } catch (e) {}
  try {
    const res = await cmRequest('GET', '/api/community/posts/' + id, {});
    if (S.comm.reqToken !== token) return;
    S.postDetail = cmPost(res);
  } catch (e) {
    if (S.comm.reqToken !== token) return;
    toast(cmErrText(e));
    backToPosts();
    return;
  }
  render();
  cmLoadComments(id, 1, o.aroundCommentId);
  cmLoadRelated(S.postDetail.type, id);
}
function backToPosts(){
  S.comm.view = 'list'; S.comm.postId = null;
  S.postDetail = null; S.postComments = []; S.postCommentTotal = 0; S.postRelated = [];
  S.replyTarget = null; S.replyDraft = '';
  cmReloadList();
}
async function cmPostReply(){
  const el = $('#replyInput');
  if (!el) return;
  const text = String(el.value || '').trim();
  if (!text) return toast('写点什么吧');
  if (text.length > 1000) return toast('评论最多 1000 字');
  const pid = S.comm.postId;
  const payload = {body: text, replyObjectType: S.replyTarget ? 'COMMENT' : 'POST'};
  if (S.replyTarget) payload.replyObjectCommentId = S.replyTarget.commentId;
  // @ 提及：只提交「正文里还留着 @昵称」的 id（用户可能把名字删了），最多 10 个；后端还会再校验一遍
  const mentions = cmMentionIds(text);
  if (mentions.length) payload.mentions = mentions;
  try {
    // B7：拿走返回的 commentId，不再只靠重拉
    const res = await cmRequest('POST', '/api/community/posts/' + pid + '/comments', {body: payload});
    const newId = res && res.commentId;
    S.replyDraft = ''; S.replyTarget = null;
    cmMentionReset();
    await cmReloadDetail(pid);
    await cmLoadComments(pid, 1);
    // 社区 AI：@ 了 DeepSeek 就静默刷新几次，等 AI 把回复落库（不占位、不提示，决策 5）
    if (mentions.indexOf('ai_deepseek') >= 0) cmAwaitAi(pid);
    // B6：命中敏感词是“打码放行”，给一句轻提示（不是失败）
    if (newId && cmFindComment(newId) && String(cmFindComment(newId).body).indexOf('＊') >= 0) {
      toast('回复已发布，含敏感词已自动打码');
    } else {
      toast('回复已发布');
    }
  } catch (e) {
    toast(cmErrText(e));
  }
}
async function cmExpandReplies(rootId){
  try {
    const res = await cmRequest('GET', '/api/community/comments/' + rootId + '/replies' + cmQuery({page: 1, size: 50}), {});
    const norm = cmNormalizeList(res);
    const root = cmFindComment(rootId);
    if (root) {
      root.replies = norm.items.map(cmComment);
      root.replyCount = norm.total;
      root.expanded = true;
    }
    render();
  } catch (e) { toast('展开失败：' + cmErrText(e)); }
}
async function cmLikePost(){
  const p = S.postDetail;
  if (!p) return;
  const on = !p.liked;
  // 乐观更新：先动 UI，再以服务端为准（B4：A 只做本地 ±1，多端必漂）
  p.liked = on; p.likeCount = Math.max(0, p.likeCount + (on ? 1 : -1)); render();
  try {
    await cmRequest(on ? 'POST' : 'DELETE', '/api/community/posts/' + p.id + '/like', {});
    await cmReloadDetail(p.id);
    if (S.view === 'community' && S.comm.view === 'post') render();
    toast(on ? '已点赞' : '已取消点赞');
  } catch (e) {
    p.liked = !on; p.likeCount = Math.max(0, p.likeCount + (on ? -1 : 1)); render();
    toast(cmErrText(e));
  }
}
async function cmLikeComment(id){
  const c = cmFindComment(id);
  if (!c) return;
  const on = !c.liked;
  c.liked = on; c.likeCount = Math.max(0, c.likeCount + (on ? 1 : -1)); render();
  try {
    await cmRequest(on ? 'POST' : 'DELETE', '/api/community/comments/' + id + '/like', {});
    if (S.comm.postId) await cmLoadComments(S.comm.postId, S.commentPage || 1);  // 回读服务端
  } catch (e) {
    c.liked = !on; c.likeCount = Math.max(0, c.likeCount + (on ? -1 : 1)); render();
    toast(cmErrText(e));
  }
}
async function cmDeleteComment(id){
  if (!confirm('删除这条评论？')) return;
  try {
    await cmRequest('DELETE', '/api/community/comments/' + id, {});
    if (S.comm.postId) {
      await cmReloadDetail(S.comm.postId);
      await cmLoadComments(S.comm.postId, S.commentPage || 1);
    }
    toast('已删除');
  } catch (e) { toast(cmErrText(e)); }
}
async function cmDeletePost(){
  const p = S.postDetail;
  if (!p) return;
  if (!confirm('删除这篇帖子？删除后其下评论一并不可见')) return;
  try {
    await cmRequest('DELETE', '/api/community/posts/' + p.id, {});
    toast('已删除');
    backToPosts();
  } catch (e) { toast(cmErrText(e)); }
}
function cmClosePostModal(){
  document.querySelectorAll('#cmPostMask').forEach(function(m){ m.remove(); });
}
function cmPickType(el){
  const box = el.parentElement;
  Array.prototype.forEach.call(box.querySelectorAll('.cm-opt'), function(o){ o.classList.remove('on'); });
  el.classList.add('on');
  S.cmNewType = el.getAttribute('data-pt');
}
function cmPostModal(post){
  document.querySelectorAll('#cmPostMask').forEach(function(m){ m.remove(); });
  const editing = !!post;
  S.cmNewType = editing ? post.type : 'CHAT';
  const opts = [['CHAT', '闲聊', '随便聊聊'], ['GUIDE', '教程', '分享经验方法'], ['HELP', '求助', '卡住了求指点']]
    .map(function(o){
      return '<button class="cm-opt ' + (S.cmNewType === o[0] ? 'on' : '') + '" data-pt="' + o[0] + '" onclick="cmPickType(this)">'
        + '<b>' + o[1] + '</b><small>' + o[2] + '</small></button>';
    }).join('');
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'cmPostMask';
  mask.innerHTML = `
    <div class="cm-modal">
      <h3>${editing ? '编辑帖子' : '发布帖子'}</h3>
      <div class="page-desc">先选类型，再写标题和正文 · 正文支持 Markdown，图片只能用外链</div>
      <div class="cm-field" style="margin-top:16px">
        <div class="cm-field-label">帖子类型</div>
        <div class="cm-opts three">${opts}</div>
      </div>
      <div class="cm-field">
        <div class="cm-field-label">标题 <span>40 字以内</span></div>
        <input id="cmTitle" class="cm-input" maxlength="40" placeholder="一句话说清楚你要聊什么" value="${editing ? esc(post.title) : ''}">
      </div>
      <div class="cm-field">
        <div class="cm-field-label">关联辩题 <span>可选</span></div>
        <select id="cmTopic" class="cm-input">
          <option value="">不关联辩题</option>
          ${cmTopicOptions(editing ? post.topicId : '')}
        </select>
      </div>
      <div class="cm-field" style="margin-bottom:0">
        <div class="cm-field-label">正文 <span>输入 @ 可以 @ 人</span></div>
        <textarea id="cmBody" class="cm-textarea" placeholder="展开说说…"
                  oninput="cmMentionInput(this)" onkeydown="cmMentionKey(event, this)"
                  onblur="setTimeout(cmMentionClose, 120)">${editing ? esc(post.body) : ''}</textarea>
      </div>
      <div class="cm-modal-foot">
        <button class="btn" onclick="cmClosePostModal()">取消</button>
        <button class="btn btn-primary" onclick="cmSubmitPost(${editing ? cmJsArg(post.id) : 'null'})">${editing ? '保存' : '发布'}</button>
      </div>
    </div>`;
  $('#modalHost').appendChild(mask);
}
function cmOpenNewPost(){ cmMentionReset(); cmPostModal(null); }
function cmOpenEditPost(){ if (S.postDetail) { cmMentionReset(); cmPostModal(S.postDetail); } }
async function cmSubmitPost(id){
  const titleEl = $('#cmTitle');
  const bodyEl = $('#cmBody');
  const topicEl = $('#cmTopic');
  const title = String(titleEl ? titleEl.value : '').trim();
  const text = String(bodyEl ? bodyEl.value : '').trim();
  const topicId = topicEl ? topicEl.value : '';
  if (!title) return toast('先写标题');
  if (!text) return toast('正文还没写');
  const payload = {type: S.cmNewType || 'CHAT', title: title, body: text};
  // @ 提及只在「发新帖」时提交：编辑旧帖再发一遍会让被 @ 的人重复收通知
  const mentions = id ? [] : cmMentionIds(text);
  if (mentions.length) payload.mentions = mentions;
  if (id) payload.topicId = topicId ? topicId : null;
  else if (topicId) payload.topicId = topicId;
  try {
    if (id) {
      await cmRequest('PATCH', '/api/community/posts/' + id, {body: payload});
      cmClosePostModal();
      await cmReloadDetail(id);
      await cmLoadPosts();
      render();
      toast('已保存');
    } else {
      // B7：用返回值直接跳详情，不再“发完回列表再靠重拉”
      const res = await cmRequest('POST', '/api/community/posts', {body: payload});
      const newId = res && res.postId;
      cmClosePostModal();
      S.comm.page = 1;
      await cmLoadPosts();
      if (newId) {
        await cmOpenPost(newId);
      } else {
        S.comm.view = 'list'; render();
      }
      // 社区 AI：发帖正文里 @ 了 DeepSeek → 静默刷新等它回楼（不占位、不提示）
      if (newId && mentions.indexOf('ai_deepseek') >= 0) cmAwaitAi(newId);
      // B6：命中敏感词 → 打码放行，提示一句，不报错
      const d = S.postDetail;
      const masked = d && (String(d.title).indexOf('＊') >= 0 || String(d.body).indexOf('＊') >= 0);
      toast(masked ? '发布成功，含敏感词已自动打码' : '发布成功');
    }
  } catch (e) {
    toast(cmErrText(e));
  }
}
window.__CM = {
  log: CM_LOG,
  state: function(){ return {comm: S.comm, posts: S.posts, total: S.postTotal, detail: S.postDetail, comments: S.postComments}; },
};
/* ==================== 举报 / 禁言 / 我的举报（2026-11-03 治理链路） ==================== */

const CM_REASONS = [['SPAM','垃圾广告'],['ABUSE','人身攻击'],['ILLEGAL','违法违规'],['OTHER','其他']];
let cmReportTarget = null;     // {type:'POST'|'COMMENT', id}
let cmReportReason = 'SPAM';
let cmMuteInfo = null;         // {banned, until, reason}
let cmMyReports = null;        // {items,total,page,size}

/** 禁言黄条：被禁言时显示在社区列表 / 详情顶部（决策 D3：浏览不受影响，只是不能发内容）。 */
function cmMuteBanner(){
  if (!cmMuteInfo || !cmMuteInfo.banned) return '';
  const until = cmMuteInfo.until ? cmFmt(cmMuteInfo.until) : '';
  const why = cmMuteInfo.reason ? (' · 原因：' + esc(cmMuteInfo.reason)) : '';
  return '<div style="display:flex;align-items:center;gap:10px;background:#FFF7E8;border:1px solid #FFE4BA;color:#B8740A;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px">'
    + '<b>你已被禁言</b><span>至 ' + until + why + '</span>'
    + '<span style="opacity:.75;margin-left:auto">不能发帖 / 评论 / 编辑 / 点赞，浏览正常</span></div>';
}

/** 拉一次自己的禁言状态（进入社区时调一次，不轮询）。 */
async function cmLoadMyBan(){
  if (!S.user) { cmMuteInfo = null; return; }
  try { cmMuteInfo = await cmRequest('GET', '/api/community/me/ban'); }
  catch (e) { cmMuteInfo = null; }
}

/* ---------- 举报弹窗 ---------- */

function cmOpenReport(type, id){
  if (!S.user) { toast('请先登录再举报'); go('me'); return; }
  cmReportTarget = { type:type, id:id };
  cmReportReason = 'SPAM';
  cmRenderReportModal();
}

function cmPickReason(el){
  cmReportReason = el.getAttribute('data-r');
  Array.prototype.forEach.call(el.parentElement.querySelectorAll('.cm-opt'), function(o){ o.classList.remove('on'); });
  el.classList.add('on');
}

function cmCloseReportModal(){
  document.querySelectorAll('#cmReportMask').forEach(function(m){ m.remove(); });
  cmReportTarget = null;
}

function cmRenderReportModal(){
  document.querySelectorAll('#cmReportMask').forEach(function(m){ m.remove(); });
  const t = cmReportTarget || {};
  const label = t.type === 'COMMENT' ? '这条评论' : '这篇帖子';
  const opts = CM_REASONS.map(function(r){
    return '<button class="cm-opt ' + (cmReportReason === r[0] ? 'on' : '') + '" data-r="' + r[0] + '" onclick="cmPickReason(this)">'
      + '<b>' + r[1] + '</b></button>';
  }).join('');
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'cmReportMask';
  mask.innerHTML = `
    <div class="cm-modal">
      <h3>举报${label}</h3>
      <div class="page-desc">举报会提交给管理员人工处理，被举报内容不会自动隐藏。</div>
      <div class="cm-field" style="margin-top:16px">
        <div class="cm-field-label">举报原因</div>
        <div class="cm-opts">${opts}</div>
      </div>
      <div class="cm-field" style="margin-bottom:0">
        <div class="cm-field-label">补充说明 <span>可选，最多 500 字</span></div>
        <textarea id="cmReportDetail" class="cm-textarea" maxlength="500" placeholder="具体哪里有问题？"></textarea>
      </div>
      <div class="cm-modal-foot">
        <button class="btn" onclick="cmCloseReportModal()">取消</button>
        <button class="btn btn-primary" onclick="cmSubmitReport()">提交举报</button>
      </div>
    </div>`;
  $('#modalHost').appendChild(mask);
}

async function cmSubmitReport(){
  if (!cmReportTarget) return;
  const el = document.querySelector('#cmReportDetail');
  const detail = el ? String(el.value || '').trim() : '';
  try {
    const res = await cmRequest('POST', '/api/community/reports', { body:{
      targetType: cmReportTarget.type, targetId: cmReportTarget.id,
      reason: cmReportReason, detail: detail || null
    }});
    cmCloseReportModal();
    toast('举报已提交（编号 ' + (res && res.reportId) + '）');
  } catch (e) {
    toast(cmErrText(e));
  }
}

/* ---------- 我的举报 ---------- */

async function cmOpenMyReports(){
  if (!S.user) { toast('请先登录'); go('me'); return; }
  cmMyReports = null;
  cmRenderMyReports();
  await cmLoadMyReports(1);
}

function cmCloseMyReports(){
  document.querySelectorAll('#cmMyMask').forEach(function(m){ m.remove(); });
  cmMyReports = null;
}

async function cmLoadMyReports(page){
  try {
    cmMyReports = await cmRequest('GET', '/api/community/my-reports?page=' + page + '&size=10');
  } catch (e) {
    toast('加载失败：' + cmErrText(e));
    cmMyReports = { items:[], total:0, page:1, size:10 };
  }
  cmRenderMyReports();
}

function cmReasonName(k){
  const r = CM_REASONS.filter(function(x){ return x[0] === k; })[0];
  return r ? r[1] : (k || '');
}

function cmActionName(a){
  const m = { IGNORE:'忽略', DELETE:'删除内容', BAN:'禁言', DELETE_AND_BAN:'删除并禁言' };
  return m[a] || a || '';
}

function cmReportStatusHTML(status, action){
  if (status === 'PENDING') return '<b style="color:#B8740A">待处理</b>';
  if (status === 'REJECTED') return '<b style="color:#86909C">已驳回</b>';
  return '<b style="color:#00B42A">已处理</b>' + (action ? '（' + cmActionName(action) + '）' : '');
}

function cmRenderMyReports(){
  document.querySelectorAll('#cmMyMask').forEach(function(m){ m.remove(); });
  const d = cmMyReports;
  let body;
  if (!d) {
    body = '<div style="padding:28px 0;text-align:center;color:#86909C;font-size:13px">加载中…</div>';
  } else if (!d.items || !d.items.length) {
    body = '<div style="padding:28px 0;text-align:center;color:#86909C;font-size:13px">还没有举报记录</div>';
  } else {
    body = d.items.map(function(r){
      const isPost = r.targetType === 'POST';
      return '<div style="padding:12px 0;border-bottom:1px solid #F2F3F5">'
        + '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#86909C">'
        + '<span class="mini-tag">' + (isPost ? '帖子' : '评论') + '</span>'
        + '<span>' + esc(cmReasonName(r.reason)) + '</span>'
        + '<span style="margin-left:auto">' + cmFmt(r.createdAt) + '</span></div>'
        + '<div style="margin-top:6px;font-size:13.5px;color:#1D2129">' + esc(r.targetSummary || '（内容已删除）') + '</div>'
        + (r.detail ? '<div style="margin-top:4px;font-size:12.5px;color:#86909C">补充：' + esc(r.detail) + '</div>' : '')
        + '<div style="margin-top:6px;font-size:12.5px">' + cmReportStatusHTML(r.status, r.action)
        + (r.handledAt ? '<span style="color:#A9AEB8"> · ' + cmFmt(r.handledAt) + '</span>' : '') + '</div>'
        + '</div>';
    }).join('');
  }
  const page = (d && d.page) || 1;
  const size = (d && d.size) || 10;
  const pages = d ? Math.max(1, Math.ceil((d.total || 0) / size)) : 1;
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'cmMyMask';
  mask.innerHTML = `
    <div class="cm-modal">
      <h3>我的举报</h3>
      <div class="page-desc">共 ${d ? d.total : 0} 条 · 处理结果由管理员决定</div>
      <div style="max-height:52vh;overflow:auto;margin-top:12px">${body}</div>
      <div class="cm-modal-foot">
        ${pages > 1 ? `<button class="btn" ${page <= 1 ? 'disabled' : ''} onclick="cmLoadMyReports(${Math.max(1, page - 1)})">上一页</button>` : ''}
        ${pages > 1 ? `<button class="btn" ${page >= pages ? 'disabled' : ''} onclick="cmLoadMyReports(${Math.min(pages, page + 1)})">下一页</button>` : ''}
        <button class="btn btn-primary" onclick="cmCloseMyReports()">关闭</button>
      </div>
    </div>`;
  $('#modalHost').appendChild(mask);
}

// ==================== @ 提及（V2） ====================
//
// 交互：输入框里打 `@` + 至少 1 个字符 → 弹候选（昵称前缀匹配，≤10 条）
//       ↑↓ 移动、Enter 选中、Esc 关闭、点击选中（用 mousedown，避免 textarea 先失焦）
// 提交：把选中过的 id 放进 payload.mentions（只带正文里还留着 `@昵称` 的）
// 显示：正文里的 `@昵称` 走 cmMentionify() 变浅蓝，不加链接（决策 2）
// 身份：**只认 userId**，前端不按昵称猜人（决策 1）

const CM_MENTION = {
  open: false, items: [], active: 0, query: '', start: 0, el: null, timer: null,
  picked: []          // 当前编辑框里选中过的人：[{id, name}]
};

/** 输入框内容变化时调用：判断光标前是不是正在打 @ */
function cmMentionInput(el){
  const v = String(el.value || '');
  const caret = el.selectionStart == null ? v.length : el.selectionStart;
  const upTo = v.slice(0, caret);
  const m = upTo.match(/@([^\s@]{0,20})$/);
  if (!m) { cmMentionClose(); return; }

  CM_MENTION.el = el;
  CM_MENTION.start = caret - m[0].length;
  CM_MENTION.query = m[1];
  if (!m[1]) { cmMentionClose(); return; }        // 只打了一个 @：先不查

  clearTimeout(CM_MENTION.timer);
  CM_MENTION.timer = setTimeout(function(){ cmMentionFetch(m[1]); }, 150);
}

async function cmMentionFetch(q){
  if (!S.user) return;                            // 候选接口要登录
  try {
    const r = await api('/api/community/users?q=' + encodeURIComponent(q));
    if (CM_MENTION.query !== q) return;           // 竞态：期间又打了字
    CM_MENTION.items = (r && r.items) || [];
    CM_MENTION.active = 0;
    CM_MENTION.open = CM_MENTION.items.length > 0;
    cmMentionRender();
  } catch (e) {
    cmMentionClose();
  }
}

function cmMentionRender(){
  let box = $('#cmMentionBox');
  if (!CM_MENTION.open) { if (box) box.remove(); return; }
  const el = CM_MENTION.el;
  if (!el) { cmMentionClose(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'cmMentionBox';
    box.className = 'mention-box';
    document.body.appendChild(box);
  }
  const rect = el.getBoundingClientRect();
  box.style.left = Math.round(rect.left + 12) + 'px';
  box.style.top = Math.round(rect.bottom + 6) + 'px';
  box.innerHTML = CM_MENTION.items.map(function(u, i){
    return '<div class="mention-item' + (i === CM_MENTION.active ? ' on' : '') + '"'
      + ' onmousedown="cmMentionPick(' + i + ');return false;">'
      + '<b>' + esc(u.name) + '</b><span>@' + esc(u.name) + '</span></div>';
  }).join('');
}

/** textarea 上的键盘处理（↑↓ 选择、Enter 确认、Esc 关闭） */
function cmMentionKey(e, el){
  if (!CM_MENTION.open || !CM_MENTION.items.length) return;
  const n = CM_MENTION.items.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    CM_MENTION.active = (CM_MENTION.active + 1) % n;
    cmMentionRender();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    CM_MENTION.active = (CM_MENTION.active - 1 + n) % n;
    cmMentionRender();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    cmMentionPick(CM_MENTION.active);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cmMentionClose();
  }
}

/** 选中第 i 个候选：替换掉正在输入的 `@query`，插入 `@昵称 ` 并记住 id */
function cmMentionPick(i){
  const it = CM_MENTION.items[i];
  const el = CM_MENTION.el;
  if (!it || !el) return;

  const v = String(el.value || '');
  const caret = el.selectionStart == null ? v.length : el.selectionStart;
  const before = v.slice(0, CM_MENTION.start);
  const after = v.slice(caret);
  const insert = '@' + it.name + ' ';
  el.value = before + insert + after;

  const pos = (before + insert).length;
  try { el.setSelectionRange(pos, pos); } catch (e) {}
  el.focus();

  if (el.id === 'replyInput') cmDraft(el.value);

  const already = CM_MENTION.picked.some(function(x){ return x.id === it.id; });
  if (!already && CM_MENTION.picked.length < 10) CM_MENTION.picked.push({ id: it.id, name: it.name });

  cmMentionClose();
}

function cmMentionClose(){
  CM_MENTION.open = false;
  const box = $('#cmMentionBox');
  if (box) box.remove();
}

/** 提交时算出 mentions：只带「正文里还留着 @昵称」的，去重、最多 10 个 */
function cmMentionIds(text){
  const body = String(text || '');
  const ids = [];
  CM_MENTION.picked.forEach(function(x){
    if (ids.length < 10 && body.indexOf('@' + x.name) >= 0 && ids.indexOf(x.id) < 0) ids.push(x.id);
  });
  return ids;
}

/** 提交成功 / 打开新编辑框时清空 */
function cmMentionReset(){
  CM_MENTION.picked = [];
  cmMentionClose();
}
