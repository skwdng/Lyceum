package com.siyige.admin;

import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import com.siyige.auth.ClientIp;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;

/**
 * 标签管理（T3）：列表 / 预置 / 改名（撞名自动合并） / 删除。
 *
 * <p>权限统一挂 {@link Perm#CONTENT_MODERATE}（与内容处置同一个权限点）：
 * 能改内容的运营/审核就能管标签；VIEWER 一个写操作都进不来。
 *
 * <p>审计：三个写操作都记 `sy_audit_log`（target_type=TAG、source=MANUAL、report_id=0），
 * 且**不可恢复**（详见 {@link AuditLogRepo} 与 {@link RestoreService} 的 TAG 分支）。
 */
@RestController
@RequestMapping("/api/admin/tags")
@Require(Perm.CONTENT_MODERATE)
public class AdminTagController {

    private final AdminTagService service;

    public AdminTagController(AdminTagService service) {
        this.service = service;
    }

    /** 列表：含**没人用过**的标签（后台要能清理脏标签），按使用次数降序。 */
    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return service.list(q, page, size);
    }

    /** 预置一个官方标签（重名直接返回已有的那个，不报错）。 */
    @PostMapping
    public Map<String, Object> create(@RequestBody AdminDtos.CreateTagRequest body, HttpServletRequest http) {
        return service.create(body == null ? null : body.name(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    /**
     * 改名。新名撞上已有标签时**自动合并**（源标签消失、帖子挂到目标、计数相加），
     * 响应里 {@code merged=true}，前端据此提示「已并入」。
     */
    @PostMapping("/{id}/rename")
    public Map<String, Object> rename(@PathVariable long id,
                                      @RequestBody AdminDtos.RenameTagRequest body,
                                      HttpServletRequest http) {
        return service.rename(id, body == null ? null : body.name(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }

    /** 删除：先断关联再删标签（帖子保留其它标签）。响应带 affected = 受影响帖子数。 */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable long id, HttpServletRequest http) {
        return service.delete(id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
    }
}
