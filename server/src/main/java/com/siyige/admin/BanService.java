package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 社区禁言的写入侧（管理员操作）。
 *
 * <p>规则（方案 R2）：**多次禁言取最晚到期时间，不累加天数**——
 * 否则「重复点 7 天」会变成 14 天、21 天，管理员完全无法预期效果。
 * 实现：基准时间取「当前已有禁言的到期时间」与「现在」中较晚的那个，再加 days。
 *
 * <p>与全站封禁（`sy_user.status`，见 AdminUserService）互不干扰：
 * 禁言只管社区发帖/评论/编辑/点赞，解禁也不会顺手把封禁解开。
 */
@Service
public class BanService {

    private static final Logger log = LoggerFactory.getLogger(BanService.class);

    /** 允许的禁言天数（方案 D3 定死 1 / 3 / 7）。 */
    static final int[] ALLOWED_DAYS = {1, 3, 7};

    private final BanRepo repo;

    public BanService(BanRepo repo) {
        this.repo = repo;
    }

    /**
     * 禁言 N 天。
     *
     * @param userId  被禁言的用户 id（调用方需先确认用户存在）
     * @param days    1 / 3 / 7
     * @param reason  可选，最长 200 字
     * @param adminId 操作的管理员 id（落 banned_by）
     * @return 禁言到期时间
     */
    /** 用户管理页的手动禁言：没有触发它的举报，report_id 留空（也**不写审计**）。 */
    public Timestamp ban(String userId, int days, String reason, long adminId) {
        return ban(userId, days, reason, adminId, null);
    }

    /**
     * 禁言（可由举报处理触发）。
     *
     * @param reportId 触发它的举报 id；手动禁言传 null
     */
    public Timestamp ban(String userId, int days, String reason, long adminId, Long reportId) {
        if (userId == null || userId.isBlank()) {
            throw AuthException.invalidParam("用户 id 不能为空");
        }
        if (!isAllowed(days)) {
            throw AuthException.invalidParam("禁言天数只能是 1 / 3 / 7");
        }
        String why = reason == null ? null : reason.trim();
        if (why != null && why.length() > 200) {
            throw AuthException.invalidParam("禁言原因最多 200 字");
        }

        Timestamp now = Timestamp.from(Instant.now());
        Timestamp current = repo.latestActiveUntil(userId);
        // 已有禁言就叠加在它的到期时间上（取最晚），否则从现在开始算
        Instant base = current != null && current.toInstant().isAfter(Instant.now())
                ? current.toInstant() : Instant.now();
        Timestamp until = Timestamp.from(base.plus(days, ChronoUnit.DAYS));

        repo.insert(userId, adminId, why, until, reportId);
        log.info("禁言 userId={} days={} until={} by={}", userId, days, until, adminId);
        return until;
    }

    /** 提前解除社区禁言（把生效中的禁言改成已过期）。 */
    public void unban(String userId) {
        if (userId == null || userId.isBlank()) {
            throw AuthException.invalidParam("用户 id 不能为空");
        }
        int n = repo.release(userId);
        log.info("解除禁言 userId={} 影响 {} 条", userId, n);
    }

    private static boolean isAllowed(int days) {
        for (int d : ALLOWED_DAYS) if (d == days) return true;
        return false;
    }
}
