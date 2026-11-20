package com.siyige.auth;

/**
 * 登录失败限流（决策 6 / 方案 §2.3）。
 *
 * <p>规则：
 * <ul>
 *   <li>同账号：5 次失败 / 5 分钟 → 锁 15 分钟</li>
 *   <li>同 IP：20 次失败 / 5 分钟 → 锁 5 分钟</li>
 * </ul>
 *
 * <p><b>Q1 决策</b>：存储不可用时**不放行**（fail-closed），抛 503 SERVICE_UNAVAILABLE——
 * 限流失效等于敞开爆破大门，不如直接拒绝登录。
 *
 * <p>抽成接口是为了让 Controller 单测不依赖真实 Redis。
 */
public interface LoginRateLimiter {

    /**
     * 登录前调用：处于锁定状态则抛 429。
     *
     * @throws AuthException 429 {@code TOO_MANY_ATTEMPTS} 或 503 {@code SERVICE_UNAVAILABLE}
     */
    void assertAllowed(String account, String ip);

    /** 登录失败后调用：累加计数，达阈值则落锁。 */
    void onFailure(String account, String ip);

    /** 登录成功后调用：清掉该账号的失败计数（IP 计数保留，避免一个账号成功就洗白整台机器）。 */
    void onSuccess(String account);
}
