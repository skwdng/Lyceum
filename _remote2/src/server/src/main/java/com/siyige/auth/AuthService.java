package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 账号与密码核心（不含 JWT，JWT 在 T3 的 JwtService）。
 *
 * <p>安全要点：
 * <ul>
 *   <li><b>防账号枚举</b>：账号不存在时也跑一次真实的哈希校验（对 dummy hash），
 *       并且失败文案与"密码错"完全一致；时间差因此不可用。</li>
 *   <li><b>密码策略</b>：8–64 位，必须同时含数字和字母。</li>
 *   <li><b>账号</b>：3–32 位字母/数字/下划线，统一小写存储与比对（不区分大小写）。</li>
 *   <li><b>并发注册</b>：唯一索引 ux_user_account 兜底，捕获 DuplicateKeyException → 409。</li>
 *   <li><b>日志</b>：只打 account，永不打印密码或哈希。</li>
 * </ul>
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** 账号规则：3–32 位字母数字下划线。 */
    private static final Pattern ACCOUNT = Pattern.compile("^[A-Za-z0-9_]{3,32}$");

    private static final int NAME_MAX = 64;

    private final AuthRepo repo;
    private final PasswordEncoder encoder;

    /** 防时序枚举用的假哈希；懒加载一次（用生产参数编码，耗时与真实校验一致）。 */
    private volatile String dummyHash;

    public AuthService(AuthRepo repo, PasswordEncoder encoder) {
        this.repo = repo;
        this.encoder = encoder;
    }

    // ==================== 注册 ====================

    public AuthDtos.AuthUser register(AuthDtos.RegisterRequest req) {
        String account = normalizeAccount(req == null ? null : req.account());
        String rawPassword = req == null ? null : req.password();

        if (!ACCOUNT.matcher(account).matches()) {
            throw AuthException.invalidParam("用户名需为 3-32 位字母、数字或下划线");
        }
        checkPasswordPolicy(rawPassword);

        // 先查一次给出友好错误；并发竞态由唯一索引兜底（见下面的 catch）
        if (repo.findByAccount(account) != null) throw AuthException.accountTaken();

        String hash = encoder.encode(rawPassword);
        try {
            // 昵称默认 = 账号（决策 5）
            repo.insert(account, account, hash);
        } catch (DuplicateKeyException e) {
            throw AuthException.accountTaken();
        }
        log.info("注册成功 account={}", account);
        return new AuthDtos.AuthUser(account, account, account);
    }

    // ==================== 登录 ====================

    public AuthDtos.AuthUser login(AuthDtos.LoginRequest req) {
        String account = normalizeAccount(req == null ? null : req.account());
        String rawPassword = req == null ? null : req.password();

        AuthRepo.UserRecord user = account.isEmpty() ? null : repo.findByAccount(account);

        // 防时序枚举：账号不存在 / 没有密码 / 已禁用，都跑一次同等开销的校验
        if (user == null || user.passwordHash() == null) {
            verifyAgainstDummy(rawPassword);
            log.info("登录失败（账号不存在或无密码） account={}", account);
            throw AuthException.badCredentials();
        }
        // AI 账号（is_bot=1）禁止登录。必须在密码校验**之前**拦：
        // 它的 password_hash 是故意写成不可解析的串，先走 encoder.matches 会抛解析异常变成 500。
        if (user.bot()) {
            verifyAgainstDummy(rawPassword);       // 与其它失败分支保持同等耗时，不额外泄露账号性质
            log.info("登录失败（AI 账号禁止登录） account={} id={}", account, user.id());
            throw AuthException.badCredentials();
        }
        if (!encoder.matches(rawPassword, user.passwordHash())) {
            log.info("登录失败（密码错误） account={}", account);
            throw AuthException.badCredentials();
        }
        if (user.status() != 1) {
            // 全站封禁：密码已经验过，这里明确告诉对方"被封了"——
            // 方案 §4 / 验收 #15 要求登录直接返回 ACCOUNT_DISABLED，而不是含糊的"密码错"。
            log.info("登录失败（账号已被全站封禁） account={} status={}", account, user.status());
            throw AuthException.accountDisabled();
        }

        // 参数/算法升级时平滑重算（决策 4 的迁移口子）
        if (encoder.upgradeEncoding(user.passwordHash())) {
            try {
                repo.updatePasswordHash(user.id(), encoder.encode(rawPassword));
                log.info("密码哈希已按新参数重算 account={}", account);
            } catch (RuntimeException e) {
                // 重算失败不影响本次登录
                log.warn("密码哈希重算失败（忽略，不影响本次登录） account={}", account, e);
            }
        }

        log.info("登录成功 account={}", account);
        return toView(user);
    }

    // ==================== 改密 ====================

    /**
     * 改密码。
     *
     * <p>顺序刻意是「先验旧密码、再校验新密码策略」：这样没掌握旧密码的人
     * 试探不到密码策略的任何细节。
     *
     * <p>校验（用户决策 1）：
     * <ul>
     *   <li>旧密码必须对，否则 400 {@code INVALID_PARAM}「旧密码不正确」（用户确认用 400）</li>
     *   <li>新密码 8–64 位且必须同时含数字与字母</li>
     *   <li>新旧不能相同</li>
     * </ul>
     *
     * <p>写库时同时落 `pwd_changed_at`：**该账号所有旧令牌立刻失效**（401 TOKEN_STALE）。
     * 日志只打 account，绝不打印任何密码。
     */
    public void changePassword(String userId, String oldPassword, String newPassword) {
        if (userId == null || userId.isBlank()) throw AuthException.unauthorized();
        AuthRepo.UserRecord user = repo.findById(userId);
        if (user == null) throw AuthException.unauthorized();
        if (user.passwordHash() == null) {
            throw AuthException.invalidParam("当前账号没有设置密码，请联系管理员");
        }

        if (oldPassword == null || oldPassword.isEmpty()) {
            throw AuthException.invalidParam("请输入旧密码");
        }
        if (!encoder.matches(oldPassword, user.passwordHash())) {
            log.info("改密失败（旧密码不正确） account={}", user.account());
            throw AuthException.invalidParam("旧密码不正确");
        }

        checkPasswordPolicy(newPassword);
        if (encoder.matches(newPassword, user.passwordHash())) {
            throw AuthException.invalidParam("新密码不能与旧密码相同");
        }

        repo.changePassword(user.id(), encoder.encode(newPassword),
                java.sql.Timestamp.from(java.time.Instant.now()));
        log.info("改密成功 account={}（该账号旧令牌全部失效）", user.account());
    }

    // ==================== 我 / 改名 ====================

    public AuthDtos.AuthUser me(String userId) {
        if (userId == null || userId.isBlank()) throw AuthException.unauthorized();
        AuthRepo.UserRecord user = repo.findById(userId);
        if (user == null) throw AuthException.unauthorized();
        return toView(user);
    }

    public AuthDtos.AuthUser updateName(String userId, String rawName) {
        if (userId == null || userId.isBlank()) throw AuthException.unauthorized();
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) throw AuthException.invalidParam("昵称不能为空");
        if (name.length() > NAME_MAX) throw AuthException.invalidParam("昵称最多 " + NAME_MAX + " 个字符");

        AuthRepo.UserRecord user = repo.findById(userId);
        if (user == null) throw AuthException.unauthorized();

        repo.updateName(userId, name);
        log.info("昵称已更新 account={}", user.account());
        return new AuthDtos.AuthUser(user.id(), user.account(), name);
    }

    // ==================== 内部 ====================

    private static AuthDtos.AuthUser toView(AuthRepo.UserRecord u) {
        return new AuthDtos.AuthUser(u.id(), u.account(), u.name());
    }

    /** 账号统一小写、去空白；不合法时由调用方按各自场景处理。 */
    static String normalizeAccount(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase();
    }

    /** 密码策略：与管理员端共用同一套规则（见 {@link PasswordPolicy}）。 */
    private static void checkPasswordPolicy(String password) {
        PasswordPolicy.check(password);
    }

    /**
     * 对假哈希跑一次校验，只为消掉时间差；结果恒为 false，永远不通过。
     */
    private void verifyAgainstDummy(String rawPassword) {
        String dummy = dummyHash;
        if (dummy == null) {
            dummy = encoder.encode("dummy-" + UUID.randomUUID());
            dummyHash = dummy;
        }
        encoder.matches(rawPassword == null ? "" : rawPassword, dummy);
    }
}
