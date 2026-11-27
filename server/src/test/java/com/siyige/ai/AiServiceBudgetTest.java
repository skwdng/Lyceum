package com.siyige.ai;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 单场 token 预算：超了就本场后续轮次直接走模板，并且复盘要能看出「这轮是预算耗尽」。
 *
 * <p>这里全部用「没有 api-key 的 LlmClient」构造：{@code enabled()} = false，任何路径都不会发请求，
 * 所以整套用例离线可跑；预算用量通过覆盖 {@code usedTokens()} 注入，不需要真打模型。
 */
class AiServiceBudgetTest {

    private static final long DEFAULT_BUDGET = 40_000;

    private static LlmClient offlineClient() {
        return new LlmClient("http://127.0.0.1:9/v1", "", "test-model");
    }

    private static AiService noKeyService() {
        return new AiService(offlineClient(), null, null, true);
    }

    private static List<Map<String, Object>> history() {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(turn("B1", "我方判断：期末考试的学分认定必须有刚性凭证，否则整个学分体系会失去锚点。"));
        out.add(turn("A1", "我方立论：判断这道题要先立一个标准——可执行、可监督、可追责。"));
        out.add(turn("B2", "对方把「技术可行」直接推成了「制度应当」，这一步跨得太快。"));
        return out;
    }

    private static Map<String, Object> turn(String seat, String content) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("seat", seat);
        t.put("content", content);
        return t;
    }

    // ------------------------------------------------------------------ 配置

    @Test
    void 默认预算是四万() {
        assertEquals(DEFAULT_BUDGET, noKeyService().matchTokenBudget());
    }

    @Test
    void 预算可以按场调整() {
        AiService ai = noKeyService();
        ai.setMatchTokenBudget(1_000);
        assertEquals(1_000, ai.matchTokenBudget());
    }

    @Test
    void 预算边界_等于上限即视为用尽() {
        assertFalse(AiService.budgetExceeded(39_999, DEFAULT_BUDGET), "差 1 个 token 还能再跑一轮");
        assertTrue(AiService.budgetExceeded(40_000, DEFAULT_BUDGET), "刚好到上限就停");
        assertTrue(AiService.budgetExceeded(40_001, DEFAULT_BUDGET));
        assertFalse(AiService.budgetExceeded(9_999_999, 0), "预算 ≤0 视为不限");
    }

    @Test
    void 没绑定对局时不判超预算() {
        AiService ai = noKeyService();
        assertFalse(ai.budgetExhausted(), "还没 bind，没有本场用量可查");
    }

    // ------------------------------------------------------------------ 降级可见

    @Test
    void 模型不可用时走模板_分析状态是无素材() {
        AiService ai = noKeyService();
        ai.bind("m-offline");
        try {
            AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t-1", "pro", history());

            assertTrue(sp.degraded(), "没配 key 必须降级模板");
            assertFalse(sp.text().isBlank(), "兜底也必须接得上话");
            assertEquals(AiService.Speech.ANALYSIS_NONE, sp.analysisStatus(),
                    "模型不可用不是「分析失败」，是压根没分析");
            assertEquals("无分析素材", sp.analysisLabel());
            assertFalse(sp.budgetExhausted());
        } finally {
            ai.unbind();
        }
    }

    @Test
    void 超预算后直接走模板_并标预算耗尽() {
        AiService ai = new AiService(offlineClient(), null, null, true) {
            @Override
            long usedTokens() { return DEFAULT_BUDGET; }        // 刚好打满
        };
        ai.bind("m-budget");
        try {
            AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t-2", "pro", history());

            assertTrue(sp.degraded(), "预算耗尽必须走模板");
            assertEquals(AiService.Speech.ANALYSIS_BUDGET, sp.analysisStatus());
            assertTrue(sp.budgetExhausted(), "复盘要能直接标出来");
            assertEquals("预算用尽·模板兜底", sp.analysisLabel());
            assertFalse(sp.text().isBlank());
            assertEquals("", sp.analysis(), "超预算时不做分析，analysis 必须是空的");
        } finally {
            ai.unbind();
        }
    }

    @Test
    void 预算没到上限时不会被误标() {
        AiService ai = new AiService(offlineClient(), null, null, true) {
            @Override
            long usedTokens() { return DEFAULT_BUDGET - 1; }
        };
        ai.bind("m-under");
        try {
            AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t-3", "pro", history());
            assertFalse(sp.budgetExhausted(), "还差 1 个 token 不该被判超预算");
            assertEquals(AiService.Speech.ANALYSIS_NONE, sp.analysisStatus());
        } finally {
            ai.unbind();
        }
    }

    // ------------------------------------------------------------------ 两段式：分析状态可见

    /** 假客户端：分析阶段返回给定 JSON，生成阶段一律失败（不联网，纯本地桩）。 */
    private static LlmClient stubClient(String analysisJson) {
        return new LlmClient("http://127.0.0.1:9/v1", "", "stub") {
            @Override
            public boolean enabled() { return true; }

            @Override
            public String chat(String system, String user, double temperature, int timeoutSec) throws Exception {
                if (system != null && system.contains("辩论分析器")) return analysisJson;
                throw new IllegalStateException("生成阶段故意失败");
            }
        };
    }

    @Test
    void 分析成功时状态是ok_即使生成降级也要保留() {
        AiService ai = new AiService(stubClient("{\"claim\":\"保留期末考试\",\"evidence\":[],\"fallacies\":[],\"weakness\":\"标准未给\"}"),
                null, null, true);
        ai.bind("m-ok");
        try {
            AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t-4", "pro", history());

            assertTrue(sp.analysisOk(), "分析拿到了 JSON 就该是 ok");
            assertTrue(sp.analysis().contains("保留期末考试"), "分析原文要能落给复盘");
            assertEquals("有分析", sp.analysisLabel());
            assertTrue(sp.degraded(), "生成失败降级模板，但分析状态仍是 ok —— 两件事互不掩盖");
            assertFalse(sp.text().isBlank());
        } finally {
            ai.unbind();
        }
    }

    @Test
    void 分析返回空串按分析失败降级处理() {
        AiService ai = new AiService(stubClient(""), null, null, true);
        ai.bind("m-empty-analysis");
        try {
            AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t-5", "pro", history());
            assertEquals(AiService.Speech.ANALYSIS_DEGRADED, sp.analysisStatus(),
                    "空的分析等于没分析，复盘要按「已降级」标注");
            assertEquals("分析失败·已降级", sp.analysisLabel());
        } finally {
            ai.unbind();
        }
    }

    @Test
    void 旧的三参构造仍然可用() {
        AiService.Speech sp = new AiService.Speech("我方认为应当保留期末考试。", true, "");
        assertEquals("我方认为应当保留期末考试。", sp.text());
        assertTrue(sp.degraded());
        assertEquals(AiService.Speech.ANALYSIS_NONE, sp.analysisStatus());
        assertEquals(0, sp.fabricated());

        AiService.Speech withAnalysis = new AiService.Speech("正文", false, "{\"claim\":\"保留期末考试\"}");
        assertTrue(withAnalysis.analysisOk());
        assertEquals("有分析", withAnalysis.analysisLabel());
    }
}
