package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 对局归属校验：**这场对局是不是我能看/能操作的那一场**。
 *
 * <p>这是辩论侧唯一允许回答"你能不能碰这场对局"的地方。Controller 不许自己拼 SQL 判断。
 *
 * <p><b>为什么有两条判据（而不是只看 sy_match.user_id）：</b>
 * 房间局只有**一条** match，而且是"谁点开局就记在谁名下"
 * （`RoomService.start()` → `matches.create(房主, ...)`，再用 `sy_room.match_id` 存住这层关系）。
 * 只看 owner 会把房间里其他 7 个人全挡在外面。所以两条任一成立即放行：
 * <ol>
 *   <li><b>单人局</b>：我是这条 {@code sy_match} 的 owner</li>
 *   <li><b>房间局</b>：这条 match 属于某个房间，且我在那个房间的席位上</li>
 * </ol>
 *
 * <p>注意判据 ② 不要求我是房主 —— 同房间的任何真人玩家都能看/能操作（否则多人对局没法玩）。
 *
 * <p><b>不认领老数据</b>：{@code u1} / {@code gXXXXXX} 这类历史对局的 owner 不是任何登录账号，
 * 所以现在**谁都进不去**（403）。这是既定决策，不做迁移。
 */
@Component
public class MatchAccess {

    private static final Logger log = LoggerFactory.getLogger(MatchAccess.class);

    /** ① 单人局：我是这条 match 的 owner。 */
    private static final String SQL_OWNER =
            "select count(*) from sy_match where id = ? and user_id = ?";

    /** ② 房间局：这条 match 属于某个房间，且我在那个房间的席位上。 */
    private static final String SQL_ROOM_SEAT =
            "select count(*) from sy_room r join sy_seat s on s.room_code = r.code "
                    + "where r.match_id = ? and s.user_id = ?";

    private final JdbcTemplate jdbc;

    public MatchAccess(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 能看 / 能操作这场对局吗。参数为空一律 false（不猜、不放行）。 */
    public boolean canAccess(String matchId, String userId) {
        if (matchId == null || matchId.isBlank()) return false;
        if (userId == null || userId.isBlank()) return false;

        if (count(SQL_OWNER, matchId, userId) > 0) return true;
        return count(SQL_ROOM_SEAT, matchId, userId) > 0;
    }

    /**
     * 归属校验的统一入口：不是这场的人 → {@code 403 FORBIDDEN}。
     *
     * <p>注意 401 与 403 的分工：**401 是"你没登录"**（过滤器负责），
     * **403 是"你登录了，但这场不是你的"**（这里负责）。两者不能混。
     */
    public void requireAccess(String matchId, String userId) {
        if (!canAccess(matchId, userId)) {
            // 只记 matchId 与 userId，不记令牌
            log.info("拒绝访问对局 matchId={} userId={}（既不是 owner 也不在该房间席位上）",
                    matchId, userId);
            throw AuthException.forbidden("无权访问这场对局");
        }
    }

    private int count(String sql, String matchId, String userId) {
        Integer n = jdbc.queryForObject(sql, Integer.class, matchId, userId);
        return n == null ? 0 : n;
    }
}
