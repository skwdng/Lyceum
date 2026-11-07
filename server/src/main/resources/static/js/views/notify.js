/* 通知（V1）：列表 / 未读底色 / 点击跳转
 * 归属：见 docs/协作规范.md 接口点表
 *
 * 约定（方案 §7）：
 *   · 文案与跳转目标**全部由后端拼好**（text / link），前端不判断 type、不自己拼「等 N 人」
 *   · 列表接口有副作用：拉一次就把**本页**标已读，所以要立刻刷新角标（不等 45 秒轮询）
 */

async function loadNotify(page){
  const p = Math.max(1, page || 1);
  const size = S.notify.size || 20;
  S.notify.error = null;
  try {
    const r = await api('/api/community/notifications?page=' + p + '&size=' + size);
    S.notify.items = r.items || [];
    S.notify.total = r.total || 0;
    S.notify.page = r.page || p;
    // 本页刚被标已读：角标马上跟着减（不想让用户盯着旧数字 45 秒）
    await refreshUnread();
  } catch (e) {
    S.notify.items = [];
    S.notify.total = 0;
    S.notify.error = (e && e.message) || '加载失败';
  }
  if (S.view === 'notify') render();
}

function viewNotify(){
  const list = S.notify.items || [];
  const total = S.notify.total || 0;
  const page = S.notify.page || 1;
  const size = S.notify.size || 20;
  const pages = Math.max(1, Math.ceil(total / size));

  if (S.notify.error) {
    return `<h1 class="pg">通知</h1>
      <div class="card"><div class="empty">${esc(S.notify.error)}</div></div>`;
  }

  return `
  <h1 class="pg">通知</h1>
  <p class="sub">评论、回复、点赞、@ 提及都会出现在这里 · 共 ${total} 条${
    (S.unread || 0) > 0 ? ` · <b style="color:#4C9AFF">${S.unread} 条未读</b>` : ''}</p>
  ${list.length
    ? `<div class="card" style="padding:0;overflow:hidden">${list.map(notifyRow).join('')}</div>`
    : `<div class="card"><div class="empty">还没有通知</div></div>`}
  ${pages > 1 ? notifyPager(page, pages) : ''}`;
}

function notifyRow(it){
  const unread = it.read === false;
  return `<div class="notify-row${unread ? ' unread' : ''}" onclick="notifyOpen(${it.id})">
    <span class="notify-dot"></span>
    <div style="flex:1;min-width:0">
      <div class="notify-text">${esc(it.text)}</div>
      <div class="notify-time">${notifyTime(it.createdAt)}</div>
    </div>
  </div>`;
}

function notifyPager(page, pages){
  return `<div class="notify-pager">
    <button class="btn ghost" ${page <= 1 ? 'disabled' : ''} onclick="loadNotify(${page - 1})">上一页</button>
    <span class="sub" style="align-self:center">第 ${page} / ${pages} 页</span>
    <button class="btn ghost" ${page >= pages ? 'disabled' : ''} onclick="loadNotify(${page + 1})">下一页</button>
  </div>`;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期 */
function notifyTime(ms){
  if (!ms) return '';
  const diff = Date.now() - Number(ms);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
  const d = new Date(Number(ms));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * 点击一条通知：按后端给的 link 跳转。
 *
 * <p>link 里带 {@code commentId} 时（回复 / 评论点赞 / 评论里的 @ / 评论被删），
 * 直接定位到那一楼：后端按 aroundCommentId 返回该评论所在的那一页，前端滚过去并高亮 2 秒。
 */
async function notifyOpen(id){
  const it = (S.notify.items || []).find(x => Number(x.id) === Number(id));
  if (!it) return;
  const link = it.link || {};

  // 好友类通知（FRIEND_REQUEST / FRIEND_ACCEPTED）与内容无关，点进去是「好友」页
  if (link.view === 'friends') { go('friends'); return; }

  if (link.view === 'me' || !link.postId) { go('me'); return; }

  go('community');
  try {
    await cmOpenPost(link.postId, link.commentId ? {aroundCommentId: link.commentId} : undefined);
  } catch (e) {
    toast('内容打不开了：' + ((e && e.message) || '可能已被删除'));
  }
}
