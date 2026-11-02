package com.siyige.community;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 社区模块的数据访问。
 *
 * ⚠️ 所有权：这个包（com.siyige.community）由社区负责人独占，
 * 其他人不要改这里的文件；需要联调就走 HTTP 接口。
 */
@Repository
public class CommunityRepo {

    private final JdbcTemplate jdbc;

    public CommunityRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }

    public List<Map<String, Object>> posts(int page, int size) {
        return jdbc.queryForList(
                "select * from sy_post order by id desc limit ? offset ?", size, page * size)
                .stream().map(CommunityRepo::lower).toList();
    }

    public Map<String, Object> post(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_post where id=?", id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public long createPost(String userId, String userName, String title, String content, String topicId) {
        jdbc.update("insert into sy_post(user_id,user_name,title,content,topic_id) values(?,?,?,?,?)",
                userId, userName, title, content, topicId);
        Long id = jdbc.queryForObject("select max(id) from sy_post", Long.class);
        return id == null ? 0 : id;
    }

    public void like(long id) { jdbc.update("update sy_post set likes = likes + 1 where id=?", id); }

    public List<Map<String, Object>> comments(long postId) {
        return jdbc.queryForList("select * from sy_comment where post_id=? order by id", postId)
                .stream().map(CommunityRepo::lower).toList();
    }

    public void addComment(long postId, String userId, String userName, String content) {
        jdbc.update("insert into sy_comment(post_id,user_id,user_name,content) values(?,?,?,?)",
                postId, userId, userName, content);
    }

    public int count() {
        Integer n = jdbc.queryForObject("select count(*) from sy_post", Integer.class);
        return n == null ? 0 : n;
    }
}
