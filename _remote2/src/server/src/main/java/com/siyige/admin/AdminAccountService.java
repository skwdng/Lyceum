package com.siyige.admin;

import com.siyige.admin.rbac.AdminRole;
import com.siyige.auth.AuthException;
import com.siyige.auth.PasswordPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 管理员账号管理（**A 方案：只能由超管创建**，没有自助注册、没有邀请码）。
 *
 * <p>能做的事（都要求 `admin:manage`，实际上只有 SUPER 有）：
 * 列表 / 创建 / 改角色 / 启用停用 / 重置密码。
 *
 * <p>**三条硬规则**（设计方案 §5）：
 * <ol>
 *   <li>**不做硬删除**，只能停用 —— 处理记录里的 `admin_id` 要能对上人</li>
 *   <li><b>不能停用/降级自己</b>：防止手滑把自己锁死（`CANNOT_DISABLE_SELF` / `CANNOT_DEMOTE_SELF`）</li>
 *   <li>系统**至少保留一个启用的 SUPER**（`LAST_SUPER`）</li>
 * </ol>
 *
 * <p>密码规则：明文**只在"创建"和"重置"那一次响应里出现**，库里只存哈希；
 * 日志与审计文案一律不出现密码（`detail` 里只有账号与角色）。
 */
@Service
public class AdminAccountService {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountService.class);

    /** 账号：3-64 位，字母数字开头，可含 `_ . -`（与用户账号习惯一致，但管理员独立一套）。 */
    private static final Pattern ACCOUNT = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$");
    /** 一次性密码字符集：去掉 0 O 1 l I 这些看着像的，线下念给对方不容易错。 */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final char[] DIGITS = "23456789".toCharArray();
    private static final char[] LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".toCharArray();
    private static final int ONE_TIME_PWD_LEN = 12;

    private final SecureRandom random = new SecureRandom();

    private final AdminAccountRepo repo;
    private final PasswordEncoder encoder;
    private final AuditLog audit;

    public AdminAccountService(AdminAccountRepo repo, PasswordEncoder encoder, AuditLog audit) {
        this.repo = repo;
        this.encoder = encoder;
        this.audit = audit;
    }

    // ==================== 读 ====================

    /** 管理员列表。**不含密码哈希**，也不返回给前端任何可用于登录的东西。 */
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : repo.list()) out.add(view(r));
        return out;
    }

    private static Map<String, Object> view(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.get("id"));
        m.put("account", r.get("account"));
        m.put("role", r.get("role"));
        // 对前端用 enabled 布尔，比"status=1"好读；status 也一并给着，兼容老调用
        m.put("enabled", ((Number) r.get("status")).intValue() == 1);
        m.put("status", r.get("status"));
        m.put("mustChangePwd", Boolean.TRUE.equals(r.get("must_change_pwd")));
        m.put("createdAt", millis(r.get("created_at")));
        m.put("createdBy", r.get("created_by"));
        m.put("lastLoginAt", millis(r.get("last_login_at")));
        m.put("roleChangedAt", millis(r.get("role_changed_at")));
        return m;
    }

    private static Long millis(Object ts) {
        if (ts == null) return null;
        if (ts instanceof java.sql.Timestamp t) return t.getTime();
        if (ts instanceof java.time.Instant i) return i.toEpochMilli();
        return null;
    }

    // ==================== 创建 ====================

    /**
     * 建账号。密码不给就**生成一次性密码**（12 位，去掉易混淆字符）。
     *
     * @return {@code {admin:{...}, password:"一次性明文", mustChangePwd:true, hint:"..."}}
     *         —— **这是唯一一次能看到明文的地方**
     */
    public Map<String, Object> create(String rawAccount, String rawRole, String password,
                                     long adminId, String adminName, String ip) {
        String account = normalizeAccount(rawAccount);
        if (!ACCOUNT.matcher(account).matches()) {
            throw new IllegalArgumentException("INVALID_PARAM: 账号需 3-64 位，字母或数字开头，可含 _ . -");
        }

        AdminRole role = requireRole(rawRole);
        if (repo.existsByAccount(account)) {
            throw new IllegalArgumentException("ADMIN_EXISTS: 账号 " + account + " 已存在");
        }

        String plain = (password == null || password.isBlank()) ? oneTimePassword() : password;
        checkPassword(plain);

        long id = repo.insert(account, encoder.encode(plain), role.name(), adminName);
        if (id <= 0) throw new IllegalArgumentException("INTERNAL_ERROR: 创建失败，请重试");

        audit.record(adminId, adminName, AuditLogRepo.ACTION_ADMIN_CREATE, null,
                AuditLogRepo.TARGET_ADMIN, id, account,
                "创建管理员 " + account + "（角色 " + role.name() + "）", ip);
        log.info("创建管理员 id={} account={} role={} by={}", id, account, role.name(), adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("admin", view(repo.findById(id)));
        out.put("password", plain);
        out.put("mustChangePwd", true);
        out.put("hint", "这是唯一一次能看到密码，请立刻线下发给对方；对方首登必须改密");
        return out;
    }

    // ==================== 改角色 ====================

    public Map<String, Object> changeRole(long targetId, String rawRole,
                                          long adminId, String adminName, String ip) {
        Map<String, Object> target = requireAdmin(targetId);
        AdminRole role = requireRole(rawRole);

        AdminRole current = AdminRole.parse(str(target.get("role")));
        if (current == role) {
            return view(repo.findById(targetId));      // 幂等：改成一样的角色不算错
        }

        // 规则：不能改自己的角色（手滑降级自己就再也改不回来）
        if (targetId == adminId) {
            throw new IllegalArgumentException("CANNOT_DEMOTE_SELF: 不能修改自己的角色，请让另一个超管操作");
        }
        // 规则：系统必须至少保留一个启用的 SUPER
        if (current == AdminRole.SUPER && role != AdminRole.SUPER) {
            assertAnotherSuper(targetId);
        }

        repo.updateRole(targetId, role.name());
        audit.record(adminId, adminName, AuditLogRepo.ACTION_ADMIN_ROLE, null,
                AuditLogRepo.TARGET_ADMIN, targetId, str(target.get("account")),
                "改角色：" + str(target.get("account")) + " "
                        + (current == null ? "（未知）" : current.name() + "（" + nameOf(current) + "）")
                        + " → " + role.name() + "（" + nameOf(role) + "）", ip);
        log.info("改管理员角色 id={} {} -> {} by={}", targetId, current, role, adminName);
        return view(repo.findById(targetId));
    }

    // ==================== 启用 / 停用 ====================

    public Map<String, Object> setEnabled(long targetId, Boolean enabled,
                                          long adminId, String adminName, String ip) {
        if (enabled == null) throw new IllegalArgumentException("INVALID_PARAM: 缺少 enabled");
        Map<String, Object> target = requireAdmin(targetId);
        boolean currentlyEnabled = ((Number) target.get("status")).intValue() == 1;
        if (currentlyEnabled == enabled) {
            return view(repo.findById(targetId));      // 幂等
        }

        if (!enabled) {
            if (targetId == adminId) {
                throw new IllegalArgumentException("CANNOT_DISABLE_SELF: 不能停用自己的账号");
            }
            // 停用的是最后一个启用的超管 -> 谁也别想再进来
            if (AdminRole.parse(str(target.get("role"))) == AdminRole.SUPER) {
                assertAnotherSuper(targetId);
            }
        }

        repo.updateStatus(targetId, enabled);
        audit.record(adminId, adminName,
                enabled ? AuditLogRepo.ACTION_ADMIN_ENABLE : AuditLogRepo.ACTION_ADMIN_DISABLE, null,
                AuditLogRepo.TARGET_ADMIN, targetId, str(target.get("account")),
                (enabled ? "启用管理员 " : "停用管理员 ") + str(target.get("account")), ip);
        log.info("{}管理员 id={} account={} by={}", enabled ? "启用" : "停用",
                targetId, target.get("account"), adminName);
        return view(repo.findById(targetId));
    }

    // ==================== 重置密码 ====================

    /**
     * 重置成新的一次性密码：`must_change_pwd = true` 且 **`pwd_changed_at = now`**
     * —— 对方手上还在用的旧令牌立刻失效（否则重置等于没重置）。
     */
    public Map<String, Object> resetPassword(long targetId, long adminId, String adminName, String ip) {
        Map<String, Object> target = requireAdmin(targetId);
        String plain = oneTimePassword();
        repo.resetPassword(targetId, encoder.encode(plain));

        audit.record(adminId, adminName, AuditLogRepo.ACTION_ADMIN_RESET_PWD, null,
                AuditLogRepo.TARGET_ADMIN, targetId, str(target.get("account")),
                "重置密码：" + str(target.get("account")) + "（对方首登必须改密，旧令牌已失效）", ip);
        log.info("重置管理员密码 id={} account={} by={}（明文不回日志）",
                targetId, target.get("account"), adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("admin", view(repo.findById(targetId)));
        out.put("password", plain);
        out.put("mustChangePwd", true);
        out.put("hint", "这是唯一一次能看到新密码，请立刻线下发给对方；对方旧令牌已失效");
        return out;
    }

    // ==================== 内部 ====================

    private Map<String, Object> requireAdmin(long id) {
        Map<String, Object> row = repo.findById(id);
        if (row == null) throw new IllegalArgumentException("ADMIN_NOT_FOUND: 管理员不存在");
        return row;
    }

    /** 角色必填且必须合法（**不给默认 SUPER**，防止意外提权）。 */
    private static AdminRole requireRole(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("ROLE_REQUIRED: 必须指定角色（SUPER / OPS / MOD / VIEWER）");
        }
        AdminRole role = AdminRole.parse(raw);
        if (role == null) {
            throw new IllegalArgumentException("ROLE_REQUIRED: 角色只能是 SUPER / OPS / MOD / VIEWER");
        }
        return role;
    }

    /** 至少还要剩一个启用的超管，否则再没人能管账号。 */
    private void assertAnotherSuper(long targetId) {
        if (repo.countEnabledSupers(targetId) <= 0) {
            throw new IllegalArgumentException("LAST_SUPER: 系统必须至少保留一个启用的超管");
        }
    }

    /**
     * 密码强度：直接复用用户侧 {@link PasswordPolicy}（>=8 位 + 字母 + 数字），
     * 只把错误码换成 {@code WEAK_PASSWORD} 好让前端区分「密码弱」和「参数错」。
     */
    private static void checkPassword(String password) {
        try {
            PasswordPolicy.check(password);
        } catch (AuthException e) {
            String msg = e.getMessage() == null ? "密码不合规" : e.getMessage();
            int colon = msg.indexOf(':');
            String detail = colon > 0 ? msg.substring(colon + 1).trim() : msg;
            throw new IllegalArgumentException("WEAK_PASSWORD: " + detail);
        }
    }

    /** 一次性密码：12 位，去掉 0 O 1 l I；**保证同时含数字和字母**（满足密码策略）。 */
    String oneTimePassword() {
        char[] buf = new char[ONE_TIME_PWD_LEN];
        for (int i = 0; i < buf.length; i++) buf[i] = ALPHABET.charAt(random.nextInt(ALPHABET.length()));
        // 固定把 0 号位换成数字、1 号位换成字母：两位不会互相覆盖，
        // 避免"随机位置连写两次"在极小概率下把数字位又盖成字母（被测出来过）。
        buf[0] = DIGITS[random.nextInt(DIGITS.length)];
        buf[1] = LETTERS[random.nextInt(LETTERS.length)];
        // 其余位再洗一遍，免得"前两位永远是数字+字母"看起来像固定格式
        for (int i = buf.length - 1; i > 1; i--) {
            int j = random.nextInt(i + 1);
            char t = buf[i];
            buf[i] = buf[j];
            buf[j] = t;
        }
        return new String(buf);
    }

    private static String normalizeAccount(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String nameOf(AdminRole r) {
        if (r == null) return "（未知角色）";
        return switch (r) {
            case SUPER -> "超管";
            case OPS -> "运营";
            case MOD -> "审核";
            case VIEWER -> "只读";
        };
    }
}
