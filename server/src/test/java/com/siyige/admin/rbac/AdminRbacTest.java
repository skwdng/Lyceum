package com.siyige.admin.rbac;

import com.siyige.admin.AdminContext;
import com.siyige.admin.AdminMeController;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

/**
 * R1：角色 × 权限点矩阵 + {@link Require} 切面 + `/api/admin/me`。
 *
 * <p>这套断言是"权限矩阵"的地基 —— R4 还会有一份 4 角色 × 全部接口的 HTTP 级矩阵测试，
 * 但那份跑得慢；这里是纯内存的，改矩阵时第一时间报警。
 */
class AdminRbacTest {

    @AfterEach
    void clear() {
        AdminContext.clear();
    }

    // ---------- 矩阵 ----------

    @Test
    void 超管拥有全部15个权限点() {
        assertEquals(Perm.values().length, AdminRole.SUPER.perms().size());
        assertEquals(15, AdminRole.SUPER.perms().size());
        for (Perm p : Perm.values()) {
            assertTrue(AdminRole.SUPER.has(p), "SUPER 缺 " + p.code());
        }
    }

    @Test
    void 运营_能处置不能导出不能审视频不能管账号() {
        AdminRole r = AdminRole.OPS;
        assertEquals(12, r.perms().size());
        assertTrue(r.has(Perm.REPORT_RESOLVE));
        assertTrue(r.has(Perm.USER_BAN));
        assertTrue(r.has(Perm.CONTENT_MODERATE));
        assertTrue(r.has(Perm.AUDIT_RESTORE));
        assertTrue(r.has(Perm.TOPIC_MODERATE));
        assertTrue(r.has(Perm.VIDEO_READ));
        assertFalse(r.has(Perm.VIDEO_AUDIT), "运营不能审核视频");
        assertFalse(r.has(Perm.ANALYTICS_EXPORT), "导出只给超管");
        assertFalse(r.has(Perm.ADMIN_MANAGE), "运营不能管账号");
    }

    @Test
    void 审核_能审内容与视频但不能封号不能恢复不能看报表() {
        AdminRole r = AdminRole.MOD;
        assertEquals(10, r.perms().size());
        assertTrue(r.has(Perm.CONTENT_MODERATE));
        assertTrue(r.has(Perm.VIDEO_AUDIT));
        // 2026-11-13：审核员要能自己下架脏辩题，不必等运营（追加 topic:moderate，权限点 9 -> 10）
        assertTrue(r.has(Perm.TOPIC_MODERATE), "审核可以下架辩题");
        assertFalse(r.has(Perm.USER_BAN), "审核不能封号");
        assertFalse(r.has(Perm.AUDIT_RESTORE), "审核不能撤销处置");
        assertFalse(r.has(Perm.ANALYTICS_READ), "审核不能看报表");
    }

    @Test
    void 只读_所有read都有_所有写都没有() {
        AdminRole r = AdminRole.VIEWER;
        assertEquals(7, r.perms().size());
        assertTrue(r.has(Perm.REPORT_READ));
        assertTrue(r.has(Perm.USER_READ));
        assertTrue(r.has(Perm.CONTENT_READ));
        assertTrue(r.has(Perm.AUDIT_READ));
        assertTrue(r.has(Perm.VIDEO_READ));
        assertTrue(r.has(Perm.TOPIC_READ));
        assertTrue(r.has(Perm.ANALYTICS_READ));
        // 写操作一个都不能有
        assertFalse(r.has(Perm.REPORT_RESOLVE));
        assertFalse(r.has(Perm.USER_BAN));
        assertFalse(r.has(Perm.CONTENT_MODERATE));
        assertFalse(r.has(Perm.AUDIT_RESTORE));
        assertFalse(r.has(Perm.VIDEO_AUDIT));
        assertFalse(r.has(Perm.TOPIC_MODERATE));
        assertFalse(r.has(Perm.ANALYTICS_EXPORT));
        assertFalse(r.has(Perm.ADMIN_MANAGE));
    }

    @Test
    void 只有超管能导出和管理账号() {
        for (AdminRole r : AdminRole.values()) {
            assertEquals(r == AdminRole.SUPER, r.has(Perm.ANALYTICS_EXPORT), r + " 的导出权限不对");
            assertEquals(r == AdminRole.SUPER, r.has(Perm.ADMIN_MANAGE), r + " 的账号管理权限不对");
        }
    }

    @Test
    void 角色解析_大小写与空白容忍_脏值不默认超管() {
        assertEquals(AdminRole.SUPER, AdminRole.parse("super"));
        assertEquals(AdminRole.SUPER, AdminRole.parse("  SuPer "));
        assertEquals(AdminRole.VIEWER, AdminRole.parse("viewer"));
        assertNull(AdminRole.parse(null));
        assertNull(AdminRole.parse(""));
        assertNull(AdminRole.parse("ADMIN"), "老值 ADMIN 不能默认成超管");
        assertNull(AdminRole.parse("BOSS"));
    }

    // ---------- 切面 ----------

