package com.siyige.community;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 社区禁言校验（`sy_community_ban`，表由 schema-admin.sql 建）。
 *
 * <p>放在社区包而不是 admin 包，是为了**依赖单向**：admin 可以依赖 community
 * （处理举报要读帖子/评论），community 不反过来依赖 admin。这里只读表、不写表；
 * 禁言的写入（管理员 ban / unban）在 `com.siyige.admin.BanService`。
 *
 * <p><b>为什么不加缓存</b>（方案 R7 / 决策）：`user_id + until` 有索引、H2 是内存库，
 * 一次主键级查询是微秒级；加缓存只会换来"禁言后要等缓存过期才生效"这类 bug。
 * 社区写频率本来就低，不值得。
 */
@Component
public class MuteGuard {

    private static final Logger log = LoggerFactory.getLogger(MuteGuard.class);

    private static final DateTimeFormatter UNTIL_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault());

    private final JdbcTemplate jdbc;

    public MuteGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 当前生效的禁言到期时间；没被禁言返回 null。 */
    public Timestamp activeUntil(String userId) {
        if (userId == null || userId.isBlank()) return null;
        List<Timestamp> rows = jdbc.queryForList(
                "select until from sy_community_ban " +
                "where user_id = ? and until > ? order by until desc limit 1",
                Timestamp.class, userId, Timestamp.from(Instant.now()));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 当前生效的禁言（含原因），没被禁言返回 null。 */
    public Map<String, Object> activeBan(String userId) {
        if (userId == null || userId.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select until, reason from sy_community_ban " +
                "where user_id = ? and until > ? order by until desc limit 1",
                userId, Timestamp.from(Instant.now()));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 写操作前调用：被禁言就抛 403 {@code MUTED}，message 里带到期时间。
     *
     * <p>拦的动作：发帖 / 评论 / 编辑帖子 / 点赞（都是"继续产出公开内容"）。
     * 不拦：删除自己的帖或评论、取消点赞、浏览——删除是净化行为，不能被禁言卡住。
     */
    public void assertNotMuted(String userId) {
        Timestamp until = activeUntil(userId);
        if (until == null) return;

        String text = UNTIL_FMT.format(until.toInstant());
        long mins = Math.max(0, ChronoUnit.MINUTES.between(Instant.now(), until.toInstant()));
        log.info("禁言拦截 userId={} until={} 剩余 {} 分钟", userId, text, mins);
        throw AuthException.muted(text);
    }

    /** `GET /api/community/me/ban` 的响应体。 */
    public Map<String, Object> banInfo(String userId) {
        Timestamp until = activeUntil(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("banned", until != null);
        out.put("until", until == null ? null : until.getTime());
        if (until == null) {
            out.put("reason", null);
        } else {
            Map<String, Object> ban = activeBan(userId);
            out.put("reason", ban == null ? null : ban.get("reason"));
        }
        return out;
    }
}
