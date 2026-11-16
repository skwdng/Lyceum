package com.siyige.admin.alert;

import com.siyige.admin.AdminContext;
import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理台告警接口。
 *
 * <p>权限统一 {@link Perm#ANALYTICS_READ}（设计 §5）：MOD / VIEWER 本来就没有报表权限，
 * 也就不需要看告警 —— 不为它新增权限点。
 *
 * <p>A1 先只放「手动扫描」；列表 / 未读数 / 已处理 / 撤回 / 静音 / SSE 在 A2 加到这个类里。
 */
@RestController
@RequestMapping("/api/admin/alerts")
@Require(Perm.ANALYTICS_READ)
public class AlertController {

    private final AlertService alerts;

    public AlertController(AlertService alerts) {
        this.alerts = alerts;
    }

    /**
     * 立即扫一次（验证用）。
     *
     * <p>作用：改阈值/造完数据后不用等 5 分钟；自检脚本也靠它把链路跑通。
     * 返回 `{raised, resolved, touched, skippedRules, unread}`。
     */
    @PostMapping("/scan")
    public Map<String, Object> scan() {
        AlertService.ScanResult r = alerts.scan();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("raised", r.raised());
        out.put("resolved", r.resolved());
        out.put("touched", r.touched());
        out.put("skippedRules", r.skippedRules());
        out.put("unread", alerts.unread());
        out.put("by", AdminContext.account());
        return out;
    }
}
