package com.siyige.video;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 辩场（辩论短视频）数据访问。
 *
 * 归属：这个包由短视频模块负责；表在 schema-video.sql，前缀 sy_video*。
 */
@Repository
public class VideoRepo {

    private final JdbcTemplate jdbc;

    public VideoRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }

    private static List<Map<String, Object>> lowerAll(List<Map<String, Object>> rows) {
        return rows.stream().map(VideoRepo::lower).toList();
    }

    // ---------- Feed：只出「过审 + 在线」的视频 ----------
    public List<Map<String, Object>> feed(long cursor, int size, String topic, String segment) {
        StringBuilder sql = new StringBuilder("""
                select v.*, u.name as author
                  from sy_video v left join sy_user u on u.id = v.user_id
                 where v.status='ONLINE' and v.audit_status='PASSED'
                """);
        List<Object> args = new ArrayList<>();
        if (cursor > 0) { sql.append(" and v.id < ? "); args.add(cursor); }
        if (topic != null && !topic.isBlank()) { sql.append(" and v.topic = ? "); args.add(topic); }
        if (segment != null && !segment.isBlank()) { sql.append(" and v.segment = ? "); args.add(segment); }
        sql.append(" order by v.id desc limit ? ");
        args.add(size);
        return lowerAll(jdbc.queryForList(sql.toString(), args.toArray()));
    }

    public List<Map<String, Object>> search(String q, int size) {
        String like = "%" + q + "%";
        return lowerAll(jdbc.queryForList("""
                select v.*, u.name as author from sy_video v left join sy_user u on u.id = v.user_id
                 where v.status='ONLINE' and v.audit_status='PASSED'
                   and (v.title like ? or v.description like ? or v.topic like ?)
                 order by v.id desc limit ?
                """, like, like, like, size));
    }

    public Map<String, Object> video(long id) {
        var rows = jdbc.queryForList("""
                select v.*, u.name as author from sy_video v left join sy_user u on u.id = v.user_id
                 where v.id=?
                """, id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public long create(String userId, String title, String desc, String url, String poster,
                       String topic, String segment, String side, int durationSec) {
        jdbc.update("""
                insert into sy_video(user_id,title,description,url,poster,topic,segment,side,duration_sec,audit_status)
                values(?,?,?,?,?,?,?,?,?,'PENDING')
                """, userId, title, desc, url, poster, topic, segment, side, durationSec);
        Long id = jdbc.queryForObject("select max(id) from sy_video", Long.class);
        return id == null ? 0 : id;
    }

    public void setAuditStatus(long id, String status, String note) {
        jdbc.update("update sy_video set audit_status=?, audit_note=? where id=?", status, note, id);
    }

    public void setOnline(long id, boolean online) {
        jdbc.update("update sy_video set status=? where id=?", online ? "ONLINE" : "HIDDEN", id);
    }

    public void view(long id) { jdbc.update("update sy_video set views = views + 1 where id=?", id); }

    // ---------- 点赞 / 评论 ----------
    public void like(long videoId, String userId) {
        Integer n = jdbc.queryForObject(
                "select count(*) from sy_video_like where video_id=? and user_id=?", Integer.class, videoId, userId);
        if (n != null && n > 0) return;
        jdbc.update("insert into sy_video_like(video_id,user_id) values(?,?)", videoId, userId);
        jdbc.update("update sy_video set likes = likes + 1 where id=?", videoId);
    }

    public void unlike(long videoId, String userId) {
        int n = jdbc.update("delete from sy_video_like where video_id=? and user_id=?", videoId, userId);
        if (n > 0) jdbc.update("update sy_video set likes = case when likes>0 then likes-1 else 0 end where id=?", videoId);
    }

    public boolean liked(long videoId, String userId) {
        if (userId == null || userId.isBlank()) return false;
        Integer n = jdbc.queryForObject(
                "select count(*) from sy_video_like where video_id=? and user_id=?", Integer.class, videoId, userId);
        return n != null && n > 0;
    }

    public List<Map<String, Object>> comments(long videoId) {
        return lowerAll(jdbc.queryForList("""
                select c.*, u.name as author from sy_video_comment c left join sy_user u on u.id = c.user_id
                 where c.video_id=? order by c.id desc limit 100
                """, videoId));
    }

    public void addComment(long videoId, String userId, String content) {
        jdbc.update("insert into sy_video_comment(video_id,user_id,content) values(?,?,?)", videoId, userId, content);
        jdbc.update("update sy_video set comments = comments + 1 where id=?", videoId);
    }

    // ---------- 电子审核留痕 ----------
    public void insertAudit(long videoId, String stage, String result, String reason,
                            String operator, String snapshot, String prevStatus) {
        jdbc.update("""
                insert into sy_video_audit(video_id,stage,result,reason,operator,snapshot,prev_status)
                values(?,?,?,?,?,?,?)
                """, videoId, stage, result, reason, operator, snapshot, prevStatus);
    }

    public List<Map<String, Object>> auditLogs(long videoId) {
        return lowerAll(jdbc.queryForList("select * from sy_video_audit where video_id=? order by id desc", videoId));
    }

    public Map<String, Object> lastAudit(long videoId) {
        var rows = jdbc.queryForList("select * from sy_video_audit where video_id=? order by id desc limit 1", videoId);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public void markRestored(long auditId) {
        jdbc.update("update sy_video_audit set restored=true where id=?", auditId);
    }

    public List<Map<String, Object>> auditQueue(String status, int size) {
        String where = switch (status == null ? "REVIEW" : status.toUpperCase()) {
            case "ALL" -> "";
            case "REVIEW" -> " and v.audit_status in ('REVIEW','PENDING') ";
            default -> " and v.audit_status = '" + status.toUpperCase().replace("'", "") + "' ";
        };
        return lowerAll(jdbc.queryForList("""
                select v.*, u.name as author from sy_video v left join sy_user u on u.id=v.user_id
                 where 1=1 %s order by v.id desc limit ?
                """.formatted(where), size));
    }

    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("videos", jdbc.queryForObject("select count(*) from sy_video", Integer.class));
        out.put("passed", jdbc.queryForObject("select count(*) from sy_video where audit_status='PASSED'", Integer.class));
        out.put("pending", jdbc.queryForObject("select count(*) from sy_video where audit_status in ('PENDING','REVIEW')", Integer.class));
        out.put("rejected", jdbc.queryForObject("select count(*) from sy_video where audit_status='REJECTED'", Integer.class));
        return out;
    }
}
