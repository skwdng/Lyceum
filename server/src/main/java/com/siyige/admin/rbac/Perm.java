package com.siyige.admin.rbac;

/**
 * 管理端**权限点**（15 个，由 29 个管理接口归纳，设计方案 §1）。
 *
 * <p>常量值是 `领域:动作` 形式，会原样出现在：
 * <ul>
 *   <li>{@code GET /api/admin/me} 的 {@code perms} 数组里 —— 前端菜单/按钮按它渲染</li>
 *   <li>403 错误信息里（{@code FORBIDDEN_PERM: 缺少权限 content:moderate}）—— 方便排查</li>
 * </ul>
 *
 * <p>**这里是唯一真源**：权限点只在这里定义，角色到权限点的映射只在 {@link AdminRole} 里写一份，
 * 别的地方一律不许再写 if/else 判角色。
 */
public enum Perm {

    /** 管理员账号增删改查、改角色、重置密码（超管专属）。 */
    ADMIN_MANAGE("admin:manage"),

    /** 看举报队列与举报详情。 */
    REPORT_READ("report:read"),
    /** 处置举报（忽略 / 删除内容 / 禁言）。 */
    REPORT_RESOLVE("report:resolve"),

    /** 看用户列表、用户违规浮窗。 */
    USER_READ("user:read"),
    /** 封禁 / 解封 / 禁言 / 批量处置用户。 */
    USER_BAN("user:ban"),

    /** 看帖子、评论、帖子详情。 */
    CONTENT_READ("content:read"),
    /** 屏蔽 / 解除屏蔽内容（含批量）。 */
    CONTENT_MODERATE("content:moderate"),

    /** 看处理记录。 */
    AUDIT_READ("audit:read"),
    /** 撤销处置（恢复内容）。 */
    AUDIT_RESTORE("audit:restore"),

    /** 看视频审核队列、审核日志、机审规则。 */
    VIDEO_READ("video:read"),
    /** 视频通过 / 驳回 / 恢复。 */
    VIDEO_AUDIT("video:audit"),

    /** 看辩题列表。 */
    TOPIC_READ("topic:read"),
    /** 辩题通过 / 驳回 / 下架。 */
    TOPIC_MODERATE("topic:moderate"),

    /** 看报表（概览 / 趋势 / 分布 / 活跃 / 质量）。 */
    ANALYTICS_READ("analytics:read"),
    /** **导出全站数据**：敏感操作，单独拆出来只给超管。 */
    ANALYTICS_EXPORT("analytics:export");

    private final String code;

    Perm(String code) {
        this.code = code;
    }

    /** 对外字符串（写进 /me、403 文案、前端菜单声明）。 */
    public String code() {
        return code;
    }

    @Override
    public String toString() {
        return code;
    }
}
