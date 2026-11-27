package com.siyige.eval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 固定评测语料（离线、可复现：不依赖网络、不调用 LLM）。
 *
 * <p>语料分三部分：
 * <ol>
 *   <li>分档集：{@code server/src/test/resources/eval/score-dataset.json}（20 题 × 4 档 = 80 条），
 *       与 {@code ScoreEvalTest} 共用同一份，避免两套基准漂移。</li>
 *   <li>边界样例：{@link #edgeCases()} 内置 8 条（超短 / 纯口号 / 编数字 / 引用他人原话 /
 *       超时 / 全英文 / 纯问句 / 攻击人身）。SPEC §14.7 只定义了四档，没有覆盖这些极端输入，
 *       所以它们单独一组：只断言「不崩 + 分合法 + 不透支高分」，不混进 pairwise accuracy 的分母。</li>
 *   <li>引用校验样本：{@link #quoteCases(List)} 内置 9 条（真引用 / 假引用 / 改写后文本各 3 条），
 *       供 fabricated-quote 率使用。</li>
 * </ol>
 *
 * <p>来源说明：80 条分档集来自 docs/评分有效性评测报告.md（2026-11-24 基线，人工按四维标注）；
 * 8 条边界样例与 9 条引用样本是本轮 QA 新增（2026-11-27），标注口径写在每条 {@code source} 字段里，
 * 复核时改这里的常量即可，不需要动断言代码。
 */
final class EvalCorpus {

    /** 与 ScoreEvalTest 共用的分档集资源路径。 */
    static final String DATASET_RESOURCE = "/eval/score-dataset.json";

    /**
     * 一条评测样本。
     *
     * @param status 生产链路里的发言状态；空串表示按 {@code UtteranceCheck} 自动判 OK / EMPTY，
     *               {@code TIMEOUT} 表示超时（不计内容，但计 timeout 次数）
     */
    record Sample(String id, String topic, String tier, String text, String status, String source) {
        Sample(String id, String topic, String tier, String text, String source) {
            this(id, topic, tier, text, "", source);
        }
    }

    /**
     * 一条引用校验样本。
     *
     * @param kind               real=真引用（来源里逐字存在）、fake=伪造引用（语料里根本没有）、
     *                           rewrite=改写（意思接近，但不是原话）
     * @param expectedFabricated true 表示引用护栏应当判为「不可核实 / 伪造」
     */
    record QuoteCase(String id, String kind, String quote, String source, boolean expectedFabricated) {}

    private EvalCorpus() {}

    /** 读取 20 题 × 4 档 = 80 条分档样本。 */
    static List<Sample> dataset() throws Exception {
        List<Sample> out = new ArrayList<>();
        try (InputStream in = EvalCorpus.class.getResourceAsStream(DATASET_RESOURCE)) {
            if (in == null) throw new IllegalStateException("缺少评测集资源 " + DATASET_RESOURCE);
            JsonNode root = new ObjectMapper().readTree(in);
            JsonNode samples = root.get("samples");
            if (samples == null || !samples.isArray()) throw new IllegalStateException("评测集缺少 samples 数组");
            for (JsonNode s : samples) {
                out.add(new Sample(
                        s.get("id").asText(),
                        s.get("topic").asText(),
                        s.get("tier").asText(),
                        s.get("text").asText(),
                        "",
                        "test resource " + DATASET_RESOURCE + "（2026-11-24 人工四维标注基线）"));
            }
        }
        return out;
    }

    /**
     * 8 条边界样例（QA 新增，2026-11-27）。
     *
     * <p>每条都对应一个真实会出现的输入形态；预期不是「多少分」，而是三条底线：
     * 评分不抛异常、总分落在 0–100、不能靠这些形态拿到接近优秀档的高分。
     */
    static List<Sample> edgeCases() {
        String src = "QA 新增边界样例（2026-11-27，评测脚手架内置；SPEC §14.7 未覆盖的极端输入）";
        return List.of(
                new Sample("edge-ultra-short", "边界·超短", "edge",
                        "我方认为应当取消。", src + "：超短"),
                new Sample("edge-slogan", "边界·纯口号", "edge",
                        "期末考试就是落后的，必须警惕，大家都知道。", src + "：纯口号"),
                new Sample("edge-fake-number", "边界·编数字", "edge",
                        "据调查，87.6% 的学生在取消期末考试后成绩提升了 43%，这必然说明考试没用。",
                        src + "：编数字（论据库外的统计数字）"),
                new Sample("edge-quote-other", "边界·引用他人", "edge",
                        "对方刚才说「考试是唯一公平的尺子」，我方承认这句话点到了要害，"
                                + "但它忽略了复核成本，因为任何评价都要有人复核。",
                        src + "：引用他人原话"),
                new Sample("edge-timeout", "边界·超时", "edge", "",
                        "TIMEOUT", src + "：超时（生产链路记 TIMEOUT，不计内容）"),
                new Sample("edge-english", "边界·全英文", "edge",
                        "The affirmative side believes final exams should be abolished because continuous "
                                + "assessment with external moderation gives a more reliable signal of student "
                                + "competence. We invite the negative side to explain who moderates the moderators.",
                        src + "：全英文"),
                new Sample("edge-question-only", "边界·纯问句", "edge",
                        "请问对方：你们说的公平，究竟由谁来复核？如果没有人复核，凭什么说它公平？",
                        src + "：纯问句（只有追问，没有本方论证）"),
                new Sample("edge-personal-attack", "边界·攻击人身", "edge",
                        "对方辩友连这个都不懂，是不是水平太差了？你这种人根本没资格谈教育。",
                        src + "：攻击人身（应被判定为低质量发言）")
        );
    }

    /**
     * 9 条引用校验样本：真引用 3 / 假引用 3 / 改写 3。
     *
     * <p>来源：真引用逐字取自 80 条分档集里的 t1-good、t2-good 和一条内置论据卡摘录；
     * 假引用是典型「AI 编统计数字 / 编对方原话」句式（不用书名号，避免触发 QuoteGuard 的出处类豁免）；
     * 改写是真引用的同义复述——按「引用必须逐字」的口径，
     * 改写同样属于不可核实引用（这正是 QuoteGuard 要抓的那类）。
     */
    static List<QuoteCase> quoteCases(List<Sample> dataset) {
        String t1 = textOf(dataset, "t1-good");
        String t2 = textOf(dataset, "t2-good");
        String card = "据《普通高等学校学生管理规定》，考核形式本由学校规定，学校可以依规调整考核方式。";

        return List.of(
                new QuoteCase("q-real-1", "real", "取消一次性闭卷，不等于取消考核", t1, false),
                new QuoteCase("q-real-2", "real", "信息茧房指的是信息接触面被系统性收窄", t2, false),
                new QuoteCase("q-real-3", "real", "考核形式本由学校规定", card, false),

                new QuoteCase("q-fake-1", "fake",
                        "据教育部 2023 年统计，87.6% 的高校已取消期末考试。", t1, true),
                new QuoteCase("q-fake-2", "fake",
                        "对方已经承认取消考试会让及格率上升 30%。", t2, true),
                new QuoteCase("q-fake-3", "fake",
                        "对方亲口承认所有高校都已经取消期末考试", t1, true),

                new QuoteCase("q-rewrite-1", "rewrite",
                        "取消一次闭卷考试并不等于不再考核", t1, true),
                new QuoteCase("q-rewrite-2", "rewrite",
                        "算法推荐会让人的信息接触范围越来越窄", t2, true),
                new QuoteCase("q-rewrite-3", "rewrite",
                        "学校有权自行决定怎么考核", card, true)
        );
    }

    private static String textOf(List<Sample> dataset, String id) {
        for (Sample s : dataset) if (s.id().equals(id)) return s.text();
        throw new IllegalStateException("评测集缺少样本 " + id + "（引用校验样本依赖它）");
    }
}
