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
 * 管理端：举报队列 / 详情 / 处理。
 *
 * <pre>
 *   GET  /api/admin/reports?status=PENDING&page=&size=   按目标聚合
 *   GET  /api/admin/reports/{id}                        详情 + 目标全文 + 同目标其他举报
 *   POST /api/admin/reports/{id}/resolve {action,banDays?,note?}   204
 * </pre>
 *
 * <p>身份由 {@link AdminAuthFilter} 校验后放进 {@link AdminContext}，
 * `handled_by` 一律取 {@code AdminContext.requireId()}，**不信任何请求参数**。
 */
@RestController
@RequestMapping("/api/admin/reports")
public class AdminReportController {

    private final AdminReportService service;

    public AdminReportController(AdminReportService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> queue(@RequestParam(required = false) String status,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        return service.queue(status, page, size);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<Void> resolve(@PathVariable long id,
                                        @RequestBody(required = false) AdminDtos.ResolveRequest req,
                                        HttpServletRequest http) {
        service.resolve(id, req, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
        return ResponseEntity.noContent().build();
    }
}
