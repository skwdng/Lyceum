package com.siyige.admin;

import com.siyige.auth.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 管理端：用户管理。
 *
 * <pre>
 *   GET  /api/admin/users?q=&page=&size=          列表（账号/昵称/两种处罚状态/被举报数）
 *   POST /api/admin/users/{id}/ban    {days,reason?}   社区禁言 1/3/7 天
 *   POST /api/admin/users/{id}/unban                   解除社区禁言
 *   POST /api/admin/users/{id}/status {status,reason?} 全站封禁开关（0/1）
 * </pre>
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return service.users(q, page, size);
    }

    @PostMapping("/{id}/ban")
    public ResponseEntity<Void> ban(@PathVariable String id,
                                    @RequestBody(required = false) AdminDtos.BanRequest req) {
        service.ban(id, req == null ? null : req.days(), req == null ? null : req.reason(),
                AdminContext.requireId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/unban")
    public ResponseEntity<Void> unban(@PathVariable String id) {
        service.unban(id, AdminContext.requireId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/status")
    public ResponseEntity<Void> status(@PathVariable String id,
                                       @RequestBody(required = false) AdminDtos.SetStatusRequest req,
                                       HttpServletRequest http) {
        service.setStatus(id, req == null ? null : req.status(), req == null ? null : req.reason(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
        return ResponseEntity.noContent().build();
    }
}
