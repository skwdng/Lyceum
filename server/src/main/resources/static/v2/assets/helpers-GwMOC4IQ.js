import { B as ApiError } from "./index-DPLYiPqf.js";
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
  const m = { IGNORE: "忽略", DELETE: "删除内容", BAN: "禁言", DELETE_AND_BAN: "删除并禁言", RESTORE: "撤销处理" };
  return m[k] || k;
}
export {
  actionName as a,
  errText as e,
  fmtTime as f,
  reasonName as r
};
