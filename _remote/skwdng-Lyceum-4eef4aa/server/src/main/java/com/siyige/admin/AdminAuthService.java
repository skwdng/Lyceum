package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * 管理员认证（独立账号体系，与 `com.siyige.auth.AuthService` 是两套东西）。
 *
 * <p>与用户登录保持同一套安全标准：
 * <ul>
 *   <li>Argon2id 校验（复用同一个 {@link PasswordEncoder} Bean，参数一致）</li>
 *   <li><b>防账号枚举</b>：账号不存在 / 停用时也跑一次假哈希校验，耗时与真实校验一致</li>
 *   <li>失败文案统一「账号或密码错误」，不泄露"这个管理员账号存不存在"</li>
 *   <li>日志只打 account，**不打印密码、不打印 token**</li>
 * </ul>
 *
 * <p>限流不在这里做：由 `AdminAuthController` 用 {@code adminLoginRateLimiter} 在进入本类之前拦住。
 */
@Service
public class AdminAuthService {

    private static final Logger log = LoggerFactory.getLogger(AdminAuthService.class);

    private final AdminRepo repo;
    private final PasswordEncoder encoder;

    /** 防时序枚举用的假哈希；懒加载一次（用生产参数编码）。 */
    private volatile String dummyHash;

    public AdminAuthService(AdminRepo repo, PasswordEncoder encoder) {
        this.repo = repo;
        this.encoder = encoder;
    }

    /**
     * 校验账号密码。
     *
     * @return 通过则返回管理员视图（id + account），由 Controller 负责签发 ADMIN 令牌
     * @throws AuthException 400 入参缺失 / 401 {@code BAD_CREDENTIALS}
     */
    public AdminDtos.AdminView login(AdminDtos.AdminLoginRequest req) {
        String account = normalize(req == null ? null : req.account());
        String rawPassword = req == null ? null : req.password();

        if (account.isEmpty() || rawPassword == null || rawPassword.isEmpty()) {
            throw AuthException.invalidParam("账号和密码不能为空");
        }

        AdminRepo.AdminRecord admin = repo.findByAccount(account);

        // 防时序枚举：账号不存在 / 没密码 / 已停用，都跑一次同等开销的校验
        if (admin == null || admin.passwordHash() == null) {
            verifyAgainstDummy(rawPassword);
            log.info("管理员登录失败（账号不存在或无密码） account={}", account);
            throw AuthException.badCredentials();
        }
        if (!encoder.matches(rawPassword, admin.passwordHash())) {
            log.info("管理员登录失败（密码错误） account={}", account);
            throw AuthException.badCredentials();
        }
        if (admin.status() != 1) {
            // 也不泄露"账号被停用"，对外仍是同一句话
            log.info("管理员登录失败（账号状态非正常） account={} status={}", account, admin.status());
            throw AuthException.badCredentials();
        }

        log.info("管理员登录成功 account={} adminId={}", admin.account(), admin.id());
        // R2：记录最后登录时间（失败不影响登录 —— 列表页少一列而已）
        try {
            repo.touchLastLogin(admin.id());
        } catch (RuntimeException e) {
            log.warn("写 last_login_at 失败 adminId={}：{}", admin.id(), e.toString());
        }
        return new AdminDtos.AdminView(admin.id(), admin.account());
    }

    /**
     * 管理员改密码。
     *
     * <p>规则与用户端**完全一致**（{@link com.siyige.auth.PasswordPolicy}）：
     * 先验旧密码（错 -> 400「旧密码不正确」，不泄露策略），再校验新密码，最后才写库。
     *
     * <p>写库同时落 `pwd_changed_at`：该管理员**所有旧令牌立刻失效**（401 TOKEN_STALE），
     * 包括他此刻正在用的这一个——前端收到 204 后应回登录页重新登录。
     *
     * <p>日志只打 account，**不打印任何密码**；管理员改密本身**不写审计**
     * （审计只记举报处理与恢复，用户决策 2）。
     */
    public void changePassword(long adminId, String oldPassword, String newPassword) {
        AdminRepo.AdminRecord admin = repo.findById(adminId);
        if (admin == null) throw AuthException.notAdmin();
        if (admin.passwordHash() == null) {
            throw AuthException.invalidParam("当前账号没有设置密码，请联系运维");
        }

        if (oldPassword == null || oldPassword.isEmpty()) {
            throw AuthException.invalidParam("请输入旧密码");
        }
        if (!encoder.matches(oldPassword, admin.passwordHash())) {
            log.info("管理员改密失败（旧密码不正确） account={}", admin.account());
            throw AuthException.invalidParam("旧密码不正确");
        }

        com.siyige.auth.PasswordPolicy.check(newPassword);
        if (encoder.matches(newPassword, admin.passwordHash())) {
            throw AuthException.invalidParam("新密码不能与旧密码相同");
        }

        repo.changePassword(admin.id(), encoder.encode(newPassword),
                java.sql.Timestamp.from(java.time.Instant.now()));
        // R2：改完必须把"首登强制改密"标记清掉，否则改完还是进不去业务页
        repo.clearMustChangePwd(admin.id());
        log.info("管理员改密成功 account={} adminId={}（该账号旧令牌全部失效）",
                admin.account(), admin.id());
    }
    /** 账号统一小写去空白（与用户账号规则一致）。 */
    static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase();
    }

    private void verifyAgainstDummy(String rawPassword) {
        String dummy = dummyHash;
        if (dummy == null) {
            dummy = encoder.encode("dummy-admin-" + UUID.randomUUID());
            dummyHash = dummy;
        }
        encoder.matches(rawPassword == null ? "" : rawPassword, dummy);
    }
}
