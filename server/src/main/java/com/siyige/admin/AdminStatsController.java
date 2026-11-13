package com.siyige.admin;

import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 管理端：顶部统计卡片。 */
@RestController
@RequestMapping("/api/admin/stats")
public class AdminStatsController {

    private final AdminStatsService service;

    public AdminStatsController(AdminStatsService service) {
        this.service = service;
    }

    @Require(Perm.ANALYTICS_READ)
    @GetMapping
    public Map<String, Object> stats() {
        return service.stats();
    }
}
