package com.siyige.admin;

import com.siyige.repo.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 辩题审核（管理端）。
 *
 * <p>规则（来自设计方案 §6）：**不改"自定义题先待审"** —— 那会阻塞用户开局（点了开打却在等人工）。
 * 保持 AI 单审为准，人工只做「事后下架」和「驳回留痕」。
 *
 * <p>写库复用既有 `Store.markModeration(id, status, reason)`（原本零调用方），不另写一条 update。
 */
@Service
public class AdminTopicService {

    private static final Logger log = LoggerFactory.getLogger(AdminTopicService.class);

    static final int SIZE_MAX = 50;
    static final int SIZE_DEFAULT = 20;

    /** mod_status 取值：PASS（正常）/ REJECT（驳回、下架）/ NEED_EDIT（待修改）/ pending（待审）。 */
    static final List<String> STATUSES = List.of("PASS", "REJECT", "NEED_EDIT", "pending");

    private final AdminTopicRepo repo;
    private final Store store;

    public AdminTopicService(AdminTopicRepo repo, Store store) {
        this.repo = repo;
        this.store = store;
    }

    public Map<String, Object> topics(String modStatus, String source, String q, int page, int size) {
        int p = Math.max(1, page);
        int s = size <= 0 ? SIZE_DEFAULT : Math.min(size, SIZE_MAX);
        long total = repo.count(modStatus, source, q);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.list(modStatus, source, q, (p - 1) * s, s);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(view(r));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    /** 通过：`mod_status = PASS`。 */
    public void approve(String id) {
        requireTopic(id);
        store.markModeration(id, "PASS", null);
        log.info("辩题通过 id={} by={}", id, AdminContext.account());
    }

    /** 驳回：必须带理由（留痕）。 */
    public void reject(String id, String reason) {
        requireTopic(id);
        String why = reason == null ? "" : reason.trim();
        if (why.isEmpty()) {
            throw new IllegalArgumentException("INVALID_PARAM: 驳回必须填理由（留痕用）");
        }
        store.markModeration(id, "REJECT", truncate(why));
        log.info("辩题驳回 id={} reason={} by={}", id, why, AdminContext.account());
    }

    /**
     * 下架（已上架的题事后撤下）。
     *
     * <p>实现上等同"驳回"：`mod_status = REJECT`，前台 `Store.topics()` 会把它过滤掉，
     * 而管理端这条查询不过滤，所以仍然查得到、还能再改回 PASS。
     */
    public void offline(String id, String reason) {
        requireTopic(id);
        String why = reason == null ? "" : reason.trim();
        store.markModeration(id, "REJECT", truncate(why.isEmpty() ? "管理员下架" : why));
        log.info("辩题下架 id={} reason={} by={}", id, why, AdminContext.account());
    }

    private void requireTopic(String id) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("INVALID_PARAM: id 不能为空");
        if (repo.find(id) == null) throw new IllegalArgumentException("TOPIC_NOT_FOUND: 辩题不存在");
    }

    private static String truncate(String s) {
        return s.length() <= 300 ? s : s.substring(0, 300);   // 列宽 varchar(300)
    }

    private static Map<String, Object> view(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", str(r.get("id")));
        m.put("title", str(r.get("title")));
        m.put("cat", str(r.get("cat")));
        m.put("diff", str(r.get("diff")));
        m.put("source", str(r.get("source")));
        m.put("plays", r.get("plays") == null ? 0 : ((Number) r.get("plays")).longValue());
        m.put("modStatus", r.get("mod_status") == null ? "PASS" : str(r.get("mod_status")));
        m.put("modReason", str(r.get("mod_reason")));
        m.put("modAt", millis(r.get("mod_at")));
        return m;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long millis(Object ts) {
        if (ts == null) return null;
        if (ts instanceof java.sql.Timestamp t) return t.getTime();
        if (ts instanceof java.time.Instant i) return i.toEpochMilli();
        return null;
    }
}
