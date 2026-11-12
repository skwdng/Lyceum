import { I as ApiError } from "./index-BBvYsYtx.js";
function errText(e) {
  if (e instanceof ApiError) return e.message || e.code;
  return e && e.message || "操作失败";
}
function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function reasonName(k) {
  const m = { SPAM: "垃圾广告", ABUSE: "人身攻击", ILLEGAL: "违法违规", OTHER: "其他" };
  return m[k] || k;
}
function actionName(k) {
  const m = {
    // 举报处置链路
    IGNORE: "忽略",
    DELETE: "删除内容",
    BAN: "禁言",
    DELETE_AND_BAN: "删除并禁言",
    RESTORE: "撤销处理",
    REPORT_RESOLVE: "举报处置",
    // 管理台其它动作（2026-11-12 起也写处理记录）
    VIDEO_DECIDE: "视频复核",
    VIDEO_RESTORE: "视频恢复",
    TOPIC_APPROVE: "辩题通过",
    TOPIC_REJECT: "辩题驳回",
    TOPIC_OFFLINE: "辩题下架",
    USER_BAN: "全站封禁",
    USER_UNBAN: "解除封禁",
    PASS: "通过",
    REJECT: "驳回",
    UNBAN: "解封"
  };
  return m[k] || k;
}
export {
  actionName as a,
  errText as e,
  fmtTime as f,
  reasonName as r
};
