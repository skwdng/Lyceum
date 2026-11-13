package com.siyige.admin;

/**
 * 管理员登录的请求 / 响应对象。
 *
 * <p><b>安全要求</b>：带密码的 DTO，{@code toString()} 只允许出现 account，
 * 绝不能把密码带进日志或异常。
 */
public final class AdminDtos {

    private AdminDtos() { }

    /** 管理员登录入参。 */
    public record AdminLoginRequest(String account, String password) {
        @Override
        public String toString() {
            return "AdminLoginRequest[account=" + account + "]";
        }
    }

    /**
     * 管理员改密入参。
     *
     * <p><b>安全要求</b>：{@code toString()} 固定输出 redacted，绝不能让密码进日志。
     */
    public record ChangeAdminPasswordRequest(String oldPassword, String newPassword) {
        @Override
        public String toString() {
            return "ChangeAdminPasswordRequest[<redacted>]";
        }
    }
    /** 用户管理：社区禁言入参。 */
    public record BanRequest(Integer days, String reason) {
        @Override
        public String toString() {
            return "BanRequest[days=" + days + "]";
        }
    }

    /** 用户管理：全站封禁开关入参。status=0 封禁 / 1 正常。 */
    public record SetStatusRequest(Integer status, String reason) { }

    /**
     * 内容管理：屏蔽入参。
     *
     * <p>{@code note} 会写进审计描述、也会推给内容作者（"被管理员删除 + 理由"），可空。
     */
    public record HideRequest(String note) { }

    /** 视频复核：人工判定入参。decision = PASS | REJECT。 */
    public record VideoDecideRequest(String decision, String reason) { }

    /** 辩题审核：驳回 / 下架的理由（驳回必填）。 */
    public record TopicReasonRequest(String reason) { }

    /** 内容批量处置：action = hide | unhide，type = post | comment，ids 最多 200 条。 */
    public record BatchContentRequest(String type, String action, java.util.List<Long> ids, String note) { }

    /** 用户批量处置：action = mute | ban | unban，reason 统一填。 */
    public record BatchUserRequest(String action, java.util.List<String> ids, Integer days, String reason) { }

    /**
     * 举报处理入参。
     *
     * <p>{@code action} 取 {@code IGNORE} / {@code DELETE} / {@code BAN} / {@code DELETE_AND_BAN}；
     * 后两种必须带 {@code banDays}（1 / 3 / 7）。
     */
    public record ResolveRequest(String action, Integer banDays, String note) { }
    /** 服务端内部用的管理员视图（不含哈希），**不**直接下发。 */
    public record AdminView(Long id, String account) { }

    // ---------- R2：管理员账号管理 ----------

    /**
     * 建账号入参。`password` 可空 —— 不填就由服务端生成一次性密码。
     *
     * <p><b>安全要求</b>：{@code toString()} 绝不输出 password。
     */
    public record CreateAdminRequest(String account, String role, String password) {
        @Override
        public String toString() {
            return "CreateAdminRequest[account=" + account + ",role=" + role + ",password=<redacted>]";
        }
    }

    /** 改角色入参。role = SUPER | OPS | MOD | VIEWER（必填）。 */
    public record ChangeAdminRoleRequest(String role) { }

    /** 启用 / 停用入参。 */
    public record SetAdminEnabledRequest(Boolean enabled) { }
}
