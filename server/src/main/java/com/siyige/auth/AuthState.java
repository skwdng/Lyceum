package com.siyige.auth;

import java.time.Instant;

/**
 * 账号的「认证状态」快照：一次查询同时拿到封禁与改密时间。
 *
 * <p>为什么合并成一条 SQL（用户决策 1）：`JwtAuthFilter` 每个带 token 的请求都要判定，
 * 多查一次库纯属浪费；`select coalesce(status,1), pwd_changed_at from sy_user where id = ?`
 * 一次就够。
 *
 * @param disabled     全站封禁（`sy_user.status = 0`）
 * @param pwdChangedAt 最近一次改密时间；从未改过为 {@code null}
 */
public record AuthState(boolean disabled, Instant pwdChangedAt) {

    /** 用户不存在时的状态（不封禁、没改过密码）。 */
    public static final AuthState UNKNOWN = new AuthState(false, null);

    /**
     * 令牌是否因为「签发早于改密」而失效。
     *
     * <p><b>为什么要把 pwdChangedAt 截断到秒（甲方案）：</b>
     * JWT 的 {@code iat} 是 NumericDate，精度只到**秒**；而库里 `pwd_changed_at` 是
     * 毫秒级 timestamp。若直接比毫秒，改密后**同一秒**签发的新令牌会满足
     * {@code iat < pwd_changed_at}，用户改完密码立刻被自己的新令牌踢下线。
     * 截断到秒后：
     * <ul>
     *   <li>同一秒签发的新令牌：{@code iat == changedSec} → 不失效 ✅</li>
     *   <li>改密前一秒及更早签发的旧令牌：{@code iat < changedSec} → 失效 ✅</li>
     * </ul>
     * 代价是「改密那一秒内签发的旧令牌」最多多活不到 1 秒——已与用户确认接受。
     */
    public boolean isTokenStale(Instant issuedAt) {
        if (pwdChangedAt == null || issuedAt == null) return false;
        return issuedAt.getEpochSecond() < pwdChangedAt.getEpochSecond();
    }
}
