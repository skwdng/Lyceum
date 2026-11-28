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

    /** 记下「本轮已催」与时间戳（幂等 + 防连点）。 */
    public void setSkip(String id, int step, long at) {
        jdbc.update("update sy_match set skipped_step=?, last_skip_at=? where id=?", step, at, id);
    }

    /**
     * 「催一下」的 CAS：只有这一轮**还没催过**才记账。
     *
     * <p>为什么不能像以前那样先读后写：两个并发的催请求都读到 skipped_step≠step，
     * 于是都往下走、都把 deadline 推到过去，emit 两次 skip。用条件更新让 DB 当裁判，
     * 返回 0 行就说明别人已经催过这一轮了。
     *
     * @return 受影响行数：1 = 抢到这一次催；0 = 这一轮已经催过
     */
    public int setSkipIfNotSkipped(String id, int step, long at) {
        return jdbc.update("update sy_match set skipped_step=?, last_skip_at=? "
                        + "where id=? and coalesce(skipped_step,-1) <> ?",
                step, at, id, step);
    }

    public Map<String, Object> match(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_match where id=?", id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public List<Map<String, Object>> runningMatches() {
        return lowerAll(jdbc.queryForList("select * from sy_match where status='RUNNING'"));
    }

    /** 我作为 owner 的进行中对局（单人页「进行中的对局」列表用）。 */
    public List<Map<String, Object>> runningMatchesOwnedBy(String userId) {
        return lowerAll(jdbc.queryForList(
                "select * from sy_match where status='RUNNING' and user_id=? "
                        + "order by last_active_at desc", userId));
    }

    /**
     * 我坐在席位上的房间局（进行中）。
     *
     * <p>房间局只有一条 match，owner 是房主；其他人靠 sy_seat 反查自己在这场里坐哪。
     * 少了这条，除房主外的人在「进行中的对局」里看不到自己正在打的房间局。
     */
    public List<Map<String, Object>> runningRoomMatchesOf(String userId) {
        return lowerAll(jdbc.queryForList(
                "select m.* from sy_match m "
                        + " join sy_room r on r.match_id = m.id "
                        + " join sy_seat s on s.room_code = r.code "
                        + " where m.status='RUNNING' and s.user_id=? "
                        + " order by m.last_active_at desc", userId));
    }

    /**
     * 我作为 owner 的**已结束**对局（对局板块「历史」用）。
     *
     * <p>带上 {@code turn_count}：列表上要显示「这场说了几句」，前端据此决定能不能点进复盘。
     * 排序用 {@code coalesce(finished_at, started_at)} —— 老数据没有 finished_at，
     * 直接按它排会让这些行全落到同一档（甚至 NULL 排最前）。
     */
    public List<Map<String, Object>> finishedMatchesOwnedBy(String userId) {
        return lowerAll(jdbc.queryForList(
                "select m.*, (select count(*) from sy_turn t where t.match_id = m.id) as turn_count "
                        + " from sy_match m where m.status='FINISHED' and m.user_id=? "
                        + " order by coalesce(m.finished_at, m.started_at) desc limit 20", userId));
    }

    /** 我是席位成员的**已结束**房间局（房主不是我，也算我打过）。 */
    public List<Map<String, Object>> finishedRoomMatchesOf(String userId) {
        return lowerAll(jdbc.queryForList(
                "select m.*, (select count(*) from sy_turn t where t.match_id = m.id) as turn_count "
                        + " from sy_match m "
                        + " join sy_room r on r.match_id = m.id "
                        + " join sy_seat s on s.room_code = r.code "
                        + " where m.status='FINISHED' and s.user_id=? "
                        + " order by coalesce(m.finished_at, m.started_at) desc limit 20", userId));
    }

    /**
     * 房间局「重新加入继续打」：把这场收缩成单人局。
     *
     * <p>只保留我一个人占席，其余席位从此由 AI 补位（MatchService.pickAiSeat 按 my_seats 判谁是 AI）。
     * 顺手把抢拍状态清干净——单人局没有抢拍。
     */
    public void makeSolo(String id, String mySeat) {
        jdbc.update("update sy_match set kind='solo', my_seats=?, phase='STEP', buzz_seat=null, "
                + "last_active_at=? where id=?", mySeat, System.currentTimeMillis(), id);
    }

    /**
     * CAS 推进：只有「库里当前的 step 还是我以为的 step」时才推进到 next。
     *
     * <p>为什么要它：提交与 tick 超时是两条独立路径，各自拿着自己的快照调 advance。
     * 无条件 update 会让后到的那次把同一轮再推一遍（甚至把 step 回写），
     * 结果是同一步两条发言、或者整步被跳过。改成条件更新后，DB 只认第一次。
     *
     * @return 受影响行数：1 = 这次推进生效；0 = 别人已经推进过（调用方应直接 return）
     */
    public int updateStepIf(String id, int step, int next, Long deadline) {
        long now = System.currentTimeMillis();
        if (deadline == null) {
            // 单人模式不限时：deadline 置空（参数化 null 会让 JDBC 猜不出类型）
            return jdbc.update("update sy_match set step=?, deadline_at=null, extend_count=0, warned=false, "
                            + "last_active_at=? where id=? and step=?",
                    next, now, id, step);
        }
        return jdbc.update("update sy_match set step=?, deadline_at=?, extend_count=0, warned=false, "
                        + "last_active_at=? where id=? and step=?",
                next, ts(deadline), now, id, step);
    }

    /** 兼容旧调用（create / buzz 用：等于「把当前步的 deadline 重设一次」，不推进 step）。 */
    public void updateStep(String id, int step, Long deadline) {
        long now = System.currentTimeMillis();
        if (deadline == null) {
            // 单人模式不限时：直接把 deadline 置空，参数化 null 会让 JDBC 猜不出类型
            jdbc.update("update sy_match set step=?, deadline_at=null, extend_count=0, warned=false, last_active_at=? where id=?",
                    step, now, id);
        } else {
            jdbc.update("update sy_match set step=?, deadline_at=?, extend_count=0, warned=false, last_active_at=? where id=?",
                    step, ts(deadline), now, id);
        }
    }

    /** 打字续命：deadline 后移、次数 +1。 */
    public void extendDeadline(String id, long deadline) {
        jdbc.update("update sy_match set deadline_at=?, extend_count=extend_count+1, last_active_at=? where id=?",
                ts(deadline), System.currentTimeMillis(), id);
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

    /**
     * 幂等收尾：只有还处于 RUNNING 的对局才会被改成终态。
     *
     * <p>结算（扣费 / 画像滑动平均 / 逐场记录）都挂在 {@code finish()} 上，
     * 两条推进路径同时到末尾就会各结算一遍。让 DB 来判「是不是第一次收尾」。
     *
     * @return 1 = 本次收尾生效（该由我结算）；0 = 已经有人收过尾了
     */
    public int finishMatchIfRunning(String id, String status, Integer total) {
        return jdbc.update("update sy_match set status=?, total_score=?, finished_at=current_timestamp "
                + "where id=? and status='RUNNING'", status, total, id);
    }

    /**
     * 删掉一场刚建出来、还没落任何回合的对局（目前只用于「预扣失败」的回滚）。
     *
     * <p>为什么不是标 ABANDONED：用户反馈「余额不足点进辩题 → 充值后回来还看到这条记录」，
     * 这种局从来没有开始过，留在列表里只会让人困惑；此刻还没有 sy_turn，硬删是干净的。
     */
    public void deleteMatch(String id) {
        jdbc.update("delete from sy_match where id = ? and not exists (select 1 from sy_turn t where t.match_id = sy_match.id)", id);
    }

    public void insertTurn(String matchId, int step, String seat, String seg, String content,
                           String status, String inputType) {
        insertTurn(matchId, step, seat, seg, content, status, inputType, null);
    }

    /**
     * 带「AI 为什么降级」的写入。
     *
     * @param aiReason AI 分析状态：{@code ok} / {@code degraded} / {@code budget-exhausted} / {@code none}；
     *                 玩家发言与超时记录传 null（没有 AI 分析这回事）
     */
    public void insertTurn(String matchId, int step, String seat, String seg, String content,
                           String status, String inputType, String aiReason) {
        jdbc.update("insert into sy_turn(match_id,step,seat,seg,content,status,input_type,ai_reason) "
                        + "values(?,?,?,?,?,?,?,?)",
                matchId, step, seat, seg, content, status, inputType, aiReason);
    }

    /** 这一步是否已经有发言了（防重复插入：重试/并发都靠它兜底）。 */
    public boolean hasTurn(String matchId, int step) {
        Integer n = jdbc.queryForObject(
                "select count(*) from sy_turn where match_id=? and step=?", Integer.class, matchId, step);
        return n != null && n > 0;
    }

    public List<Map<String, Object>> turns(String matchId) {
        return lowerAll(jdbc.queryForList(
                // ai_reason 要带上：复盘面板据此显示「这一轮 AI 是降级了还是模板兜底」
                "select step,seat,seg,content,status,input_type,ai_reason,created_at "
                        + "from sy_turn where match_id=? order by id", matchId));
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
        // match_id：记录页每一行要能点开看整场逐句（2026-11-28）。
        // 老数据可能是 NULL（第 2 步之前就砍掉的关联），前端据此判断「这一行不可点」。
        return lowerAll(jdbc.queryForList(
                "select id,match_id,topic_title,seats,total,turns,created_at from sy_record "
                        + "where user_id=? order by id desc limit 50", userId));
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
        // 先 update、影响 0 行再 insert：H2 与 MySQL 通用（merge ... key() 是 H2 专有，
        // MySQL 那边对应 insert ... on duplicate key update，各写一套不如统一走这两句）
        int n = jdbc.update("update sy_brief set content = ? where topic_id = ? and side = ?",
                content, topicId, side);
        if (n > 0) return;
        jdbc.update("insert into sy_brief(topic_id, side, content) values(?,?,?)",
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
