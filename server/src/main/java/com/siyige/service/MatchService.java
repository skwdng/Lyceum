package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.analytics.Active;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.api.SseHub;
import com.siyige.domain.Format;
import com.siyige.engine.TurnEngine;
import com.siyige.hot.HotRank;
import com.siyige.repo.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
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
    private final UtteranceCheck utterance;
    private final java.util.Random rnd = new java.util.Random();
    private final com.siyige.billing.WalletService wallet;
    private final com.siyige.billing.UserLlmService userLlm;
    private final com.siyige.ai.AiTier aiTier;
    private final com.siyige.repo.RoomStore roomStore;
    private final HotRank hot;
    private final SseHub hub;
    private final FlawService flaw;
    private final ObjectMapper json;
    /**
     * 四个节奏参数（参数管理第二批）从后台读，每次现读。
     *
     * <p>默认值与**当前线上行为**一致：time-scale 0.05 / turn-seconds 300 /
     * ai-think-ms **700** / ai-delay-scale 1.0。
     * 注意 ai-think-ms 的 yml 是 700、原来代码里的 {@code @Value} 默认是 1800，
     * 真正生效的一直是 yml 的 700 —— 所以默认值取 700，不能照抄 1800。
     */
    private final ConfigService cfg;

    /**
     * AI 接话的基础间隔（毫秒）。产品口径 4–7 秒（见 {@link #aiDeadline(String)}），
     * 这里给 4000 起的下界，抖动 3000 让区间落在 4–7；线上可用 siyige.pace.ai-gap-ms 微调，
     * 但最终仍会被夹回 [4s, 7s]。
     */
    @Value("${siyige.pace.ai-gap-ms:4000}")
    private long aiGapMs = 4000;

    /** 接话间隔的随机抖动（毫秒）：同一场里间隔不该一模一样。 */
    @Value("${siyige.pace.ai-gap-jitter-ms:3000}")
    private long aiGapJitterMs = 3000;

    public MatchService(Store store, AiService ai, ScoreService scorer, HotRank hot, SseHub hub, FlawService flaw,
                        ObjectMapper json,
                        ConfigService cfg,
                        UtteranceCheck utterance,
                        com.siyige.billing.WalletService wallet,
                        com.siyige.billing.UserLlmService userLlm,
                        com.siyige.ai.AiTier aiTier,
                        com.siyige.repo.RoomStore roomStore) {
        this.store = store; this.ai = ai; this.scorer = scorer; this.hot = hot; this.hub = hub;
        this.flaw = flaw; this.json = json;
        this.cfg = cfg;
        this.utterance = utterance;
        this.wallet = wallet;
        this.userLlm = userLlm;
        this.aiTier = aiTier;
        this.roomStore = roomStore;
    }

    // ---------- 节奏参数（每次现读，后台改完不用重启） ----------

    /** 演示压缩倍速。只影响**新算出来**的 deadline，已经写进库的不追改。 */
    private double timeScale() { return cfg.getDouble(ConfigKey.PACE_TIME_SCALE); }

    /** AI 思考停顿下限（毫秒），还会被 timeScale 缩放。 */
    private long aiThinkMs() { return cfg.getInt(ConfigKey.PACE_AI_THINK_MS); }

    /** 每步默认发言时长（秒）。用户显式指定且不等于它时才算"指定"。 */
    private int turnSeconds() { return cfg.getInt(ConfigKey.PACE_TURN_SECONDS); }

    /** 当前配置的「每步发言时长」默认值：给接口回显用，避免各处再写死 300。 */
    public int defaultTurnSeconds() { return turnSeconds(); }

    /** AI 回应间隔倍率（**不**跟 timeScale 压缩）。 */
    private double aiDelayScale() { return cfg.getDouble(ConfigKey.PACE_AI_DELAY_SCALE); }

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
        return create(userId, topicId, seatsRaw, mode, turnSeconds, pace, difficulty, kind, null, null);
    }

    /** 带 AI 档位与付款人的开局（多人房间传房主为付款人）。 */
    @Active
    public String create(String userId, String topicId, String seatsRaw, String mode, int turnSeconds,
                         String pace, String difficulty, String kind, String tierRaw, String payerUserId) throws Exception {
        Set<String> seats = TurnEngine.parseSeats(seatsRaw);
        for (String s : seats) {
            if (!TurnEngine.validSeat(s)) throw new IllegalArgumentException("非法席位: " + s);
        }
        Map<String, Object> topic = store.topic(topicId);
        if (topic == null) throw new IllegalArgumentException("辩题不存在");

        String id = "m" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        // 质询 2–4 轮/方，自由辩 3–6 轮，每场随机——真实比赛不固定
        int queryRounds = Format.randomQueryRounds(rnd);
        int freeRounds = Format.randomFreeRounds(rnd);
        List<Format.Step> steps = Format.stepsOf(mode, queryRounds, freeRounds);
        boolean firstMine = TurnEngine.isMine(seats, steps.get(0).seat());
        int turnSec = stepSeconds(steps.get(0), turnSeconds, pace, kind);
        // 开场不需要"等对方说完"，AI 直接开口（1.2 秒）
        Long deadline = firstMine ? deadlineFor(turnSec) : Long.valueOf(openingDelay());
        String tier = aiTier == null ? "PRO" : aiTier.normalize(tierRaw);
        store.createMatch(id, userId, topicId, String.valueOf(topic.get("title")), mode,
                TurnEngine.joinSeats(seats), turnSec, pace, difficulty, kind, deadline,
                queryRounds, freeRounds, tier, payerUserId);
        // 档位落地：BYOK 需要真的有 key；没配 key 就退回 PRO
        if ("BYOK".equals(tier) && userLlm != null) {
            if (userLlm.profileOf(userId) == null) {
                tier = "PRO";
                store.setTier(id, tier);
            } else {
                store.setOwnKey(id, true);
            }
        } else if (userLlm != null && userLlm.profileOf(userId) != null) {
            // 配了自己的 key 但没选档位：默认按自带 Key 走（不多收模型成本）
            store.setOwnKey(id, true);
        }

        // 计费：基础版 / 自带 Key 都免费，不预扣；只有高级版按预估冻结
        boolean freeTier = "BYOK".equals(tier)
                || (aiTier != null && !aiTier.chargeModelCost(tier) && !aiTier.chargeServiceFee(tier));
        String payer = (payerUserId == null || payerUserId.isBlank()) ? userId : payerUserId;
        if (wallet != null && !freeTier) {
            // 预扣金额由 WalletService 按后台参数（服务费 + token 单价）现算，这里不再自己估
            long held = wallet.hold(payer, id);
            if (held < 0) {
                throw new IllegalStateException("余额不足，请先充值（本场预估 "
                        + (wallet.estimateCents() / 100.0) + " 元）");
            }
            store.setTokenBase(id, wallet.tokenSnapshot());
        }

        store.incPlays(topicId);
        hot.zincrby(topicId, 1);   // 开辩 +1
        // 开场事件里的秒数必须和 advance 用同一个口径（stepSeconds → Pace.secondsFor），
        // 不能再发 Format.Step.sec()：那个字段是历史表的静态值（立论 180），
        // 与实际 deadline（立论 300）对不上，前端倒计时会一开局就错。
        hub.emit(id, "match.start", Map.of(
                "step", 1, "seg", steps.get(0).seg(), "seat", steps.get(0).seat(),
                "seconds", turnSec, "mySeats", TurnEngine.joinSeats(seats)));
        return id;
    }

    // ---------- 玩家提交 ----------

    @Active
    public Map<String, Object> submit(String matchId, String content, String inputType) throws Exception {
        return submit(matchId, content, inputType, null);
    }

    /**
     * 玩家提交发言。
     *
     * @param userId 提交者；**联机对局必须传**，否则会退化成
     *               「这场里任意一个真人席位都能替对方发言」（2026-11-14 线上实测踩到：
     *               B 方提交的内容被记成了 A1 的发言）
     */
    public Map<String, Object> submit(String matchId, String content, String inputType, String userId) throws Exception {
        Map<String, Object> m = require(matchId);
        // ① 状态闸门：被回收（ABANDONED）/ 已结算（FINISHED）的对局不能再写发言。
        //    以前只判 cur == null，于是僵尸对局被回收后客户端重发还能往里塞内容并推进一步。
        if (!"RUNNING".equals(str(m.get("status"))))
            throw new IllegalStateException("MATCH_NOT_RUNNING: 对局已结束（" + str(m.get("status")) + "）");

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) throw new IllegalStateException("对局已结束");

        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        String buzzSeat = str(m.get("buzz_seat"));
        String speaker = buzzSeat.isBlank() ? cur.seat() : buzzSeat;   // 抢拍时以抢到的人为准
        if (!TurnEngine.isMine(mine, speaker))
            throw new IllegalStateException("NOT_YOUR_TURN: 当前轮到 " + speaker);

        // 真实席位校验：是谁在提交，就必须坐在当前发言席上
        String mySeat = seatOfUser(m, userId);
        if (mySeat != null && !mySeat.equals(speaker)) {
            throw new IllegalStateException("NOT_YOUR_TURN: 现在是 " + speaker + " 的回合，你坐 " + mySeat);
        }

        // ② 逐步唯一：这一步已经有发言了（双击 / 网络重试 / 与 tick 超时撞车）→ 幂等返回，
        //    既不写第二条，也不再推进。席位校验放在前面，所以「别人抢着说」仍然报 NOT_YOUR_TURN。
        if (store.hasTurn(matchId, step + 1)) {
            return Map.of("ok", true, "step", step + 1, "total", steps.size(), "duplicate", true);
        }

        String text = content == null || content.isBlank() ? "（未发言）" : content.trim();
        // 敷衍发言（「11」「对」「嗯」）记为 EMPTY：不算内容，不计入评分文本，
        // 但对局照常推进——下一轮 AI 会明确点出「你这一轮没有回答问题」。
        String status = (utterance != null && utterance.vacuous(text)) ? "EMPTY" : "OK";
        String recordSeat = (mySeat != null && !mySeat.isBlank()) ? mySeat : speaker;
        store.insertTurn(matchId, step + 1, recordSeat, cur.seg(), text, status,
                inputType == null ? "kb" : inputType);
        hot.zincrby(str(m.get("topic_id")), 2);   // 发言 +2
        hub.emit(matchId, "turn", Map.of(
                "seat", recordSeat, "seg", cur.seg(), "who", "me", "content", text));

        advance(matchId, m, steps, step);
        return Map.of("ok", true, "step", step + 1, "total", steps.size());
    }

    // ---------- 定时推进（AI 回合 / 超时） ----------

    /**
     * AI 生成用的线程池。
     *
     * <p>tick 每 250ms 扫一遍对局表，如果 AI 调用直接在 tick 线程里做（3–8 秒），
     * 多场并发就会排队：压测里 15 场时最后一场要等 50 秒。这里改成 tick 只判定、
     * 生成丢进池子，四路并行。
     */
    private final java.util.concurrent.ExecutorService aiPool =
            java.util.concurrent.Executors.newFixedThreadPool(4, r -> {
                Thread th = new Thread(r, "ai-gen");
                th.setDaemon(true);
                return th;
            });

    /** 正在生成中的对局（防同一步被 tick 重复提交） */
    private final java.util.Set<String> generating = java.util.concurrent.ConcurrentHashMap.newKeySet();

    /** 每个 (对局, step) 的生成次数：advance 失败会重试，超过 3 次就止损。 */
    private final java.util.Map<String, Integer> attempts = new java.util.concurrent.ConcurrentHashMap<>();

    @jakarta.annotation.PreDestroy
    void shutdownPool() {
        aiPool.shutdownNow();
    }

    /** 多久没动静算「没人管了」（毫秒）。比最长单步（180 秒）留足余量。 */
    private static final long ABANDON_AFTER_MS = 15 * 60 * 1000L;

    @Scheduled(fixedDelay = 250)
    public void tick() {
        reapAbandoned();
        for (Map<String, Object> m : store.runningMatches()) {
            try { tickOne(m); } catch (Exception e) { log.warn("tick {} failed: {}", m.get("id"), e.toString()); }
        }
    }

    /**
     * 回收「僵尸对局」：长时间没有任何推进的对局判 ABANDONED。
     *
     * <p>为什么要它：tick 每 250ms 扫描所有 RUNNING 对局，AI 调用串行排队。
     * 用户关掉页面 / 断网后，那场对局会永远停在 RUNNING 一直占用调度线程，
     * 攒几场之后正常对局的 AI 发言会被拖到几十秒（2026-11-14 压测实测）。
     *
     * <p>判据用「最后活跃时间」：deadline_at 每次推进都会刷新，正在打的对局不会被误杀。
     */
    private void reapAbandoned() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> running;
        try {
            running = store.runningMatches();
        } catch (Exception e) {
            return;
        }
        for (Map<String, Object> row : running) {
            try {
                // 活跃时间优先用 last_active_at：单人模式 deadline_at 为 NULL，
                // 只拿 started_at 会把「打了 15 分钟的正常对局」误判成僵尸（用户踩过）
                long dl = numLong(row.get("deadline_at"));
                long started = numLong(row.get("started_at"));
                long active = numLong(row.get("last_active_at"));
                long anchorTs = Math.max(active > 0 ? active : started, Math.max(dl, started));
                if (anchorTs <= 0 || now - anchorTs < ABANDON_AFTER_MS) continue;

                String id = str(row.get("id"));
                log.info("回收僵尸对局 {}（{} 分钟无推进）", id, (now - anchorTs) / 60000);
                // CAS 收尾：抢不到说明正常结算已经把它改完了，这时绝不能再结算一次
                if (store.finishMatchIfRunning(id, "ABANDONED", 0) == 0) continue;
                settleBilling(id, row);          // 预扣的按实际用量结掉，不留挂账
                hub.emit(id, "match.end", Map.of("abandoned", true));
            } catch (Exception e) {
                log.warn("回收失败 {}: {}", str(row.get("id")), e.toString());
            }
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

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
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
            if (aiSeat == null) {
                // 该席位是玩家、同侧又没有 AI 可顶 → 以前这里直接 return，
                // 于是「全真人一侧」的自由辩永远卡在 BUZZ，只能等 15 分钟僵尸回收。
                if (!expired) return;                     // 窗口内还是等玩家抢
                if (!store.hasTurn(id, step + 1)) {
                    store.insertTurn(id, step + 1, cur.seat(), cur.seg(),
                            "（抢拍超时未发言）", "TIMEOUT", "timeout");
                    hub.emit(id, "turn", Map.of("seat", cur.seat(), "seg", cur.seg(), "who", "me",
                            "content", "（抢拍超时未发言）", "timeout", true));
                }
                advance(id, m, steps, step);
                return;
            }
            submitAi(id, m, steps, step, cur, aiSeat, true);
            return;
        }

        String buzzSeat2 = str(m.get("buzz_seat"));
        String speaker = buzzSeat2.isBlank() ? cur.seat() : buzzSeat2;   // 抢拍后以抢到的人为准

        if (TurnEngine.isMine(mine, speaker)) {
            // 超时也要去重：玩家可能刚刚在同一毫秒提交成功（submit 已插一条 OK 发言），
            // 这里再插 TIMEOUT 就会变成「这一轮说了两次」。
            if (!store.hasTurn(id, step + 1)) {
                store.insertTurn(id, step + 1, speaker, cur.seg(), "（超时未发言）", "TIMEOUT", "timeout");
                hub.emit(id, "turn", Map.of("seat", speaker, "seg", cur.seg(), "who", "me",
                        "content", "（超时未发言）", "timeout", true));
            }
        } else {
            submitAi(id, m, steps, step, cur, cur.seat(), false);
            return;                       // 由异步任务推进，tick 不再阻塞
        }
        advance(id, m, steps, step);
    }

    /**
     * 把「AI 说一句」丢进线程池。
     *
     * <p>同一个对局同一时刻只允许一个生成任务（{@code generating} 集合），
     * 否则 tick 每 250ms 看到 deadline 过期就会重复提交，一句话被生成好几次。
     */
    private void submitAi(String id, Map<String, Object> m, List<Format.Step> steps, int step,
                          Format.Step cur, String seat, boolean buzzed) {
        if (!generating.add(id)) return;                 // 这场已经在生成，跳过

        // 同一步最多生成 3 次：再失败说明 advance 那边有问题，
        // 无限重试只会把同一句话重复插进库里（前端就会看到"叠字"），还烧 token。
        String akey = id + "#" + (step + 1);
        int tries = attempts.merge(akey, 1, Integer::sum);
        if (tries > 3) {
            log.error("对局 {} 第 {} 步连续生成 {} 次仍未推进，判 ABANDONED", id, step + 1, tries);
            attempts.remove(akey);
            generating.remove(id);
            try { store.finishMatch(id, "ABANDONED", 0); } catch (Exception ignore) { }
            return;
        }
        aiPool.submit(() -> {
            try {
                ai.bind(id);
                applyTier(m);
                AiService.Speech sp;
                long genStartedAt = System.currentTimeMillis();
                try {
                    sp = aiLineFor(m, seat, cur.seg(), cur.duty());
                } finally {
                    ai.clearOwnProfile();
                    ai.unbind();
                }
                // 记下本场生成耗时：下一次 AI 接话的 deadline 会扣掉它，保证「可见间隔」是 4–7 秒
                lastGenMs.put(id, System.currentTimeMillis() - genStartedAt);
                String line = sp.text();
                // 「AI 为什么是这个样子」要能复盘：分析状态落库（ok/degraded/budget-exhausted/none），
                // 玩家发言那条路径不写这个字段。
                String aiReason = sp.analysisStatus();
                FlawService.Planted planted = flaw.plant(line, str(m.get("difficulty")));
                line = planted.text();
                // 这一步已经有发言了就别再插一条（重试/并发会造成一步多条，
                // 前端 key 撞车 → 气泡里同一段话叠很多遍）
                boolean already = store.hasTurn(id, step + 1);
                if (!already) {
                    store.insertTurn(id, step + 1, seat, cur.seg(), line,
                            sp.degraded() ? "TEMPLATE" : "OK", "ai", aiReason);
                }
                if (buzzed) store.setPhase(id, "STEP");
                java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
                payload.put("seat", seat);
                payload.put("seg", cur.seg());
                payload.put("who", "ai");
                payload.put("content", line);
                if (buzzed) payload.put("buzzed", true);
                // 只有真降级才带 reason（ok/none 是正常或没分析，别让前端每轮都弹个「降级」）
                if (isDegradedReason(aiReason)) payload.put("reason", aiReason);
                hub.emit(id, "turn", payload);
                if (planted.type() != null) {
                    store.insertFlaw(id, step + 1, planted.type());
                    hub.emit(id, "flaw", Map.of("step", step + 1, "seat", seat,
                            "options", FlawService.TYPES));
                }
                advance(id, m, steps, step);
                attempts.remove(akey);
            } catch (Exception e) {
                log.warn("AI 生成失败 match={} step={}: {}", id, step, e.toString());
            } finally {
                generating.remove(id);
            }
        });
    }

    /**
     * 抓漏：玩家指出某一轮 AI 发言的逻辑漏洞。
     *
     * <p>**每轮只能答一次**。原来这里既把 {@code correct} 直接回给客户端，又没有作答次数限制：
     * 客户端拿 correct 或者反复换 type 重试，总能拿到 hit=true，抓漏分（+3/次、上限 +9）
     * 等于白送，理论上能刷到满分。
     *
     * <p>现在：已作答（hit 非空）就直接返回 {@code already-answered} + 原 hit，不覆盖、不再加分；
     * 只有**首次**作答才返回 {@code correct}（留给「答错后告诉你正确答案」的教学用法）。
     */
    public Map<String, Object> point(String matchId, int step, String type) {
        require(matchId);
        String planted = store.flawType(matchId, step);
        if (planted == null) return Map.of("ok", false, "reason", "这一轮没有漏洞可抓");

        Object prior = answeredHit(matchId, step);
        if (prior != null) {
            return Map.of("ok", false, "reason", "already-answered", "hit", prior);
        }

        boolean hit = planted.equals(type);
        store.markFlaw(matchId, step, hit);
        return Map.of("ok", true, "hit", hit, "correct", planted, "chosen", type);
    }

    /** 这一轮已经作答过就返回当时的 hit（Boolean），没作答返回 null。 */
    private Object answeredHit(String matchId, int step) {
        for (Map<String, Object> r : store.flaws(matchId)) {
            if (num(r.get("step")) != step) continue;
            Object h = r.get("hit");
            if (h == null) continue;            // 没作答的不算
            return h;
        }
        return null;
    }

    /** 打字续命：玩家正在输入时把本步 deadline 往后推，每步最多 3 次。 */
    public Map<String, Object> keepalive(String matchId) {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status")))) return Map.of("extended", false, "reason", "not-running");
        int used = num(m.get("extend_count"));
        if (used >= com.siyige.domain.Pace.MAX_EXTEND)
            return Map.of("extended", false, "reason", "max", "used", used);

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
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
        // 用户自定义的每步时长（存在 turn_sec）要一直生效；以前这里恒传 0，
        // 导致「自定义 90 秒」只在第 1 步有效，第 2 步起悄悄回到 Pace 表的 300 秒。
        int turnSec = stepSeconds(ns, num(m.get("turn_sec")), str(m.get("pace")), str(m.get("kind")));

        // 自由辩：先开一个抢话窗口，谁抢到谁上；其余环节按席次轮转
        // 单人模式不抢拍：没有对手跟你抢，8 秒窗口只会把打字慢的人卡住
        boolean isBuzz = !"solo".equalsIgnoreCase(str(m.get("kind"))) && "自由辩".equals(ns.seg());
        Long deadline;
        int shownSec;
        if (isBuzz) {
            long w = buzzWindowMs();
            deadline = Long.valueOf(System.currentTimeMillis() + w);
            shownSec = (int) (w / 1000);
        } else if (mine) {
            deadline = deadlineFor(turnSec);
            shownSec = turnSec;
        } else {
            // AI 回合的等待时间是 aiDeadline 算出来的（目标 4–7s 可见间隔，已扣掉生成耗时），
            // 事件里别写死 2 秒，否则前端倒计时和真实 deadline 是两套数字。
            long at = aiDeadline(matchId, ns.seat());
            deadline = Long.valueOf(at);
            shownSec = (int) Math.max(1, Math.round((at - System.currentTimeMillis()) / 1000.0));
        }

        // CAS：只有库里 step 还是我看到的 step 才推进。返回 0 说明别人（另一条路径）已经推过这一步，
        // 这里直接放弃，避免同一轮被推进两次 / 整步被跳过。
        if (store.updateStepIf(matchId, step, next, deadline) == 0) {
            log.debug("advance {} step={} 已被其它路径推进，跳过", matchId, step);
            return;
        }
        store.setPhase(matchId, isBuzz ? "BUZZ" : "STEP");

        hub.emit(matchId, "step", Map.of(
                "step", next + 1, "seg", ns.seg(), "seat", ns.seat(),
                "seconds", shownSec,
                "mine", mine,
                "phase", isBuzz ? "BUZZ" : "STEP"));
    }

    /** 自由辩抢拍窗口：真实自由辩就是抢话，给 6 秒窗口。 */
    private long buzzWindowMs() {
        return Math.max(3000, (long) (8 * 1000 * Math.max(0.05, timeScale())));
    }

    /**
     * 玩家点「抢」：抢到就拿到这一步的发言权。
     *
     * <p><b>必须带 userId</b>：原来没有这个人参，席位取的是 {@code my_seats} 集合的第一个元素，
     * 房间里"谁点都算同一个人抢到"——非第一个席位的玩家抢完立刻被 `NOT_YOUR_TURN` 拒掉。
     * 现在按抢拍者的真实席位（房间席 / my_seats）定，且只允许**本步同侧**的人接话。
     */
    public Map<String, Object> buzz(String matchId, String userId) {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status")))) return Map.of("ok", false, "reason", "对局已结束");
        if (!"BUZZ".equals(str(m.get("phase")))) return Map.of("ok", false, "reason", "现在不是抢拍时间");

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) return Map.of("ok", false, "reason", "已结束");

        String seat = seatOfUser(m, userId);
        if (seat == null || seat.isBlank()) return Map.of("ok", false, "reason", "你没有席位");
        if (!Format.side(seat).equals(Format.side(cur.seat())))
            return Map.of("ok", false, "reason", "这一步该" + sideName(cur.seat()) + "接话");

        int turnSec = stepSeconds(cur, num(m.get("turn_sec")), str(m.get("pace")), str(m.get("kind")));
        store.setPhaseWithBuzz(matchId, "STEP", seat);      // 记下是谁抢到的
        store.updateStep(matchId, step, deadlineFor(turnSec));
        hub.emit(matchId, "buzz.taken", Map.of("by", "me", "seat", seat));
        return Map.of("ok", true, "seat", seat, "seconds", turnSec);
    }

    private static String sideName(String seat) {
        return "A".equals(Format.side(seat)) ? "正方（A）" : "反方（B）";
    }

    /** 哪些分析状态算「这一轮降级了」：分析失败、预算用尽。ok/none 不算。 */
    private static boolean isDegradedReason(String analysisStatus) {
        return AiService.Speech.ANALYSIS_DEGRADED.equals(analysisStatus)
                || AiService.Speech.ANALYSIS_BUDGET.equals(analysisStatus);
    }

    /** AI 的"思考"停顿：按席位人设不同（快攻 0.9s、价值派 1.7s），再加抖动。 */
    /**
     * AI 接话的停顿：产品口径 **可见间隔 4–7 秒**（从上一句落库到下一句出现）。
     *
     * <p>注意「deadline」只是等到什么时候开始生成，模型还要再跑 2–3 秒才出字。
     * 如果直接给 4–7 秒的 deadline，用户实际看到的是 6–10 秒。所以这里先取目标间隔
     * （4–7 秒，按席位 ±10%），再减掉本场最近一次生成耗时，夹到 [0.8s, 7s]。
     */
    private static final long AI_GAP_MIN_MS = 4_000L;
    private static final long AI_GAP_MAX_MS = 7_000L;
    /** 本场最近一次 AI 生成耗时（毫秒），用来把「等 deadline + 生成」对账成 4–7 秒。 */
    private final Map<String, Long> lastGenMs = new ConcurrentHashMap<>();

    private long aiDeadline(String matchId, String seat) {
        long pick = aiGapMs + (long) (aiGapJitterMs * Math.random());
        // 快攻派（A2/B2）说话稍急，归谬/价值派（A3/B4）稍慢
        if ("A2".equals(seat) || "B2".equals(seat)) pick = (long) (pick * 0.9);
        if ("B4".equals(seat) || "A3".equals(seat)) pick = (long) (pick * 1.1);
        long target = Math.max(AI_GAP_MIN_MS, Math.min(AI_GAP_MAX_MS, (long) (pick * Math.max(0.05, aiDelayScale()))));
        long gen = lastGenMs.getOrDefault(matchId, 2_200L);   // 没有历史时按 2.2 秒估
        long wait = Math.max(800L, Math.min(7_000L, target - gen));
        return System.currentTimeMillis() + wait;
    }

    private long aiDeadline() { return aiDeadline("", "A1"); }

    /** 开场第一句：不等 10–15 秒，1.2 秒就开口。 */
    private long openingDelay() {
        // 开场第一句给 2.2 秒：让人先看清辩题和席位再听第一句
        return Math.max(300, (long) (2_200 * Math.max(0.05, aiDelayScale())));
    }

    /** 这一轮由谁开口：正常就是赛制写的那个席位，玩家缺席才由同侧 AI 顶上。 */
    private String pickAiSeat(Map<String, Object> m, Format.Step cur) {
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        // ① 该席位不是玩家 → 就是它本人发言（之前错在这里：一律换成了同侧第一个空位）
        if (!mine.contains(cur.seat())) return cur.seat();
        // ② 该席位是玩家但没接（超时/抢拍）→ 同侧找个 AI 顶上
        String side = Format.side(cur.seat());
        for (String s : Format.SEATS) {
            if (Format.side(s).equals(side) && !mine.contains(s)) return s;
        }
        return null;
    }

    /** 「催一下」的最小间隔：连点不生效（毫秒） */
    private static final long SKIP_COOLDOWN_MS = 3000;

    /**
     * 单人模式「催一下」：跳过 AI 的等待，让它立刻接话。
     *
     * <p>**幂等**：同一轮只生效一次。连点、脚本刷、以及"AI 已经在打字了又去催"都不会再起作用——
     * 之前没有这层保护，连点会把 deadline 反复推到过去，出现「一催就直接说完」的观感。
     */
    public Map<String, Object> skip(String matchId) {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status")))) return Map.of("ok", false, "reason", "对局已结束");
        if (!"solo".equalsIgnoreCase(str(m.get("kind"))))
            return Map.of("ok", false, "reason", "多人对局不能跳过");
        if ("BUZZ".equals(str(m.get("phase"))))
            return Map.of("ok", false, "reason", "抢拍阶段不能跳过");

        int step = num(m.get("step"));
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) return Map.of("ok", false, "reason", "已结束");
        if (TurnEngine.isMine(TurnEngine.parseSeats(str(m.get("my_seats"))), cur.seat()))
            return Map.of("ok", false, "reason", "现在轮到你说");

        // ① 同一轮只允许催一次
        int skippedStep = num(m.get("skipped_step"));
        if (skippedStep == step) return Map.of("ok", false, "reason", "这一轮已经催过了");

        // ② 冷却：两次催之间至少 3 秒（防脚本连点）
        //    last_skip_at 是 bigint 毫秒；用 num() 会被 intValue() 截成 32 位，冷却等于失效。
        long lastAt = numLong(m.get("last_skip_at"));
        long now = System.currentTimeMillis();
        if (now - lastAt < SKIP_COOLDOWN_MS) {
            long wait = (SKIP_COOLDOWN_MS - (now - lastAt) + 999) / 1000;
            return Map.of("ok", false, "reason", "别急，" + wait + " 秒后再催");
        }

        // ③ 落库：CAS 记账（同一轮只有一次能记上），再改 deadline。
        //    两个并发请求都能读到「这一轮还没催」，以前会双双把 deadline 推到过去并 emit 两次。
        if (store.setSkipIfNotSkipped(matchId, step, now) == 0)
            return Map.of("ok", false, "reason", "这一轮已经催过了");
        store.updateStep(matchId, step, now - 1);
        hub.emit(matchId, "skip", Map.of("step", step + 1));
        return Map.of("ok", true);
    }
    /** 结算本场费用：按实际 token 用量多退少补。 */
    /**
     * 单人模式走两段式（先分析对方 → 再生成），多人房间保持单段生成。
     * 返回 Speech 而不是 String，是为了把「本轮是否降级成模板」带给落库层。
     */
    /**
     * 单人模式的流式版本：边生成边把增量推给前端。
     *
     * <p>前端收到 {@code token} 事件就开始渲染，不用等整段生成完再"假装打字"。
     * 首发延迟从「等模型说完（约 8 秒）」降到「模型说出第一个字（约 1 秒）」。
     */
    private AiService.Speech aiLineStream(Map<String, Object> m, String seat, String seg, String duty) throws Exception {
        String id = str(m.get("id"));
        return ai.speakForSoloStream(seat, seg, duty, str(m.get("topic_title")),
                str(m.get("topic_id")), str(m.get("difficulty")), store.turns(id),
                delta -> hub.emit(id, "token", Map.of("seat", seat, "seg", seg, "delta", delta)));
    }

    /** 单人 → 流式；多人房间 → 整段（广播给多个人，增量推太碎没意义） */
    /** 是否推流式增量（默认关：前端用打字机，推了也是白推）。 */
    @org.springframework.beans.factory.annotation.Value("${siyige.ai.stream:false}")
    private boolean aiStream;

    private AiService.Speech aiLineFor(Map<String, Object> m, String seat, String seg, String duty) throws Exception {
        // 房间多人对局不推流式；单人模式也要看开关
        if (aiStream && "solo".equalsIgnoreCase(str(m.get("kind")))) {
            return aiLineStream(m, seat, seg, duty);
        }
        return aiLine(m, seat, seg, duty);
    }

    /**
     * 生成一段 AI 发言。
     *
     * <p>以前单人/房间两条路：单人两段式（先分析对方再回应），房间单段 ——
     * 同一个辩题在房间里 AI 明显更笨。现在统一走两段式，房间只是不推流式增量。
     */
    private AiService.Speech aiLine(Map<String, Object> m, String seat, String seg, String duty) throws Exception {
        String id = str(m.get("id"));
        return ai.speakForSolo(seat, seg, duty, str(m.get("topic_title")),
                str(m.get("topic_id")), str(m.get("difficulty")), store.turns(id));
    }

    /**
     * 按本场档位切换模型：
     * BASIC → 本地 ollama；BYOK → 用户自己的 key；PRO → 平台默认（不动 profile）。
     */
    /**
     * 把提交者映射到席位：
     * · 房间对局：查 sy_seat 里这个人坐哪（房码 → 席位）；
     * · 单人：对局里 my_seats 只有一个，直接取。
     *
     * @return 解析不出来时返回 null（老客户端不传 userId 的情况，保持兼容）
     */
    private String seatOfUser(Map<String, Object> m, String userId) {
        if (userId == null || userId.isBlank()) return null;
        if ("room".equalsIgnoreCase(str(m.get("kind"))) && roomStore != null) {
            String code = roomStore.codeOfMatch(str(m.get("id")));
            if (code != null) {
                String s = roomStore.seatOfUser(code, userId);
                if (s != null) return s;
            }
        }
        // 严格解析：这里不能吃 parseSeats 的「空→A1」默认值，
        // 否则房间对局里查不到席位的人会被当成 A1，替 A1 发言
        Set<String> mine = TurnEngine.parseSeatsStrict(str(m.get("my_seats")));
        return mine.isEmpty() ? null : mine.iterator().next();
    }

    private void applyTier(Map<String, Object> m) {
        String tier = str(m.get("tier"));
        String owner = str(m.get("user_id"));
        if ("BYOK".equals(tier) || "true".equalsIgnoreCase(str(m.get("own_key")))) {
            ai.useOwnProfile(owner, userLlm);
            return;
        }
        if (aiTier != null) {
            var p = aiTier.profileOf(tier);
            if (p != null) ai.useProfile(p);      // BASIC
        }
    }

    private void settleBilling(String matchId, Map<String, Object> m) {
        if (wallet == null) return;
        try {
            // 付款人：多人房间由房主承担；单人就是自己
            String userId = str(m.get("payer_user_id"));
            if (userId.isBlank()) userId = str(m.get("user_id"));

            String tier = str(m.get("tier"));
            // 基础版（本地模型）：免费，不结算也不扣服务费
            if (aiTier != null && !aiTier.chargeModelCost(tier) && !aiTier.chargeServiceFee(tier)) {
                Map<String, Object> bill = Map.of("freeTier", true, "tier", tier,
                        "tokens", 0, "modelCostCents", 0, "serviceFeeCents", 0, "totalCents", 0);
                store.saveBill(matchId, 0);
                hub.emit(matchId, "bill", bill);
                ai.clearMatchUsage(matchId);
                return;
            }
            // 按对局精确归集：不受其它对局 / 其它接口调用影响
            boolean own = "true".equalsIgnoreCase(str(m.get("own_key"))) || "BYOK".equals(tier);
            if (own) {
                // 自带 Key：模型成本不计，服务费也不收（可能指向用户本地模型，平台零成本）
                Map<String, Object> bill = wallet.settleOwnKey(userId, matchId);
                store.saveBill(matchId, 0);
                hub.emit(matchId, "bill", bill);
                ai.clearMatchUsage(matchId);
                return;
            }
            long used = ai.tokensForMatch(matchId);
            if (used <= 0) {
                // 兜底：极端情况下（模型未启用、全部走模板）用全局差值
                long base = numLong(m.get("token_base"));
                used = Math.max(0, wallet.tokenSnapshot() - base);
            }
            Map<String, Object> bill = wallet.settle(userId, matchId, used);
            store.saveBill(matchId, used);
            ai.clearMatchUsage(matchId);
            hub.emit(matchId, "bill", bill);
        } catch (Exception e) {
            log.warn("结算失败 {}: {}", matchId, e.toString());
        }
    }

    /**
     * 本场是否有「真人队友」。
     *
     * <p>注意：单人模式里同侧还有 AI 补位（B1/B3/B4 都是 AI），它们不算队友；
     * 只有同侧其它席位由真人发言（input_type != "ai"）才算。否则单人模式的协同维度
     * 会被 AI 的发言带成 100 或 0，画像就不准了。
     */
    private boolean hasTeammate(List<Map<String, Object>> turns, java.util.Set<String> mine) {
        if (mine.isEmpty()) return false;
        String side = str(mine.iterator().next()).substring(0, 1);
        for (Map<String, Object> t2 : turns) {
            String seat = str(t2.get("seat"));
            if (seat.length() < 2) continue;
            if (!seat.startsWith(side) || mine.contains(seat)) continue;
            String input = str(t2.get("input_type"));
            if (!"ai".equalsIgnoreCase(input)) return true;   // 真人队友
        }
        return false;
    }

    private void finish(String matchId, Map<String, Object> m) throws Exception {
        // 幂等闸门：提交与 tick 超时是两条推进路径，可能同时走到最后一步。
        // 先把「收尾权」抢到（CAS: status='RUNNING'），抢不到就直接返回，
        // 否则结算 / 画像滑动平均 / 逐场记录都会各做一遍。
        if (store.finishMatchIfRunning(matchId, "FINISHED", null) == 0) {
            log.debug("finish {} 已由其它路径收尾，跳过重复结算", matchId);
            return;
        }
        settleBilling(matchId, m);
        List<Map<String, Object>> turns = store.turns(matchId);
        Set<String> mine = TurnEngine.parseSeats(str(m.get("my_seats")));
        ScoreService.Score sc = scorer.score(turns, mine, str(m.get("topic_id")), store.flaws(matchId));

        // 收尾权已经在上面用 CAS 拿到了，这里只是把总分补上（status 已经是 FINISHED）
        store.finishMatch(matchId, "FINISHED", sc.total());
        hot.zincrby(str(m.get("topic_id")), 5 + sc.turns() * 0.0);   // 打完 +5

        // 六维画像：滑动平均（含场次样本数）+ 本场数据单独存一份，用于算增量
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
        // 第六维：协同（本场协同分 0–3 换算成 0–100）
        // 单人模式没有队友，协同分恒为 0，这时记中性基线 60，否则会把画像冤枉成短板
        boolean hasMate = hasTeammate(turns, mine);
        now.put("协同", hasMate
                ? (int) Math.min(100, Math.round(sc.collab() * 100.0 / 3))
                : 60);

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

        // 记录本场（含六维），供能力分析按「最近 N 场」重新聚合
        store.insertRecord(str(m.get("user_id")), matchId, str(m.get("topic_title")),
                str(m.get("my_seats")), sc.total(), sc.turns(), json.writeValueAsString(now));

        // 只发一次：之前这里连着两段一模一样的 Map.of，前端会收到两条 match.end，
        // 复盘页被触发两次（弹两次结算、埋点双记）。收尾事件必须是幂等的单发点。
        hub.emit(matchId, "match.end", Map.of(
                "total", sc.total(), "matter", sc.matter(), "method", sc.method(), "manner", sc.manner(),
                "turns", sc.turns(), "timeout", sc.timeout()));
        // 生成重试计数按「对局#step」记，对局结束就该丢掉，否则长跑进程会一直攒着
        attempts.keySet().removeIf(k -> k.startsWith(matchId + "#"));
    }

    // ---------- 查询 ----------

    public Map<String, Object> detail(String matchId) throws Exception {
        Map<String, Object> m = require(matchId);
        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")), num(m.get("query_rounds")), num(m.get("free_rounds")));
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
        out.put("turnSec", num(m.get("turn_sec")) > 0 ? num(m.get("turn_sec")) : turnSeconds());
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
        // score 是 Score record，字段没动、只在末尾加了 rubric，Jackson 按 record 组件序列化，
        // 所以 /matches/{id}/review 的 JSON 里自然带上 rubric（含 dims 与 focus），
        // 既有 total/matter/…/problem/improve 一个不少。
        out.put("score", sc);
        // 按席位分别给分：占两个位置时能看出每个位置打得怎么样
        out.put("seatScores", scorer.scorePerSeat(turns, mine, str(m.get("topic_id")), store.flaws(matchId)));
        out.put("turns", turns);
        // bill_tokens 是 bigint：用 num() 会被截成 int，复盘里可能显示成负数
        out.put("billTokens", numLong(m.get("bill_tokens")));
        out.put("queryRounds", num(m.get("query_rounds")));
        out.put("freeRounds", num(m.get("free_rounds")));
        return out;
    }

    // ---------- 进行中的对局：列表 / 删除 / 重新加入继续打 ----------

    /**
     * 单人页「进行中的对局」。
     *
     * <p>两条来源合并去重：① 我是 owner 的对局；② 我坐在席位上的房间局（房间局 owner 是房主，
     * 不看 sy_seat 的话其他人永远看不到自己正在打的房）。
     *
     * @return 按「最后活跃时间」倒序；{@code step} 是给人看的 1-based 步号，{@code stepIndex} 是库里的 0-based
     */
    public List<Map<String, Object>> mine(String userId) {
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : store.runningMatchesOwnedBy(userId)) {
            byId.put(str(row.get("id")), row);
        }
        for (Map<String, Object> row : store.runningRoomMatchesOf(userId)) {
            byId.putIfAbsent(str(row.get("id")), row);
        }

        List<Map<String, Object>> out = new ArrayList<>(byId.size());
        for (Map<String, Object> row : byId.values()) {
            String matchId = str(row.get("id"));
            int total = Format.stepsOf(str(row.get("mode")),
                    num(row.get("query_rounds")), num(row.get("free_rounds"))).size();
            int stepIndex = num(row.get("step"));
            String roomCode = roomStore == null ? null : roomStore.codeOfMatch(matchId);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("matchId", matchId);
            item.put("topicTitle", str(row.get("topic_title")));
            item.put("mode", str(row.get("mode")));
            item.put("kind", str(row.get("kind")));
            item.put("step", Math.min(stepIndex + 1, Math.max(1, total)));   // 1-based，给界面显示
            item.put("stepIndex", stepIndex);                                // 0-based，给续打用
            item.put("totalSteps", total);
            item.put("mySeats", str(row.get("my_seats")));
            item.put("roomCode", roomCode);          // 单人局为 null
            item.put("updatedAt", numLong(row.get("last_active_at")));   // epoch 毫秒
            item.put("status", str(row.get("status")));
            out.add(item);
        }
        out.sort((a, b) -> Long.compare(
                ((Number) b.get("updatedAt")).longValue(), ((Number) a.get("updatedAt")).longValue()));
        return out;
    }

    /**
     * 删除（放弃）一场对局。
     *
     * <p>幂等：已结束的直接把原状态返回，不重复结算。RUNNING 的用 CAS 抢「收尾权」再结算，
     * 和僵尸回收走同一条 settle 路径，避免两边各扣一次。
     */
    public Map<String, Object> abandon(String matchId) {
        Map<String, Object> m = require(matchId);
        String status = str(m.get("status"));
        if (!"RUNNING".equals(status)) return Map.of("ok", true, "status", status);

        if (store.finishMatchIfRunning(matchId, "ABANDONED", 0) == 0) {
            // 另一条路径（tick 超时 / 僵尸回收）刚刚收过尾，按它的结果返回
            return Map.of("ok", true, "status", str(require(matchId).get("status")));
        }
        settleBilling(matchId, m);       // 预扣的按实际用量结掉，不留挂账
        hub.emit(matchId, "match.end", Map.of("abandoned", true));
        attempts.keySet().removeIf(k -> k.startsWith(matchId + "#"));
        return Map.of("ok", true, "status", "ABANDONED");
    }

    /**
     * 房间局「重新加入继续打」：把这场转成单人续打——只留我一个真人席位，其余全部由 AI 补位。
     *
     * <p>为什么不是「重开一场」：步数、发言记录、抓漏记录都在这条 match 上，
     * 重开等于把已经打过的半场丢掉。这里只改 kind / my_seats，历史原样保留。
     *
     * <p>非房间局也允许：已经是单人的话这就是幂等操作（my_seats 会收敛成我自己的席位）。
     */
    public Map<String, Object> continueSolo(String matchId, String userId) throws Exception {
        Map<String, Object> m = require(matchId);
        if (!"RUNNING".equals(str(m.get("status"))))
            throw new IllegalStateException("MATCH_NOT_RUNNING: 对局已结束（" + str(m.get("status")) + "）");

        // 我是这场里的哪个席位：房间局查 sy_seat，单人局回落到 my_seats
        String seat = seatOfUser(m, userId);
        if (seat == null || seat.isBlank())
            throw new IllegalArgumentException("NOT_IN_MATCH: 你不在这场对局的席位上");

        List<Format.Step> steps = Format.stepsOf(str(m.get("mode")),
                num(m.get("query_rounds")), num(m.get("free_rounds")));
        int step = num(m.get("step"));
        Format.Step cur = Format.stepAt(steps, step);
        if (cur == null) throw new IllegalStateException("对局已结束");

        // ① 收缩成单人局：my_seats 只留我 → pickAiSeat 之后会把其余席位全判给 AI
        store.makeSolo(matchId, seat);

        // ② 当前这一步按单人规则重算 deadline：我的回合不限时，AI 回合给它正常的接话间隔
        boolean myTurn = TurnEngine.isMine(Set.of(seat), cur.seat());
        Long deadline;
        int shownSec;
        if (myTurn) {
            deadline = deadlineFor(stepSeconds(cur, num(m.get("turn_sec")), str(m.get("pace")), "solo"));
            shownSec = 0;                       // 单人 = 不限时
        } else {
            long at = aiDeadline(matchId, cur.seat());
            deadline = Long.valueOf(at);
            shownSec = (int) Math.max(1, Math.round((at - System.currentTimeMillis()) / 1000.0));
        }
        store.updateStep(matchId, step, deadline);

        hub.emit(matchId, "step", Map.of(
                "step", Math.min(step + 1, steps.size()), "seg", cur.seg(), "seat", cur.seat(),
                "seconds", shownSec, "mine", myTurn, "phase", "STEP", "resumed", true));
        return Map.of("ok", true, "kind", "solo", "mySeats", seat, "step", step + 1);
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
        long ms = Math.max(3000, (long) (seconds * 1000 * timeScale()));
        return System.currentTimeMillis() + ms;
    }
    /** 单人 0（不限时），多人上限 600 秒。 */
    private int stepSeconds(Format.Step s, int overrideSec, String pace, String kind) {
        if ("solo".equalsIgnoreCase(kind)) return 0;
        // 「用户指定的时长恰好等于配置里的默认值 = 视为没指定」——比较对象也要现读配置。
        // 默认值 300 时行为与改造前逐位一致（用户传 300 仍然落到赛制表的口径）。
        if (overrideSec > 0 && overrideSec != turnSeconds()) return overrideSec;
        return Math.min(600, com.siyige.domain.Pace.secondsFor(s.seg(), pace));
    }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    private static int num(Object o) { return o instanceof Number n ? n.intValue() : 0; }

    /**
     * 读毫秒时间戳。
     *
     * <p>为什么单独一个：{@code num()} 只认 Number，而 H2 的 timestamp 列取出来是
     * {@link java.sql.Timestamp}——直接 num() 会得到 0。之前僵尸回收就是用 num() 读
     * deadline_at 的，anchor 恒为 0，于是**一局都没回收过**（单测 MatchServiceTest 抓到的）。
     */
    private static long numLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof java.sql.Timestamp ts) return ts.getTime();
        if (o instanceof java.util.Date d) return d.getTime();
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** AI 思考停顿（R-PACE-01），按压缩系数缩放。 */
    public long thinkMs() { return Math.max(400, (long) (aiThinkMs() * Math.max(0.05, timeScale()))); }

    public Duration prepareDuration() { return Duration.ofMillis(Math.max(2000, (long) (10_000 * timeScale()))); }
}
