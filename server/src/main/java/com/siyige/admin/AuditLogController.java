package com.siyige.admin;

import com.siyige.auth.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 处理记录（审计）+ 一键恢复。
 *
 * <pre>
 *   GET  /api/admin/audit?page=&size=      -> {items,total,page,size}   // 倒序，每行带 canRestore
 *   POST /api/admin/audit/{id}/restore     -> 204                       // 幂等：已撤销过的 409
 * </pre>
 *
 * <p>身份由 {@link AdminAuthFilter} 校验后放进 {@link AdminContext}；
 * `undo_by` / 审计行里的 `admin_id` **一律取 {@link AdminContext#requireId()}**，不信任何请求参数。
 *
 * <p>这里只读/只撤销**已存在的处理记录**，不提供删除或修改接口——审计的价值就在于只能追加。
 */
@RestController
@RequestMapping("/api/admin/audit")
public class AuditLogController {

    private final AuditLogService service;
    private final RestoreService restore;

    public AuditLogController(AuditLogService service, RestoreService restore) {
        this.service = service;
        this.restore = restore;
    }

    @GetMapping
    public Map<String, Object> page(@RequestParam(name = "page", required = false, defaultValue = "1") int page,
                                    @RequestParam(name = "size", required = false, defaultValue = "20") int size) {
        return service.page(page, size);
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<Void> restore(@PathVariable long id, HttpServletRequest http) {
        restore.restore(id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
        return ResponseEntity.noContent().build();
    }
}
