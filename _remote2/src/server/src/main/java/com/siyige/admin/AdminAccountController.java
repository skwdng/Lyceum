package com.siyige.admin;

import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import com.siyige.auth.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理员账号管理（**超管专属**，全部要求 `admin:manage`）。
 *
 * <pre>
 *   GET  /api/admin/admins                列表（账号/角色/状态/最后登录/创建人）
 *   POST /api/admin/admins                创建 {account, role, password?} -> 一次性密码
 *   POST /api/admin/admins/{id}/role      改角色 {role}
 *   POST /api/admin/admins/{id}/status    启用/停用 {enabled}
 *   POST /api/admin/admins/{id}/reset-pwd 重置密码 -> 一次性新密码
 * </pre>
 *
 * <p>**明文密码只出现在"创建"与"重置"这两次响应里**，其余接口、日志、审计一律没有。
 * 路由统一挂在 `/api/admin/admins`（复数）下，与 `/api/admin/me`（当前身份）区分开。
 */
@RestController
@RequestMapping("/api/admin/admins")
public class AdminAccountController {

    private final AdminAccountService service;

    public AdminAccountController(AdminAccountService service) {
        this.service = service;
    }

    @Require(Perm.ADMIN_MANAGE)
    @GetMapping
    public Map<String, Object> list() {
        List<Map<String, Object>> items = service.list();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        return out;
    }

    /** 创建：不传 password 就生成一次性密码（响应里带 hint，前端要提示"只显示一次"）。 */
    @Require(Perm.ADMIN_MANAGE)
    @PostMapping
    public Map<String, Object> create(@RequestBody(required = false) AdminDtos.CreateAdminRequest req,
                                      HttpServletRequest http) {
        return service.create(req == null ? null : req.account(),
                req == null ? null : req.role(),
                req == null ? null : req.password(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @Require(Perm.ADMIN_MANAGE)
    @PostMapping("/{id}/role")
    public Map<String, Object> changeRole(@PathVariable long id,
                                          @RequestBody(required = false) AdminDtos.ChangeAdminRoleRequest req,
                                          HttpServletRequest http) {
        return service.changeRole(id, req == null ? null : req.role(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @Require(Perm.ADMIN_MANAGE)
    @PostMapping("/{id}/status")
    public Map<String, Object> setEnabled(@PathVariable long id,
                                          @RequestBody(required = false) AdminDtos.SetAdminEnabledRequest req,
                                          HttpServletRequest http) {
        return service.setEnabled(id, req == null ? null : req.enabled(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    @Require(Perm.ADMIN_MANAGE)
    @PostMapping("/{id}/reset-pwd")
    public Map<String, Object> resetPassword(@PathVariable long id, HttpServletRequest http) {
        return service.resetPassword(id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }
}
