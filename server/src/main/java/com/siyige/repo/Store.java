package com.siyige.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 所有落库操作集中在这里，JdbcTemplate 足够，不引入 ORM。 */
@Repository
public class Store {

    private final JdbcTemplate jdbc;

    public Store(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }
    private static List<Map<String, Object>> lowerAll(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) out.add(lower(r));
        return out;
    }
    private static Timestamp ts(long millis) { return new Timestamp(millis); }

    // ---------- topic ----------
    public List<Map<String, Object>> topics(String cat, String kw) {
        // 前台题库要过滤掉被驳回/下架的题（mod_status = REJECT）。
        // 管理端**不用**这条：它要能看到被驳回的题才能改判（见 AdminTopicRepo）。
        StringBuilder sql = new StringBuilder(
                "select * from sy_topic where coalesce(mod_status, 'PASS') <> 'REJECT'");
        List<Object> args = new ArrayList<>();
        if (cat != null && !cat.isBlank() && !"全部".equals(cat)) { sql.append(" and cat=?"); args.add(cat); }
        if (kw != null && !kw.isBlank()) { sql.append(" and title like ?"); args.add("%" + kw + "%"); }
        sql.append(" order by plays desc");
        return lowerAll(jdbc.queryForList(sql.toString(), args.toArray()));
    }

    public Map<String, Object> topic(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_topic where id=?", id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public void insertTopic(String id, String title, String cat, String diff, String source, String hash) {
        jdbc.update("insert into sy_topic(id,title,cat,diff,source,plays,mod_status,title_hash) values(?,?,?,?,?,0,'PASS',?)",
                id, title, cat, diff, source, hash);
    }

    public void incPlays(String id) { jdbc.update("update sy_topic set plays = plays + 1 where id=?", id); }

    public void markModeration(String id, String status, String reason) {
        jdbc.update("update sy_topic set mod_status=?, mod_reason=?, mod_at=current_timestamp where id=?",
                status, reason, id);
    }

    public Map<String, Object> auditByHash(String hash) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_audit where title_hash=? order by id desc limit 1", hash);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public void insertAudit(String title, String hash, String result, String reason, String suggestions) {
        jdbc.update("insert into sy_audit(title,title_hash,result,reason,suggestions,cached) values(?,?,?,?,?,true)",
                title, hash, result, reason, suggestions);
    }

    // ---------- match ----------
    public void createMatch(String id, String userId, String topicId, String topicTitle,
                            String mode, String mySeats, int turnSec, String pace, String difficulty, String kind,
                            Long deadline, int queryRounds, int freeRounds, String tier, String payerUserId) {
        String payer = (payerUserId == null || payerUserId.isBlank()) ? userId : payerUserId;
        String t = (tier == null || tier.isBlank()) ? "PRO" : tier;
        if (deadline == null) {
            jdbc.update("insert into sy_match(id,user_id,topic_id,topic_title,mode,my_seats,turn_sec,pace,difficulty,kind,query_rounds,free_rounds,tier,payer_user_id,step,status,deadline_at) "
                    + "values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'RUNNING',null)",
                    id, userId, topicId, topicTitle, mode, mySeats, turnSec, pace, difficulty, kind, queryRounds, freeRounds, t, payer);
        } else {
            jdbc.update("insert into sy_match(id,user_id,topic_id,topic_title,mode,my_seats,turn_sec,pace,difficulty,kind,query_rounds,free_rounds,tier,payer_user_id,step,status,deadline_at) "
                    + "values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'RUNNING',?)",
                    id, userId, topicId, topicTitle, mode, mySeats, turnSec, pace, difficulty, kind, queryRounds, freeRounds, t, payer, ts(deadline));
        }
    }

    public void setTier(String id, String tier) {
        jdbc.update("update sy_match set tier=? where id=?", tier, id);
    }

    public void setPayer(String id, String payerUserId) {
        jdbc.update("update sy_match set payer_user_id=? where id=?", payerUserId, id);
    }

    /** 开局时的全局 token 快照，结算用差值。 */
    public void setTokenBase(String id, long tokens) {
        jdbc.update("update sy_match set token_base=? where id=?", tokens, id);
    }

    /** 结算后把本场 token 用量写进对局。 */
    public void saveBill(String id, long tokens) {
        jdbc.update("update sy_match set bill_tokens=? where id=?", tokens, id);
    }

    /** 标记本场用的是用户自带 key（结算时模型成本记 0）。 */
    public void setOwnKey(String id, boolean own) {
        jdbc.update("update sy_match set own_key=? where id=?", own, id);
    }

    public Map<String, Object> match(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_match where id=?", id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public List<Map<String, Object>> runningMatches() {
        return lowerAll(jdbc.queryForList("select * from sy_match where status='RUNNING'"));
    }

    public void updateStep(String id, int step, Long deadline) {
        if (deadline == null) {
            // 单人模式不限时：直接把 deadline 置空，参数化 null 会让 JDBC 猜不出类型
            jdbc.update("update sy_match set step=?, deadline_at=null, extend_count=0, warned=false where id=?",
                    step, id);
        } else {
            jdbc.update("update sy_match set step=?, deadline_at=?, extend_count=0, warned=false where id=?",
                    step, ts(deadline), id);
        }
    }

    /** 打字续命：deadline 后移、次数 +1。 */
    public void extendDeadline(String id, long deadline) {
        jdbc.update("update sy_match set deadline_at=?, extend_count=extend_count+1 where id=?",
                ts(deadline), id);
    }

    public void setPhase(String id, String phase) {
        jdbc.update("update sy_match set phase=?, buzz_seat=null where id=?", phase, id);
    }

    /** 抢拍到发言权：记下是谁抢到的。 */
    public void setPhaseWithBuzz(String id, String phase, String buzzSeat) {
        jdbc.update("update sy_match set phase=?, buzz_seat=? where id=?", phase, buzzSeat, id);
    }

    /** 标一次「已预警」，避免每 250ms 重复推。 */
    public void markWarned(String id) {
        jdbc.update("update sy_match set warned=true where id=?", id);
    }

    public void finishMatch(String id, String status, Integer total) {
        jdbc.update("update sy_match set status=?, total_score=?, finished_at=current_timestamp where id=?",
                status, total, id);
    }

    public void insertTurn(String matchId, int step, String seat, String seg, String content,
                           String status, String inputType) {
        jdbc.update("insert into sy_turn(match_id,step,seat,seg,content,status,input_type) values(?,?,?,?,?,?,?)",
                matchId, step, seat, seg, content, status, inputType);
    }

    public List<Map<String, Object>> turns(String matchId) {
        return lowerAll(jdbc.queryForList(
                "select step,seat,seg,content,status,input_type,created_at from sy_turn where match_id=? order by id", matchId));
    }

    // ---------- record / diag ----------
    public void insertRecord(String userId, String matchId, String topicTitle, String seats,
                             int total, int turns, String dimsJson) {
        jdbc.update("insert into sy_record(user_id,match_id,topic_title,seats,total,turns,dims_json) values(?,?,?,?,?,?,?)",
                userId, matchId, topicTitle, seats, total, turns, dimsJson);
    }

    /** 最近 n 场的六维分（新的在前）；n<=0 表示全部。 */
    public java.util.List<Map<String, Object>> recentDims(String userId, int n) {
        String sql = "select dims_json from sy_record where user_id=? and dims_json is not null order by id desc"
                + (n > 0 ? " limit " + n : "");
        return jdbc.queryForList(sql, userId);
    }

    /** 这个用户总共打过多少场。 */
    public int recordCount(String userId) {
        Integer v = jdbc.queryForObject("select count(*) from sy_record where user_id=?", Integer.class, userId);
        return v == null ? 0 : v;
    }

    public List<Map<String, Object>> records(String userId) {
        return lowerAll(jdbc.queryForList(
                "select id,topic_title,seats,total,turns,created_at from sy_record where user_id=? order by id desc limit 50", userId));
    }

    public Map<String, Object> diag(String userId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select user_id,dims_json,flaws_json,streak,samples,last_json,updated_at from sy_diag where user_id=?", userId);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public void saveDiag(String userId, String dimsJson, String flawsJson, int streak, int samples, String lastJson) {
        Integer n = jdbc.queryForObject("select count(*) from sy_diag where user_id=?", Integer.class, userId);
        if (n == null || n == 0) {
            jdbc.update("insert into sy_diag(user_id,dims_json,flaws_json,streak,samples,last_json) values(?,?,?,?,?,?)",
                    userId, dimsJson, flawsJson, streak, samples, lastJson);
        } else {
            jdbc.update("update sy_diag set dims_json=?, flaws_json=?, streak=?, samples=?, last_json=?, "
                    + "updated_at=current_timestamp where user_id=?",
                    dimsJson, flawsJson, streak, samples, lastJson, userId);
        }
    }

    // ---------- brief（材料包） ----------
    public String brief(String topicId, String side) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select content from sy_brief where topic_id=? and side=?", topicId, side);
        return rows.isEmpty() ? null : String.valueOf(rows.get(0).get("content"));
    }

    public void saveBrief(String topicId, String side, String content) {
        jdbc.update("merge into sy_brief(topic_id, side, content) key(topic_id, side) values(?,?,?)",
                topicId, side, content);
    }

    // ---------- flaw（抓漏） ----------
    public void insertFlaw(String matchId, int step, String type) {
        jdbc.update("insert into sy_flaw(match_id,step,type) values(?,?,?)", matchId, step, type);
    }

    public List<Map<String, Object>> flaws(String matchId) {
        return lowerAll(jdbc.queryForList(
                "select step,type,hit from sy_flaw where match_id=? order by step", matchId));
    }

    public String flawType(String matchId, int step) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select type from sy_flaw where match_id=? and step=?", matchId, step);
        return rows.isEmpty() ? null : String.valueOf(rows.get(0).get("type"));
    }

    public void markFlaw(String matchId, int step, boolean hit) {
        jdbc.update("update sy_flaw set hit=? where match_id=? and step=?", hit, matchId, step);
    }

    // ---------- event ----------
    public int nextSeq(String matchId) {
        Integer n = jdbc.queryForObject("select coalesce(max(seq),0)+1 from sy_event where match_id=?", Integer.class, matchId);
        return n == null ? 1 : n;
    }

    public void saveEvent(String matchId, int seq, String type, String payload) {
        jdbc.update("insert into sy_event(match_id,seq,type,payload) values(?,?,?,?)", matchId, seq, type, payload);
    }

    public List<Map<String, Object>> events(String matchId, int since) {
        return lowerAll(jdbc.queryForList(
                "select seq,type,payload from sy_event where match_id=? and seq>? order by seq", matchId, since));
    }

    // ---------- evidence ----------
    public List<Map<String, Object>> evidence(String topicId) {
        return lowerAll(jdbc.queryForList(
                "select id,topic_id,side,claim,source,pub_year,verified,tags from sy_evidence where topic_id=? order by side,id",
                topicId));
    }

    public void insertEvidence(String id, String topicId, String side, String claim, String source,
                               Integer year, boolean verified, String tags) {
        jdbc.update("insert into sy_evidence(id,topic_id,side,claim,source,pub_year,verified,tags) values(?,?,?,?,?,?,?,?)",
                id, topicId, side, claim, source, year, verified, tags);
    }

    public int evidenceCount() {
        Integer n = jdbc.queryForObject("select count(*) from sy_evidence", Integer.class);
        return n == null ? 0 : n;
    }

    public Instant now() { return Instant.now(); }
}
