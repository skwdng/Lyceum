package com.siyige.admin;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * R2：管理员账号管理（创建 / 改角色 / 启停 / 重置密码）+ 保护规则 + 审计。
 *
 * <p>为什么要连真 H2 而不是 mock：这里最值钱的是那几条**保护规则**（停用自己、降级自己、
 * 最后一个超管）和"密码只出现一次"的落库行为 —— 这些都在 SQL 与唯一索引上。
 *
 * <p>用低参 Argon2（m=1024,t=1）跑速度，生产是 19456/2。
 */
class AdminAccountServiceTest {

    private JdbcTemplate jdbc;
    private AdminAccountRepo repo;
    private PasswordEncoder encoder;
    private AuditLog audit;
    private AdminAccountService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:acc" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                    "schema-admin.sql", "schema-security.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        repo = new AdminAccountRepo(jdbc);
        encoder = new Argon2PasswordEncoder(8, 16, 1, 1024, 1);
        audit = new AuditLog(new AuditLogRepo(jdbc));
        service = new AdminAccountService(repo, encoder, audit);
    }

    /** 种子里已经有 admin（id=1，SUPER）；再造一个超管当"另一个操作人"。 */
    private void seedSecondSuper() {
        jdbc.update("insert into sy_admin(account, password_hash, role, status, must_change_pwd) "
                + "values('super2', 'x', 'SUPER', 1, false)");
    }

    private String hashOf(String account) {
        return jdbc.queryForObject("select password_hash from sy_admin where account = ?", String.class, account);
    }

    private String roleOf(String account) {
        return jdbc.queryForObject("select role from sy_admin where account = ?", String.class, account);
    }

    private int statusOf(String account) {
        Integer v = jdbc.queryForObject("select status from sy_admin where account = ?", Integer.class, account);
        return v == null ? -1 : v;
    }

    private boolean mustChange(String account) {
        Boolean v = jdbc.queryForObject("select must_change_pwd from sy_admin where account = ?",
                Boolean.class, account);
        return Boolean.TRUE.equals(v);
    }

    // ==================== 创建 ====================

    @Test
    void 创建账号_不传密码就生成一次性密码_库里只存哈希() {
        Map<String, Object> out = service.create("ops1", "OPS", null, 1L, "admin", "127.0.0.1");

        String plain = (String) out.get("password");
        assertNotNull(plain);
        assertEquals(12, plain.length(), "一次性密码 12 位");
        assertFalse(hashOf("ops1").equals(plain), "库里必须是哈希，不能是明文");
        assertTrue(encoder.matches(plain, hashOf("ops1")));
        assertEquals("OPS", roleOf("ops1"));
        assertTrue(mustChange("ops1"), "新账号首登必须改密");
        assertEquals(1, statusOf("ops1"), "新账号默认启用");
        assertEquals("admin", ((Map<?, ?>) out.get("admin")).get("createdBy"));
    }

    @Test
    void 创建账号写ADMIN_CREATE审计且不含密码() {
        service.create("ops1", "OPS", null, 1L, "admin", "127.0.0.1");

        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_audit_log where action = 'ADMIN_CREATE'");
        assertEquals(1, rows.size());
        Map<String, Object> r = rows.get(0);
        assertEquals("ADMIN", r.get("TARGET_TYPE"));
        assertEquals("ops1", r.get("TARGET_OWNER"));
        assertEquals("MANUAL", r.get("SOURCE"));
        String detail = String.valueOf(r.get("DETAIL"));
        assertTrue(detail.contains("ops1") && detail.contains("OPS"), detail);
        // 审计里绝不能出现任何 12 位一次性密码
        assertFalse(detail.matches(".*[A-Za-z0-9]{12}.*"), "审计文案里疑似带密码：" + detail);
    }

    @Test
    void 账号重复_ADMIN_EXISTS() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.create("ops1", "MOD", null, 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("ADMIN_EXISTS"), e.getMessage());
    }

    @Test
    void 不给角色或给非法角色都拒绝_不默认超管() {
        IllegalArgumentException noRole = assertThrows(IllegalArgumentException.class,
                () -> service.create("xx1", null, null, 1L, "admin", "ip"));
        assertTrue(noRole.getMessage().startsWith("ROLE_REQUIRED"), noRole.getMessage());

        IllegalArgumentException badRole = assertThrows(IllegalArgumentException.class,
                () -> service.create("xx2", "BOSS", null, 1L, "admin", "ip"));
        assertTrue(badRole.getMessage().startsWith("ROLE_REQUIRED"), badRole.getMessage());

        assertEquals(1L, countAdmins(), "两次都该被拒，库里只应剩种子 admin 一个");
    }

    @Test
    void 指定弱密码_WEAK_PASSWORD() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.create("xx3", "OPS", "abc", 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("WEAK_PASSWORD"), e.getMessage());

        IllegalArgumentException noDigit = assertThrows(IllegalArgumentException.class,
                () -> service.create("xx4", "OPS", "abcdefghij", 1L, "admin", "ip"));
        assertTrue(noDigit.getMessage().startsWith("WEAK_PASSWORD"), noDigit.getMessage());
    }

    @Test
    void 指定合规密码时用它而不是生成() {
        service.create("xx5", "VIEWER", "Passw0rd123", 1L, "admin", "ip");

        assertTrue(encoder.matches("Passw0rd123", hashOf("xx5")));
        assertTrue(mustChange("xx5"), "自己指定密码也是首登必须改密（超管给的密码不该长期用）");
    }

    private long countAdmins() {
        Long n = jdbc.queryForObject("select count(*) from sy_admin", Long.class);
        return n == null ? 0 : n;
    }

    // ==================== 保护规则 ====================

    @Test
    void 停用自己_拒绝() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.setEnabled(1L, false, 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("CANNOT_DISABLE_SELF"), e.getMessage());
        assertEquals(1, statusOf("admin"), "自己必须还是启用状态");
    }

    @Test
    void 改自己的角色_拒绝() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.changeRole(1L, "VIEWER", 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("CANNOT_DEMOTE_SELF"), e.getMessage());
        assertEquals("SUPER", roleOf("admin"));
    }

    @Test
    void 降级最后一个超管_LAST_SUPER() {
        seedSecondSuper();
        // super2 是唯一的另一个超管：降级它之后还剩 admin（SUPER），所以能成功
        service.changeRole(2L, "OPS", 1L, "admin", "ip");
        assertEquals("OPS", roleOf("super2"));

        // 现在只剩 admin 一个超管，再想降级 admin（由 super2 操作）应该被拒
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.changeRole(1L, "VIEWER", 2L, "super2", "ip"));
        assertTrue(e.getMessage().startsWith("LAST_SUPER"), e.getMessage());
        assertEquals("SUPER", roleOf("admin"));
    }

    @Test
    void 停用最后一个超管_LAST_SUPER() {
        seedSecondSuper();
        // 先把 super2 降成运营，再试着停用 admin
        service.changeRole(2L, "OPS", 1L, "admin", "ip");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.setEnabled(1L, false, 2L, "super2", "ip"));
        assertTrue(e.getMessage().startsWith("LAST_SUPER"), e.getMessage());
    }

    @Test
    void 停用与启用写不同审计动作() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");
        service.setEnabled(2L, false, 1L, "admin", "ip");
        assertEquals(0, statusOf("ops1"));
        assertEquals(1L, countAudit("ADMIN_DISABLE"));

        service.setEnabled(2L, true, 1L, "admin", "ip");
        assertEquals(1, statusOf("ops1"));
        assertEquals(1L, countAudit("ADMIN_ENABLE"));
    }

    @Test
    void 改角色写ADMIN_ROLE审计并记录前后角色() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");
        service.changeRole(2L, "MOD", 1L, "admin", "ip");

        assertEquals("MOD", roleOf("ops1"));
        String detail = String.valueOf(jdbc.queryForObject(
                "select detail from sy_audit_log where action = 'ADMIN_ROLE'", String.class));
        assertTrue(detail.contains("OPS") && detail.contains("MOD"), detail);
    }

    @Test
    void 改成同一个角色是幂等的_不报错也不写审计() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");
        service.changeRole(2L, "OPS", 1L, "admin", "ip");

        assertEquals(0L, countAudit("ADMIN_ROLE"), "没变化就不该留痕");
    }

    private long countAudit(String action) {
        Long n = jdbc.queryForObject("select count(*) from sy_audit_log where action = ?", Long.class, action);
        return n == null ? 0 : n;
    }

    // ==================== 重置密码 ====================

    @Test
    void 重置密码_换新密码_置强制改密_旧密码失效() {
        service.create("ops1", "OPS", "OldPass123", 1L, "admin", "ip");
        String oldHash = hashOf("ops1");

        Map<String, Object> out = service.resetPassword(2L, 1L, "admin", "ip");
        String plain = (String) out.get("password");

        assertEquals(12, plain.length());
        assertFalse(oldHash.equals(hashOf("ops1")), "哈希必须换掉");
        assertTrue(encoder.matches(plain, hashOf("ops1")));
        assertFalse(encoder.matches("OldPass123", hashOf("ops1")), "旧密码必须失效");
        assertTrue(mustChange("ops1"));
        assertEquals(1L, countAudit("ADMIN_RESET_PWD"));

        // 审计文案不允许出现新明文密码
        String detail = String.valueOf(jdbc.queryForObject(
                "select detail from sy_audit_log where action = 'ADMIN_RESET_PWD'", String.class));
        assertFalse(detail.contains(plain), "审计里出现了明文密码：" + detail);
    }

    @Test
    void 重置密码会让旧令牌失效_pwd_changed_at被刷新() {
        service.create("ops1", "OPS", "OldPass123", 1L, "admin", "ip");
        assertNull(jdbc.queryForObject("select pwd_changed_at from sy_admin where account = 'ops1'",
                java.sql.Timestamp.class));

        service.resetPassword(2L, 1L, "admin", "ip");

        assertNotNull(jdbc.queryForObject("select pwd_changed_at from sy_admin where account = 'ops1'",
                java.sql.Timestamp.class), "重置后必须刷新 pwd_changed_at，否则旧令牌还能用");
    }

    // ==================== 一次性密码生成器 ====================

    @Test
    void 一次性密码_长度12且同时含数字与字母且无易混淆字符() {
        for (int i = 0; i < 500; i++) {
            String p = service.oneTimePassword();
            assertEquals(12, p.length());
            assertTrue(p.chars().anyMatch(Character::isDigit), "缺数字：" + p);
            assertTrue(p.chars().anyMatch(Character::isLetter), "缺字母：" + p);
            assertFalse(p.matches(".*[0O1lI].*"), "不该出现易混淆字符：" + p);
        }
    }

    // ==================== 处理记录不可恢复 ====================

    @Test
    void 管理员类处理记录不可恢复_不能拿管理员id去恢复内容() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");
        long auditId = jdbc.queryForObject(
                "select id from sy_audit_log where action = 'ADMIN_CREATE'", Long.class);

        RestoreService restore = new RestoreService(new AuditLogRepo(jdbc), audit,
                new AdminReportRepo(jdbc), new com.siyige.community.CommunityRepo(jdbc));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restore.restore(auditId, 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("NOT_RESTORABLE"), e.getMessage());
    }

    // ==================== 列表 ====================

    @Test
    void 列表不含密码哈希只给视图字段() {
        service.create("ops1", "OPS", null, 1L, "admin", "ip");

        List<Map<String, Object>> items = service.list();
        assertTrue(items.size() >= 2, "种子 admin + 新建的 ops1");
        for (Map<String, Object> it : items) {
            assertFalse(it.containsKey("passwordHash"), "绝不能把哈希下发");
            assertFalse(it.containsKey("password_hash"), "绝不能把哈希下发");
            assertNotNull(it.get("account"));
            assertNotNull(it.get("role"));
            assertNotNull(it.get("enabled"));
        }
    }

    @Test
    void 登录后写last_login_at() {
        AdminRepo loginRepo = new AdminRepo(jdbc);
        AdminAuthService auth = new AdminAuthService(loginRepo, encoder);
        service.create("ops1", "OPS", "Passw0rd123", 1L, "admin", "ip");

        auth.login(new AdminDtos.AdminLoginRequest("ops1", "Passw0rd123"));

        assertNotNull(jdbc.queryForObject("select last_login_at from sy_admin where account = 'ops1'",
                java.sql.Timestamp.class));
    }
}
