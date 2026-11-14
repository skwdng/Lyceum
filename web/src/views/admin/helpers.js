/**
 * 管理台的四个纯函数 —— 从 `views/AdminView.vue`（原 L47–L67）**原样搬出**，逻辑一字未改。
 *
 * 为什么单独放一个文件：拆成 5 个子页后 errText / fmtTime / reasonName / actionName
 * 有 4 个页面要用，复制 4 份等于埋 4 个「改一处忘三处」的坑。
 *
 * ⚠️ 这几个是**展示层**的映射：`reasonName` / `actionName` 只把后端枚举值翻成中文，
 * 不认识的值原样返回（后端以后加枚举，页面不会炸，测试也能立刻看出来）。
 */
import { ApiError } from '../../api.js';

/** 错误文案：ApiError 取后端 message，其余兜底「操作失败」（等价旧版展示）。 */
export function errText(e) {
  if (e instanceof ApiError) return e.message || e.code;
  return (e && e.message) || '操作失败';
}

/** 毫秒时间戳 -> `YYYY-MM-DD HH:mm`；空值显示 `—`。 */
export function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 举报原因枚举 -> 中文。 */
export function reasonName(k) {
  const m = { SPAM: '垃圾广告', ABUSE: '人身攻击', ILLEGAL: '违法违规', OTHER: '其他' };
  return m[k] || k;
}

/** 处置动作枚举 -> 中文（审计记录里的 verdict 也用同一张表）。 */
export function actionName(k) {
  const m = {
    // 举报处置链路
    IGNORE: '忽略', DELETE: '删除内容', BAN: '禁言', DELETE_AND_BAN: '删除并禁言', RESTORE: '撤销处理',
    REPORT_RESOLVE: '举报处置',
    // 管理台其它动作（2026-11-12 起也写处理记录）
    VIDEO_DECIDE: '视频复核', VIDEO_RESTORE: '视频恢复',
    TOPIC_APPROVE: '辩题通过', TOPIC_REJECT: '辩题驳回', TOPIC_OFFLINE: '辩题下架',
    USER_BAN: '全站封禁', USER_UNBAN: '解除封禁',
    // R2：管理员账号管理（处理记录里能看到谁建号/改角色/重置密码）
    ADMIN_CREATE: '创建管理员', ADMIN_ROLE: '改管理员角色',
    ADMIN_DISABLE: '停用管理员', ADMIN_ENABLE: '启用管理员',
    ADMIN_RESET_PWD: '重置管理员密码',
    PASS: '通过', REJECT: '驳回', UNBAN: '解封'
  };
  return m[k] || k;
}
