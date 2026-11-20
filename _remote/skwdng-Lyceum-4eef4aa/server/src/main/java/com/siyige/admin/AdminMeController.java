package com.siyige.admin;

import com.siyige.admin.rbac.AdminRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 当前管理员是谁 + 能干什么。**任何已登录管理员都能调**（不挂 `@Require`）。
 *
 * <pre>
 *   GET /api/admin/me
 *   -> { id, account, role, perms: ["report:read", ...], mustChangePwd }
 * </pre>
 *
 * <p>前端登录后立刻调它：菜单按 `perms` 过滤、按钮按 `perms` 显隐、
 * `mustChangePwd=true` 时强制跳改密页。**角色以这里返回的为准**（它是每请求从库里读的），
 * 前端不从令牌里解析角色。
 *
 * <p>首登强制改密期间这个接口**必须**能用，否则前端连"我该去改密"都不知道 ——
 * 见 {@code AdminAuthFilter} 的放行名单。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminMeController {

    @GetMapping("/me")
    public Map<String, Object> me() {
        AdminRole role = AdminContext.role();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", AdminContext.id());
        out.put("account", AdminContext.account());
        // 角色为 null 时如实返回 null：前端按"无权限"渲染，不猜成超管
        out.put("role", role == null ? null : role.name());
        out.put("perms", role == null ? java.util.List.of() : new java.util.ArrayList<>(role.permCodes()));
        out.put("mustChangePwd", AdminContext.mustChangePwd());
        return out;
    }
}
