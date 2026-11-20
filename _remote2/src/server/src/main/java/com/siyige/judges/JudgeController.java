package com.siyige.judges;

import com.siyige.engine.TurnEngine;
import com.siyige.repo.Store;
import com.siyige.service.MatchService;
import com.siyige.service.ScoreService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI 评审团接口。
 *
 * <p>单独一个端点、不在 review 里自动跑：一次评审要 4 次模型调用（约 0.02 元），
 * 有些人只看规则分就够了，所以做成「点一下才跑」，结果按对局缓存。
 *
 * <p>鉴权走 {@code /api/matches/**} 的辩论侧过滤器（必须登录）。
 */
@RestController
@RequestMapping("/api/matches/{matchId}/panel")
public class JudgeController {

    private final AiJudgeService judges;
    private final MatchService matches;
    private final Store store;
    private final ScoreService scorer;

    /** 缓存：同一场对局只跑一次（结果不变，没必要重复烧钱）。 */
    private final Map<String, AiJudgeService.Panel> cache = new ConcurrentHashMap<>();

    public JudgeController(AiJudgeService judges, MatchService matches, Store store, ScoreService scorer) {
        this.judges = judges;
        this.matches = matches;
        this.store = store;
        this.scorer = scorer;
    }

    private static String s(Object o) { return o == null ? "" : String.valueOf(o); }

    @GetMapping
    public Map<String, Object> panel(@PathVariable String matchId,
                                     @RequestParam(defaultValue = "false") boolean refresh) {
        Map<String, Object> out = new LinkedHashMap<>();

        if (!judges.enabled()) {
            out.put("ok", false);
            out.put("reason", "没有配置模型 key，AI 评审团不可用；规则分仍然有效");
            return out;
        }

        AiJudgeService.Panel cached = cache.get(matchId);
        if (cached != null && !refresh) {
            out.put("ok", true);
            out.put("cached", true);
            out.put("panel", cached);
            return out;
        }

        Map<String, Object> m = store.match(matchId);
        if (m == null) throw new IllegalArgumentException("对局不存在");

        String topic = s(m.get("topic_title"));
        Set<String> mine = TurnEngine.parseSeats(s(m.get("my_seats")));
        List<Map<String, Object>> turns = store.turns(matchId);

        // 规则分做参照
        ScoreService.Score sc = scorer.score(turns, mine, s(m.get("topic_id")), store.flaws(matchId));
        int ruleScore = sc == null ? 60 : sc.total();
        Map<String, Integer> dims = new LinkedHashMap<>();
        if (sc != null) {
            dims.put("立论", sc.matter());
            dims.put("论证", sc.method());
            dims.put("表达", sc.manner());
            dims.put("应变", sc.adapt());
            dims.put("论据", sc.evidence());
        }

        StringBuilder myText = new StringBuilder();
        String oppLast = "";
        String segment = "";
        Set<String> segs = new LinkedHashSet<>();
        for (Map<String, Object> t : turns) {
            String seat = s(t.get("seat"));
            String content = s(t.get("content"));
            if (mine.contains(seat)) {
                if ("TIMEOUT".equals(s(t.get("status")))) continue;
                myText.append(content).append("\n");
                segs.add(s(t.get("seg")));
            } else {
                oppLast = content;
            }
        }
        if (!segs.isEmpty()) segment = String.join(" / ", segs);

        if (myText.toString().isBlank()) {
            out.put("ok", false);
            out.put("reason", "这场你还没有发言，先打两轮再让评审团看");
            return out;
        }

        AiJudgeService.Panel p = judges.judge(topic, segment, myText.toString().trim(), oppLast, ruleScore, dims);
        if (p == null) {
            out.put("ok", false);
            out.put("reason", "评审团这次没有返回结果，稍后再试");
            return out;
        }
        cache.put(matchId, p);

        out.put("ok", true);
        out.put("cached", false);
        out.put("panel", p);
        out.put("ruleScore", ruleScore);
        out.put("tokens", 0);
        return out;
    }

    /** 四位裁判的人设（前端用来显示「谁在评」）。 */
    @GetMapping("/judges")
    public Map<String, Object> judges() {
        return Map.of("list", JudgePersonas.ALL.stream().map(j -> Map.of(
                "key", j.key(), "name", j.name(), "lens", j.lens())).toList());
    }
}
