package com.siyige.admin.config;

import com.siyige.admin.AdminContext;
import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 参数管理接口（设计方案 §6）。
 *
 * <pre>
 *   GET  /api/admin/config            全部参数（带当前值 + 来源：数据库 / 默认值）
 *   POST /api/admin/config            改一个 {key, value} -> 落库 + 立刻生效
 *   GET  /api/admin/config/log?key=   修改历史（默认最近 50 条）
 *   POST /api/admin/config/rollback   回滚到某一条历史 {logId}
 * </pre>
 *
 * <p><b>权限：全部 {@link Perm#ADMIN_MANAGE}（只有超管）</b>。理由（设计 §6）：
 * 这些参数直接影响**钱**（服务费、赠送）与**功能开关**（复核台、基础版），
 * 不该让运营随手改。以后要让运营改部分参数，再给 {@link ConfigKey} 加 editableBy 字段；
 * 本期不做，所以这里**不按分组拆权限**。
 *
 * <p><b>审计写自己的历史表</b>（sy_config_log，在 {@link ConfigService#set} 里落），
 * **不写 sy_audit_log**：处理记录页只放内容处置，参数变更在参数页的历史里看，语义更清楚。
 *
 * <p>错误体走 {@link com.siyige.admin.AdminErrors}（管理端统一 {@code {code,message}}）：
 * 校验失败 400 {@code INVALID_PARAM}，键名不认识 400，历史不存在 400。
 */
@RestController
@RequestMapping("/api/admin/config")
@Require(Perm.ADMIN_MANAGE)
public class ConfigController {

    /** 历史默认条数（设计 §6）。 */
    private static final int LOG_DEFAULT = 50;

    private final ConfigService cfg;

    public ConfigController(ConfigService cfg) {
        this.cfg = cfg;
    }

    /** 全部参数：前端按 {@code group} 分组渲染，按 {@code source} 显示"来源"。 */
    @GetMapping
    public Map<String, Object> list() {
        List<Map<String, Object>> items = cfg.list();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("groups", cfg.groups());
        out.put("total", items.size());
        return out;
    }

    /** 改一个参数：校验 -> 落库 -> 失效缓存 -> 记历史；返回改完的那一项。 */
    @PostMapping
    public Map<String, Object> update(@RequestBody(required = false) SetRequest body) {
        if (body == null || body.key() == null || body.key().isBlank()) {
            throw new IllegalArgumentException("INVALID_PARAM: 缺少参数 key");
        }
        Map<String, Object> item = cfg.set(body.key(), body.value(), AdminContext.account());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("item", item);
        out.put("by", AdminContext.account());
        return out;
    }

    /** 修改历史（倒序）。不传 key = 全部参数。 */
    @GetMapping("/log")
    public Map<String, Object> log(@RequestParam(required = false) String key,
                                   @RequestParam(defaultValue = "" + LOG_DEFAULT) int limit) {
        List<Map<String, Object>> items = cfg.history(key, limit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        out.put("key", key);
        out.put("limit", Math.min(ConfigService.HISTORY_MAX, Math.max(1, limit)));
        return out;
    }

    /** 回滚到某一条历史（回滚本身也会记一条，谁回滚的同样留痕）。 */
    @PostMapping("/rollback")
    public Map<String, Object> rollback(@RequestBody(required = false) RollbackRequest body) {
        if (body == null || body.logId() == null) {
            throw new IllegalArgumentException("INVALID_PARAM: 缺少 logId");
        }
        Map<String, Object> item = cfg.rollback(body.logId(), AdminContext.account());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("item", item);
        out.put("by", AdminContext.account());
        return out;
    }

    /** 改参数入参：{@code { "key": "tag.max-per-post", "value": "2" }}（value 一律按字符串传）。 */
    public record SetRequest(String key, String value) { }

    /** 回滚入参：{@code { "logId": 12 }}。 */
    public record RollbackRequest(Long logId) { }
}
