package com.siyige.admin;

import com.siyige.community.TagRepo;
import com.siyige.community.TagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 标签管理的业务规则（T3）。
 *
 * <p>规范化 / 敏感词 / 限额**复用** {@link TagService#normalize}（唯一真源），
 * 这里只管"后台能做哪几件事"以及审计：
 * <ul>
 *   <li>预置标签（重名幂等返回已有的）</li>
 *   <li>改名：撞名 = **自动合并**（设计方案 §3：同义词只能靠它清掉，界面上不给独立合并按钮）</li>
 *   <li>删除：先断关联再删标签；帖子保留其它标签</li>
 * </ul>
 *
 * <p>每次变动都会 {@link TagService#invalidateHot()}，前台热门条立刻反映，不用等 60 秒缓存。
 */
@Service
public class AdminTagService {

    private static final Logger log = LoggerFactory.getLogger(AdminTagService.class);

    private final TagRepo repo;
    private final TagService tags;
    private final AuditLog audit;

    public AdminTagService(TagRepo repo, TagService tags, AuditLog audit) {
        this.repo = repo;
        this.tags = tags;
        this.audit = audit;
    }

    // ==================== 列表 ====================

    /** 后台列表：含 use_count = 0 的标签（要能清理），按使用次数降序。 */
    public Map<String, Object> list(String q, int page, int size) {
        String kw = TagService.collapseSpaces(q);
        String key = kw == null ? null : kw.toLowerCase(java.util.Locale.ROOT);
        int p = Math.max(1, page);
        int sz = Math.min(100, Math.max(1, size));

        long total = repo.countForAdmin(key);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.listForAdmin(key, (p - 1) * sz, sz);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(view(r));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        return out;
    }

    // ==================== 预置 ====================

    /**
     * 预置一个官方标签。
     *
     * <p>重名不报错，直接把已有的返回（`created=false`）——后台点两次不该看见红色错误。
     */
    @Transactional
    public Map<String, Object> create(String rawName, long adminId, String adminName, String ip) {
        TagService.Normalized nz = tags.normalize(rawName);
        Map<String, Object> exist = repo.findByKey(TagService.SCOPE_POST, nz.key());
        if (exist != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("created", false);
            out.put("tag", view(exist));
            return out;
        }
        long id = repo.insert(TagService.SCOPE_POST, nz.name(), nz.key(), adminName);
        if (id <= 0) throw new IllegalArgumentException("INTERNAL_ERROR: 标签创建失败，请重试");

        audit.record(adminId, adminName, AuditLogRepo.ACTION_TAG_CREATE, null,
                AuditLogRepo.TARGET_TAG, id, nz.name(), "后台预置标签「" + nz.name() + "」", ip);
        tags.invalidateHot();
        log.info("后台预置标签 id={} name={} by={}", id, nz.name(), adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", true);
        out.put("tag", view(repo.findById(id)));
        return out;
    }

    // ==================== 改名（撞名 = 合并） ====================

    /**
     * 改名；新名撞上已有标签就**合并**过去。
     *
     * <p>响应：
     * <pre>
     * { "merged": false, "tag": {…} }                                   // 普通改名
     * { "merged": true,  "mergedInto": {"id":3,"name":"AI"}, "moved": 8 } // 撞名合并
     * </pre>
     * 合并在同一事务里：迁关联（跳过已同时拥有两个标签的帖子）→ 断源关联 → 删源标签 → 重算目标计数。
     */
    @Transactional
    public Map<String, Object> rename(long id, String rawName, long adminId, String adminName, String ip) {
        Map<String, Object> src = repo.findById(id);
        if (src == null) throw new IllegalArgumentException("TAG_NOT_FOUND: 标签不存在（可能已被删除）");

        String oldName = String.valueOf(src.get("name"));
        TagService.Normalized nz = tags.normalize(rawName);
        long affected = repo.countPostsOfTag(id);

        Map<String, Object> exist = repo.findByKey(TagService.SCOPE_POST, nz.key());
        long existId = exist == null ? -1 : num(exist.get("id"));

        if (existId > 0 && existId != id) {
            // 撞名 → 合并到已有的那个
            long targetId = existId;
            String targetName = String.valueOf(exist.get("name"));
            long moved = repo.mergeInto(id, targetId);
            tags.invalidateHot();

            audit.record(adminId, adminName, AuditLogRepo.ACTION_TAG_MERGE, null,
                    AuditLogRepo.TARGET_TAG, targetId, targetName,
                    "把「" + oldName + "」并入「" + targetName + "」，迁移 " + moved + " 篇帖子的关联"
                            + "（源标签 #" + id + " 已删除）", ip);
            log.info("标签合并 {}「{}」-> {}「{}」moved={} by={}", id, oldName, targetId, targetName, moved, adminName);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("merged", true);
            out.put("moved", moved);
            Map<String, Object> into = new LinkedHashMap<>();
            into.put("id", targetId);
            into.put("name", targetName);
            out.put("mergedInto", into);
            out.put("tag", view(repo.findById(targetId)));
            return out;
        }

        // 普通改名（含只改大小写：key 相同但展示名变了）
        repo.rename(id, nz.name(), nz.key());
        tags.invalidateHot();
        audit.record(adminId, adminName, AuditLogRepo.ACTION_TAG_RENAME, null,
                AuditLogRepo.TARGET_TAG, id, oldName,
                "标签改名「" + oldName + "」→「" + nz.name() + "」，影响 " + affected + " 篇帖子", ip);
        log.info("标签改名 {}「{}」->「{}」by={}", id, oldName, nz.name(), adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("merged", false);
        out.put("tag", view(repo.findById(id)));
        return out;
    }

    // ==================== 删除 ====================

    /** 删除标签：先断关联再删标签（帖子保留其它标签），返回受影响的帖子数。 */
    @Transactional
    public Map<String, Object> delete(long id, long adminId, String adminName, String ip) {
        Map<String, Object> src = repo.findById(id);
        if (src == null) throw new IllegalArgumentException("TAG_NOT_FOUND: 标签不存在（可能已被删除）");

        String name = String.valueOf(src.get("name"));
        long affected = repo.countPostsOfTag(id);
        repo.deleteTag(id);
        tags.invalidateHot();

        audit.record(adminId, adminName, AuditLogRepo.ACTION_TAG_DELETE, null,
                AuditLogRepo.TARGET_TAG, id, name,
                "删除标签「" + name + "」，解除 " + affected + " 篇帖子的关联", ip);
        log.info("删除标签 {}「{}」affected={} by={}", id, name, affected, adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", true);
        out.put("affected", affected);
        return out;
    }

    // ==================== 出参 ====================

    /** 行 -> 出参：固定 camelCase（H2 列名是大写，直接吐出去前端得猜）。 */
    private static Map<String, Object> view(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        Object id = r.get("id");
        m.put("id", id instanceof Number n ? n.longValue() : id);
        m.put("name", r.get("name"));
        Object used = r.get("use_count");
        m.put("useCount", used instanceof Number n ? n.intValue() : 0);
        m.put("createdBy", r.get("created_by"));
        Object at = r.get("created_at");
        m.put("createdAt", at instanceof java.sql.Timestamp t ? t.getTime()
                : at instanceof java.time.LocalDateTime ldt
                        ? ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                        : at);
        return m;
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }
}
