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

    private static final int PASSWORD_MIN = 8;
    private static final int PASSWORD_MAX = 64;
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
        if (!encoder.matches(rawPassword, user.passwordHash())) {
            log.info("登录失败（密码错误） account={}", account);
            throw AuthException.badCredentials();
        }
        if (user.status() != 1) {
            // 也不泄露"账号被禁用"，对外仍是同一句话
            log.info("登录失败（账号状态非正常） account={} status={}", account, user.status());
            throw AuthException.badCredentials();
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

    private static void checkPasswordPolicy(String password) {
        if (password == null || password.isEmpty()) {
            throw AuthException.invalidParam("密码不能为空");
        }
        if (password.length() < PASSWORD_MIN) {
            throw AuthException.invalidParam("密码至少 " + PASSWORD_MIN + " 位");
        }
        if (password.length() > PASSWORD_MAX) {
            throw AuthException.invalidParam("密码最多 " + PASSWORD_MAX + " 位");
        }
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        if (!hasDigit || !hasLetter) {
            throw AuthException.invalidParam("密码必须同时包含数字和字母");
        }
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
