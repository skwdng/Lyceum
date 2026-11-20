package com.siyige.community;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 标签两表（`sy_tag` + `sy_post_tag`）的 SQL 集中在这里。
 *
 * <p>只做读写，不做业务判断：规范化、限额、敏感词、合并规则都在 {@link TagService}。
 *
 * <p><b>use_count 一律重算，不做 +1/-1</b>（设计方案 §1）：增量有四个入口
 * （发帖加标签、编辑删标签、后台删标签、改名合并），漏一个就永久漂移；
 * 重算走 `ix_post_tag_tag`，千级数据微秒级，永远不会算错。
 */
@Repository
public class TagRepo {

    private final JdbcTemplate jdbc;

    public TagRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ==================== 读 ====================

    /** 按归一化键找（唯一性判断就用它）。 */
    public Map<String, Object> findByKey(String scope, String nameKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, name_key, scope, use_count, created_by, created_at "
                        + "from sy_tag where scope = ? and name_key = ?", scope, nameKey);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, name_key, scope, use_count, created_by, created_at "
                        + "from sy_tag where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 联想：`name_key like %q%`，只返回**用过的**（use_count > 0），按使用次数降序。 */
    public List<Map<String, Object>> suggest(String scope, String qKey, int limit) {
        if (qKey == null || qKey.isEmpty()) {
            return jdbc.queryForList(
                    "select id, name, use_count from sy_tag where scope = ? and use_count > 0 "
                            + "order by use_count desc, id asc limit ?", scope, limit);
        }
        return jdbc.queryForList(
                "select id, name, use_count from sy_tag where scope = ? and use_count > 0 "
                        + "and name_key like ? order by use_count desc, id asc limit ?",
                scope, "%" + qKey + "%", limit);
    }

    /** 热门：按使用次数降序（社区页顶部标签条）。 */
    public List<Map<String, Object>> hot(String scope, int limit) {
        return jdbc.queryForList(
                "select id, name, use_count from sy_tag where scope = ? and use_count > 0 "
                        + "order by use_count desc, id asc limit ?", scope, limit);
    }

