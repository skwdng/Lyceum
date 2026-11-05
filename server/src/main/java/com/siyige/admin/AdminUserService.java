package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端「用户管理」：列表、社区禁言 / 解禁、全站封禁开关。
 *
 * <p>两种处罚**互不干扰**（决策 2）：
 * <ul>
 *   <li>社区禁言 → `sy_community_ban`（有期限，到期自动解除，只管发帖/评论/编辑/点赞）</li>
 *   <li>全站封禁 → `sy_user.status`（立即生效，需手动解封，拦登录 + 社区所有接口）</li>
 * </ul>
 * 解禁不会顺手解封，解封也不会顺手解禁。
 */
@Service
public class AdminUserService {

    private static final Logger log = LoggerFactory.getLogger(AdminUserService.class);

    private static final int PAGE_SIZE_DEFAULT = 20;
    private static final int PAGE_SIZE_MAX = 50;

    private final AdminUserRepo repo;
    private final BanRepo banRepo;
    private final BanService bans;

    private final com.siyige.community.NotificationService notifications;

    public AdminUserService(AdminUserRepo repo, BanRepo banRepo, BanService bans,
                            com.siyige.community.NotificationService notifications) {
        this.repo = repo;
        this.banRepo = banRepo;
        this.bans = bans;
        this.notifications = notifications;
    }

    // ==================== 列表 ====================

    public Map<String, Object> users(String q, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(PAGE_SIZE_MAX, Math.max(1, size <= 0 ? PAGE_SIZE_DEFAULT : size));

        long total = repo.count(q);
        List<Map<String, Object>> rows = repo.list(q, (p - 1) * s, s);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.get("id"));
            m.put("account", row.get("account"));
            m.put("name", row.get("name"));
            m.put("status", num(row.get("status")));                       // 1 正常 / 0 全站封禁
            m.put("disabled", num(row.get("status")) == 0);
            m.put("banned", num(row.get("ban_active")) > 0);               // 社区禁言中
            m.put("banUntil", AdminReportRepo.millis(row.get("ban_until")));
            m.put("pendingReports", num(row.get("pending_reports")));
            items.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    // ==================== 社区禁言 ====================

    public void ban(String userId, Integer days, String reason, long adminId) {
        requireUser(userId);
        int d = days == null ? 0 : days;
        bans.ban(userId, d, reason, adminId);       // BanService 内部校验 1/3/7 与原因长度
    }

    public void unban(String userId) {
        unban(userId, 0L);
    }

    public void unban(String userId, long adminId) {
        requireUser(userId);
        bans.unban(userId, adminId);          // 解除禁言的通知在 BanService 里发
    }

    // ==================== 全站封禁开关 ====================

    /**
     * 全站封禁 / 解封。
     *
     * <p>写 `sy_user.status`；`JwtAuthFilter` 每次请求都会查一次这一列，
     * 所以**封了之后下一次请求就被踢**（不加缓存，决策 8）。
     */
    public void setStatus(String userId, Integer status, String reason) {
        setStatus(userId, status, reason, 0L);
    }

    /**
     * 全站封禁 / 解封（带操作人）。
     *
     * <p>封禁 → BANNED（带理由）；解封 → UNBANNED。
     * 通知失败不影响封禁本身（NotificationService 内部兜住）。
     */
    public void setStatus(String userId, Integer status, String reason, long adminId) {
        requireUser(userId);
        if (status == null || (status != 0 && status != 1)) {
            throw AuthException.invalidParam("status 只能是 0（封禁）或 1（正常）");
        }
        if (reason != null && reason.trim().length() > 200) {
            throw AuthException.invalidParam("封禁原因最多 200 字");
        }
        repo.setStatus(userId, status);
        log.info("全站状态变更 userId={} status={} reason={} ", userId, status,
                reason == null ? "-" : reason.trim());
        // 通知：封禁带理由，解封告知一声。失败不影响封禁本身（service 内部兜住）
        if (status == 0) notifications.onBanned(userId, adminId, reason);
        else notifications.onUnbanned(userId, adminId);
    }

    // ==================== 统计辅助 ====================

    public long bannedUserCount() {
        return banRepo.countActiveUsers();
    }

    public long disabledUserCount() {
        return repo.countDisabled();
    }

    // ==================== 内部 ====================

    private Map<String, Object> requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw AuthException.invalidParam("用户 id 不能为空");
        }
        Map<String, Object> user = repo.findById(userId);
        if (user == null) throw new IllegalArgumentException("USER_NOT_FOUND: 用户不存在");
        return user;
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }
}
