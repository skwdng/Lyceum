/**
 * 社区公共小工具（等价旧 community.js 的枚举 / 错误文案 / 时间格式 / 数据归一）。
 */

export const CM_TYPES = [
  { k: 'ALL', n: '全部' },
  { k: 'CHAT', n: '闲聊' },
  { k: 'GUIDE', n: '教程' },
  { k: 'HELP', n: '求助' }
];

export const CM_SORTS = [
  { k: 'NEW', n: '最新发布' },
  { k: 'COMMENTS', n: '最多评论' },
  { k: 'LIKES', n: '最多点赞' },
  { k: 'HOT', n: '最热门' }
];

export const CM_RANGES = [
  { k: 'ALL', n: '全部时间' },
  { k: '3D', n: '3 天内' },
  { k: '7D', n: '7 天内' },
  { k: 'OLDER', n: '更早' }
];

export const CM_REASONS = [
  ['SPAM', '垃圾广告'],
  ['ABUSE', '人身攻击'],
  ['ILLEGAL', '违法违规'],
  ['OTHER', '其他']
];

const pad = (n) => String(n).padStart(2, '0');

export function typeName(k) {
  const t = CM_TYPES.find((x) => x.k === k);
  return t ? t.n : '闲聊';
}

export function rangeName(k) {
  const r = CM_RANGES.find((x) => x.k === k);
  return r ? r.n : '全部时间';
}

export function reasonName(k) {
  const r = CM_REASONS.find((x) => x[0] === k);
  return r ? r[1] : k || '';
}

export function actionName(a) {
  const m = { IGNORE: '忽略', DELETE: '删除内容', BAN: '禁言', DELETE_AND_BAN: '删除并禁言' };
  return m[a] || a || '';
}

export function initial(name) {
  const s = String(name == null ? '' : name).trim();
  return s ? s.slice(0, 1) : '?';
}

/** MM-DD HH:mm（旧版 cmFmt） */
export function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function typeClass(t) {
  const safe = ['CHAT', 'GUIDE', 'HELP'].indexOf(t) >= 0 ? t : 'CHAT';
  return 'ptype ptype-' + safe;
}

/** 后端错误体 {code,message} → 人话（按 code 分支，不猜 HTTP 状态） */
export function errText(e) {
  const code = String((e && e.code) || '');
  const msg = String((e && e.message) || '');
  const map = {
    INVALID_PARAM: '参数不合法',
    UNAUTHORIZED: '请先登录',
    SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后再试',
    POST_NOT_FOUND: '帖子已删除或不存在',
    COMMENT_NOT_FOUND: '评论已删除',
    NOT_AUTHOR: '只能操作自己的内容',
    MUTED: '你已被禁言，暂时不能发内容',
    ALREADY_REPORTED: '你已经举报过这条内容',
    ACCOUNT_DISABLED: '账号已被封禁',
    NOT_ADMIN: '没有管理员权限',
    INTERNAL_ERROR: '服务异常，请重试',
    TIMEOUT: '请求超时，请重试',
    NETWORK: '后端未连接'
  };
  const detail = msg.replace(/^[A-Z][A-Z0-9_]*:\s*/, '').trim();
  const base = map[code];
  if (base) return detail && detail !== msg ? base + '（' + detail + '）' : base;
  if (/^HTTP_\d+$/.test(code)) return '后端接口异常（' + code + '）';
  return detail || msg || '操作失败';
}

/** 列表响应固定 {items,total,page,size}，只认这一种包装 */
export function normalizeList(res) {
  const r = res || {};
  const items = Array.isArray(r.items) ? r.items : [];
  return { items, total: Number(r.total) || 0, page: Number(r.page) || 1, size: Number(r.size) || items.length };
}

const num = (v) => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

function timeOf(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}

/** 后端只输出 camelCase，这里只做字段兜底，不猜 snake_case */
export function normalizePost(raw) {
  const r = raw || {};
  return {
    id: r.id,
    type: r.type || 'CHAT',
    title: r.title || '',
    body: r.body != null ? r.body : '',
    excerpt: r.excerpt != null ? r.excerpt : '',
    topicId: r.topicId != null ? r.topicId : null,
    topicTitle: r.topicTitle || '',
    authorId: r.authorId,
    authorName: r.authorName || '匿名',
    commentCount: num(r.commentCount),
    likeCount: num(r.likeCount),
    viewCount: num(r.viewCount),
    lastCommentAt: timeOf(r.lastCommentAt),
    createdAt: timeOf(r.createdAt),
    updatedAt: timeOf(r.updatedAt),
    liked: !!r.liked,
    status: r.status
  };
}

export function normalizeComment(raw) {
  const r = raw || {};
  const kids = Array.isArray(r.replies) ? r.replies : [];
  return {
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    authorName: r.authorName || '匿名',
    isBot: !!r.isBot,
    rootId: r.rootId != null ? r.rootId : null,
    replyObjectType: r.replyObjectType || 'POST',
    replyObjectCommentId: r.replyObjectCommentId != null ? r.replyObjectCommentId : null,
    replyObjectUserName: r.replyObjectUserName || '',
    body: r.body != null ? r.body : '',
    likeCount: num(r.likeCount),
    liked: !!r.liked,
    createdAt: timeOf(r.createdAt),
    replies: kids.map(normalizeComment),
    replyCount: num(r.replyCount),
    expanded: false
  };
}