    /** 假 join point：只用来给日志用，方法本身不被调用（校验失败时应该连方法体都进不去）。 */
    private static ProceedingJoinPoint fakeJoinPoint() {
        return (ProceedingJoinPoint) java.lang.reflect.Proxy.newProxyInstance(
                AdminRbacTest.class.getClassLoader(),
                new Class<?>[]{ProceedingJoinPoint.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "getSignature" -> null;
                    case "toString" -> "fake";
                    case "hashCode" -> 1;
                    case "equals" -> false;
                    default -> null;
                });
    }

    private static Require requireOf(Perm... perms) {
        return new Require() {
            @Override
            public Perm[] value() {
                return perms;
            }

            @Override
            public Class<? extends java.lang.annotation.Annotation> annotationType() {
                return Require.class;
            }
        };
    }

    @Test
    void 没有角色时切面必须拒绝_不能静默放行() {
        AdminContext.set(1L, "x", null, false);

        RbacException e = assertThrows(RbacException.class,
                () -> RequireAspect.check(requireOf(Perm.CONTENT_READ), fakeJoinPoint()));
        assertEquals("NOT_ADMIN", e.code());
    }

    @Test
    void 只读角色调写接口403_错误里带缺少的权限点() {
        AdminContext.set(2L, "viewer1", AdminRole.VIEWER, false);

        RbacException e = assertThrows(RbacException.class,
                () -> RequireAspect.check(requireOf(Perm.USER_BAN), fakeJoinPoint()));
        assertEquals("FORBIDDEN_PERM", e.code());
        assertTrue(e.getMessage().contains("user:ban"), e.getMessage());
    }

    @Test
    void 有权限点时切面放行_不会误伤() {
        AdminContext.set(3L, "mod1", AdminRole.MOD, false);

        assertDoesNotThrow(() -> RequireAspect.check(requireOf(Perm.CONTENT_MODERATE), fakeJoinPoint()));
        assertDoesNotThrow(() -> RequireAspect.check(requireOf(Perm.VIDEO_AUDIT), fakeJoinPoint()));
    }

    @Test
    void 多个权限点任一命中即放行() {
        AdminContext.set(4L, "ops1", AdminRole.OPS, false);

        // OPS 有 CONTENT_MODERATE、没有 USER_BAN，写在一起应该放行
        assertDoesNotThrow(() -> RequireAspect.check(
                requireOf(Perm.USER_BAN, Perm.CONTENT_MODERATE), fakeJoinPoint()));
    }

    // ---------- /api/admin/me ----------

    @Test
    void me接口返回角色与权限点_前端靠它渲染菜单() {
        AdminContext.set(8L, "ops9", AdminRole.OPS, true);

        Map<String, Object> me = new AdminMeController().me();

        assertEquals("ops9", me.get("account"));
        assertEquals("OPS", me.get("role"));
        assertEquals(Boolean.TRUE, me.get("mustChangePwd"));
        @SuppressWarnings("unchecked")
        java.util.List<String> perms = (java.util.ArrayList<String>) me.get("perms");
        assertTrue(perms.contains("content:moderate"));
        assertFalse(perms.contains("analytics:export"));
        assertEquals(12, perms.size());
    }

    @Test
    void me接口在角色缺失时说null而不是编个超管() {
        AdminContext.set(9L, "broken", null, false);

        Map<String, Object> me = new AdminMeController().me();

        assertNull(me.get("role"));
        assertTrue(((java.util.List<?>) me.get("perms")).isEmpty());
    }

    /** 权限点代码是稳定契约：前端菜单/按钮按字符串匹配，改名等于改接口。 */
    @Test
    void 权限点代码就是设计方案里的那15个字符串() {
        java.util.Set<String> codes = new java.util.LinkedHashSet<>();
        for (Perm p : Perm.values()) codes.add(p.code());
        assertEquals(java.util.Set.of(
                "admin:manage", "report:read", "report:resolve", "user:read", "user:ban",
                "content:read", "content:moderate", "audit:read", "audit:restore",
                "video:read", "video:audit", "topic:read", "topic:moderate",
                "analytics:read", "analytics:export"), codes);
    }

    @Test
    void 校验通过时不会抛异常_也不自己调用方法体() {
        AdminContext.set(5L, "super1", AdminRole.SUPER, false);
        AtomicBoolean entered = new AtomicBoolean(false);
        ProceedingJoinPoint jp = (ProceedingJoinPoint) java.lang.reflect.Proxy.newProxyInstance(
                AdminRbacTest.class.getClassLoader(),
                new Class<?>[]{ProceedingJoinPoint.class},
                (proxy, method, args) -> {
                    if ("getSignature".equals(method.getName())) return null;
                    if ("proceed".equals(method.getName())) { entered.set(true); return "ok"; }
                    if ("hashCode".equals(method.getName())) return 1;
                    if ("equals".equals(method.getName())) return false;
                    return null;
                });

        assertDoesNotThrow(() -> RequireAspect.check(requireOf(Perm.ADMIN_MANAGE), jp));
        assertFalse(entered.get(), "check() 只做校验，proceed 由 around 负责");
    }
}
