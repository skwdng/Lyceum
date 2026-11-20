package com.siyige.auth;

/**
 * 密码强度规则（用户端与管理端**共用同一套**，改规则只改这里）。
 *
 * <p>规则：8–64 位，必须同时包含数字与字母。
 *
 * <p>抽出来的原因：用户改密与管理员改密必须是同一把尺子；复制两份迟早会漂移
 * ——哪天有人调了用户端的位数，管理端没跟着改，就成了安全缺口。
 *
 * <p>注意：这里的异常一律 400 {@code INVALID_PARAM}。**不要**在"验旧密码之前"调用
 * {@link #check}，否则没掌握旧密码的人能靠错误信息试探出密码策略（见 AuthService#changePassword 的注释）。
 */
public final class PasswordPolicy {

    public static final int MIN = 8;
    public static final int MAX = 64;

    private PasswordPolicy() { }

    /** 不合规就抛 400 {@code INVALID_PARAM}。 */
    public static void check(String password) {
        if (password == null || password.isEmpty()) {
            throw AuthException.invalidParam("密码不能为空");
        }
        if (password.length() < MIN) {
            throw AuthException.invalidParam("密码至少 " + MIN + " 位");
        }
        if (password.length() > MAX) {
            throw AuthException.invalidParam("密码最多 " + MAX + " 位");
        }
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        if (!hasDigit || !hasLetter) {
            throw AuthException.invalidParam("密码必须同时包含数字和字母");
        }
    }
}
