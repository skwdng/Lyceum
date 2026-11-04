package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.ai.AiService;
import com.siyige.api.SseHub;
import com.siyige.domain.Format;
import com.siyige.engine.TurnEngine;
import com.siyige.hot.HotRank;
import com.siyige.repo.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 对局编排：开局、玩家提交、AI 回合、超时推进、结算。
 * 计时权威在数据库 deadline_at（R-TECH-04），不依赖内存 Timer。
 */
@Service
public class MatchService {

    private static final Logger log = LoggerFactory.getLogger(MatchService.class);

    private final Store store;
    private final AiService ai;
    private final ScoreService scorer;
    private final HotRank hot;
    private final SseHub hub;
    private final FlawService flaw;
    private final ObjectMapper json;
    private final double timeScale;
    private final long aiThinkMs;
    private final int defaultTurnSeconds;
    private final double aiDelayScale;

    public MatchService(Store store, AiService ai, ScoreService scorer, HotRank hot, SseHub hub, FlawService flaw,
                        ObjectMapper json,
                        @Value("${siyige.pace.time-scale:1.0}") double timeScale,
                        @Value("${siyige.pace.ai-think-ms:1800}") long aiThinkMs,
                        @Value("${siyige.pace.turn-seconds:300}") int defaultTurnSeconds,
                        @Value("${siyige.pace.ai-delay-scale:1.0}") double aiDelayScale) {
        this.store = store; this.ai = ai; this.scorer = scorer; this.hot = hot; this.hub = hub;
        this.flaw = flaw; this.json = json; this.timeScale = timeScale; this.aiThinkMs = aiThinkMs;
        this.defaultTurnSeconds = defaultTurnSeconds;
        this.aiDelayScale = aiDelayScale;
    }

    // ---------- 开局 ----------

    public String create(String userId, String topicId, String seatsRaw, String mode) throws Exception {
        return create(userId, topicId, seatsRaw, mode, 0);
    }

    public String create(String userId, String topicId, String seatsRaw, String mode, int turnSeconds) throws Exception {
        return create(userId, topicId, seatsRaw, mode, turnSeconds, "normal", "pro");
    }

    public String create(String userId, String topicId, String seatsRaw, String mode, int turnSeconds, String pace) throws Exception {
        return create(userId, topicId, seatsRaw, mode, turnSeconds, pace, "pro", "solo");
    }

    public String create(String userId, String topicId, String seatsRaw, String mode, int turnSeconds,
                         String pace, String difficulty) throws Exception {
        return create(userId, topicId, seatsRaw, mode, turnSeconds, pace, difficulty, "solo");
    }

    public String create(String userId, String topicId, String seatsRaw, String mode, int turnSeconds,
                         String pace, String difficulty, String kind) throws Exception {
        Set<String> seats = TurnEngine.parseSeats(seatsRaw);
        for (String s : seats) {
            if (!TurnEngine.validSeat(s)) throw new IllegalArgumentException("非法席位: " + s);
        }
        Map<String, Object> topic = store.topic(topicId);
        if (topic == null) throw new IllegalArgumentException("辩题不存在");

        String id = "m" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        List<Format.Step> steps = Format.stepsOf(mode);
        boolean firstMine = TurnEngine.isMine(seats, steps.get(0).seat());
        int turnSec = stepSeconds(steps.get(0), turnSeconds, pace, kind);
        // 开场不需要"等对方说完"，AI 直接开口（1.2 秒）
        Long deadline = firstMine ? deadlineFor(turnSec) : Long.valueOf(openingDelay());
        store.createMatch(id, userId, topicId, String.valueOf(topic.get("title")), mode,
                TurnEngine.joinSeats(seats), turnSec, pace, difficulty, kind, deadline);
        store.incPlays(topicId);
        hot.zincrby(topicId, 1);   // 开辩 +1
        hub.emit(id, "match.start", Map.of(
                "step", 1, "seg", steps.get(0).seg(), "seat", steps.get(0).seat(),
                "seconds", steps.get(0).sec(), "mySeats", TurnEngine.joinSeats(seats)));
        return id;
    }

    // ---------- 玩家提交 ----------

    public Map<String, Object> submit(String matchId, String content, String inputType) throws Exception {
        Map<String, Object> m = require(matchId);
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) throw new IllegalStateException("对局已结束");

        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        String buzzSeat = str(m.get("buzz_seat"));
        String speaker = buzzSeat.isBlank() ? cur.seat() : buzzSeat;   // 抢拍时以抢到的人为准
        if (!TurnEngine.isMine(mine, speaker))
            throw new IllegalStateException("NOT_YOUR_TURN: 当前轮到 " + speaker);

