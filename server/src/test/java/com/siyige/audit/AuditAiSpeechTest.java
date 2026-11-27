package com.siyige.audit;

import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.LlmClient;
import com.siyige.ai.Personas;
import com.siyige.ai.QuoteGuard;
import com.siyige.domain.Format;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 审计夹具：AI 发言的截断 / 复读 / 引文真实性 / 降级路径 / 节奏 / 人设。
 *
 * <p>这些用例默认不跑（类上 @Disabled）——它们断言的是「当前已知缺陷仍然存在」，
 * 一旦有人修好其中一条，对应断言就会变红，那时把断言翻成正向期望即可。
 * 用途：① 让审计结论可复现（不是"我看着像"，而是跑一下就能看到现在的行为）；
 * ② 给修复方一个现成的验收夹具。结论与根因见 docs/audit/02-ai-speech.md。
 *
 * <p>全部离线：无 api-key 的 LlmClient 或本地桩，不发任何网络请求。
 */
@org.junit.jupiter.api.Disabled("审计夹具：故意固化当前缺陷，修复后把断言翻成正向期望再启用")
class AuditAiSpeechTest {

    // ------------------------------------------------------------------ 公用

    /** 后台参数桩：语音开关等一律当"开"，{@code llmEnabled()} 只取决于有没有 key。 */
    private static ConfigService enabledCfg() {
        ConfigService cfg = mock(ConfigService.class);
        when(cfg.getBool(any())).thenReturn(true);
        return cfg;
    }

    private static AiService offline() {
        return new AiService(new LlmClient("http://127.0.0.1:9/v1", "", "audit-model"), null, null, enabledCfg());
    }

    /** 每次调用都抛指定异常的客户端：模拟 429 / 超时（AiService 只 catch Exception）。 */
    private static LlmClient failing(Exception err) {
        return new LlmClient("http://127.0.0.1:9/v1", "", "audit-model") {
            @Override
            public boolean enabled() { return true; }

            @Override
            public String chat(String system, String user, double temperature, int timeoutSec) throws Exception {
                throw err;
            }

            @Override
            public String chatStream(String system, String user, double temperature, int timeoutSec,
                                     java.util.function.Consumer<String> onDelta) throws Exception {
                throw err;
            }
        };
    }

    /** 用量桩：让 tokensForMatch 直接报一个超预算的数字（不需要真发请求）。 */
    private static LlmClient withUsage(long tokens) {
        return new LlmClient("http://127.0.0.1:9/v1", "", "audit-model") {
            @Override
            public long tokensForMatch(String matchId) { return tokens; }
        };
    }

