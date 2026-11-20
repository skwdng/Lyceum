package com.siyige.admin.alert;

import com.siyige.admin.AdminContext;
import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.Require;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理台告警接口（设计 §5）。
 *
 * <p><b>权限（与设计要求的一点偏差，已确认理由）</b>：设计写的是"全部挂
 * {@link Perm#ANALYTICS_READ}（MOD / VIEWER 看不到告警）"，但既有 RBAC 矩阵里
 * **VIEWER 也有 `analytics:read`**（它是"能看所有列表、不能写"的只读角色）。
 * 如果写操作也挂它，VIEWER 就能把告警标记已处理，违背只读语义。
 * 所以：**读**（列表 / 未读数 / 静音列表 / SSE）挂 `ANALYTICS_READ`，
 * **写**（已处理 / 撤回 / 静音 / 手动扫描）挂 `REPORT_RESOLVE`。
 * 结果：MOD 看不到页面（无 analytics:read）；VIEWER 能看列表但按不动按钮（写接口 403）。
 *
 * <p>⚠️ 告警的「标记已处理」**不写 sy_audit_log**（红线 3）：处理记录页只放内容处置动作，
 * 混进告警会让人看不懂；acked_by / acked_at / acked_note 本身就是留痕。
 *
 * <p>SSE 那条路径是**唯一**允许用 `?token=` 的（{@link com.siyige.admin.AdminAuthFilter} 里开了例外）：
 * 浏览器的 EventSource 不能设请求头。
 */
@RestController
@RequestMapping("/api/admin/alerts")
@Require(Perm.ANALYTICS_READ)
public class AlertController {

    private final AlertService alerts;
    private final AlertSse sse;

    public AlertController(AlertService alerts, AlertSse sse) {
        this.alerts = alerts;
        this.sse = sse;
    }

    /** 列表：默认只看未处理（`status=OPEN`），`status=ALL` 看全部。 */
    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String status,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return alerts.list(status == null || status.isBlank() ? "OPEN" : status, page, size);
    }

    /** 未处理数（顶栏红点；60 秒轮询兜底用）。 */
    @GetMapping("/unread")
    public Map<String, Object> unread() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("unread", alerts.unread());
        return out;
    }

    /**
     * SSE 通道：只推 `{unread}`。
     *
     * <p>鉴权走 `?token=`（唯一例外，见类注释）；建连后前端的第一次 /unread 仍会拉一次，
     * 所以这里不再补发历史。
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return sse.subscribe(AdminContext.requireId(), alerts.unread());
    }

    /**
     * 已处理（ACKED）。`note` 可选，落 acked_note。
     *
     * <p>**读用 ANALYTICS_READ、写用 REPORT_RESOLVE**（与设计要求不一样的地方，见类注释）：
     * RBAC 矩阵里 VIEWER 也有 `analytics:read`（"只读角色能看所有列表"），
     * 如果写操作也挂 ANALYTICS_READ，只读角色就能把告警标记成已处理 —— 这就破了自己的语义。
     * 挂 `report:resolve` 后：SUPER / OPS / MOD 能处置，VIEWER 403。
     */
    @PostMapping("/{id}/ack")
    @Require(value = {Perm.ANALYTICS_READ, Perm.REPORT_RESOLVE}, mode = Require.Mode.ALL)
    public Map<String, Object> ack(@PathVariable long id, @RequestBody(required = false) AckRequest body) {
        return alerts.ack(id, body == null ? null : body.note(), AdminContext.account());
    }

    /** 误点撤回：ACKED -> OPEN。 */
    @PostMapping("/{id}/reopen")
    @Require(value = {Perm.ANALYTICS_READ, Perm.REPORT_RESOLVE}, mode = Require.Mode.ALL)
    public Map<String, Object> reopen(@PathVariable long id) {
        return alerts.reopen(id);
    }

    /** 静音某规则到某时刻（epoch 毫秒，最多 30 天）。 */
    @PostMapping("/mute")
    @Require(value = {Perm.ANALYTICS_READ, Perm.REPORT_RESOLVE}, mode = Require.Mode.ALL)
    public Map<String, Object> mute(@RequestBody MuteRequest body) {
        return alerts.mute(body == null ? null : body.ruleKey(),
                body == null ? null : body.until(), AdminContext.account());
    }

    /** 解除静音。 */
    @PostMapping("/mute/{ruleKey}/off")
    @Require(value = {Perm.ANALYTICS_READ, Perm.REPORT_RESOLVE}, mode = Require.Mode.ALL)
    public Map<String, Object> unmute(@PathVariable String ruleKey) {
        int n = alerts.unmute(ruleKey);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ruleKey", ruleKey);
        out.put("removed", n);
        return out;
    }

    /** 当前仍有效的静音（界面上显示「已静音至 …」）。 */
    @GetMapping("/mutes")
    public Map<String, Object> mutes() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", alerts.mutes());
        out.put("rules", AlertRule.ALL);
        return out;
    }

    /**
     * 立即扫一次（验证用）。
     *
     * <p>作用：改阈值/造完数据后不用等 5 分钟；自检脚本也靠它把链路跑通。
     * 返回 `{raised, resolved, touched, skippedRules, unread}`。
     */
    @PostMapping("/scan")
    @Require(value = {Perm.ANALYTICS_READ, Perm.REPORT_RESOLVE}, mode = Require.Mode.ALL)
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

    /** 已处理入参：`{ "note": "已联系当事人" }`（可空）。 */
    public record AckRequest(String note) { }

    /** 静音入参：`{ "ruleKey": "USER_REPORT_BURST", "until": 1763000000000 }`。 */
    public record MuteRequest(String ruleKey, Long until) { }
}
