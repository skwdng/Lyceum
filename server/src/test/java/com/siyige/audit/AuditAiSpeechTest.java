package com.siyige.audit;

import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.LlmClient;
import com.siyige.ai.Personas;
import com.siyige.ai.QuoteGuard;
import org.junit.jupiter.api.Disabled;
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
 * AI 发言审计夹具（docs/audit/02-ai-speech.md）。
 *
 * <p>两种用法：
 * <ul>
 *   <li><b>已修好的</b>（B3：A1 字数/截断、A3 引文硬指纹、A5 出处豁免）：默认启用，断言的是**期望行为**，
 *       属于正式回归用例；</li>
 *   <li><b>还没修的</b>：逐个 {@code @Disabled("待 B5：…")}，断言的是"缺陷仍存在"，修好后把它翻成正向期望
 *       并去掉 @Disabled。</li>
 * </ul>
 *
 * <p>全部离线：无 api-key 的 LlmClient 或本地桩，不发任何网络请求。
 */
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

    // charCap / guard / cutRepeats / buildPrompt 都是包内或私有可见，审计测试在 audit 包，只能走反射。
    private static int charCapOf(String seg, String duty, Personas.Persona p) throws Exception {
        Method m = AiService.class.getDeclaredMethod("charCap", String.class, String.class, Personas.Persona.class);
        m.setAccessible(true);
        return (int) m.invoke(null, seg, duty, p);
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

    private static List<Map<String, Object>> historyOf(String... contents) {
        return history(contents);
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

    // ================================================================== A1 字数与截断（已修，启用）

    /**
     * A1：字数只能有一个来源。prompt 的引导上限与护栏截断上限都取 {@code charCap()}
     * （= min(Persona.maxChars, Format.segCharCap(seg,duty))），不许再出现第二套区间。
     */
    @Test
    void 字数只有一个来源_prompt与护栏用同一个上限() throws Exception {
        AiService ai = offline();

        // 立论：人设 260 与环节 260 取小 = 260
        assertEquals(260, charCapOf("立论", "立论", Personas.of("A1")));
        String prompt = buildPrompt(ai, "A1", "立论", "立论", "",
                "对方说：成本过高。", historyOf("对方说：成本过高。"));
        assertTrue(prompt.contains("最多 260 字"), "prompt 只给一个上限：\n" + prompt);
        assertFalse(prompt.contains("220–320"), "旧的两套字数区间必须删掉");
        assertFalse(prompt.matches("(?s).*\\d+\\s*[–-]\\s*\\d+\\s*字.*"), "prompt 里不该再出现 X–Y 字区间");

        // 质询·答：人设 220 与环节 120 取小 = 120 —— prompt 与护栏同样对齐
        assertEquals(120, charCapOf("质询", "质询·答", Personas.of("A3")));
        String answerPrompt = buildPrompt(ai, "A3", "质询", "质询·答", "",
                "对方刚问：谁执行？", historyOf("对方刚问：谁执行？"));
        assertTrue(answerPrompt.contains("最多 120 字"), "答方也按 120 字：\n" + answerPrompt);
    }

    /** A1：有句读就切在句读上，不切在词中间、不伪造句号。 */
    @Test
    void 截断落在句读上_不是硬切() throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= 10; i++) sb.append("第").append(i).append("，标准可查：对方至今没有给出能被第三方复核的口径。");
        String speech = sb.toString();                                                  // 300 字上下，每句都有句号
        String out = guardOf(offline(), speech, Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());

        assertEquals(260, charCapOf("立论", "立论", Personas.of("A1")));
        assertTrue(out.length() <= 260, "截断后不得超上限，实际 " + out.length());
        assertTrue(out.endsWith("。"), "有句读就该停在句读上：" + out.substring(Math.max(0, out.length() - 12)));
        assertFalse(out.contains("……"), "有句读时不需要省略号");
        assertTrue(speech.startsWith(out), "切出来的必须是原文前缀");
        assertTrue(out.matches("(?s).*[。！？；]"), "切口前必须有句读");
    }

    /** A1：一个句读都没有时，用省略号收尾，不许凭空补一个句号假装说完了。 */
    @Test
    void 无句读时用省略号收尾_不伪造句号() throws Exception {
        String speech = "我方先立判准然后逐条筛对方的论点".repeat(20);   // 320 字，零句读
        assertEquals(320, speech.length());

        String out = guardOf(offline(), speech, Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());

        assertTrue(out.length() <= 262, "截断后不得超上限，实际 " + out.length());
        assertTrue(out.endsWith("……"), "没有句读就用省略号收尾：" + out.substring(Math.max(0, out.length() - 10)));
        assertFalse(out.substring(0, out.length() - 2).contains("。"), "不许伪造句号");
    }

    /** A1 + 引号：切口落在引文内部时，退回到开引号之前，落库正文里不留孤立「。 */
    @Test
    void 截断不切进引文_不留孤立开引号() throws Exception {
        String prefix = "判准第一条先立住".repeat(30);                       // 240 字，零标点
        String speech = prefix + "对方说「引文内容很长，还要再长一些」然后继续说明";
        String out = guardOf(offline(), speech, Personas.of("A1"), "", "", "A1", "立论", "立论", List.of());

        assertTrue(out.length() <= 260, "截断后不得超上限，实际 " + out.length());
        assertFalse(out.contains("「"), "不能留下半个引文：" + out.substring(Math.max(0, out.length() - 16)));
        assertFalse(out.contains("」"));
        assertTrue(out.endsWith("……"), "退到开引号之前后用省略号收尾");
    }

    // ================================================================== A3 / A5 引文硬指纹（已修，启用）

    /** A3：引文插了否定词（必须有 → 必须没有），模糊命中也不算数，按不一致改写。 */
    @Test
    void 插入否定词的引文判不一致并改写() {
        String said = "我方判断：期末考试的学分认定必须有刚性凭证，否则整个学分体系会失去锚点。";
        List<Map<String, Object>> h = List.of(turn("B1", said));

        QuoteGuard.Result r = QuoteGuard.scrub(
                "对方刚才说「期末考试的学分认定必须没有刚性凭证」，这一点我不认同。", h);

        assertEquals(QuoteGuard.Status.MISMATCH, r.verdicts().get(0).status(),
                "否定词指纹对不上 → MISMATCH（相似度仍然 >0.8，靠 Dice 拦不住）");
        assertEquals(1, r.fabricated(), "按编造处理：改写 + 计数");
        assertEquals(1, r.mismatched());
        assertFalse(r.text().contains("「"), "假引文必须改写成不带引号的说法：" + r.text());
    }

    /** A3：数字对不上判不一致；数字对得上则照常放行（不要过度拦截）。 */
    @Test
    void 数字与原文不一致判不一致_一致则放行() {
        String said = "据官方口径，取消期末考试后不及格率下降 21%，这是唯一可核查的数字。";
        List<Map<String, Object>> h = List.of(turn("B1", said));

        QuoteGuard.Result bad = QuoteGuard.scrub("对方说「取消期末考试后不及格率下降 37%」", h);
        assertEquals(QuoteGuard.Status.MISMATCH, bad.verdicts().get(0).status(), "21% 被改成 37%");
        assertEquals(1, bad.fabricated());

        QuoteGuard.Result good = QuoteGuard.scrub("对方说「取消期末考试后不及格率下降 21%」", h);
        assertEquals(QuoteGuard.Status.MATCHED, good.verdicts().get(0).status(), "数字一致就该放行");
        assertEquals(0, good.fabricated());
        assertTrue(good.text().contains("「"), "真引文保留");
    }

    /** A5：出处豁免只豁免书名号内部；书名号外面带数字的主张仍要被核。 */
    @Test
    void 出处豁免只豁免书名号内部_带数字的主张仍要核() {
        List<Map<String, Object>> h = List.of(turn("B1", "我方判断：期末考试的学分认定必须有刚性凭证。"));

        QuoteGuard.Result mixed = QuoteGuard.scrub(
                "对方说「《中国教育发展报告》显示取消期末后不及格率下降 37%」，这个数字不可核查。", h);
        assertNotEquals(QuoteGuard.Status.CITATION, mixed.verdicts().get(0).status(),
                "书名号只豁免书名号内部，外面那句带 37% 的主张要照常核");
        assertEquals(1, mixed.fabricated(), "整条引文被改写（出处名称谓保留在正文里也没意义，改写成口头说法）");

        // 纯出处名（带年份、无数据口径）仍然豁免
        QuoteGuard.Result pure = QuoteGuard.scrub("据「2021 年中国教育发展报告」，相关问题值得讨论。", h);
        assertEquals(QuoteGuard.Status.CITATION, pure.verdicts().get(0).status());
        assertEquals(0, pure.fabricated(), "出处名不该被判成编造");

        // 「据」+ 数据口径：不再算纯出处
        QuoteGuard.Result data = QuoteGuard.scrub("据「某平台统计取消期末后及格率提升 37%」，这一点很关键。", h);
        assertNotEquals(QuoteGuard.Status.CITATION, data.verdicts().get(0).status(), "带百分比就不是出处名了");
        assertEquals(1, data.fabricated());
    }

    /** 真引用（数字、否定词都与原文一致）必须原样保留 —— 防止硬指纹把正常引述也改掉。 */
    @Test
    void 真引用不会被护栏改动_三参构造仍可用() throws Exception {
        AiService ai = offline();
        ai.resetQuoteFabricatedCount();
        String opp = "我方从未主张全面取消期末考试，只要求把一次性闭卷改成过程性证据。";

        // 注意别用「对方刚才说「…」，这一点我不认同：」开头——那是 guard 自己的合成句壳，会被剥掉
        String out = guardOf(ai,
                "你方的意思是「从未主张全面取消期末考试」，但你的方案实际上取消了考核。",
                Personas.of("A2"), "", opp, "A2", "驳立论", "驳立论", historyOf(opp));

        assertEquals(0, ai.quoteFabricatedCount(), "否定词与原文一致，不该被判成不一致");
        assertTrue(out.contains("「从未主张全面取消期末考试」"), "真引文要保留：" + out);

        AiService.Speech legacy = new AiService.Speech("我方认为应当保留期末考试。", true, "");
        assertEquals("我方认为应当保留期末考试。", legacy.text());
        assertTrue(legacy.degraded());
        assertEquals(AiService.Speech.ANALYSIS_NONE, legacy.analysisStatus());
        assertEquals(0, legacy.fabricated());
    }

    // ================================================================== 待 B5（未修，保持固化的缺陷）

    /**
     * A2：cutRepeats 的判定是「同一句 ≥8 字第二次出现即整段截断」。结辩复现句是修辞不是退化：
     * 「我方判准只有一条：…」开头立一遍、收尾再点一遍，是标准结辩结构，却会被判复读，
     * 连后面的收束句一起砍掉。
     */
    @Disabled("待 B5：cutRepeats 只删重复句、不砍后续，并放宽结辩/质询")
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

    /** A2：同一句「请对方正面回答…」夹在三条之间（真实质询节奏），也会被判复读截断。 */
    @Disabled("待 B5：同上，重复追问不该整段截断")
    @Test
    void cutRepeats误杀质询的重复追问() throws Exception {
        String ask = "请对方正面回答：谁执行、谁复核、谁追责。";
        String a = "第一，你方说有成本，却没说是哪个科目，也没给出分摊比例的口径。";
        String b = "第二，你方说会改进，却没给改进的边界，也没说谁来判断改进是否发生。";
        String text = ask + a + ask + b + ask + "我方收在这个问题上。";

        String cut = cutRepeatsOf(text);
        assertFalse(cut.contains("我方收在这个问题上"), "第二次追问就被判复读，后面整段丢失");
    }

    /** A4：8–12 字的忠实缩略被判编造（短引文阈值过严）。 */
    @Disabled("待 B5：8–12 字区间阈值下调或补包含判定")
    @Test
    void 忠实缩略的短引文被判编造() {
        String said = "我方判断：取消期末考试会让学生彻底放弃复习，因为一次性闭卷只考记忆。";
        List<Map<String, Object>> h = List.of(turn("B1", said));

        QuoteGuard.Result r = QuoteGuard.scrub("对方说「取消期末会让学生放弃复习」，这句话我不认同。", h);

        assertEquals(1, r.fabricated(), "只是省了「考试」「彻底」，语义没变，却被判成编造");
        assertFalse(r.text().contains("「"), "于是被改写成不带引号的说法");
    }

    /**
     * A6：无 key / 429 / 超时 / 预算耗尽四条路径，返回值上唯一的共同点是 degraded=true，
     * 而 MatchService 只用这一个布尔决定落库状态（MatchService.java）：四条全部落成 status=TEMPLATE。
     */
    @Disabled("待 B5：落库要带原因（no_key/rate_limit/timeout/budget）")
    @Test
    void 四条降级路径落库状态无法区分() {
        List<Map<String, Object>> h = historyOf(
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

    /** A8：打字机总时长（≈8.2–9.7s）长于 AI 接话间隔（2.98–7.5s）。 */
    @Disabled("待 B5：打字机与 aiGap 对账（per=clamp(3200/字数) 或服务端补偿）")
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

        assertTrue(freeMs > 7_500, "自由辩 ~100 字打字要 " + freeMs + "ms，慢于最慢的 AI 间隔");
        assertTrue(closeMs > 7_500, "结辩 " + closeMs + "ms，同样慢于最慢的 AI 间隔");
        assertTrue(freeMs - 4_750 > 0, "单轮积压 " + (freeMs - 4_750) + "ms，十几步下来积十几秒");
    }

    /** A9：ai-think-ms: 700 是死配置（MatchService.thinkMs() 没有任何调用方）。 */
    @Disabled("待 B5：删掉死配置或让 aiDeadline 真正用它")
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

    /** A11：质询·答 的 prompt 里同时写着「以问句为主」和「第一句必须正面回答」——两条互斥指令。 */
    @Disabled("待 B5：SEG_GUIDE 按 (seg,duty) 取，答方单独一套环节指南")
    @Test
    void 质询答的prompt同时要求全问句和先正面回答() throws Exception {
        AiService ai = offline();
        String prompt = buildPrompt(ai, "B3", "质询", "质询·答",
                "", "对方刚问：谁执行、谁复核？", historyOf("对方刚问：谁执行、谁复核？"));

        assertTrue(prompt.contains("以问句为主"), "SEG_GUIDE 只按 seg 取，答方也拿到「以问句为主」");
        assertTrue(prompt.contains("不要长篇论证"), "同上");
        assertTrue(prompt.contains("第一句必须**正面回答**"), "duty 维度又要求先正面回答 —— 两条指令互斥");
    }

    /** A11：A3 人设「先给一个具体场景再归纳」与质询「以问句为主」冲突。 */
    @Disabled("待 B5：答方人设改成先给结论再补场景")
    @Test
    void 质询轮次里人设与环节指令互斥() throws Exception {
        AiService ai = offline();
        String prompt = buildPrompt(ai, "A3", "质询", "质询·问",
                "", "我方判断：期末考试的学分认定必须有刚性凭证。",
                historyOf("我方判断：期末考试的学分认定必须有刚性凭证。"));

        assertTrue(prompt.contains(Personas.of("A3").style()), "人设风格进了 prompt");
        assertTrue(prompt.contains("先给一个具体场景"), "A3 的推理路线：先给场景再归纳");
        assertTrue(prompt.contains("以问句为主"), "质询环节指南：以问句为主、不要长篇论证");
    }

    /** A12：「去 AI 味」只覆盖「作为一个AI/语言模型」，「我是一个人工智能助手」原样留下。 */
    @Disabled("待 B5：扩正则覆盖「我是(一个)?(AI|人工智能|语言模型|机器人|助手)」")
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

    /** A10：模板兜底不看 duty：质询·答 抽到的仍是提问句（答方第一句必须正面回答）。 */
    @Disabled("待 B5：LINES 键扩成 side+seg+duty，答池单列")
    @Test
    void 质询答的兜底模板仍然是提问句() {
        AiService ai = offline();
        List<Map<String, Object>> h = historyOf("我方判断：期末考试的学分认定必须有刚性凭证。",
                "我方立论：判断这道题要先立一个标准——可执行、可监督、可追责。");

        for (int i = 0; i < 12; i++) {
            AiService.Speech sp = ai.speakForSolo("A3", "质询", "质询·答", "辩题", "t", "pro", h);
            String t = sp.text();
            boolean startsAsAnswer = t.startsWith("我方回答") || t.startsWith("我方正面回答") || t.startsWith("回答");
            assertFalse(startsAsAnswer, "兜底模板忽略 duty=质询·答，第一句不是回答：" + t);
            assertTrue(t.contains("？"), "抽到的仍是提问句（质询池全是问句）：" + t);
        }
    }
}
