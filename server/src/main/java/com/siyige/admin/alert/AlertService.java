package com.siyige.admin.alert;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 告警的扫描与处理（设计方案 §3、§4）。
 *
 * <p>一次扫描做四件事（每条规则独立判定，互不影响）：
 * <ol>
 *   <li><b>人</b> USER_REPORT_BURST：24 小时内被举报次数 &gt; 阈值的用户</li>
 *   <li><b>内容</b> POST_REPORT_BURST：同一条帖子/评论被举报次数 &gt; 阈值</li>
 *   <li><b>积压</b> REPORT_BACKLOG：全局 PENDING 举报数 &gt; 阈值</li>
 *   <li><b>活跃缺失</b> DAU_MISSING：昨天的 `sy_daily_active` 一行都没有（CRIT）</li>
 * </ol>
 *
 * <p><b>不用 join</b>（红线 4）：先单表聚合出"哪些内容被举报了多少次"，
 * 再 `in` 批量查这些内容的作者，最后在应用层按作者累加。
 *
 * <p>去重在 {@link #raise}：同对象当天已有 OPEN 只 `touch`（更新 metric / last_seen），
 * 靠唯一索引 + 捕获冲突兜住并发，所以一天只会为同一个对象报一次。
 *
 * <p>指标回落：本规则下"这次不再超标"的 OPEN 转 RESOLVED；**ACKED 永远不动**
 * （人点过「已处理」，不该因为指标掉下去又自己变回未处理，设计 §4）。
 */
@Service
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);

    private final AlertRepo repo;
    private final AlertSse sse;

    public AlertService(AlertRepo repo, AlertSse sse) {
        this.repo = repo;
        this.sse = sse;
    }

    // ==================== 扫描 ====================

    /** 一次扫描的结果（给手动接口与日志用）。 */
    public record ScanResult(int raised, int resolved, int touched, List<String> skippedRules) { }

    /**
     * 扫一遍并落库。
     *
     * <p>手动接口与定时任务都走这里（一条逻辑，不会出现"手动能报、定时不报"）。
     */
    @Transactional
    public ScanResult scan() {
        Timestamp now = Timestamp.from(Instant.now());
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        List<String> skipped = new ArrayList<>();
        int raised = 0;
        int resolved = 0;
        int touched = 0;

        // ① 一次聚合，两条规则共用（把 having 挪到 Java：按人累加要看到**全部**举报，
        //    不能只看"单条内容就已超标"的那几行，否则 5 篇各 2 次举报的用户会被漏掉）
        Timestamp since = Timestamp.from(Instant.now().minus(Duration.ofHours(AlertRule.WINDOW_HOURS)));
        List<Map<String, Object>> rows = repo.reportBurstsSince(since, 0);

        // ---------- ② 内容类 ----------
        if (muted(AlertRule.POST_REPORT_BURST, skipped)) {
            log.debug("跳过内容告警：规则被静音");
        } else {
            Set<String> stillHot = new HashSet<>();
            for (Map<String, Object> row : rows) {
                String targetType = str(row.get("target_type"));
                String targetId = str(row.get("target_id"));
                long cnt = num(row.get("cnt"));
                if (cnt <= AlertRule.REPORT_THRESHOLD) continue;      // 正好等于阈值不报

                stillHot.add(targetKey(targetType, targetId));
                String key = AlertRule.contentKey(targetType, targetId, today);
                String title = "内容 " + targetType + "#" + targetId + " " + AlertRule.WINDOW_HOURS
                        + " 小时内被举报 " + cnt + " 次";
                Result r = raise(AlertRule.POST_REPORT_BURST, targetType, targetId,
                        AlertRule.LEVEL_WARN, title, null, cnt, key, now);
                if (r == Result.RAISED) raised++;
                else if (r == Result.TOUCHED) touched++;
            }
            resolved += resolveStale(AlertRule.POST_REPORT_BURST, stillHot, now);
        }

        // ---------- ③ 人类（两步查询 + 应用层累加） ----------
        if (muted(AlertRule.USER_REPORT_BURST, skipped)) {
            log.debug("跳过用户告警：规则被静音");
        } else {
            Map<String, Long> perUser = sumByAuthor(rows);
            Set<String> stillHot = new HashSet<>();
            for (Map.Entry<String, Long> e : perUser.entrySet()) {
                String userId = e.getKey();
                long total = e.getValue();
                if (total <= AlertRule.REPORT_THRESHOLD) continue;

                stillHot.add(targetKey("USER", userId));      // 与 resolveStale 里的键拼法必须一致
                String key = AlertRule.userKey(userId, today);
                String title = "用户 " + userId + " " + AlertRule.WINDOW_HOURS + " 小时内被举报 " + total + " 次";
                Result r = raise(AlertRule.USER_REPORT_BURST, "USER", userId,
                        AlertRule.LEVEL_WARN, title, null, total, key, now);
                if (r == Result.RAISED) raised++;
                else if (r == Result.TOUCHED) touched++;
            }
            resolved += resolveStale(AlertRule.USER_REPORT_BURST, stillHot, now);
        }

        // ---------- ④ 全局积压 ----------
        if (muted(AlertRule.REPORT_BACKLOG, skipped)) {
            log.debug("跳过积压告警：规则被静音");
        } else {
            long pending = repo.countPendingReports();
            if (pending > AlertRule.BACKLOG_THRESHOLD) {
                Timestamp oldest = repo.oldestPendingAt();
                long hours = oldest == null ? 0
                        : Math.max(0, Duration.between(oldest.toInstant(), Instant.now()).toHours());
                String key = AlertRule.backlogKey(today);
                Result r = raise(AlertRule.REPORT_BACKLOG, null, null, AlertRule.LEVEL_WARN,
                        "举报积压 " + pending + " 条（阈值 " + AlertRule.BACKLOG_THRESHOLD + "）",
                        "最老一条已等待 " + hours + " 小时", pending, key, now);
                if (r == Result.RAISED) raised++;
                else if (r == Result.TOUCHED) touched++;
                resolved += resolveStale(AlertRule.REPORT_BACKLOG, Set.of(GLOBAL_KEY), now);
            } else {
                // 没超标 -> 该规则的 OPEN 全部回落
                resolved += resolveStale(AlertRule.REPORT_BACKLOG, Set.of(), now);
            }
        }

        // ---------- ⑤ 活跃统计缺失（自己检查自己） ----------
        if (muted(AlertRule.DAU_MISSING, skipped)) {
            log.debug("跳过 DAU 告警：规则被静音");
        } else {
            LocalDate yesterday = today.minusDays(1);
            if (!repo.hasDailyActive(yesterday)) {
                String key = AlertRule.dauKey(yesterday);
                Result r = raise(AlertRule.DAU_MISSING, null, null, AlertRule.LEVEL_CRIT,
                        "活跃统计缺失：" + yesterday + " 没有落库数据",
                        "说明昨晚 00:05 的统计任务没跑成功", 0, key, now);
                if (r == Result.RAISED) raised++;
                else if (r == Result.TOUCHED) touched++;
                resolved += resolveStale(AlertRule.DAU_MISSING, Set.of(GLOBAL_KEY), now);
            } else {
                resolved += resolveStale(AlertRule.DAU_MISSING, Set.of(), now);
            }
        }

        long unread = repo.countOpen();
        if (raised > 0 || resolved > 0) {
            sse.broadcastUnread(unread);          // 红点立刻变，不用等前端轮询
        }
        log.info("告警扫描完成：新增 {} / 更新 {} / 回落 {} / 未处理 {} / 静音跳过 {}",
                raised, touched, resolved, unread, skipped);
        return new ScanResult(raised, resolved, touched, skipped);
    }

    /** 按作者累加（帖子走 author_id，评论走 user_id；两步查询的结果在这里合并）。 */
    private Map<String, Long> sumByAuthor(List<Map<String, Object>> rows) {
        List<Long> postIds = new ArrayList<>();
        List<Long> commentIds = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String type = str(row.get("target_type"));
            Long id = longOrNull(row.get("target_id"));
            if (id == null) continue;
            if ("POST".equals(type)) postIds.add(id);
            else if ("COMMENT".equals(type)) commentIds.add(id);
        }
        Map<Long, String> postAuthor = repo.authorsOfPosts(postIds);
        Map<Long, String> commentAuthor = repo.authorsOfComments(commentIds);

        Map<String, Long> perUser = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String type = str(row.get("target_type"));
            Long id = longOrNull(row.get("target_id"));
            if (id == null) continue;
            String author = "POST".equals(type) ? postAuthor.get(id) : commentAuthor.get(id);
            if (author == null) continue;                     // 内容已被彻底删掉：跳过
            perUser.merge(author, num(row.get("cnt")), Long::sum);
        }
        return perUser;
    }

    // ==================== raise（去重的全部秘密） ====================

    private enum Result { RAISED, TOUCHED, SKIPPED }

    /**
     * 报一条告警（幂等）。
     *
     * <ol>
     *   <li>已有同对象的 OPEN → 只更新 metric / last_seen（不推送）</li>
     *   <li>没有 → 插；撞唯一索引（并发/已 ACK 后当天又扫）→ 当作已存在，不推送</li>
     *   <li>真插入 → 由调用方统计 raised，扫描结束后统一推一次未读数</li>
     * </ol>
     */
    private Result raise(String ruleKey, String targetType, String targetId, String level,
                         String title, String detail, long metric, String dedupKey, Timestamp now) {
        Map<String, Object> open = repo.findOpen(ruleKey, targetType, targetId);
        if (open != null) {
            repo.touch(num(open.get("id")), metric, title, detail, now);
            return Result.TOUCHED;
        }
        long id = repo.insertIfAbsent(ruleKey, targetType, targetId, level, title, detail, metric, dedupKey, now);
        if (id <= 0) {
            // 撞唯一键 = 当天这个对象已经报过（可能是 ACKED / RESOLVED），不再打扰
            return Result.SKIPPED;
        }
        log.info("新告警 {} {}#{} metric={}", ruleKey, targetType, targetId, metric);
        return Result.RAISED;
    }

    /** 把该规则下"这次不再超标"的 OPEN 转 RESOLVED，返回条数。 */
    private int resolveStale(String ruleKey, Set<String> stillHot, Timestamp now) {
        int n = 0;
        for (Map<String, Object> row : repo.openOfRule(ruleKey)) {
            long id = num(row.get("id"));
            String key = targetKey(str(row.get("target_type")), str(row.get("target_id")));
            if (stillHot.contains(key)) continue;
            int done = repo.resolve(id);
            n += done;
            if (done > 0) log.info("告警回落 {} #{}（key={} 已不再超标）", ruleKey, id, key);
        }
        return n;
    }

    /** 全局类规则（没有对象）在"仍然超标"集合里的统一键。 */
    private static final String GLOBAL_KEY = "G";

    private static String targetKey(String type, String id) {
        return type == null ? GLOBAL_KEY : type + ":" + id;
    }

    // ==================== 静音 ====================

    private boolean muted(String ruleKey, List<String> skipped) {
        Timestamp until = repo.mutedUntil(ruleKey);
        if (until == null) return false;
        skipped.add(ruleKey);
        return true;
    }

    /**
     * 静音到某时刻（`until` = epoch 毫秒）。
     *
     * <p>上限 30 天：静音是为了"别吵我"，不是"永久关闭告警"——
     * 真要长期关，应该改阈值或删规则，而不是让它静悄悄失效。
     */
    public Map<String, Object> mute(String ruleKey, Long untilMillis, String by) {
        if (!AlertRule.isKnown(ruleKey)) {
            throw new IllegalArgumentException("INVALID_PARAM: 未知规则 " + ruleKey);
        }
        long until = untilMillis == null ? 0L : untilMillis;
        long now = System.currentTimeMillis();
        if (until <= now) {
            throw new IllegalArgumentException("INVALID_PARAM: 静音截止时间必须晚于现在");
        }
        if (until > now + Duration.ofDays(30).toMillis()) {
            throw new IllegalArgumentException("INVALID_PARAM: 静音最多 30 天");
        }
        repo.mute(ruleKey, new Timestamp(until), by);
        log.info("静音规则 {} 至 {} by={}", ruleKey, Instant.ofEpochMilli(until), by);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ruleKey", ruleKey);
        out.put("until", until);
        return out;
    }

    public int unmute(String ruleKey) {
        return repo.unmute(ruleKey);
    }

    public List<Map<String, Object>> mutes() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : repo.activeMutes()) {
            Map<String, Object> m = new LinkedHashMap<>();
            String ruleKey = str(row.get("rule_key"));
            m.put("ruleKey", ruleKey);
            m.put("label", AlertRule.label(ruleKey));
            Object until = row.get("muted_until");
            m.put("until", until instanceof Timestamp t ? t.getTime() : until);
            m.put("mutedBy", row.get("muted_by"));
            out.add(m);
        }
        return out;
    }

    // ==================== 读与处理 ====================

    public long unread() {
        return repo.countOpen();
    }

    public Map<String, Object> list(String status, int page, int size) {
        String st = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)
                ? null : status.trim().toUpperCase();
        int p = Math.max(1, page);
        int sz = Math.min(100, Math.max(1, size));

        long total = repo.countByStatus(st);
        List<Map<String, Object>> rows = total == 0 ? List.of() : repo.list(st, (p - 1) * sz, sz);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(view(r));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        out.put("unread", repo.countOpen());
        out.put("openTotal", repo.countByStatus(AlertRule.STATUS_OPEN));
        out.put("mutes", mutes());
        return out;
    }

    /** 已处理：**不写 sy_audit_log**（红线 3），acked_by / acked_at / acked_note 本身就是留痕。 */
    public Map<String, Object> ack(long id, String note, String by) {
        Map<String, Object> row = repo.find(id);
        if (row == null) throw new IllegalArgumentException("ALERT_NOT_FOUND: 告警不存在");
        String status = str(row.get("status"));
        if (!AlertRule.STATUS_OPEN.equals(status)) {
            throw new IllegalArgumentException("ALERT_NOT_OPEN: 这条告警当前是 " + status + "，只有未处理的才能标记");
        }
        int n = repo.ack(id, by, note);
        if (n == 0) throw new IllegalArgumentException("ALERT_NOT_OPEN: 状态已变化，请刷新后再试");

        long unread = repo.countOpen();
        sse.broadcastUnread(unread);
        log.info("告警已处理 id={} by={} 未处理剩 {}", id, by, unread);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("status", AlertRule.STATUS_ACKED);
        out.put("unread", unread);
        return out;
    }

    /** 误点撤回：ACKED -> OPEN。 */
    public Map<String, Object> reopen(long id) {
        Map<String, Object> row = repo.find(id);
        if (row == null) throw new IllegalArgumentException("ALERT_NOT_FOUND: 告警不存在");
        if (!AlertRule.STATUS_ACKED.equals(str(row.get("status")))) {
            throw new IllegalArgumentException("ALERT_NOT_ACKED: 只有已处理的告警才能撤回");
        }
        int n = repo.reopen(id);
        if (n == 0) throw new IllegalArgumentException("ALERT_NOT_ACKED: 状态已变化，请刷新后再试");

        long unread = repo.countOpen();
        sse.broadcastUnread(unread);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("status", AlertRule.STATUS_OPEN);
        out.put("unread", unread);
        return out;
    }

    // ==================== 出参 ====================

    /** 行 -> 出参：固定 camelCase（H2 列名大写，直接吐出去前端要猜大小写）。 */
    private static Map<String, Object> view(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", numOrNull(r.get("id")));
        String ruleKey = str(r.get("rule_key"));
        m.put("ruleKey", ruleKey);
        m.put("ruleLabel", AlertRule.label(ruleKey));
        m.put("targetType", r.get("target_type"));
        m.put("targetId", r.get("target_id"));
        m.put("level", r.get("level"));
        m.put("title", r.get("title"));
        m.put("detail", r.get("detail"));
        m.put("metric", numOrNull(r.get("metric")));
        m.put("status", r.get("status"));
        m.put("ackedBy", r.get("acked_by"));
        m.put("ackedNote", r.get("acked_note"));
        m.put("ackedAt", millis(r.get("acked_at")));
        m.put("resolvedAt", millis(r.get("resolved_at")));
        m.put("firstSeen", millis(r.get("first_seen")));
        m.put("lastSeen", millis(r.get("last_seen")));
        return m;
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }

    private static long num(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v == null) return 0L;
        try { return Long.parseLong(String.valueOf(v)); } catch (NumberFormatException e) { return 0L; }
    }

    private static Long numOrNull(Object v) {
        if (v instanceof Number n) return n.longValue();
        return null;
    }

    private static Long longOrNull(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v == null) return null;
        try { return Long.parseLong(String.valueOf(v)); } catch (NumberFormatException e) { return null; }
    }

    private static Long millis(Object v) {
        if (v instanceof Timestamp t) return t.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (v instanceof Number n) return n.longValue();
        return null;
    }
}
