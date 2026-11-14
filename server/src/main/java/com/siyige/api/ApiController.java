package com.siyige.api;

import com.siyige.auth.MatchAccess;
import com.siyige.auth.UserContext;
import com.siyige.domain.Format;
import com.siyige.hot.HotRank;
import com.siyige.repo.Store;
import com.siyige.service.AuditService;
import com.siyige.service.MatchService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final Store store;
    private final AuditService audit;
    private final MatchService matches;
    private final HotRank hot;
    private final SseHub sse;
    private final com.siyige.service.EvidenceService evidence;
    private final com.siyige.service.BriefService brief;
    private final com.siyige.ai.AiTier aiTier;
    /** 对局归属校验的唯一入口：owner 或同房间席位成员。控制器不许自己拼 SQL 判归属。 */
    private final MatchAccess matchAccess;
    private final com.siyige.ai.LlmClient llm;

    @org.springframework.beans.factory.annotation.Autowired
    public ApiController(Store store, AuditService audit, MatchService matches, HotRank hot, SseHub sse,
                          com.siyige.ai.LlmClient llm,
                         com.siyige.service.EvidenceService evidence,
                         com.siyige.service.BriefService brief, MatchAccess matchAccess,
                         com.siyige.ai.AiTier aiTier) {
        this.store = store; this.audit = audit; this.matches = matches; this.hot = hot; this.sse = sse;
        this.evidence = evidence;
        this.brief = brief;
        this.aiTier = aiTier;
        this.llm = llm;
        this.matchAccess = matchAccess;
    }

    /**
     * 两个统一入口之一：**身份 + 归属**一次做完。
     *
     * <p>所有 {@code /matches/&#123;id&#125;/**} 端点第一行都调它：
     * 未登录 → 401（过滤器已兜底，这里再兜一次），不是这场的人 → 403 FORBIDDEN。
     */
    private String guard(String matchId) {
        String userId = UserContext.requireId();
        matchAccess.requireAccess(matchId, userId);
        return userId;
    }

    /**
     * 不含 LlmClient 的构造：给单测用（standalone MockMvc 不想拖一个模型客户端）。
     * 用法统计接口在 llm == null 时返回 0，不影响其它端点。
     */
    public ApiController(Store store, AuditService audit, MatchService matches, HotRank hot, SseHub sse,
                         com.siyige.service.EvidenceService evidence,
                         com.siyige.service.BriefService brief, MatchAccess matchAccess) {
        this(store, audit, matches, hot, sse, null, evidence, brief, matchAccess, null);
    }

    // ---------- 基础 ----------

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("ok", true, "service", "siyige", "hotKey", hot.key(), "hotSize", hot.zcard());
    }

    // 注：原 POST /auth/login（返回硬编码 demo-token）已于 2026-11-03 移除，
    // 登录接口由 com.siyige.auth.AuthController 提供（独立模块，见 docs/认证接口契约.md）。

    // ---------- 辩题 ----------

    @GetMapping("/topics")
    public List<Map<String, Object>> topics(@RequestParam(required = false) String cat,
                                            @RequestParam(required = false) String kw) {
        List<Map<String, Object>> rows = store.topics(cat, kw);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> t : rows) {
            Map<String, Object> m = new LinkedHashMap<>(t);
            m.put("hot", Math.round(hot.zscore(String.valueOf(t.get("id"))) * 10) / 10.0);
            out.add(m);
        }
        out.sort((a, b) -> Double.compare((double) b.get("hot"), (double) a.get("hot")));
        return out;
    }

    @PostMapping("/topics/audit")
    public Map<String, Object> auditTopic(@RequestBody Map<String, Object> body) {
        String title = String.valueOf(body.getOrDefault("title", ""));
        AuditService.Result r = audit.audit(title);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("result", r.result());
        out.put("reason", r.reason());
        out.put("suggestions", r.suggestions());
        out.put("cached", r.cached());
        return out;
    }

    /** 赛前材料包：定义 / 立论骨架 / 对方攻击 / 回应模板 / 论据卡 */
    @GetMapping("/topics/{id}/brief")
    public Map<String, Object> brief(@PathVariable String id,
                                     @RequestParam(defaultValue = "A") String side) throws Exception {
        return brief.brief(id, side);
    }

    /** 论据库：某道题的可引用论据卡 */
    @GetMapping("/topics/{id}/evidence")
    public Map<String, Object> evidence(@PathVariable String id) {
        var cards = evidence.publicCards(id);
        return Map.of("topicId", id, "count", cards.size(), "cards", cards);
    }

    // ---------- 对局 ----------

    /** AI 档位说明（基础版/高级版/自带 Key）。 */
    @GetMapping("/ai-tiers")
    public Map<String, Object> aiTiers() {
        return aiTier == null ? Map.of() : aiTier.describe();
    }

    @PostMapping("/matches")
    public Map<String, Object> createMatch(@RequestBody Map<String, Object> body) throws Exception {
        // 身份只认令牌（JWT 的 sub）。body 里若还带 userId 一律**忽略**（不报错）
        String userId = UserContext.requireId();
        String mode = String.valueOf(body.getOrDefault("mode", "FULL"));
        String seats = body.get("seats") instanceof List<?> l
                ? String.join(",", l.stream().map(String::valueOf).toList())
                : String.valueOf(body.getOrDefault("seats", "A1"));

        String topicId = body.get("topicId") == null ? null : String.valueOf(body.get("topicId"));
        if (topicId == null || topicId.isBlank()) {
            String title = String.valueOf(body.getOrDefault("title", ""));
            topicId = audit.ensureTopic(title);   // 自填题先过审，不过直接抛
        }
        int turnSec = body.get("turnSeconds") instanceof Number n ? n.intValue() : 0;
        String pace = String.valueOf(body.getOrDefault("pace", "normal"));
        String difficulty = String.valueOf(body.getOrDefault("difficulty", "pro"));
        String kind = String.valueOf(body.getOrDefault("kind", "solo"));
        // AI 档位：BASIC(本地免费) / PRO(平台) / BYOK(自带 Key)，默认 PRO
        String tier = String.valueOf(body.getOrDefault("tier", "PRO"));
        String id = matches.create(userId, topicId, seats, mode, turnSec, pace, difficulty, kind, tier, null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("matchId", id);
        out.put("topicId", topicId);
        out.put("seats", seats);
        out.put("turnSeconds", turnSec > 0 ? turnSec : 300);
        return out;
    }

    @GetMapping("/matches/{id}")
    public Map<String, Object> detail(@PathVariable String id) throws Exception {
        guard(id);
        return matches.detail(id);
    }

    /** 单人模式「催一下」：跳过 AI 的 10–15 秒思考 */
    @PostMapping("/matches/{id}/skip")
    public Map<String, Object> skip(@PathVariable String id) {
        guard(id);
        return matches.skip(id);
    }

    /** 自由辩抢拍：抢到就拿发言权 */
    @PostMapping("/matches/{id}/buzz")
    public Map<String, Object> buzz(@PathVariable String id) {
        guard(id);
        return matches.buzz(id);
    }

    /** 抓漏：指出某轮 AI 发言的逻辑漏洞 */
    @PostMapping("/matches/{id}/point")
    public Map<String, Object> point(@PathVariable String id, @RequestBody Map<String, Object> body) {
        guard(id);
        int step = body.get("step") instanceof Number n ? n.intValue() : 0;
        String type = String.valueOf(body.getOrDefault("type", ""));
        return matches.point(id, step, type);
    }

    /** 某场对局的埋雷记录（复盘用） */
    @GetMapping("/matches/{id}/flaws")
    public java.util.List<Map<String, Object>> flaws(@PathVariable String id) {
        guard(id);
        return store.flaws(id);
    }

    /** 打字续命 */
    @PostMapping("/matches/{id}/keepalive")
    public Map<String, Object> keepalive(@PathVariable String id) {
        guard(id);
        return matches.keepalive(id);
    }

    @PostMapping("/matches/{id}/turns")
    public Map<String, Object> submit(@PathVariable String id, @RequestBody Map<String, Object> body) throws Exception {
        guard(id);
        String content = String.valueOf(body.getOrDefault("content", ""));
        String inputType = String.valueOf(body.getOrDefault("inputType", "kb"));
        // 身份要带下去：联机对局靠它判断「这轮该不该你说话」
        return matches.submit(id, content, inputType, UserContext.requireId());
    }

    @GetMapping(value = "/matches/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String id, @RequestParam(defaultValue = "0") int since) {
        // 归属校验必须在建 SseEmitter **之前**：不通过就直接 403，不留一条挂着的连接
        guard(id);
        return sse.subscribe(id, since);
    }

    @GetMapping("/matches/{id}/review")
    public Map<String, Object> review(@PathVariable String id) throws Exception {
        guard(id);
        return matches.review(id);
    }


    // ---------- 热辩榜 ----------

    /** 模型用量：一场比赛花了多少 token */
    @GetMapping("/usage")
    public Map<String, Object> usage() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("calls", llm == null ? 0 : llm.calls());
        out.put("promptTokens", llm == null ? 0 : llm.promptTokensTotal());
        out.put("completionTokens", llm == null ? 0 : llm.completionTokensTotal());
        out.put("totalTokens", llm == null ? 0 : llm.totalTokens());
        return out;
    }

    /** 清零用量统计（测一场干净的对局用） */
    @PostMapping("/usage/reset")
    public Map<String, Object> resetUsage() { if (llm != null) llm.resetUsage(); return Map.of("ok", true); }
    @GetMapping("/hot")
    public Map<String, Object> hot(@RequestParam(defaultValue = "10") int n) {
        List<Map.Entry<String, Double>> list = hot.zrevrangeWithScores(0, n - 1);
        List<Map<String, Object>> rows = new ArrayList<>();
        int rank = 1;
        for (Map.Entry<String, Double> e : list) {
            Map<String, Object> topic = store.topic(e.getKey());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", rank++);
            row.put("topicId", e.getKey());
            row.put("title", topic == null ? "（已删除）" : topic.get("title"));
            row.put("source", topic == null ? "unknown" : topic.get("source"));
            row.put("score", Math.round(e.getValue() * 10) / 10.0);
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", hot.key());
        out.put("card", hot.zcard());
        out.put("list", rows);
        return out;
    }

    @PostMapping("/hot/{topicId}/boost")
    public Map<String, Object> boost(@PathVariable String topicId,
                                     @RequestBody(required = false) Map<String, Object> body) {
        double delta = body != null && body.get("delta") instanceof Number n ? n.doubleValue() : 1;
        return Map.of("topicId", topicId, "score", hot.zincrby(topicId, delta));
    }

    // ---------- 记录 / 画像 ----------

    @GetMapping("/records")
    public List<Map<String, Object>> records() {
        // 只查自己的：不再收 ?userId=，身份来自令牌
        return store.records(UserContext.requireId());
    }

    /**
     * 能力分析。
     *
     * @param n 只看最近 n 场；n<=0 或省略表示累计滑动平均（全部场次）
     */
    @GetMapping("/diag")
    public Map<String, Object> diag(@RequestParam(value = "n", defaultValue = "0") int n) throws Exception {
        return diagOf(UserContext.requireId(), n);
    }

    private Map<String, Object> diagOf(String userId, int n) {
        Map<String, Object> d = store.diag(userId);
        if (d == null) return Map.of("dims", Map.of(), "flaws", Map.of(), "streak", 0,
                "total", 0, "window", Math.max(0, n), "samples", 0, "empty", true);
        Map<String, Object> out = new LinkedHashMap<>();
        var om = new com.fasterxml.jackson.databind.ObjectMapper();
        Map<String, Object> dims = Map.of(), flaws = Map.of(), last = Map.of(), delta = new LinkedHashMap<String, Object>();
        try {
            if (d.get("dims_json") != null) dims = om.readValue(String.valueOf(d.get("dims_json")), Map.class);
            if (d.get("flaws_json") != null) flaws = om.readValue(String.valueOf(d.get("flaws_json")), Map.class);
            if (d.get("last_json") != null) last = om.readValue(String.valueOf(d.get("last_json")), Map.class);
            for (var e : last.entrySet()) {
                int now = ((Number) e.getValue()).intValue();
                int avg = dims.get(e.getKey()) instanceof Number num0 ? num0.intValue() : now;
                delta.put(e.getKey(), now - avg);
            }
        } catch (Exception e) {
            // 保持空
        }
        // 「最近 n 场」：拿记录里的每场六维重新平均，最准（不受滑动平均的先后影响）
        int total = store.recordCount(userId);
        if (total == 0) {
            // 有旧的滑动平均但没有逐场记录：也不能当作有效画像
            return Map.of("dims", Map.of(), "flaws", flaws, "streak", d.get("streak"),
                    "total", 0, "window", Math.max(0, n), "samples", 0, "empty", true);
        }
        int window = n > 0 ? Math.min(n, Math.max(total, 1)) : total;
        if (n > 0) {
            var rows = store.recentDims(userId, n);
            if (!rows.isEmpty()) {
                Map<String, Double> sum = new LinkedHashMap<>();
                for (var row : rows) {
                    try {
                        Map<String, Object> one = om.readValue(String.valueOf(row.get("dims_json")), Map.class);
                        for (var e : one.entrySet()) {
                            double v = ((Number) e.getValue()).doubleValue();
                            sum.merge(e.getKey(), v, Double::sum);
                        }
                    } catch (Exception ignore) { }
                }
                Map<String, Integer> win = new LinkedHashMap<>();
                int cnt = rows.size();
                sum.forEach((k, v) -> win.put(k, (int) Math.round(v / cnt)));
                if (!win.isEmpty()) {
                    // delta 用「本场 vs 这个窗口的均值」
                    Map<String, Object> d2 = new LinkedHashMap<>();
                    for (var e : last.entrySet()) {
                        int now = ((Number) e.getValue()).intValue();
                        int base = win.getOrDefault(e.getKey(), now);
                        d2.put(e.getKey(), now - base);
                    }
                    dims = new LinkedHashMap<>(win);
                    delta = d2;
                }
            }
        }

        out.put("dims", dims);
        out.put("last", last);
        out.put("delta", delta);
        out.put("flaws", flaws);
        out.put("samples", d.get("samples") == null ? 0 : d.get("samples"));
        out.put("streak", d.get("streak"));
        out.put("total", total);
        out.put("window", n > 0 ? window : 0);
        return out;
    }

    // ---------- 赛制信息 ----------

    @GetMapping("/format")
    public Map<String, Object> format(@RequestParam(defaultValue = "FULL") String mode) {
        List<Format.Step> steps = Format.stepsOf(mode);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Format.Step s : steps) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("no", s.no()); m.put("seg", s.seg()); m.put("seat", s.seat()); m.put("sec", s.sec());
            m.put("role", Format.role(s.seat())); m.put("side", Format.side(s.seat()));
            rows.add(m);
        }
        return Map.of("mode", mode, "steps", rows, "total", rows.size());
    }
}