        String text = content == null || content.isBlank() ? "（未发言）" : content.trim();
        store.insertTurn(matchId, step + 1, speaker, cur.seg(), text, "OK",
                inputType == null ? "kb" : inputType);
        hot.zincrby(str(m.get("topic_id")), 2);   // 发言 +2
        hub.emit(matchId, "turn", Map.of(
                "seat", cur.seat(), "seg", cur.seg(), "who", "me", "content", text));

        advance(matchId, m, steps, step);
        return Map.of("ok", true, "step", step + 1, "total", steps.size());
    }

    // ---------- 定时推进（AI 回合 / 超时） ----------

    @Scheduled(fixedDelay = 250)
    public void tick() {
        for (Map<String, Object> m : store.runningMatches()) {
            try { tickOne(m); } catch (Exception e) { log.warn("tick {} failed: {}", m.get("id"), e.toString()); }
        }
    }

    private void tickOne(Map<String, Object> m) throws Exception {
        String id = str(m.get("id"));
        Object dl = m.get("deadline_at");
        if (dl == null) return;
        Instant deadline = ((java.sql.Timestamp) dl).toInstant();
        long leftSec = java.time.Duration.between(Instant.now(), deadline).getSeconds();

        // 快结束了先推一条预警（只推一次）
        if (leftSec <= com.siyige.domain.Pace.WARN_SEC && leftSec > 0
                && !"true".equals(String.valueOf(m.get("warned")))) {
            store.markWarned(id);
            hub.emit(id, "warn", Map.of("leftSec", Math.max(0, leftSec), "step", num(m.get("step")) + 1));
        }
        if (Instant.now().isBefore(deadline)) return;

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) { finish(id, m); return; }

        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));

        // ── 自由辩抢拍阶段：窗口内谁抢到谁上 ──
        if ("BUZZ".equals(str(m.get("phase")))) {
            long windowMs = buzzWindowMs();
            long remainingMs = java.time.Duration.between(Instant.now(), deadline).toMillis();
            boolean expired = remainingMs <= 0;
            // 给玩家半个窗口的机会，之后 AI 才开始抢（否则 AI 一上来就抢光）
            boolean aiGrabs = remainingMs < windowMs * 0.35 && Math.random() < 0.3;
            if (!expired && !aiGrabs) return;
            String aiSeat = pickAiSeat(m, cur);
            if (aiSeat == null) return;                     // 全是玩家席位，等玩家抢
            String line = ai.speak(aiSeat, cur.seg(), str(m.get("topic_title")),
                    str(m.get("topic_id")), str(m.get("difficulty")), store.turns(id));
            FlawService.Planted planted = flaw.plant(line, str(m.get("difficulty")));
            line = planted.text();
            store.insertTurn(id, step + 1, aiSeat, cur.seg(), line, "OK", "ai");
            store.setPhase(id, "STEP");
            hub.emit(id, "turn", Map.of("seat", aiSeat, "seg", cur.seg(), "who", "ai",
                    "content", line, "buzzed", true));
            if (planted.type() != null) {
                store.insertFlaw(id, step + 1, planted.type());
                hub.emit(id, "flaw", Map.of("step", step + 1, "seat", aiSeat, "options", FlawService.TYPES));
            }
            advance(id, m, steps, step);
            return;
        }

        String buzzSeat2 = str(m.get("buzz_seat"));
        String speaker = buzzSeat2.isBlank() ? cur.seat() : buzzSeat2;   // 抢拍后以抢到的人为准

        if (TurnEngine.isMine(mine, speaker)) {
            store.insertTurn(id, step + 1, speaker, cur.seg(), "（超时未发言）", "TIMEOUT", "timeout");
            hub.emit(id, "turn", Map.of("seat", speaker, "seg", cur.seg(), "who", "me",
                    "content", "（超时未发言）", "timeout", true));
        } else {
            String line = ai.speak(cur.seat(), cur.seg(), str(m.get("topic_title")),
                    str(m.get("topic_id")), str(m.get("difficulty")), store.turns(id));
            // 按难度概率埋一处逻辑漏洞，供玩家抓
            FlawService.Planted planted = flaw.plant(line, str(m.get("difficulty")));
            line = planted.text();
            store.insertTurn(id, step + 1, cur.seat(), cur.seg(), line, "OK", "ai");
            hub.emit(id, "turn", Map.of("seat", cur.seat(), "seg", cur.seg(), "who", "ai", "content", line));
            if (planted.type() != null) {
                store.insertFlaw(id, step + 1, planted.type());
                hub.emit(id, "flaw", Map.of("step", step + 1, "seat", cur.seat(),
                        "options", FlawService.TYPES));
            }
        }
        advance(id, m, steps, step);
    }

    /** 抓漏：玩家指出某一轮 AI 发言的逻辑漏洞。 */
    public Map<String, Object> point(String matchId, int step, String type) {
        require(matchId);
        String planted = store.flawType(matchId, step);
        if (planted == null) return Map.of("ok", false, "reason", "这一轮没有漏洞可抓");
        boolean hit = planted.equals(type);
        store.markFlaw(matchId, step, hit);
        return Map.of("ok", true, "hit", hit, "correct", planted, "chosen", type);
    }

    /** 打字续命：玩家正在输入时把本步 deadline 往后推，每步最多 3 次。 */
    public Map<String, Object> keepalive(String matchId) {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status")))) return Map.of("extended", false, "reason", "not-running");
        int used = num(m.get("extend_count"));
        if (used >= com.siyige.domain.Pace.MAX_EXTEND)
            return Map.of("extended", false, "reason", "max", "used", used);

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        Format.Step cur = Format.stepAt(steps, num(m.get("step")));
        if (cur == null) return Map.of("extended", false, "reason", "finished");
        if (!TurnEngine.isMine(TurnEngine.parseSeats(str(m.get("my_seats"))), cur.seat()))
            return Map.of("extended", false, "reason", "not-your-turn");

        // 单人模式 deadline_at 为空 = 不限时。绝不能在这里「续」出一个截止时间来，
        // 否则一打字就被判超时（曾经的 bug：发言被吞 + 记录 TIMEOUT）。
        if (m.get("deadline_at") == null)
            return Map.of("extended", false, "reason", "unlimited");

        // 续时不跟 time-scale 走：它的意义是「给人打字的时间」，压缩后等于没给。
        long deadline = System.currentTimeMillis()
                + (long) com.siyige.domain.Pace.EXTEND_SEC * 1000;
        store.extendDeadline(matchId, deadline);
        hub.emit(matchId, "extend", Map.of("addSec", com.siyige.domain.Pace.EXTEND_SEC, "used", used + 1));
        return Map.of("extended", true, "addSec", com.siyige.domain.Pace.EXTEND_SEC, "used", used + 1,
                "max", com.siyige.domain.Pace.MAX_EXTEND);
    }

    // ---------- 推进与结算 ----------

    private void advance(String matchId, Map<String, Object> m, List<Format.Step> steps, int step) throws Exception {
        int next = step + 1;
        if (next >= steps.size()) { finish(matchId, m); return; }
        Format.Step ns = steps.get(next);
        boolean mine = TurnEngine.isMine(TurnEngine.parseSeats(str(m.get("my_seats"))), ns.seat());
        int turnSec = stepSeconds(ns, 0, str(m.get("pace")), str(m.get("kind")));

        // 自由辩：先开一个抢话窗口，谁抢到谁上；其余环节按席次轮转
        boolean isBuzz = "自由辩".equals(ns.seg());
        Long deadline = isBuzz
                ? Long.valueOf(System.currentTimeMillis() + buzzWindowMs())
                : (mine ? deadlineFor(turnSec) : Long.valueOf(aiDeadline(ns.seat())));
        store.updateStep(matchId, next, deadline);
        store.setPhase(matchId, isBuzz ? "BUZZ" : "STEP");

        hub.emit(matchId, "step", Map.of(
                "step", next + 1, "seg", ns.seg(), "seat", ns.seat(),
                "seconds", isBuzz ? (int) (buzzWindowMs() / 1000) : (mine ? turnSec : 2),
                "mine", mine,
                "phase", isBuzz ? "BUZZ" : "STEP"));
    }

    /** 自由辩抢拍窗口：真实自由辩就是抢话，给 6 秒窗口。 */
    private long buzzWindowMs() {
        return Math.max(3000, (long) (8 * 1000 * Math.max(0.05, timeScale)));
    }

    /** 玩家点「抢」：抢到就拿到这一步的发言权。 */
    public Map<String, Object> buzz(String matchId) {
        Map<String, Object> m = require(matchId);
        if (!"BUZZ".equals(str(m.get("phase")))) return Map.of("ok", false, "reason", "现在不是抢拍时间");
        java.util.Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        if (mine.isEmpty()) return Map.of("ok", false, "reason", "你没有席位");
        String seat = mine.iterator().next();
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        Format.Step cur = Format.stepAt(steps, num(m.get("step")));
        int turnSec = stepSeconds(cur, 0, str(m.get("pace")), str(m.get("kind")));
        store.setPhaseWithBuzz(matchId, "STEP", seat);      // 记下是谁抢到的
        store.updateStep(matchId, num(m.get("step")), deadlineFor(turnSec));
        hub.emit(matchId, "buzz.taken", Map.of("by", "me", "seat", seat));
        return Map.of("ok", true, "seat", seat, "seconds", turnSec);
    }

    /** AI 的"思考"停顿：按席位人设不同（快攻 0.9s、价值派 1.7s），再加抖动。 */
    private long aiDeadline(String seat) {
        // 一方说完，另一方至少隔 10 秒再回；区间 10–15 秒（按压缩系数缩放）
        long pick = 10_000L + (long) (5_000L * Math.random());
        long ms = Math.max(400, (long) (pick * Math.max(0.05, aiDelayScale)));
        return System.currentTimeMillis() + ms;
    }

    private long aiDeadline() { return aiDeadline("A1"); }

    /** 开场第一句：不等 10–15 秒，1.2 秒就开口。 */
    private long openingDelay() {
        return Math.max(300, (long) (1200 * Math.max(0.05, aiDelayScale)));
    }

    /** 在同侧里挑一个不是玩家的席位，用来"抢到话筒"。 */
    private String pickAiSeat(Map<String, Object> m, Format.Step cur) {
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        String side = Format.side(cur.seat());
        for (String s : Format.SEATS) {
            if (Format.side(s).equals(side) && !mine.contains(s)) return s;
        }
        return null;
    }

    /** 单人模式「催一下」：跳过 AI 的等待，让它立刻接话。 */
    public Map<String, Object> skip(String matchId) {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status")))) return Map.of("ok", false, "reason", "not-running");
        if (!"solo".equalsIgnoreCase(str(m.get("kind"))))
            return Map.of("ok", false, "reason", "多人对局不能跳过");
        if ("BUZZ".equals(str(m.get("phase"))))
            return Map.of("ok", false, "reason", "抢拍阶段不能跳过");
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        Format.Step cur = Format.stepAt(steps, num(m.get("step")));
        if (cur == null) return Map.of("ok", false, "reason", "已结束");
        if (TurnEngine.isMine(TurnEngine.parseSeats(str(m.get("my_seats"))), cur.seat()))
            return Map.of("ok", false, "reason", "现在轮到你说");
        store.updateStep(matchId, num(m.get("step")), System.currentTimeMillis() - 1);
        hub.emit(matchId, "skip", Map.of("step", num(m.get("step")) + 1));
        return Map.of("ok", true);
    }
    private void finish(String matchId, Map<String, Object> m) throws Exception {
        List<Map<String, Object>> turns = store.turns(matchId);
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        ScoreService.Score sc = scorer.score(turns, mine, str(m.get("topic_id")), store.flaws(matchId));

        store.finishMatch(matchId, "FINISHED", sc.total());
        store.insertRecord(str(m.get("user_id")), matchId, str(m.get("topic_title")),
                str(m.get("my_seats")), sc.total(), sc.turns());
        hot.zincrby(str(m.get("topic_id")), 5 + sc.turns() * 0.0);   // 打完 +5

        // 五维画像：滑动平均（含场次样本数）+ 本场数据单独存一份，用于算增量
        Map<String, Object> diag = store.diag(str(m.get("user_id")));
        int prevSamples = diag == null ? 0 : num(diag.get("samples"));
        Map<String, Integer> avg = new LinkedHashMap<>();
        Map<String, Integer> flaws = new LinkedHashMap<>();
        if (diag != null && diag.get("dims_json") != null) {
            avg = json.readValue(str(diag.get("dims_json")), Map.class);
            if (diag.get("flaws_json") != null) {
                flaws = json.readValue(str(diag.get("flaws_json")), Map.class);
            }
        }
        Map<String, Integer> now = new LinkedHashMap<>();
        now.put("立论", sc.matter());
        now.put("论证", sc.method());
        now.put("表达", sc.manner());
        now.put("应变", sc.adapt());
        now.put("论据", sc.evidence());

        if (avg.isEmpty()) {
            avg = new LinkedHashMap<>(now);
        } else {
            for (Map.Entry<String, Integer> e : now.entrySet()) {
                int old = avg.getOrDefault(e.getKey(), e.getValue());
                // 滑动平均：第 n+1 场 = (旧均值×n + 本场) / (n+1)
                avg.put(e.getKey(), (int) Math.round((old * (double) prevSamples + e.getValue()) / (prevSamples + 1)));
            }
        }
        // 瑕疵：真正检出什么就累加什么，不再写死
        for (Map.Entry<String, Integer> e : sc.flaws().entrySet()) {
            flaws.merge(e.getKey(), e.getValue(), Integer::sum);
        }
        int streak = diag == null ? 1 : num(diag.get("streak")) + 1;
        store.saveDiag(str(m.get("user_id")), json.writeValueAsString(avg), json.writeValueAsString(flaws),
                streak, prevSamples + 1, json.writeValueAsString(now));

        hub.emit(matchId, "match.end", Map.of(
                "total", sc.total(), "matter", sc.matter(), "method", sc.method(), "manner", sc.manner(),
                "turns", sc.turns(), "timeout", sc.timeout()));

        hub.emit(matchId, "match.end", Map.of(
                "total", sc.total(), "matter", sc.matter(), "method", sc.method(), "manner", sc.manner(),
                "turns", sc.turns(), "timeout", sc.timeout()));
    }

    // ---------- 查询 ----------

    public Map<String, Object> detail(String matchId) throws Exception {
        Map<String, Object> m = require(matchId);
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("match", m);
        out.put("steps", steps);
        out.put("currentStep", cur);
        boolean running = "RUNNING".equals(str(m.get("status")));
        String buzzSeat = str(m.get("buzz_seat"));
        String speaker = (buzzSeat.isBlank() && cur != null) ? cur.seat() : buzzSeat;
        out.put("buzzSeat", buzzSeat);
        out.put("waitingForMe", running && speaker != null && TurnEngine.isMine(mine, speaker));
        out.put("waitingSeat", running && cur != null ? cur.seat() : null);
        out.put("turnSec", num(m.get("turn_sec")) > 0 ? num(m.get("turn_sec")) : defaultTurnSeconds);
        out.put("pace", str(m.get("pace")));
        out.put("phase", str(m.get("phase")));
        out.put("kind", str(m.get("kind")));
        out.put("unlimited", "solo".equalsIgnoreCase(str(m.get("kind"))));
        out.put("extendUsed", num(m.get("extend_count")));
        Object dl = m.get("deadline_at");
        long left = dl == null ? 0 : java.time.Duration.between(Instant.now(), ((java.sql.Timestamp) dl).toInstant()).getSeconds();
        out.put("remainingSec", Math.max(0, left));   // 房间模式下前端据此判断是不是自己
        out.put("turns", store.turns(matchId));
        return out;
    }

    public Map<String, Object> review(String matchId) throws Exception {
        Map<String, Object> m = require(matchId);
        List<Map<String, Object>> turns = store.turns(matchId);
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        ScoreService.Score sc = scorer.score(turns, mine, str(m.get("topic_id")), store.flaws(matchId));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("score", sc);
        out.put("turns", turns);
        return out;
    }

    // ---------- 工具 ----------

    private Map<String, Object> require(String matchId) {
        Map<String, Object> m = store.match(matchId);
        if (m == null) throw new IllegalArgumentException("对局不存在: " + matchId);
        return m;
    }

    /**
     * 计时：优先用用户指定的每步时长（turnSec），否则用赛制默认。
     * 再乘压缩系数——演示环境 0.05，生产 1.0。
     */
    /** seconds <= 0 表示不限时，返回 null（库里的 deadline_at 为空）。 */
    private Long deadlineFor(int seconds) {
        if (seconds <= 0) return null;
        long ms = Math.max(3000, (long) (seconds * 1000 * timeScale));
        return System.currentTimeMillis() + ms;
    }
    /** 单人 0（不限时），多人上限 600 秒。 */
    private int stepSeconds(Format.Step s, int overrideSec, String pace, String kind) {
        if ("solo".equalsIgnoreCase(kind)) return 0;
        if (overrideSec > 0 && overrideSec != defaultTurnSeconds) return overrideSec;
        return Math.min(600, com.siyige.domain.Pace.secondsFor(s.seg(), pace));
    }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    private static int num(Object o) { return o instanceof Number n ? n.intValue() : 0; }

    /** AI 思考停顿（R-PACE-01），按压缩系数缩放。 */
    public long thinkMs() { return Math.max(400, (long) (aiThinkMs * Math.max(0.05, timeScale))); }

    public Duration prepareDuration() { return Duration.ofMillis(Math.max(2000, (long) (10_000 * timeScale))); }
}
