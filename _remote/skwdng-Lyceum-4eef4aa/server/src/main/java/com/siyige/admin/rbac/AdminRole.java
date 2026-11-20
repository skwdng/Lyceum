package com.siyige.admin.rbac;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * 管理端角色（4 个）+ **角色 × 权限点矩阵**（设计方案 §2）。
 *
 * <p>这个枚举是权限矩阵的**唯一真源**：{@link RequireAspect} 只查这里，
 * 别处 MUST NOT 再写一份 `if (role == SUPER)`。
 *
 * <p>角色**存在数据库**（`sy_admin.role`），每个请求由 {@code AdminStatusSource} 读出来塞进
 * {@code AdminContext}；**不写进 JWT** —— 写进令牌的话改角色要等令牌过期（2 小时）才生效，
 * 而实际上改完下一次请求就该生效。
 */
public enum AdminRole {

    /** 超管：15 个权限点全有（含导出、账号管理）。 */
    SUPER {
        @Override
        public Set<Perm> perms() {
            return Collections.unmodifiableSet(EnumSet.allOf(Perm.class));
        }
    },

    /** 运营：日常处置 + 看报表；**不能导出、不能审核视频、不能管账号**。 */
    OPS {
        @Override
        public Set<Perm> perms() {
            return set(Perm.REPORT_READ, Perm.REPORT_RESOLVE,
                    Perm.USER_READ, Perm.USER_BAN,
                    Perm.CONTENT_READ, Perm.CONTENT_MODERATE,
                    Perm.AUDIT_READ, Perm.AUDIT_RESTORE,
                    Perm.TOPIC_READ, Perm.TOPIC_MODERATE,
                    Perm.VIDEO_READ,
                    Perm.ANALYTICS_READ);
        }
    },

    /** 审核：内容 / 视频 / 辩题审核；**不能封号、不能恢复内容、不能看报表**。
     *  2026-11-13 起补上 {@code topic:moderate}：审核员遇到脏辩题要能自己下架，不必等运营。 */
    MOD {
        @Override
        public Set<Perm> perms() {
            return set(Perm.REPORT_READ, Perm.REPORT_RESOLVE,
                    Perm.USER_READ,
                    Perm.CONTENT_READ, Perm.CONTENT_MODERATE,
                    Perm.AUDIT_READ,
                    Perm.VIDEO_READ, Perm.VIDEO_AUDIT,
                    Perm.TOPIC_READ, Perm.TOPIC_MODERATE);
        }
    },

    /** 只读：所有 read，**不含导出、不含 video:audit**（实习生 / 外包观察）。 */
    VIEWER {
        @Override
        public Set<Perm> perms() {
            return set(Perm.REPORT_READ, Perm.USER_READ, Perm.CONTENT_READ,
                    Perm.AUDIT_READ, Perm.VIDEO_READ, Perm.TOPIC_READ, Perm.ANALYTICS_READ);
        }
    };

    /** 该角色拥有的权限点（**唯一矩阵**）。 */
    public abstract Set<Perm> perms();

    public boolean has(Perm perm) {
        return perm != null && perms().contains(perm);
    }

    /** 权限点代码集合（写进 `/api/admin/me`，前端按它渲染菜单/按钮）。 */
    public Set<String> permCodes() {
        Set<String> out = new java.util.LinkedHashSet<>();
        for (Perm p : perms()) out.add(p.code());
        return Collections.unmodifiableSet(out);
    }

    /**
     * 解析数据库里的角色值。**大小写不敏感**、容忍空白。
     *
     * @return 无法识别的值返回 {@code null}（调用方按"没有角色"处理 → 403 NOT_ADMIN），
     *         不要默认成 SUPER，否则脏数据会悄悄提权
     */
    public static AdminRole parse(String raw) {
        if (raw == null) return null;
        String v = raw.trim().toUpperCase(java.util.Locale.ROOT);
        if (v.isEmpty()) return null;
        for (AdminRole r : values()) {
            if (r.name().equals(v)) return r;
        }
        return null;
    }

    private static Set<Perm> set(Perm... perms) {
        EnumSet<Perm> s = EnumSet.noneOf(Perm.class);
        Collections.addAll(s, perms);
        return Collections.unmodifiableSet(s);
    }
}
