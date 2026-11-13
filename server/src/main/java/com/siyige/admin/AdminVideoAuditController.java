package com.siyige.admin;

import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
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
 * 视频复核台的后台接口（管理端）。
 *
 * <pre>
 *   GET  /api/admin/video-audit/queue?status=&size=   队列 + 全局统计
 *   GET  /api/admin/video-audit/{id}/logs             某个视频的审核日志
 *   POST /api/admin/video-audit/{id}/decide           {decision: PASS|REJECT, reason?}
 *   POST /api/admin/video-audit/{id}/restore          一键恢复
 *   GET  /api/admin/video-audit/rules                 机器规则（只读，说明用）
 * </pre>
 *
 * <p>与视频模块那 4 个接口的关系：数据层完全复用，鉴权换成管理员令牌。
 * 视频模块原接口的 `requireConsole()` 已收紧为"必须管理员"，因此从用户侧调一律 403
 * （验收断言：非管理员调 4 个接口 → 403）。
 */
@RestController
@RequestMapping("/api/admin/video-audit")
public class AdminVideoAuditController {

    private final AdminVideoAuditService service;

    public AdminVideoAuditController(AdminVideoAuditService service) {
        this.service = service;
    }

    @Require(Perm.VIDEO_READ)
    @GetMapping("/queue")
    public Map<String, Object> queue(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String q,
                                     @RequestParam(required = false) String authorId,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        return service.queue(status, q, authorId, from, to, page, size);
    }

    @Require(Perm.VIDEO_READ)
    @GetMapping("/{id}/logs")
    public Map<String, Object> logs(@PathVariable long id) {
        return service.logs(id);
    }

    @Require(Perm.VIDEO_AUDIT)
    @PostMapping("/{id}/decide")
    public Map<String, Object> decide(@PathVariable long id,
                                      @RequestBody(required = false) AdminDtos.VideoDecideRequest req,
                                      HttpServletRequest http) {
        return service.decide(id, req == null ? null : req.decision(), req == null ? null : req.reason(),
                AdminContext.requireId(), AdminContext.account(), com.siyige.auth.ClientIp.of(http));
    }

    @Require(Perm.VIDEO_AUDIT)
    @PostMapping("/{id}/restore")
    public ResponseEntity<Map<String, Object>> restore(@PathVariable long id, HttpServletRequest http) {
        return ResponseEntity.ok(service.restore(id, AdminContext.requireId(), AdminContext.account(),
                com.siyige.auth.ClientIp.of(http)));
    }

    @Require(Perm.VIDEO_READ)
    @GetMapping("/rules")
    public Map<String, Object> rules() {
        return service.rules();
    }
}
