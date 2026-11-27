package com.siyige.ai;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 引用真实性护栏。
 *
 * <p>治的病：AI 写「对方刚才说『现行学分认定完全刚性、无法替代』」，而对方整场没说过这句话。
 * 判定规则见 {@link QuoteGuard}：抽引号片段 → 归一化 → ≥8 字 → 与历史原文做归一化模糊匹配（阈值 0.8）
 * → 未命中即 fabricated 并改写成不带引号的说法。
 */
class QuoteGuardTest {

    /** 对方真实说过的话（历史 turns 里的原文）。 */
    private static final String OPP_SAID =
            "我方判断：期末考试的学分认定必须有刚性凭证，否则整个学分体系会失去锚点。";

    private static Map<String, Object> turn(String seat, String content) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("seat", seat);
        t.put("content", content);
        return t;
    }

    private static List<Map<String, Object>> history(String... contents) {
        List<Map<String, Object>> out = new ArrayList<>();
        String[] seats = {"B1", "A1", "B2", "A2"};
        for (int i = 0; i < contents.length; i++) out.add(turn(seats[i % seats.length], contents[i]));
        return out;
    }

    private static AiService serviceOffline() {
        // key 为空 → LlmClient.enabled() = false，任何路径都不会发请求
        return new AiService(new LlmClient("http://127.0.0.1:9/v1", "", "test-model"), null, null, true);
    }

    // ------------------------------------------------------------------ 命中

    @Test
    void 精确命中的引文原样保留() {
        String ai = "对方刚才说「期末考试的学分认定必须有刚性凭证」，这一点我不认同：刚性不等于唯一。";
        QuoteGuard.Result r = QuoteGuard.scrub(ai, history(OPP_SAID));

        assertEquals(0, r.fabricated(), "历史里能查到，不算编造");
        assertEquals(1, r.quoted(), "核对了 1 条引文");
        assertTrue(r.text().contains("「期末考试的学分认定必须有刚性凭证」"), "命中就不该改正文");
        assertEquals(QuoteGuard.Status.MATCHED, r.verdicts().get(0).status());
    }

    @Test
    void 模糊命中_少一两个字或标点不同仍算命中() {
        // 原话归一化 34 字，这里少一个「有」、加了空格和逗号
        String ai = "对方说「期末考试的学分认定必须 有刚性凭证，否则整个学分体系会失去锚点吗」，问题是这个前提没证。";
        List<Map<String, Object>> h = history(OPP_SAID);

        QuoteGuard.Result r = QuoteGuard.scrub(ai, h);
        assertEquals(0, r.fabricated(), "80% 相似度容错，不该判编造");
        assertTrue(r.text().contains("「"), "命中时保留原引号");

        double s = QuoteGuard.score("期末考试的学分认定必须 有刚性凭证，否则整个学分体系会失去锚点吗", h);
        assertTrue(s >= QuoteGuard.MATCH_THRESHOLD, "相似度应达到阈值，实际 " + s);
    }

    // ------------------------------------------------------------------ 未命中

    @Test
    void 未命中的引文改写成不带引号的说法() {
        String ai = "对方刚才说「取消期末考试会让学生彻底放弃复习」，这一点我不同意：先把判准说清。";
        List<Map<String, Object>> h = history(OPP_SAID);

        QuoteGuard.Result r = QuoteGuard.scrub(ai, h);

        assertEquals(1, r.fabricated(), "这句对方没说过");
        assertFalse(r.text().contains("「") || r.text().contains("」"), "改写后不能留下引号：" + r.text());
        assertTrue(r.text().contains(QuoteGuard.OPP_REPHRASE), "应换成「你刚才那个说法」：" + r.text());
        assertFalse(r.text().startsWith("对方刚才说"), "归属套话要被清掉：" + r.text());
        assertTrue(r.text().contains("这一点我不同意：先把判准说清。"), "后半句必须保留：" + r.text());
    }

    @Test
    void 被把字句支配时用中性说法() {
        String ai = "你方把「取消期末考试会摧毁学分认定的刚性」当成结论，这是偷换。";
        QuoteGuard.Result r = QuoteGuard.scrub(ai, history(OPP_SAID));

        assertEquals(1, r.fabricated());
        assertTrue(r.text().contains(QuoteGuard.NEUTRAL_REPHRASE) || r.text().contains(QuoteGuard.OPP_REPHRASE),
                "改写后要通顺：" + r.text());
        assertFalse(r.text().contains("「"));
    }

    // ------------------------------------------------------------------ 不判的情形

    @Test
    void 短引用不参与核对() {
        String ai = "对方说「成本过高」，这句话没有口径。";
        QuoteGuard.Result r = QuoteGuard.scrub(ai, history(OPP_SAID));

        assertEquals(0, r.fabricated(), "不足 8 字不判");
        assertEquals(ai, r.text(), "不判就不动正文");
        assertEquals(QuoteGuard.Status.TOO_SHORT, r.verdicts().get(0).status());
    }

    @Test
    void 出处类引用不当成对方的原话() {
        String ai = "据「普通高等学校学生管理规定」，学分认定必须留有刚性凭证。";
        QuoteGuard.Result r = QuoteGuard.scrub(ai, history(OPP_SAID));

        assertEquals(0, r.fabricated(), "论据出处不是引用对方");
        assertTrue(r.text().contains("「普通高等学校学生管理规定」"));
        assertEquals(QuoteGuard.Status.CITATION, r.verdicts().get(0).status());
    }

    @Test
    void 没有引文时正文一字不动() {
        String ai = "我方判断：应当保留期末考试，但补一条替代口径。";
        QuoteGuard.Result r = QuoteGuard.scrub(ai, history(OPP_SAID));
        assertEquals(0, r.fabricated());
        assertEquals(0, r.quoted());
        assertEquals(ai, r.text());
    }

    // ------------------------------------------------------------------ 与 guard 的接线

    @Test
    void 护栏把编造引用计数交给调用方() {
        AiService ai = serviceOffline();
        ai.resetQuoteFabricatedCount();

        AiService.GuardResult g = ai.guardDetailed(
                "对方刚才说「算法推荐在机制上必然收窄信息接触面」，这一点我不同意：标准还没立。",
                Personas.of("A2"), "", OPP_SAID, "A2", "驳立论", "驳立论", history(OPP_SAID));

        assertEquals(1, g.fabricated(), "guard 要把条数带出来");
        assertFalse(g.text().contains("「"), "落库正文里不能留这句假引用：" + g.text());
        assertTrue(g.text().contains(QuoteGuard.OPP_REPHRASE));
        assertEquals(1, ai.quoteFabricatedCount(), "实例上要能查到累计条数");
    }

    @Test
    void 真引用不会被护栏改动_三参构造仍可用() {
        AiService ai = serviceOffline();
        AiService.GuardResult g = ai.guardDetailed(
                "对方刚才说「期末考试的学分认定必须有刚性凭证」，这一点我不认同：刚性不等于唯一。",
                Personas.of("A2"), "", OPP_SAID, "A2", "驳立论", "驳立论", history(OPP_SAID));

        assertEquals(0, g.fabricated(), "真引用不该被改写");
        assertTrue(g.text().contains("「期末考试的学分认定必须有刚性凭证」"));

        AiService.Speech legacy = new AiService.Speech("我方认为应当保留期末考试。", true, "");
        assertEquals("我方认为应当保留期末考试。", legacy.text());
        assertTrue(legacy.degraded());
        assertEquals(AiService.Speech.ANALYSIS_NONE, legacy.analysisStatus());
        assertEquals(0, legacy.fabricated());
    }
}