    /** 后台列表：含未使用的标签（要能清理脏标签）。 */
    public long countForAdmin(String qKey) {
        if (qKey == null || qKey.isEmpty()) {
            Long n = jdbc.queryForObject("select count(*) from sy_tag where scope = 'POST'", Long.class);
            return n == null ? 0 : n;
        }
        Long n = jdbc.queryForObject(
                "select count(*) from sy_tag where scope = 'POST' and name_key like ?", Long.class,
                "%" + qKey + "%");
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> listForAdmin(String qKey, int offset, int limit) {
        if (qKey == null || qKey.isEmpty()) {
            return jdbc.queryForList(
                    "select id, name, use_count, created_by, created_at from sy_tag where scope = 'POST' "
                            + "order by use_count desc, id asc limit ? offset ?", limit, offset);
        }
        return jdbc.queryForList(
                "select id, name, use_count, created_by, created_at from sy_tag where scope = 'POST' "
                        + "and name_key like ? order by use_count desc, id asc limit ? offset ?",
                "%" + qKey + "%", limit, offset);
    }

    /** 一篇帖子的标签（详情页用）。 */
    public List<Map<String, Object>> tagsOfPost(long postId) {
        return jdbc.queryForList(
                "select t.id, t.name from sy_post_tag pt join sy_tag t on t.id = pt.tag_id "
                        + "where pt.post_id = ? order by t.name_key asc, t.id asc", postId);
    }

    /**
     * 一页帖子的标签（列表用，**一次批量查，避免 N+1**）。
     *
     * @return postId -> [{id,name}]（没有标签的帖子不出现在 map 里）
     */
    public Map<Long, List<Map<String, Object>>> tagsByPostIds(Collection<Long> postIds) {
        if (postIds == null || postIds.isEmpty()) return Collections.emptyMap();
        String placeholders = String.join(",", Collections.nCopies(postIds.size(), "?"));
        List<Object> args = new ArrayList<>(postIds);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select pt.post_id, t.id, t.name from sy_post_tag pt join sy_tag t on t.id = pt.tag_id "
                        + "where pt.post_id in (" + placeholders + ") order by pt.post_id, t.name_key, t.id",
                args.toArray());

        Map<Long, List<Map<String, Object>>> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            long postId = ((Number) r.get("post_id")).longValue();
            Map<String, Object> tag = new LinkedHashMap<>();
            tag.put("id", ((Number) r.get("id")).longValue());
            tag.put("name", r.get("name"));
            out.computeIfAbsent(postId, k -> new ArrayList<>()).add(tag);
        }
        return out;
    }

    /** 一个标签当前挂了多少篇帖子（改名合并/删除确认文案要用真实数字）。 */
    public long countPostsOfTag(long tagId) {
        Long n = jdbc.queryForObject("select count(*) from sy_post_tag where tag_id = ?", Long.class, tagId);
        return n == null ? 0 : n;
    }

    public List<Long> tagIdsOfPost(long postId) {
        return jdbc.queryForList("select tag_id from sy_post_tag where post_id = ?", Long.class, postId);
    }

    // ==================== 写 ====================

    /**
     * 建标签，返回自增 id。
     *
     * <p>用显式 SQL 而不是 {@code SimpleJdbcInsert}：后者在没指定列时会**把表里所有列都写一遍**
     * （没给的列写 null），而 `use_count` 是 `not null default 0` → H2 直接报
     * "NULL not allowed for column USE_COUNT"。写死列名顺手把 use_count 显式置 0 更不容易踩坑。
     */
    public long insert(String scope, String name, String nameKey, String createdBy) {
        jdbc.update("insert into sy_tag(name, name_key, scope, use_count, created_by) values(?, ?, ?, 0, ?)",
                name, nameKey, scope, createdBy);
        Long id = jdbc.queryForObject(
                "select id from sy_tag where scope = ? and name_key = ?", Long.class, scope, nameKey);
        return id == null ? -1 : id;
    }

    /** 关联（已存在则忽略，返回 0）。 */
    public int attach(long postId, long tagId) {
        Integer exists = jdbc.queryForObject(
                "select count(*) from sy_post_tag where post_id = ? and tag_id = ?", Integer.class, postId, tagId);
        if (exists != null && exists > 0) return 0;
        return jdbc.update("insert into sy_post_tag(post_id, tag_id) values(?, ?)", postId, tagId);
    }

    public int detach(long postId, long tagId) {
        return jdbc.update("delete from sy_post_tag where post_id = ? and tag_id = ?", postId, tagId);
    }

    /** 编辑帖子的标签：整篇清空再按新集合写入（简单、幂等，量级是 5 以内）。 */
    public int detachAllOfPost(long postId) {
        return jdbc.update("delete from sy_post_tag where post_id = ?", postId);
    }

    /** 重算某个标签的使用次数（唯一真源；别处不许 +1/-1）。 */
    public int recount(long tagId) {
        return jdbc.update(
                "update sy_tag set use_count = (select count(*) from sy_post_tag where tag_id = ?) where id = ?",
                tagId, tagId);
    }

    /** 改名（不撞名时用；撞名走 {@link #mergeInto}）。 */
    public int rename(long id, String name, String nameKey) {
        return jdbc.update("update sy_tag set name = ?, name_key = ? where id = ?", name, nameKey, id);
    }

    /**
     * 把源标签的关系迁到目标（改名撞名时的"合并"）。
     *
     * <p>三步在同一事务里（调用方 {@link TagService} 加 {@code @Transactional}）：
     * 1) 迁关联（**跳过已同时拥有两个标签的帖子**，否则主键冲突）
     * 2) 断源关联 + 删源标签
     * 3) 重算目标计数
     *
     * @return 迁移过去的行数
     */
    public int mergeInto(long sourceId, long targetId) {
        int moved = jdbc.update(
                "insert into sy_post_tag(post_id, tag_id) "
                        + "select s.post_id, ? from sy_post_tag s "
                        + " where s.tag_id = ? "
                        + "   and not exists (select 1 from sy_post_tag t "
                        + "                    where t.post_id = s.post_id and t.tag_id = ?)",
                targetId, sourceId, targetId);
        jdbc.update("delete from sy_post_tag where tag_id = ?", sourceId);
        jdbc.update("delete from sy_tag where id = ?", sourceId);
        recount(targetId);
        return moved;
    }

    /** 删除标签：先断关联再删标签（帖子保留其它标签）。 */
    public void deleteTag(long id) {
        jdbc.update("delete from sy_post_tag where tag_id = ?", id);
        jdbc.update("delete from sy_tag where id = ?", id);
    }
}