    private static Map<String, Object> turn(String seat, String content) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("seat", seat);
        t.put("content", content);
        return t;
    }

    private static List<Map<String, Object>> history(String... contents) {
        List<Map<String, Object>> out = new ArrayList<>();
        String[] seats = {"B1", "A1", "B2", "A2", "A3", "B3"};
        for (int i = 0; i < contents.length; i++) out.add(turn(seats[i % seats.length], contents[i]));
        return out;
    }

    // guard / cutRepeats / segChars / buildPrompt 都是包内或私有可见，审计测试在 audit 包，只能走反射。
    private static String segChars(String seg, Personas.Persona p) throws Exception {
        Method m = AiService.class.getDeclaredMethod("segChars", String.class, Personas.Persona.class);
        m.setAccessible(true);
        return (String) m.invoke(null, seg, p);
    }

    private static String guardOf(AiService ai, String text, Personas.Persona p, String mateLast,
                                  String oppLast, String seat, String seg, String duty,
                                  List<Map<String, Object>> history) throws Exception {
        Method m = AiService.class.getDeclaredMethod("guard", String.class, Personas.Persona.class,
                String.class, String.class, String.class, String.class, String.class, List.class);
        m.setAccessible(true);
        return (String) m.invoke(ai, text, p, mateLast, oppLast, seat, seg, duty, history);
    }

    private static String cutRepeatsOf(String text) throws Exception {
        Method m = AiService.class.getDeclaredMethod("cutRepeats", String.class);
        m.setAccessible(true);
        return (String) m.invoke(null, text);
    }

    private static String buildPrompt(AiService ai, String seat, String seg, String duty, String mateLast,
                                      String oppLast, List<Map<String, Object>> history) throws Exception {
        Method m = AiService.class.getDeclaredMethod("buildPrompt",
                String.class, String.class, String.class, String.class, String.class, String.class,
                Personas.Persona.class, String.class, String.class, String.class, List.class, String.class);
        m.setAccessible(true);
        return (String) m.invoke(ai, seat, seg, duty, "取消期末考试利大于弊", "t-audit", "pro",
                Personas.of(seat), mateLast, oppLast, "", history, "");
    }

    /** 复刻 web/src/stores/debate.js:641-646 的打字机时长算法（ms）。 */
    private static long typingMs(String text) {
        int len = text.length();
        int per = Math.min(150, Math.max(18, Math.round(6500f / Math.max(1, len))));
        long total = 0;
        for (char ch : text.toCharArray()) {
            long d = per;
            if (ch == '。' || ch == '！' || ch == '？') d = Math.min(520, per * 8L);
            else if (ch == '，' || ch == '；' || ch == '：') d = Math.min(240, per * 3L);
            else if (ch == '「' || ch == '」') d = Math.round(per * 1.5);
            total += d;
        }
        return total;
    }

    // ================================================================== ① 截断

    /**
     * 同一个 prompt 里给了互相矛盾的字数：【字数】最多 260（AiService.buildPrompt:622-623），
     * 【本轮要求】1 却写「输出 220–320 字」（:668）。模型按 320 写完，guard 再按
     * min(persona.maxChars, segCharCap) = 260 硬切（AiService.guardDetailed:914-918）。
     */
    @Test
    void 立论的字数指令自相矛盾_护栏按260硬切() throws Exception {
        assertEquals("220–320", segChars("立论", Personas.of("A1")), "【本轮要求】里的区间上限是 320");
        assertEquals(260, Format.segCharCap("立论", "立论"), "【字数】与护栏用的是同一个 260");
        assertEquals(260, Personas.of("A1").maxChars());
    }

    /** 260 字硬切且窗口内没有句号 → 走 substring(0,260)+'。' 分支，切在词中间。 */
    @Test
    void 无句号时截断切在词中间() throws Exception {
        String longSpeech = "我方先立判准然后逐条筛对方的论点".repeat(20);   // 320 字，零句读
        assertEquals(320, longSpeech.length());

        String out = guardOf(offline(), longSpeech, Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());

        assertEquals(261, out.length(), "被切成 260 字 + 补一个句号");
        assertTrue(longSpeech.startsWith(out.substring(0, 260)), "确实是原文本的前缀（说明是硬切）");
        assertFalse(out.substring(0, 260).matches("(?s).*[。！？；：，、]"), "切口前面没有任何句读，等于切在词中间");
    }

    // ================================================================== ② 复读误杀

    /**
     * cutRepeats 的判定是「同一句 ≥8 字第二次出现即整段截断」。结辩复现句是修辞不是退化：
     * 「我方判准只有一条：…」开头立一遍、收尾再点一遍，是标准结辩结构，却会被判复读，
     * 连后面的收束句一起砍掉。
     */
    @Test
    void cutRepeats误杀结辩的复现句() throws Exception {
        String ref = "我方判准只有一条：可执行、可监督、可追责。";
        String mids = "第一，标准可查：对方至今没有给出一个能被第三方复核的口径。"
                + "第二，过程可看：执行主体是谁，对方从立论回避到结辩。"
                + "第三，结果可追：出了事追到机构还是个人，对方始终没有回答。";
        String close = "所以请评委按这三条打分，谢谢。";
        String text = ref + mids + ref + close;

        String cut = cutRepeatsOf(text);

        assertFalse(cut.contains("请评委按这三条打分"), "收束句被当成复读整段砍掉：" + cut);
        assertTrue(cut.contains("第三，结果可追"), "前面三条应该保留");
    }

    /** 同一句「请对方正面回答…」夹在三条之间（真实质询节奏），也会被判复读截断。 */
    @Test
    void cutRepeats误杀质询的重复追问() throws Exception {
        String ask = "请对方正面回答：谁执行、谁复核、谁追责。";
        String a = "第一，你方说有成本，却没说是哪个科目，也没给出分摊比例的口径。";
        String b = "第二，你方说会改进，却没给改进的边界，也没说谁来判断改进是否发生。";
        String text = ask + a + ask + b + ask + "我方收在这个问题上。";

        String cut = cutRepeatsOf(text);
        assertFalse(cut.contains("我方收在这个问题上"), "第二次追问就被判复读，后面整段丢失");
    }

    // ================================================================== ③ 引文真实性

    /**
     * 否定词反转仍然"命中"：Dice≈0.90 ≥ 0.80，QuoteGuard 认为这句是对方说的，
     * 但引文把「必须有」改成了「必须没有」——语义相反。
     */
    @Test
    void 引文被插入否定词后仍判命中() {
        String said = "我方判断：期末考试的学分认定必须有刚性凭证，否则整个学分体系会失去锚点。";
        List<Map<String, Object>> h = List.of(turn("B1", said));

        QuoteGuard.Result r = QuoteGuard.scrub(
                "对方刚才说「期末考试的学分认定必须没有刚性凭证」，这一点我不认同。", h);

        assertEquals(0, r.fabricated(), "否定词反转没被拦住（相似度 ≈0.90 > 阈值 0.80）");
        assertTrue(r.text().contains("「期末考试的学分认定必须没有刚性凭证」"), "假引文原样留在正文里");
    }

    /** 反向问题：8–12 字的忠实缩略反而被判编造（短引文的阈值过严）。 */
    @Test
    void 忠实缩略的短引文被判编造() {
        String said = "我方判断：取消期末考试会让学生彻底放弃复习，因为一次性闭卷只考记忆。";
        List<Map<String, Object>> h = List.of(turn("B1", said));

        QuoteGuard.Result r = QuoteGuard.scrub("对方说「取消期末会让学生放弃复习」，这句话我不认同。", h);

        assertEquals(1, r.fabricated(), "只是省了「考试」「彻底」，语义没变，却被判成编造");
        assertFalse(r.text().contains("「"), "于是被改写成不带引号的说法");
    }

    /** 出处豁免：只要引文裹上书名号 / 前面挂个「据」，编造的数据也穿得过引用护栏。 */
    @Test
    void 出处豁免放过编造数据() {
        List<Map<String, Object>> h = List.of(turn("B1", "我方判断：期末考试的学分认定必须有刚性凭证。"));

        QuoteGuard.Result bookTitle = QuoteGuard.scrub(
                "对方说「《中国教育发展报告》显示取消期末后不及格率下降 37%」，这个数字不可核查。", h);
        assertEquals(0, bookTitle.fabricated(), "书名号一裹就按出处处理，编的 37% 不会被拦");
        assertEquals(QuoteGuard.Status.CITATION, bookTitle.verdicts().get(0).status());

        QuoteGuard.Result ju = QuoteGuard.scrub("据「2021 年中国教育发展报告」，不及格率下降 37%。", h);
        assertEquals(0, ju.fabricated(), "「据…」同样整段豁免");
    }

    // ================================================================== ④ 降级路径

    /**
     * 无 key / 429 / 超时 / 预算耗尽四条路径，返回值上唯一的共同点是 degraded=true，
     * 而 MatchService 只用这一个布尔决定落库状态（MatchService.java:385）：
     * 四条路径全部落成 status=TEMPLATE，前端/复盘无法区分。
     */
    @Test
    void 四条降级路径落库状态无法区分() {
        List<Map<String, Object>> h = history(
                "我方判断：期末考试的学分认定必须有刚性凭证。",
                "我方立论：判断这道题要先立一个标准——可执行、可监督、可追责。");

        AiService.Speech noKey = offline().speakForSolo("A2", "驳立论", "驳立论", "辩题", "t", "pro", h);

        AiService.Speech http429 = new AiService(failing(new IllegalStateException("LLM HTTP 429")),
                null, null, enabledCfg()).speakForSolo("A2", "驳立论", "驳立论", "辩题", "t", "pro", h);

        AiService.Speech timeout = new AiService(failing(new HttpTimeoutException("request timed out")),
                null, null, enabledCfg()).speakForSolo("A2", "驳立论", "驳立论", "辩题", "t", "pro", h);

        AiService budgetAi = new AiService(withUsage(40_000), null, null, enabledCfg());
        budgetAi.bind("m-audit");
        AiService.Speech overBudget = budgetAi.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t", "pro", h);
        budgetAi.unbind();

        assertTrue(noKey.degraded(), "无 key → 模板");
        assertTrue(http429.degraded(), "429 → 模板");
        assertTrue(timeout.degraded(), "超时 → 模板");
        assertTrue(overBudget.degraded(), "预算耗尽 → 模板");
        // 内部其实分得清（analysisStatus 不同），但落库只拿了 degraded 这一个布尔
        assertEquals(AiService.Speech.ANALYSIS_NONE, noKey.analysisStatus());
        assertEquals(AiService.Speech.ANALYSIS_DEGRADED, http429.analysisStatus());
        assertEquals(AiService.Speech.ANALYSIS_DEGRADED, timeout.analysisStatus());
        assertEquals(AiService.Speech.ANALYSIS_BUDGET, overBudget.analysisStatus());
    }

    // ================================================================== ⑤ 节奏

    /**
     * 打字机总时长按「6500ms 打完整段 + 标点额外停顿」，与字数基本无关；AI 接话间隔是
     * 3500 + rand(2500)，A2/B2 ×0.85（≈3.0–5.1s），A3/B4 ×1.25（≈4.4–7.5s）。
     * 结论：下一条几乎总是早于上一条打完（前端串行打，于是积压）。
     */
    @Test
    void 打字机总比AI接话慢_下句会在上句没打完时到达() {
        String freeDebate = "对方把风险直接推成了禁止——风险存在只支持「应当规范」，支撑不到「不应推进」。"
                + "对方始终没有回答成本由谁承担，分摊机制缺位，这个论证就是不完整的。"
                + "请对方给一个数字：第一年预算是多少？";
        String closing = "整场下来，对方始终回避成本由谁承担。我方结论：值得做，但要按可监督的路径做。"
                + "三个分歧收一下：标准、成本、执行。前两个对方没答，第三个答错了。"
                + "我方不要求对方全盘接受，只要求承认一点：这件事需要可追责的机制才成立。"
                + "对方今天给了方向，没给方法；给了愿望，没给条件。我方给的是条件。";

        long freeMs = typingMs(freeDebate);
        long closeMs = typingMs(closing);

        // AI 间隔：最快 A2/B2 = 3500×0.85 ≈ 2975；最慢 A3/B4 = (3500+2500)×1.25 = 7500
        assertTrue(freeMs > 7_500, "自由辩 ~100 字打字要 " + freeMs + "ms，慢于最慢的 AI 间隔");
        assertTrue(closeMs > 7_500, "结辩 " + closeMs + "ms，同样慢于最慢的 AI 间隔");
        assertTrue(freeMs - 4_750 > 0, "单轮积压 " + (freeMs - 4_750) + "ms，十几步下来积十几秒");
    }

    /** ai-think-ms: 700 是死配置：MatchService.thinkMs() 没有任何调用方。 */
    @Test
    void aiThinkMs配置从未被使用() throws Exception {
        String src = Files.readString(Path.of("src/main/java/com/siyige/service/MatchService.java"),
                StandardCharsets.UTF_8);
        assertTrue(src.contains("public long thinkMs()"), "定义还在");
        int calls = src.split(java.util.regex.Pattern.quote("thinkMs()"), -1).length - 1;
        assertEquals(1, calls, "全文只有定义这一处出现 thinkMs()，没有调用点");

        String yml = Files.readString(Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);
        assertTrue(yml.contains("ai-think-ms: 700"), "配置里写着 700，但这条链路根本不读它");
    }

    // ================================================================== ⑥ 人设

    /** 人设确实进了 prompt（质询问/答席位 A3/B3 也一样），但和环节指令互相打架。 */
    @Test
    void 质询轮次里人设与环节指令互斥() throws Exception {
        AiService ai = offline();
        String prompt = buildPrompt(ai, "A3", "质询", "质询·问",
                "", "我方判断：期末考试的学分认定必须有刚性凭证。", history("我方判断：期末考试的学分认定必须有刚性凭证。"));

        assertTrue(prompt.contains(Personas.of("A3").style()), "人设风格进了 prompt");
        assertTrue(prompt.contains("先给一个具体场景"), "A3 的推理路线：先给场景再归纳");
        assertTrue(prompt.contains("以问句为主"), "质询环节指南：以问句为主、不要长篇论证");
        // 结论：同一段 prompt 里既要「先给场景（＝陈述）」，又要「全是问句」
    }

    /** 结辩的人设与环节指南方向一致（A4 归谬/收束）——这一条是"生效且不冲突"的正例。 */
    @Test
    void 结辩席位人设生效且不冲突() throws Exception {
        AiService ai = offline();
        String prompt = buildPrompt(ai, "A4", "总结", "总结",
                "", "对方说：成本过高。", history("对方说：成本过高。"));

        assertTrue(prompt.contains(Personas.of("A4").habit()), "A4「三个分歧收一下」的习惯写进了 prompt");
        assertTrue(prompt.contains("把全场分歧归成 2–3 条"), "环节指南同样是收束，方向一致");
    }

    /** 质询·答 的 prompt 里同时写着「以问句为主」和「第一句必须正面回答」——两条互斥指令。 */
    @Test
    void 质询答的prompt同时要求全问句和先正面回答() throws Exception {
        AiService ai = offline();
        String prompt = buildPrompt(ai, "B3", "质询", "质询·答",
                "", "对方刚问：谁执行、谁复核？", history("对方刚问：谁执行、谁复核？"));

        assertTrue(prompt.contains("以问句为主"), "SEG_GUIDE 只按 seg 取，答方也拿到「以问句为主」");
        assertTrue(prompt.contains("不要长篇论证"), "同上");
        assertTrue(prompt.contains("第一句必须**正面回答**"), "duty 维度又要求先正面回答 —— 两条指令互斥");
    }

    // ================================================================== ⑦ 其它

    /** 「去 AI 味」只覆盖「作为一个AI/语言模型」，「我是一个人工智能助手」原样留下。 */
    @Test
    void 去AI味覆盖不全() throws Exception {
        AiService ai = offline();
        String a = guardOf(ai, "作为一个AI语言模型，我方认为应当保留期末考试。",
                Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());
        assertFalse(a.contains("作为一个AI"), "这一种被清掉了");

        String b = guardOf(ai, "我是一个人工智能助手，我方认为应当保留期末考试。",
                Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());
        assertTrue(b.contains("我是一个人工智能助手"), "这一种没被清掉：" + b);
    }

    /** 模板兜底不看 duty：质询·答 抽到的仍是提问句（答方第一句必须正面回答）。 */
    @Test
    void 质询答的兜底模板仍然是提问句() {
        AiService ai = offline();
        List<Map<String, Object>> h = history("我方判断：期末考试的学分认定必须有刚性凭证。",
                "我方立论：判断这道题要先立一个标准——可执行、可监督、可追责。");

        for (int i = 0; i < 12; i++) {
            AiService.Speech sp = ai.speakForSolo("A3", "质询", "质询·答", "辩题", "t", "pro", h);
            String t = sp.text();
            // 答方的硬性要求是「第一句正面回答（结论或口径）」；模板池里没有这种句式
            boolean startsAsAnswer = t.startsWith("我方回答") || t.startsWith("我方正面回答") || t.startsWith("回答");
            assertFalse(startsAsAnswer, "兜底模板忽略 duty=质询·答，第一句不是回答：" + t);
            assertTrue(t.contains("？"), "抽到的仍是提问句（质询池全是问句）：" + t);
        }
    }
}
