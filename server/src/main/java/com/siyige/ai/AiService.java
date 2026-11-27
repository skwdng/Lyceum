package com.siyige.ai;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import com.siyige.domain.Format;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * AI 席位发言。
 *
 * 三层：人设（Personas）+ 上下文装配（buildPrompt）+ 输出护栏（guard）。
 * 没配 key 或模型失败 → 模板兜底，**但兜底也要接得上话**，否则协同分永远为 0。
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private static final String SYSTEM = """
            你是一名中文辩论赛选手，正在打 4v4 正式赛制。
            只输出你这一轮的发言，不要解释、不要自报身份、不要写「作为AI」。
            要求：第一句给判断，随后两到三条理由，结尾一句追问或收束。
            禁止：编造具体数字和来源；人身攻击；复述对方原话超过一句。
            """;

    /** 模板库：按「阵营+环节」分，句子刻意写得像人话，用于模型不可用时兜底。 */
    private static final Map<String, List<String>> LINES = Map.ofEntries(
            Map.entry("A立论", List.of(
                    "我方立论：判断这道题要先立一个标准——可执行、可监督、可追责，三条缺一不可。",
                    "我方核心主张：这件事收益是公共的，成本却集中在少数主体，整体值得推进。",
                    "先把题目拆开：争的不是要不要，而是以什么方式、由谁负责。我方要的是后者能落地。",
                    "我方判准只有一条：普通人在不被告知的情况下，能不能自己判断这件事对他的影响。",
                    "我方先给结论：值得做。理由不在它有多完美，而在不做的话代价由谁默默承担。",
                    "这道题在定义上就有陷阱——有人把「开始做」当成「做到完美」。我方先把定义拧回来。",
                    "我方立三条：标准可查、过程可看、结果可追。三条齐了才算成立，缺一条就是空话。",
                    "我方从现实出发：现在的问题不是该不该，而是已经发生的事没人管。",
                    "我方核心是一句常识：有风险不等于禁止，有收益不等于放任。",
                    "我方今天只证一件事：按对方的路子走，第一年就会出现谁都不负责的局面。"
            )),
            Map.entry("B立论", List.of(
                    "我方先把议题拉回现实：今天讨论的不是理想状态该不该，而是此时此刻能不能。",
                    "我方立场明确：这一命题在现实层面缺乏可行性，成本与收益结构性错配。",
                    "我方判准两条：谁受益、谁承担。这两条不重叠，就不能说这件事成立。",
                    "我方从反面切入：真正需要证明的是「不出问题」，而对方只证了「有好处」。",
                    "我方先把最容易被忽略的一点摆上桌：执行成本落在谁头上，这件事就由谁决定成败。",
                    "我方立论不给口号，只给一条可检验的标准：出问题时能不能指到具体的人和账。",
                    "我方立场：条件不成立。不是反对方向，而是反对在条件不成立时强行推进。",
                    "我方先纠一个常见误解：把「有人受益」推成「整体应当」，这一步是不成立的。",
                    "我方从最坏情况开始设计：如果第一年就出事，有没有人能兜住。目前没有。",
                    "我方核心一句：不能用未来的收益，去抵今天的结构性风险。"
            )),
            Map.entry("A驳立论", List.of(
                    "对方一辩把「技术可行」直接推成了「制度应当」，这是从实然跳到应然。",
                    "对方始终没说清成本由谁承担，只谈收益不谈分摊，论证不完整。",
                    "对方的标准太松：按它的说法，只要有一点好处就该做，那几乎所有事都成立。",
                    "对方用个别案例推普遍结论，这一步跨得太大，中间缺一整段论证。",
                    "对方的判准自己没法检验——用什么指标判断「更好」？没有口径，就等于没有判准。",
                    "对方把「没有证据证明有害」当成「证明了无害」，这是举证责任的错位。",
                    "对方回避了最要命的一点：这件事做错了，谁能被追责。",
                    "对方把反对意见都归成「保守」，这本身就是一个回避问题的说法。"
            )),
            Map.entry("B驳立论", List.of(
                    "对方立的标准太宽——按它的说法，任何有试错成本的政策都不该做。",
                    "对方举的例子只能说明个别地区可行，推不出普遍可复制。",
                    "对方先假定执行者一定尽责，再论证方案可行——这个前提本身没被证明。",
                    "对方把「方向正确」当成「方法正确」，方向对不代表这条路径能走通。",
                    "对方一直在谈长期收益，却跳过了前三年的成本由谁垫付。",
                    "对方用「可以改进」回应质疑，可改进的空间有多大，没有给任何边界。",
                    "对方的判准只在理想条件下成立，条件一变，结论就翻。",
                    "对方把评价标准和执行标准混在一起了：好不等于做得到。"
            )),
            Map.entry("A质询", List.of(
                    "我请教对方：你方说的「成本过高」，具体高在哪个科目？没有口径，这就只是印象。",
                    "我想追问：按你方的标准，现有制度里有几项能通过？",
                    "请对方给一个数字：这件事的第一年预算是多少？哪个部门出？",
                    "我确认一下：你方是说「完全不该做」，还是「现在不该做」？这两种主张差很远。",
                    "追问一句：如果试点成功，你方是否支持推广？如果不支持，试点又为了什么？",
                    "我想问：你方判准里的「可检验」，由谁来检验？第三方还是自己人？",
                    "请对方正面回答：出现责任事故时，追责对象是机构还是个人？",
                    "我想确认边界：按你方逻辑，是不是所有带风险的事都不该批准？"
            )),
            Map.entry("B质询", List.of(
                    "我请教对方一辩：你说的「可行」，是实验室可行还是大规模推行可行？",
                    "对方一直在谈原则，我想问：执行主体是谁？出了问题向谁追责？",
                    "追问：你方说「效果会体现」，多久体现？三年不起效算不算失败？",
                    "我想问：你方给的判准，能不能用来判断一件已经发生的事？如果不能，它就不是判准。",
                    "请对方明确：你方主张的是「现在就叫停」，还是「叫停后换一套」？",
                    "我确认一下：你方举的那两个案例，成本和今天这件事是同一个量级吗？",
                    "追问：如果评估结果和你方预期相反，你方会改变立场吗？",
                    "我想问一句直接的：这套方案最坏的结果是什么，谁承担？"
            )),
            // 质询·问：封闭问句池（是/否、数字、二选一）——质询该逼出可核查的口径，不是长篇论证
            Map.entry("A质询问", List.of(
                    "请对方只回答是或否：你方是否承认第一年的成本由学校承担？",
                    "请给一个数字：这件事第一年的预算是多少，由哪个部门出？",
                    "请二选一：你方主张现在全面推开，还是先试点再评估？",
                    "请明确口径：你方说的「可行性」用哪一项指标衡量？",
                    "请回答时间点：如果三年内不出效果，你方是否同意叫停？",
                    "请确认边界：按你方逻辑，凡带风险的项目是不是都不该立项？"
            )),
            Map.entry("B质询问", List.of(
                    "请对方只回答是或否：现行制度里是否出现过责任无人承担的情况？",
                    "请给一个数字：试点覆盖多少所学校才算你方说的「规模」？",
                    "请二选一：你方要的是取消考试，还是更换考核形式？",
                    "请明确口径：你方说的「改进」由谁来判定已经发生？",
                    "请回答时间点：你方的方案到第几年能给出评估结论？",
                    "请确认边界：如果评估结果与预期相反，你方是否调整主张？"
            )),
            // 质询·答：先正面回答 + 一句理由 + 可反问（以前答方抽到的全是提问句，见 docs/audit/02 A10）
            Map.entry("A质询答", List.of(
                    "我方正面回答：成本由学校承担，理由是它本来就有教务与学籍权限。要不要我把分摊比例也说清？",
                    "我方直接回答：先试点再评估，理由是现在没有任何基线数据。需要我把评估指标列出来吗？",
                    "我方明确：承担主体是校教务部门，理由是它已经在做学籍审核。你方是否认可这个主体？",
                    "我方给数字：第一年按每校一笔固定预算列支，理由是这与人头无关。你方要不要看口径？",
                    "我方回答：三年内按年度评估，理由是学期制天然有节点。要不要我把节点说细一点？",
                    "我方确认边界：有风险不等于不该做，理由是风险可以分层管理。你方接受这个区分吗？"
            )),
            Map.entry("B质询答", List.of(
                    "我方正面回答：现行制度里确实有过责任真空，理由是执行与监管分属两个部门。要不要我把环节点出来？",
                    "我方直接回答：规模先定一个区，理由是一区之内才好比较。需要我把样本量说出来吗？",
                    "我方明确：要换考核形式而不是取消考核，理由是学分认定必须有凭证。你方是否同意这个前提？",
                    "我方给口径：由第三方评估判定改进，理由是自评没有约束力。你方接受第三方吗？",
                    "我方回答：第二年给出中期评估，理由是第一年只能拿到基线。要不要我把基线口径列出来？",
                    "我方确认边界：结论相反我方就调整主张，理由是判准要先于结论。你方愿意同样承诺吗？"
            )),
            Map.entry("A自由辩", List.of(
                    "对方把风险直接推成了禁止——风险存在只支持「应当规范」，支撑不到「不应推进」。",
                    "对方始终没有回答成本由谁承担，分摊机制缺位，这个论证就是不完整的。",
                    "对方每个回合都在换判准：谈收益时用效率，谈风险时用安全，两个标准互相打架。",
                    "对方说「可以慢慢来」，但没说慢到什么时候，也没有任何阶段目标。",
                    "对方举的反例只证明了「有失败案例」，没证明「大概率失败」。",
                    "对方把「我们现在没准备好」当成「永远不该做」，这一步推得太远。",
                    "对方一直在要求我方证明没风险，这是把举证责任整个搬给了我方。",
                    "对方的方案里没有退出机制，一旦错了也停不下来，这才是真正的问题。"
            )),
            Map.entry("B自由辩", List.of(
                    "对方说我方只会否定，但我方给了替代路径：先试点、再评估、后铺开。",
                    "请对方正面回答：如果现在就全面推进，第一年的执行主体是谁？",
                    "对方把「方向对」当成「现在就能做」，这两件事之间隔着执行能力。",
                    "对方每提一个收益，我方就问一次成本，问到第四个问题对方就没答了。",
                    "对方说「先做了再改」，可这件事没有可逆性，做了就回不去。",
                    "对方的判准在自己身上就失效——按你方标准，你方这套方案也过不了。",
                    "对方把「有人反对」解释成「反对者保守」，这不是论证，是贴标签。",
                    "对方始终没有给出失败的定义，所以也永远不会承认失败。"
            )),
            Map.entry("A总结", List.of(
                    "整场下来，对方始终回避成本由谁承担。我方结论：值得做，但要按可监督的路径做。",
                    "三个分歧收一下：标准、成本、执行。前两个对方没答，第三个答错了。",
                    "我方不要求对方全盘接受，只要求承认一点：这件事需要可追责的机制才成立。",
                    "对方今天给了方向，没给方法；给了愿望，没给条件。我方给的是条件。",
                    "把这场拉回最朴素的一问：出了事，能不能找到负责的人。对方从头到尾没答。",
                    "我方守到最后的判准没变：可执行、可监督、可追责。请评委按这三条打分。"
            )),
            Map.entry("B总结", List.of(
                    "我方结辩：对方没有拿出任何一期执行评估。在评估缺位时不应全面推进。",
                    "真正的分歧不在该不该，而在能不能——这一点我方从立论守到了现在。",
                    "我方不比谁更理想，只比谁更敢面对最坏情况。对方一次都没面对。",
                    "回顾整场：对方所有论证都建立在一个未证明的前提上——执行者一定尽责。",
                    "我方最后只请评委回答一个问题：现在推，谁兜底。答不出来，就不该推。",
                    "我方立场从头到尾没有移动：条件不成立之前，方向再对也不该动。"
            ))
    );

    /**
     * 环节结构的「变体」：同一个环节给 3 套不同的推进顺序，每轮随机抽一套。
     *
     * <p>只有 SEG_GUIDE 一套结构时，8 个席位打三场，骨架全都一样，
     * 读起来就像同一个模板换词。这里让结构本身也有变化。
     */
    private static final Map<String, List<String>> SEG_VARIANTS = Map.of(
            "立论", List.of(
                    "【变体A】先界定 → 给判准 → 两个论点 → 收束立场。",
                    "【变体B】先摆出一个现实矛盾 → 由此推出判准 → 用判准回答矛盾 → 收束。",
                    "【变体C】先给结论 → 立刻说清「我凭什么这么判」→ 两个支撑 → 一句让步后再收束。"
            ),
            "驳立论", List.of(
                    "【变体A】引对方一处原话 → 指出推理缺口 → 用我方判准重判。",
                    "【变体B】先承认对方一处合理 → 再指出它管辖不到的地方 → 补我方视角。",
                    "【变体C】把对方论证推到极端，让它自己显出荒谬 → 给出我方替代解释。"
            ),
            "质询", List.of(
                    "【变体A】先问定义（你说的X具体指什么）→ 再问边界（什么情况下不算）→ 收在追责。",
                    "【变体B】先要一个可核查的口径（数字/主体/时间）→ 对方答不出就指出这是印象。",
                    "【变体C】先确认对方立场强度（完全反对 or 有条件反对）→ 顺着它的条件往下逼。"
            ),
            "自由辩", List.of(
                    "【变体A】直接回击对方上一个说法 → 补一个新角度 → 反问一句把球打回去。",
                    "【变体B】先让一步 → 指出让步之后对方反而更被动 → 给出我方更硬的判准。",
                    "【变体C】指出对方换过判准 → 用对方自己的标准检验它自己的方案。"
            ),
            "总结", List.of(
                    "【变体A】收三个分歧（标准/成本/执行）→ 指出对方哪些没答 → 落回我方判准。",
                    "【变体B】只讲一条主线：这场真正的分歧是什么 → 我方为什么守住了它。",
                    "【变体C】回到最朴素的一问（谁负责/谁承担）→ 用整场证据回答它 → 一句收尾。"
            )
    );

    /** 每个环节该怎么说——这是让 AI 像正常辩手的关键 *//** 每个环节该怎么说——这是让 AI 像正常辩手的关键 */
    private static final java.util.Map<String, String> SEG_GUIDE = java.util.Map.of(
            "立论", """
                    按这个顺序写，不要跑：
                    1) 先界定题目里最关键的词（一句话）；
                    2) 给出我方判准（1–2 条，可检验）；
                    3) 用判准推出 2 个论点，每个论点一句话结论 + 一句话支撑；
                    4) 最后一句收束，给出我方立场。
                    禁止：一上来就反问、先说对方、只喊口号没结构。""",
            "驳立论", """
                    按这个顺序写：
                    1) 先点出对方立论里 1–2 个具体问题（引用对方原话不超过 12 字）；
                    2) 说明这个问题为什么致命（一句因果）；
                    3) 再用一句话讲清我方立场为何因此更成立。
                    不要重新讲一遍自己的立论。""",
            "质询", """
                    这一轮是质询：以问句为主，2–3 个问题，不要长篇论证。
                    每个问题都要逼对方给出可核查的口径（谁执行、怎么算、凭什么）。
                    可以有一句短铺垫，其余全是问句。""",
            "自由辩", """
                    这一轮是自由辩：短兵相接，60–100 字就够。
                    结构：一句回击 + 一句反问。不要展开三段论，不要重复已经说过的段落。""",
            "总结", """
                    这一轮是结辩：
                    1) 把全场分歧归成 2–3 条；
                    2) 逐条判定谁占了上风（用一句话给理由）；
                    3) 最后一句拉到价值层面收束。
                    不要引入新论点。"""
    );

    private final LlmClient llm;
    private final com.siyige.service.EvidenceService evidence;
    private final com.siyige.service.UtteranceCheck utterance;
    /** 语音开关从后台参数读（参数管理第二批）：每次现读，关掉立刻生效。 */
    private final ConfigService cfg;
    private final Random random = new Random();

    /**
     * 单场 token 预算（默认 40000，配置项 {@code siyige.ai.match-token-budget}）。
     *
     * <p>为什么要有：一场 4v4 是 20+ 轮，每轮「分析 + 生成」两次调用，遇上模型退化重试还会翻倍。
     * 预算用尽后**本场后续轮次直接走模板**（并为复盘标注 budget-exhausted），
     * 宁可这一场话说得糙，也不能让一场对局把当天额度烧穿。
     */
    @org.springframework.beans.factory.annotation.Value("${siyige.ai.match-token-budget:40000}")
    private long matchTokenBudget = 40000;

    /** 当前线程正在为哪一场生成（bind 时记下，用于查本场用量）。 */
    private volatile String currentMatchId;

    /** 引用护栏拦下的编造引用累计条数（speak 这种只返回 String 的入口靠它把计数交出去）。 */
    private final java.util.concurrent.atomic.AtomicLong quoteFabricatedTotal =
            new java.util.concurrent.atomic.AtomicLong();

    public AiService(LlmClient llm, com.siyige.service.EvidenceService evidence,
                     com.siyige.service.UtteranceCheck utterance,
                     ConfigService cfg) {
        this.llm = llm;
        this.evidence = evidence;
        this.utterance = utterance;
        this.cfg = cfg;
    }

    /** 模型可用 = 有 key（llm.enabled）**且**后台没关语音通道。 */
    public boolean llmEnabled() { return llm.enabled() && cfg.getBool(ConfigKey.AI_SPEECH_ENABLED); }

    /** 把本轮模型调用归到某场对局（计费用）。 */
    public void bind(String matchId) { llm.bindMatch(matchId); this.currentMatchId = matchId; }

    /** 如果该用户配了自己的模型，这一轮就用他的 key。 */
    public void useOwnProfile(String userId, com.siyige.billing.UserLlmService userLlm) {
        if (userLlm == null || userId == null) return;
        var p = userLlm.profileOf(userId);
        if (p != null) llm.useProfile(p);
    }

    public void clearOwnProfile() { llm.clearProfile(); }

    /** 基础版：切到本地 ollama 的配置。 */
    public void useProfile(com.siyige.ai.LlmClient.Profile p) { llm.useProfile(p); }
    public void unbind() { llm.unbindMatch(); this.currentMatchId = null; }
    public long tokensForMatch(String matchId) { return llm.tokensForMatch(matchId); }
    public void clearMatchUsage(String matchId) { llm.clearMatchUsage(matchId); }

    // ------------------------------------------------------------ token 预算

    /** 本场预算（token）。 */
    public long matchTokenBudget() { return matchTokenBudget; }

    /** 设置本场预算；传 ≤0 视为关掉预算（回到默认值的语义由调用方决定）。 */
    public void setMatchTokenBudget(long budget) { this.matchTokenBudget = budget; }

    /** 本场已用 token。单独抽出来是为了让单测能注入用量，不必真发请求。 */
    long usedTokens() {
        String id = currentMatchId;
        return id == null || id.isBlank() ? 0 : llm.tokensForMatch(id);
    }

    /** 纯函数版预算判定：≤0 的预算视为不限。 */
    static boolean budgetExceeded(long used, long budget) { return budget > 0 && used >= budget; }

    /** 本场预算是否已经用尽（没有绑定对局时一律 false）。 */
    public boolean budgetExhausted() {
        String id = currentMatchId;
        if (id == null || id.isBlank()) return false;
        return budgetExceeded(usedTokens(), matchTokenBudget);
    }

    /** 引用护栏拦下的编造引用条数（累计，进程内）。 */
    public long quoteFabricatedCount() { return quoteFabricatedTotal.get(); }

    public void resetQuoteFabricatedCount() { quoteFabricatedTotal.set(0); }

    // ---------------------------------------------------------------- 主入口

    public String speak(String seat, String seg, String topicTitle, List<Map<String, Object>> history) {
        return speak(seat, seg, topicTitle, null, history);
    }

    public String speak(String seat, String seg, String topicTitle, String topicId, List<Map<String, Object>> history) {
        return speak(seat, seg, topicTitle, topicId, "pro", history);
    }

    public String speak(String seat, String seg, String topicTitle, String topicId, String difficulty,
                        List<Map<String, Object>> history) {
        return speak(seat, seg, "", topicTitle, topicId, difficulty, history);
    }

    /** 带环节职责（质询·问 / 质询·答）的版本。 */
    public String speak(String seat, String seg, String duty, String topicTitle, String topicId, String difficulty,
                        List<Map<String, Object>> history) {
        Personas.Persona p = Personas.of(seat);
        String mateLast = lastSameSide(history, seat);
        String oppLast = lastOpposite(history, seat);
        String mine = myKeyLines(history, seat);

        String text;
        if (budgetExhausted()) {
            log.warn("本场 token 预算用尽（{}≥{}），本轮直接走模板", usedTokens(), matchTokenBudget);
            text = template(seat, seg, duty, mateLast, history);
        } else if (llmEnabled()) {
            try {
                text = llm.chat(SYSTEM, buildPrompt(seat, seg, duty, topicTitle, topicId, difficulty, p, mateLast, oppLast, mine, history, ""), p.temperature(), 25);
            } catch (Exception e) {
                log.warn("LLM 发言失败，降级模板：{}", e.toString());
                text = template(seat, seg, duty, mateLast, history);
            }
        } else {
            text = template(seat, seg, duty, mateLast, history);
        }
        return guard(text, p, mateLast, oppLast, seat, seg, duty, history);
    }

    public String speak(String seat, String seg, String topicTitle) {
        return speak(seat, seg, topicTitle, List.of());
    }

    /**
     * 一条发言的结果。
     *
     * <p>字段说明（后两个是新增的，原来的三参构造仍然可用）：
     * <ul>
     *   <li>{@code text} —— 落库正文（已经过输出护栏与引用核查）</li>
     *   <li>{@code degraded} —— 本轮是否降级成模板</li>
     *   <li>{@code analysis} —— 两段式第一步的结构化分析（JSON 原文，失败时为空串）</li>
     *   <li>{@code analysisStatus} —— 分析的真实状态：{@code ok} 有分析 / {@code degraded} 分析失败已降级 /
     *       {@code budget-exhausted} 本场预算用尽直接走模板 / {@code none} 没有可分析素材（对方还没说话）</li>
     *   <li>{@code fabricated} —— 本轮引用护栏拦下并改写的「编造引用」条数</li>
     * </ul>
     *
     * <p>为什么要单独给 {@code analysisStatus}：复盘要能区分「这一轮 AI 真的听了对方再回应」和
     * 「分析挂了、它是在盲说」。只看 {@code analysis} 空不空分不出来——没有素材时本来就是空的。
     */
    public record Speech(String text, boolean degraded, String analysis, String analysisStatus, int fabricated) {

        /** 分析成功，生成阶段用上了这份分析。 */
        public static final String ANALYSIS_OK = "ok";
        /** 分析阶段失败，本轮按无分析生成（复盘标「降级」）。 */
        public static final String ANALYSIS_DEGRADED = "degraded";
        /** 本场 token 预算用尽，本轮直接走模板。 */
        public static final String ANALYSIS_BUDGET = "budget-exhausted";
        /** 没有可分析素材（对方还没发言 / 内容空泛），不算失败。 */
        public static final String ANALYSIS_NONE = "none";

        /** 兼容旧构造：只给三段时按有无分析内容推断状态。 */
        public Speech(String text, boolean degraded, String analysis) {
            this(text, degraded, analysis,
                    analysis == null || analysis.isBlank() ? ANALYSIS_NONE : ANALYSIS_OK, 0);
        }

        public boolean analysisOk() { return ANALYSIS_OK.equals(analysisStatus); }
        public boolean analysisDegraded() { return ANALYSIS_DEGRADED.equals(analysisStatus); }
        public boolean budgetExhausted() { return ANALYSIS_BUDGET.equals(analysisStatus); }

        /** 复盘/日志里直接显示的中文标注。 */
        public String analysisLabel() {
            return switch (analysisStatus == null ? ANALYSIS_NONE : analysisStatus) {
                case ANALYSIS_OK -> "有分析";
                case ANALYSIS_DEGRADED -> "分析失败·已降级";
                case ANALYSIS_BUDGET -> "预算用尽·模板兜底";
                default -> "无分析素材";
            };
        }
    }

    private static final String ANALYST = """
            你是辩论分析器。只做拆解，不写回应、不给建议、不评价输赢。
            输出必须是纯 JSON（不要 markdown 代码块），字段固定：
            {"claim":"对方核心主张（一句话）",
             "evidence":["他给的论据，每条不超过 20 字"],
             "fallacies":[{"type":"以偏概全|因果倒置|循环论证|偷换概念|诉诸情绪|无","quote":"摘自对方原话，不超过 12 字"}],
             "weakness":"最容易被击穿的一点（一句话）"}
            若确实没有可指摘之处，fallacies 给空数组，weakness 写"标准未给"或"事实未核"。
            """;

    /**
     * 单人模式专用：先分析对方上一句，再生成回应。
     *
     * <p>两步分开是刻意的 —— 一次让它"分析 + 写稿"，它一定跳过分析直接套话。
     * 分析失败不阻断对局，只是本轮退化为"无分析生成"。
     */
    public Speech speakForSolo(String seat, String seg, String topicTitle, String topicId, String difficulty,
                               List<Map<String, Object>> history) {
        return speakForSolo(seat, seg, "", topicTitle, topicId, difficulty, history);
    }

    /** 带环节职责的版本（质询·答 时会强制"先回答再补"）。 */
    public Speech speakForSolo(String seat, String seg, String duty, String topicTitle, String topicId, String difficulty,
                               List<Map<String, Object>> history) {
        Personas.Persona p = Personas.of(seat);
        String mateLast = lastSameSide(history, seat);
        String oppLast = lastOpposite(history, seat);
        String mine = myKeyLines(history, seat);

        boolean budgetOut = budgetExhausted();
        String analysis = "";
        String analysisStatus = Speech.ANALYSIS_NONE;
        if (!budgetOut && llmEnabled() && oppLast != null && !oppLast.isBlank()
                && !(utterance != null && utterance.vacuous(oppLast))) {
            try {
                analysis = analyze(oppLast, topicTitle, seg);
                // 返回了空串也等于没分析：复盘必须能看出「这一轮是盲说的」
                analysisStatus = (analysis == null || analysis.isBlank())
                        ? Speech.ANALYSIS_DEGRADED : Speech.ANALYSIS_OK;
            } catch (Exception e) {
                log.warn("对手发言分析失败，本轮按无分析生成：{}", e.toString());
                analysis = "";
                analysisStatus = Speech.ANALYSIS_DEGRADED;
            }
        }

        boolean degraded = false;
        String text;
        if (budgetOut) {
            log.warn("本场 token 预算用尽（{}≥{}），本轮直接走模板", usedTokens(), matchTokenBudget);
            text = template(seat, seg, duty, mateLast, history);
            degraded = true;
            analysis = "";
            analysisStatus = Speech.ANALYSIS_BUDGET;
        } else if (llmEnabled()) {
            try {
                text = llm.chat(SYSTEM, buildPrompt(seat, seg, duty, topicTitle, topicId, difficulty, p,
                        mateLast, oppLast, mine, history, analysis), p.temperature(), 25);
            } catch (Exception e) {
                log.warn("LLM 发言失败，降级模板：{}", e.toString());
                text = template(seat, seg, duty, mateLast, history);
                degraded = true;
            }
        } else {
            text = template(seat, seg, duty, mateLast, history);
            degraded = true;
        }
        GuardResult g = guardDetailed(text, p, mateLast, oppLast, seat, seg, duty, history);
        return new Speech(g.text(), degraded, analysis, analysisStatus, g.fabricated());
    }

    /**
     * 两段式的流式版：分析照旧（阻塞，很快），**只有生成这一步流式**。
     *
     * <p>为什么要单独一个方法而不是改 speakForSolo：房间里多人对局不走两段式，
     * 也不需要流式（SSE 广播给多个人，增量推太碎）。这里只服务单人模式。
     *
     * @param onDelta 每收到一小段文本回调一次，调用方负责推给前端
     */
    public Speech speakForSoloStream(String seat, String seg, String topicTitle, String topicId,
                                      String difficulty, List<Map<String, Object>> history,
                                      java.util.function.Consumer<String> onDelta) {
        return speakForSoloStream(seat, seg, "", topicTitle, topicId, difficulty, history, onDelta);
    }

    /** 带环节职责的流式版本。 */
    public Speech speakForSoloStream(String seat, String seg, String duty, String topicTitle, String topicId,
                                      String difficulty, List<Map<String, Object>> history,
                                      java.util.function.Consumer<String> onDelta) {
        Personas.Persona p = Personas.of(seat);
        String mateLast = lastSameSide(history, seat);
        String oppLast = lastOpposite(history, seat);
        String mine = myKeyLines(history, seat);

        boolean budgetOut = budgetExhausted();
        String analysis = "";
        String analysisStatus = Speech.ANALYSIS_NONE;
        if (!budgetOut && llmEnabled() && oppLast != null && !oppLast.isBlank()
                && !(utterance != null && utterance.vacuous(oppLast))) {
            try {
                analysis = analyze(oppLast, topicTitle, seg);
                analysisStatus = (analysis == null || analysis.isBlank())
                        ? Speech.ANALYSIS_DEGRADED : Speech.ANALYSIS_OK;
            } catch (Exception e) {
                log.warn("对手发言分析失败，本轮按无分析生成：{}", e.toString());
                analysis = "";
                analysisStatus = Speech.ANALYSIS_DEGRADED;
            }
        }

        boolean degraded = false;
        String text;
        if (budgetOut) {
            log.warn("本场 token 预算用尽（{}≥{}），本轮直接走模板（流式）", usedTokens(), matchTokenBudget);
            text = template(seat, seg, duty, mateLast, history);
            degraded = true;
            analysis = "";
            analysisStatus = Speech.ANALYSIS_BUDGET;
        } else if (llmEnabled()) {
            try {
                text = llm.chatStream(SYSTEM, buildPrompt(seat, seg, duty, topicTitle, topicId, difficulty, p,
                        mateLast, oppLast, mine, history, analysis), p.temperature(), 25, onDelta);
            } catch (Exception e) {
                // 流式失败：整段重来一次（不走流式），再不行才降级模板
                log.warn("流式生成失败，回落整段：{}", e.toString());
                try {
                    text = llm.chat(SYSTEM, buildPrompt(seat, seg, duty, topicTitle, topicId, difficulty, p,
                            mateLast, oppLast, mine, history, analysis), p.temperature(), 25);
                } catch (Exception e2) {
                    log.warn("LLM 发言失败，降级模板：{}", e2.toString());
                    text = template(seat, seg, duty, mateLast, history);
                    degraded = true;
                }
            }
        } else {
            text = template(seat, seg, duty, mateLast, history);
            degraded = true;
        }
        GuardResult g = guardDetailed(text, p, mateLast, oppLast, seat, seg, duty, history);
        return new Speech(g.text(), degraded, analysis, analysisStatus, g.fabricated());
    }

    /** 只做分析：把对方上一句拆成 主张/论据/漏洞/弱点。 */
    public String analyze(String oppText, String topicTitle, String seg) throws Exception {
        String prompt = "辩题：" + (topicTitle == null ? "" : topicTitle)
                + "\n当前环节：" + (seg == null ? "" : seg)
                + "\n对方刚说：「" + shorten(oppText, 400) + "」";
        return llm.chat(ANALYST, prompt, 0.2, 12);
    }

    /**
     * 剥掉"对方刚才说「…」"这类引用外壳（可能套了好几层）。
     *
     * <p>为什么必须剥：prompt 里把对方原话包成「对方刚才说：「…」」，
     * 模型下一轮会把这个包装当成对方的话原样抄走，一轮套一层，
     * 十几轮后就成了「对方刚才说「对方刚才说「对方刚才说「…」」」。
     */
    private static String stripQuoteFrames(String src) {
        if (src == null) return "";
        String s = src.trim();
        String[] openers = {"对方刚才说「", "对方刚才说：", "对方说「", "对方说：", "顺着我方刚才那句「", "顺着我方刚才那句："};
        for (int round = 0; round < 4; round++) {
            boolean changed = false;
            for (String op : openers) {
                if (s.startsWith(op)) { s = s.substring(op.length()).trim(); changed = true; }
            }
            if (s.endsWith("」")) { s = s.substring(0, s.length() - 1).trim(); changed = true; }
            if (!changed) break;
        }
        return s;
    }

    // ---------------------------------------------------------------- 上下文

    /** 同侧最近一条（可能是真人队友，也可能是另一个 AI）。 */
    static String lastSameSide(List<Map<String, Object>> turns, String seat) {
        if (turns == null) return "";
        String side = Format.side(seat);
        for (int i = turns.size() - 1; i >= 0; i--) {
            String s = String.valueOf(turns.get(i).get("seat"));
            if (!Format.side(s).equals(side)) continue;
            if (s.equals(seat)) continue;
            String c = String.valueOf(turns.get(i).get("content"));
            if (c != null && !c.isBlank() && !c.contains("超时")) return c;
        }
        return "";
    }

    /** 对方最近一条。 */
    static String lastOpposite(List<Map<String, Object>> turns, String seat) {
        if (turns == null) return "";
        String side = Format.side(seat);
        for (int i = turns.size() - 1; i >= 0; i--) {
            String s = String.valueOf(turns.get(i).get("seat"));
            if (Format.side(s).equals(side)) continue;
            String c = String.valueOf(turns.get(i).get("content"));
            if (c != null && !c.isBlank() && !c.contains("超时")) return c;
        }
        return "";
    }

    /** 我方此前说过的要点（取同侧最近两条，供模型不要重复自己）。 */
    static String myKeyLines(List<Map<String, Object>> turns, String seat) {
        if (turns == null) return "";
        String side = Format.side(seat);
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (int i = turns.size() - 1; i >= 0 && n < 2; i--) {
            String s = String.valueOf(turns.get(i).get("seat"));
            if (!Format.side(s).equals(side)) continue;
            String c = String.valueOf(turns.get(i).get("content"));
            if (c == null || c.isBlank()) continue;
            if (sb.length() > 0) sb.insert(0, "；");
            sb.insert(0, shorten(c, 60));
            n++;
        }
        return sb.toString();
    }

    private String buildPrompt(String seat, String seg, String topic, String topicId, String difficulty, Personas.Persona p,
                               String mateLast, String oppLast, String mine,
                               List<Map<String, Object>> history) {
        return buildPrompt(seat, seg, "", topic, topicId, difficulty, p, mateLast, oppLast, mine, history, "");
    }

    private String buildPrompt(String seat, String seg, String duty, String topic, String topicId, String difficulty,
                               Personas.Persona p, String mateLast, String oppLast, String mine,
                               List<Map<String, Object>> history, String analysis) {
        StringBuilder sb = new StringBuilder();
        sb.append("【身份】").append(Personas.side(seat)).append(Personas.role(seat))
          .append("（").append(seat).append("），说话风格：").append(p.style())
          .append("，语气：").append(p.tone()).append("。习惯：").append(p.habit()).append("\n");
        sb.append("【辩题】").append(topic).append("\n");
        sb.append("【当前环节】").append(seg).append("\n");
        // 环节职责：质询是"一问一答"，答方必须先正面回答；之前没有这条约束，
        // AI 会在"答"的位置继续自问自答（实跑时 step 6/8 都是这样）。
        if (duty != null && !duty.isBlank()) {
            sb.append("【这一轮你的任务】").append(duty).append("\n");
            if (duty.contains("答")) {
                sb.append("硬性要求：第一句必须**正面回答**对方刚才提出的问题（给出明确结论或口径），")
                  .append("不要用「先问定义」「我方认为这个问题……」这类话延后；回答完最多补一条理由，")
                  .append("需要的话最后可以反问一句。总长控制在 120 字内。\n");
            } else if (duty.contains("问")) {
                sb.append("硬性要求：只提 1–2 个**可核查**的具体问题（问事实、问口径、问边界），"
                        + "不要长篇论证自己的立场；总长控制在 100 字内。\n");
            }
        }

        sb.append("【表达要求】直接回应内容本身：**不要用**「对方刚才说……」「顺着我方刚才那句……」这类复述套话开头；")
          .append("引用对方原话不超过一次、且只引关键词。同一句话不要在相邻两轮里重复讲。\n");
        int capHint = charCap(seg, duty, p);
        sb.append("【字数】这一环节最多 ").append(capHint).append(" 字（超过会被截断），说重点，不要凑字数。\n");
        sb.append("【你的推理方式】").append(p.strategy()).append("\n");
        sb.append("【陪练强度】").append(switch (difficulty == null ? "pro" : difficulty.toLowerCase()) {
            case "novice" -> "新手：语气友好，先接住对方再给台阶，不主动抓对方漏洞";
            case "contest" -> "竞赛：严厉、节奏快，主动抓对方每一步的漏洞，会质疑对方的前提与定义";
            default -> "进阶：正常对抗，点出主要分歧，遇到明显错误会当场反驳";
        }).append("\n");
        if (!mine.isBlank()) sb.append("【我方已说过】").append(mine).append("\n");
        // 同一个席位连续两轮开口（质询里 答完接着问）→ 明确提示别复述
        String lastSeat = history == null || history.isEmpty() ? "" : String.valueOf(history.get(history.size() - 1).get("seat"));
        if (seat.equals(lastSeat)) {
            sb.append("【注意】你上一轮刚说过话，这一轮要**推进**：换一个角度或直接提问，不要重复上一轮的说法。\n");
        }
        if (!mateLast.isBlank())
            sb.append("【同侧队友刚才说】").append(shorten(mateLast, 150)).append("\n");
        String oppClean = stripQuoteFrames(oppLast);
        if (!oppClean.isBlank()) {
            if (utterance != null && utterance.vacuous(oppClean)) {
                // 关键：一个字都不给模型看。给了它就会照着引述。
                sb.append("【对方最近说】（对方这一轮只发出极短内容，没有可引述的主张）\n");
                sb.append("【注意】").append(utterance.vacuousHint(oppLast)).append("\n");
            } else {
                sb.append("【对方最近说】").append(shorten(oppClean, 200)).append("\n");
                sb.append("【必须回应的具体主张】").append(coreClaim(oppClean)).append("\n");
            }
        }
        if (topicId != null && evidence != null) {
            String cards = evidence.promptBlock(topicId, Format.side(seat));
            if (!cards.isBlank()) {
                sb.append("【可用论据（只能用这些，引用时把出处写出来）】\n").append(cards).append("\n");
            }
        }
        String used = usedOpenings(history);
        if (!used.isBlank())
            sb.append("【场上已用过的开头】").append(used).append("（本轮禁止再用，必须换一种）\n");

        // 单人模式：先把对方上一句拆成结构（主张/论据/漏洞/弱点），再据此回应。
        // 这一段是"真的听他说话"的落点：回应必须命中 analysis 里的具体项。
        if (analysis != null && !analysis.isBlank()) {
            sb.append("\n【对方上一句的结构化分析（必须据此回应，不要照抄 JSON，也不要提「分析」二字）】\n")
              .append(shorten(analysis, 600)).append("\n");
            sb.append("回应要求：先正面回应它的 claim 或 weakness 其中之一，再指出 fallacies 里的一处（有就指，没有就讲标准）。\n");
        }

        sb.append("\n【本轮要求】\n");
        // 字数只在这里与【字数】那一行给出，且都取 charCap() 的同一个数（见 docs/audit/02-ai-speech.md A1）
        sb.append("1. 控制在 ").append(capHint).append(" 字以内，最多 3 段；超过上限会被截断。\n");
        sb.append("2. 环节结构（必须照做）：\n").append(SEG_GUIDE.getOrDefault(seg, "正常发言即可。")).append("\n");
        List<String> vs = SEG_VARIANTS.get(seg);
        if (vs != null && !vs.isEmpty())
            sb.append("  本轮按这个顺序推进：").append(vs.get(random.nextInt(vs.size()))).append("\n");
        if (!mateLast.isBlank()) {
            sb.append("3. 如果同侧队友刚说过，可以有承接，但**不要用套话开头**");
            sb.append("（禁止「我接着我方X辩那条往下说」「我方X辩把标准立起来了」这类模板腔），");
            sb.append("直接说内容即可，最多用「此外」「再补一条」这种自然过渡。\n");
        } else {
            sb.append("3. 若【对方最近说】非空，要回应其中某个具体说法，但不要套用「对方说『…』，问题在于」这种句式反复出现，直接讲你的反驳。\n");
        }
        sb.append("4. 不要重复【我方已说过】里已经讲过的论点，要往前推。\n");
        sb.append("5. 需要数据时只能引用【可用论据】里的内容，并把出处写出来（如「据《某某法》」）。\n");
        sb.append("   绝对不许编造具体数字、比例、机构名称；没有可引用的就写「请对方给出可核查口径」。\n");
        return sb.toString();
    }

    /** 从对方那段话里抽出「可被点名反驳的具体主张」，最多 20 字。 */
    static String coreClaim(String line) {
        // 极短/无实质内容的话没有「可回应的主张」
        String flat = line == null ? "" : line.replaceAll("[\\s\\p{Punct}，。！？、；：\"'（）《》【】…—~]", "");
        if (flat.length() <= 4) return "";
        if (line == null || line.isBlank()) return "";
        String s = line.replace("\\n", " ").trim();
        String[] parts = s.split("[，。；：、！？,.;:!?]");
        String best = "";
        for (String part : parts) {
            String p = part.trim();
            if (p.length() >= 8 && p.length() > best.length()) best = p;
            if (best.length() >= 20) break;
        }
        if (best.isBlank()) best = s;
        return best.length() <= 20 ? best : best.substring(0, 20);
    }

    /** 场上最近几条发言的开头，用来强制 AI 换句式，避免全场一个腔调。 */
    static String usedOpenings(List<Map<String, Object>> turns) {
        if (turns == null || turns.isEmpty()) return "";
        java.util.LinkedHashSet<String> set = new java.util.LinkedHashSet<>();
        for (int i = Math.max(0, turns.size() - 4); i < turns.size(); i++) {
            String c = String.valueOf(turns.get(i).get("content"));
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("^(顺着|接住|先回应|回应|我接着|我来补|我方[一二三四]辩讲了|我方[一二三四]辩的|我方[一二三四]辩把)")
                    .matcher(c.trim());
            if (m.find()) set.add(m.group(1));
        }
        return String.join("、", set);
    }

    /**
     * 本环节**唯一**的字数上限：人设上限与环节上限取小。
     *
     * <p>prompt 引导与护栏截断必须用同一个数。旧实现是两套数：prompt 让模型写「220–320 字」、
     * 护栏按 260 切，于是模型每次都写到 320 再被砍掉尾巴（docs/audit/02-ai-speech.md A1）。
     */
    static int charCap(String seg, String duty, Personas.Persona p) {
        int cap = Math.min(p == null ? 260 : p.maxChars(), Format.segCharCap(seg, duty));
        return Math.max(40, cap);
    }

    // ---------------------------------------------------------------- 兜底

    private String template(String seat, String seg, String mateLast, List<Map<String, Object>> history) {
        return template(seat, seg, "", mateLast, history);
    }

    /**
     * 兜底发言。
     *
     * <p>池子的键从「阵营+环节」扩成「阵营+环节+职责」：质询·问走封闭问句池、质询·答走
     * 「先正面回答 + 一句理由 + 可反问」池（旧实现答方抽到的全是提问句，docs/audit/02 A10）。
     * 末尾再掺一句席位人设（{@link #PERSONA_TAIL}），否则无 key 时同侧四个席位听起来是同一个人。
     */
    private String template(String seat, String seg, String duty, String mateLast,
                            List<Map<String, Object>> history) {
        List<String> pool = LINES.getOrDefault(poolKey(seat, seg, duty), LINES.get("A自由辩"));

        // 本场没出现过的优先（避免三句里两句一样）；末尾掺一句席位人设
        String base = pickFresh(pool, history) + personaTail(seat, history);

        // 立论/总结/质询·答 都不能用「顺着我方刚才那句…」开场（答方第一句必须是正面回答），
        // 而且这层壳很占字数：质询·答 上限 120 字，加了它人设尾句就被截掉了。
        boolean hookAllowed = !"总结".equals(seg) && !"立论".equals(seg)
                && !(duty != null && duty.contains("答"));
        if (!hookAllowed) return base;
        if (mateLast == null || mateLast.isBlank()) return base;
        String hook = hookOf(mateLast);
        if (hook.isBlank() || alreadyQuoted(history, hook, mateLast)) return base;
        return LEAD_TPL[random.nextInt(LEAD_TPL.length)].formatted(hook) + base;
    }

    /** 池子键：阵营 + 环节（质询再叠职责）。 */
    static String poolKey(String seat, String seg, String duty) {
        String side = Format.side(seat);
        String s = seg == null ? "" : seg;
        if (s.startsWith("质询") && duty != null) {
            if (duty.contains("答")) return side + "质询答";
            if (duty.contains("问")) return side + "质询问";
        }
        return side + s;
    }

    /**
     * 每个席位一句"人设口吻"，接在兜底句末尾。
     *
     * <p>取自 {@link Personas} 的 style/habit 意图，但写成人话（不是复述人设标签），例如
     * A1 的「三条缺一不可」、A4 的「三个分歧收一下」、B4 的「对方从头到尾没有回答一个问题」。
     * 同一句在最近三轮里出现过就不再重复，避免变成新的复读机。
     */
    private static final Map<String, String> PERSONA_TAIL = Map.ofEntries(
            Map.entry("A1", "我方判准三条缺一不可。"),
            Map.entry("A2", "我先就同一处连续追问。"),
            Map.entry("A3", "我举个具体场景来说明。"),
            Map.entry("A4", "三个分歧收一下。"),
            Map.entry("B1", "先把关键词的定义统一。"),
            Map.entry("B2", "对方刚才那个例子恰好说明这一点。"),
            Map.entry("B3", "这两件事是因果还是相关，得分清。"),
            Map.entry("B4", "对方从头到尾没有回答这个问题。")
    );

    static String personaTail(String seat) {
        return PERSONA_TAIL.getOrDefault(seat, "");
    }

    /** 人设尾句；最近三条里已经出现过就不再加（防止每轮同一句）。 */
    private static String personaTail(String seat, List<Map<String, Object>> history) {
        String tail = personaTail(seat);
        if (tail.isEmpty()) return "";
        if (history != null) {
            for (int i = Math.max(0, history.size() - 3); i < history.size(); i++) {
                String c = String.valueOf(history.get(i).get("content"));
                if (c != null && c.contains(tail)) return "";
            }
        }
        return " " + tail;
    }

    /** 从模板池里挑一条本场没用过的；都用过就随便挑一条。 */
    private String pickFresh(List<String> pool, List<Map<String, Object>> history) {
        String joined = "";
        if (history != null) {
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> t : history) sb.append(String.valueOf(t.get("content")));
            joined = sb.toString();
        }
        for (int i = 0; i < 12; i++) {
            String cand = pool.get(random.nextInt(pool.size()));
            String head = cand.length() > 14 ? cand.substring(0, 14) : cand;
            if (!joined.contains(head)) return cand;
        }
        return pool.get(random.nextInt(pool.size()));
    }

    /**
     * 承接对方的句式池。
     *
     * <p>以前只有一句「对方说「X」，这个问题在于：」，连打三场都是同一句，
     * 一眼就看出是模板。这里按「引述 / 反问 / 让步 / 拆解 / 归谬」五种姿态各给几条。
     */
    private static final String[] LEAD_TPL = {
            "你这一轮没有回答问题，只回了一句「%s」——请正面给出你的判准：",
            "等一下，「%s」不算回应。我问的是条件，你答的是态度：",
            "对方说「%s」——问题不在结论，在这一步推得太快：",
            "先接住对方「%s」这句。承认它，但它的适用范围比说的小得多：",
            "「%s」这句话我要拆一下，它其实含了两个互不支撑的断言：",
            "对方刚才讲「%s」，我只问一句：这个说法在什么条件下不成立？",
            "把「%s」推到极端，就能看出它站不住：",
            "对方「%s」这句，恰恰证明了我方的判准——",
            "「%s」听起来成立，是因为它默认了一个没被证明的前提：",
            "我不否认「%s」，但要指出它只覆盖了问题的一半："
    };

    /** 从一句话里挑一个可引用的「意群」：优先引号内，其次第一个分句，绝不从词中间硬切。 */
    public static String hookOf(String line) {
        if (line == null) return "";
        // 敷衍/无实质内容的话不能当引文（否则会出现「对方说『11』，问题在于……」这种荒唐句子）
        String cleaned = line.replaceAll("[\\s\\p{Punct}，。！？、；：\"'（）《》【】…—~]", "");
        if (cleaned.length() <= 4) return "";
        String s = line.replace("\n", " ").trim();
        // 1) 引号内已有现成短语
        int i = s.indexOf('「'), j = s.indexOf('」', i + 1);
        if (i >= 0 && j > i + 1 && j - i <= 18) return s.substring(i + 1, j);
        // 2) 剥掉开头的话术层：承接语整段（到冒号为止）、发言人自称、既有引号
        if (s.matches("^(顺着|接住|先回应|回应|接着).*")) {
            int c = s.indexOf('：'); if (c < 0) c = s.indexOf(':'); if (c < 0) c = s.indexOf('，');
            if (c > 0 && c < 40) s = s.substring(c + 1).trim();
        }
        s = s.replaceFirst("^(顺着|接住|先回应|回应|接着)[^，。；]{0,24}?(，|：|:|——|—)", "");
        s = s.replaceFirst("^我方[^，。；：]{0,10}[：:]", "");
        s = s.replaceFirst("^(我方立论|我方核心主张|我方立场明确|我方换个角度|对方说|对方认为)[：:，,]?", "");
        s = s.replaceFirst("^「[^」]{1,18}」[，,：:]?", "");
        s = s.trim();
        // 3) 按标点切第一个分句，长度 6–16 字
        String[] parts = s.split("[—，。；：、！？,.;:!?]");
        for (String part : parts) {
            String p = part.trim();
            if (p.length() < 8) continue;                                  // 太短的片段引出来没意义
            if (p.matches("^(我再|我要|这一条|真正的|换个角度|先回应|顺着|接住).*")) continue;  // 跳过元话术
            if (p.length() <= 16) return p;
            int q = Math.max(p.lastIndexOf('，', 16), Math.max(p.lastIndexOf('；', 16), p.lastIndexOf('：', 16)));
            return q >= 8 ? p.substring(0, q) : p.substring(0, 14);
        }
        return s.length() <= 16 ? s : s.substring(0, 16);
    }

    /** 承接句式池：按席位取，避免 7 个 AI 用同一句开头。 */
    private static final String[] LINK_TPL = {
            "顺着我方%s刚才说的「%s」，我再往前推一层：",
            "接住我方%s那句「%s」——我要补的是：",
            "我方%s讲了「%s」，这一条我认，但它还缺一半：",
            "先回应我方%s：他说「%s」之后，真正的难点在于：",
            "我跟进我方%s的「%s」，换个角度说："
    };

    /** 这个 hook 是不是已经被人引用过了（防止全员复读同一句）。 */
    static boolean alreadyQuoted(java.util.List<Map<String, Object>> turns, String hook, String source) {
        if (hook == null || hook.isBlank() || turns == null) return false;
        for (Map<String, Object> t : turns) {
            String c = String.valueOf(t.get("content"));
            if (c.equals(source)) continue;                 // 被引用的那句本身不算
            if (c.contains("「" + hook + "」")) return true;  // 别人已经引用过
        }
        return false;
    }

    // ---------------------------------------------------------------- 护栏

    /** 护栏结果：可直接落库的正文 + 引用护栏拦下的编造引用条数。 */
    record GuardResult(String text, int fabricated) { }

    /** 输出后处理：承接检查 + 去 AI 味 + 长度截断 + 引用真实性核查。 */
    String guard(String text, Personas.Persona p, String mateLast, String oppLast, String seat, String seg, String duty, List<Map<String, Object>> history) {
        return guardDetailed(text, p, mateLast, oppLast, seat, seg, duty, history).text();
    }

    /**
     * 同 {@link #guard}，但把「引用护栏改写了多少条」一并交给调用方。
     *
     * <p>只是加一个返回值，原有 {@code guard(...)} 的签名和行为保持不变——上下游都不必改。
     */
    GuardResult guardDetailed(String text, Personas.Persona p, String mateLast, String oppLast, String seat, String seg, String duty, List<Map<String, Object>> history) {
        String t = text == null ? "" : text.trim();
        t = t.replaceAll("(?i)作为(一个)?(AI|人工智能|语言模型)[，,]?", "")
             .replaceAll("(?i)I'?m an AI\\.?", "")
             .replaceAll("\\n{3,}", "\n\n")
             .trim();
        if (t.isEmpty()) t = LINES.get("A自由辩").get(0);

        // 模型自己可能已经写了「对方刚才说「…」」这种开头 —— 先剥掉，避免和下面的前缀叠成两层
        t = stripLeadingTemplate(t);

        // 优先级：先针对对方（用户最在意这点），再谈承接队友
        boolean hitsOpponent = t.matches("(?s).*(对方|你方|反方|正方).*");
        String oppClean = stripQuoteFrames(oppLast);
        if (!oppClean.isBlank() && !hitsOpponent) {
            if (utterance != null && utterance.vacuous(oppClean)) {
                // 对方这轮只回了「11」这类内容：不能编出一句引文，直接点破。
                if (!t.contains("没有回答")) t = "你这一轮没有回答问题。" + t;
            } else {
                // claim 从"剥掉壳之后"的文本里取，长度收到 24 字以内
                String claim = shorten(coreClaim(oppClean), 24).replaceAll("[「」『』]", "").trim();
                // 最近几轮已经引用过同一句 → 不再重复引用，直接说自己的（避免"复读机"）
                boolean quoted = !claim.isBlank() && alreadyQuoted(history, claim, claim);
                int usedOppFrames = countOppFrames(history);
                // 同一个席位连着两轮（质询里"答完接着问"）→ 不加引用框架，直接推进
                String lastSeat = (history == null || history.isEmpty())
                        ? "" : String.valueOf(history.get(history.size() - 1).get("seat"));
                if (seat.equals(lastSeat)) usedOppFrames = 99;
                if (!claim.isBlank() && !quoted && usedOppFrames < 3) {
                    t = "对方刚才说「" + claim + "」，这一点我不认同：" + t;
                }
            }
        }
        boolean hasLink = t.matches("(?s).*(顺着|接着|接住|补充|回应|刚才.*说的|讲了|这一条我认|我方[一二三四]辩|「).*");
        String mateClean = stripQuoteFrames(mateLast);
        // ① 环节限制：总结是收束、立论是开场、质询答要先回答问题 —— 都不该"顺队友"
        boolean hookAllowed = seg != null
                && !"总结".equals(seg)
                && !"立论".equals(seg)
                && !(duty != null && duty.contains("答"));
        // ③ 全场最多用两次承接模板（真人不会每轮都用同一句开场）
        int usedHooks = countHooks(history);
        if (hookAllowed && usedHooks < 2 && !mateClean.isBlank() && !hasLink) {
            String hook = clipAtClause(hookOf(mateClean).replaceAll("[「」『』]", "").trim(), 18);
            if (hook.length() >= 6 && !alreadyQuoted(history, hook, mateLast)) {
                String[] leads = {
                        "顺着我方刚才那句「" + hook + "」，再补一层：",
                        "接着我方上一位的说法，「" + hook + "」这一点还要往下推：",
                        "把「" + hook + "」这半步往下推："
                };
                t = leads[Math.min(usedHooks, leads.length - 1)] + t;
            }
        }
        // 先剪掉模型自己重复的段落（退化循环），再按字数截断
        t = cutRepeats(t);

        // 上限只有一个来源：charCap()（prompt 引导与这里用同一个数）。
        // 截断走句读/逗号/省略号，绝不凭空补一个句号把半句话伪装成完整句。
        int cap = charCap(seg, duty, p);
        t = clipToCap(t, cap);

        // 最后一道：引用真实性。模型很爱写「对方说『……』」，而那句对方根本没说过。
        // 放在截断之后做——否则刚改写好的句子可能又被字数上限切一刀。
        QuoteGuard.Result qg = QuoteGuard.scrub(t, history, oppLast, mateLast);
        if (qg.fabricated() > 0) {
            quoteFabricatedTotal.addAndGet(qg.fabricated());
            log.info("引用护栏：{} 条引文在历史里对不上或指纹不一致，已改写（席位 {}·{}，共核对 {} 条，其中指纹不符 {} 条）",
                    qg.fabricated(), seat, seg, qg.quoted(), qg.mismatched());
        }
        // 截断/改写都可能留下半个引号，这里统一收口（不管有没有 fabricated 都要做）
        t = QuoteGuard.dropDangling(qg.text());
        return new GuardResult(t, qg.fabricated());
    }

    /**
     * 按字数上限收尾：最近句读（。！？；）→ 最近逗号（，、：）→ 82% 处加省略号。
     *
     * <p>三条硬约束：
     * <ul>
     *   <li>不凭空造句号（旧实现 {@code substring(0,cap)+'。'} 会让半句话看起来说完了）；</li>
     *   <li>不把句子切在一个词的中间：退到最近的句读/逗号；一个都没有才退到 82% 并写明省略号；</li>
     *   <li>不切进引号内部：切口落在未闭合的引号里时，退回到那个开引号之前。</li>
     * </ul>
     */
    static String clipToCap(String text, int cap) {
        String t = text == null ? "" : text;
        if (cap <= 0 || t.length() <= cap) return t;

        int floor = Math.max(20, (int) (cap * 0.6));
        int cut = lastBoundary(t, cap, "。！？；");
        if (cut >= floor) return safePrefix(t, cut + 1, "");
        cut = lastBoundary(t, cap, "，、：,");
        if (cut >= floor) return safePrefix(t, cut, "……");
        return safePrefix(t, Math.max(1, (int) Math.round(cap * 0.82)), "……");
    }

    /** 在 [0, cap) 里从后往前找第一个出现在 marks 里的字符。 */
    private static int lastBoundary(String t, int cap, String marks) {
        for (int i = Math.min(cap, t.length()) - 1; i >= 0; i--) {
            if (marks.indexOf(t.charAt(i)) >= 0) return i;
        }
        return -1;
    }

    /** 取前缀并按需加省略号；若切口落在引号内部，退回到那个开引号之前。 */
    private static String safePrefix(String t, int end, String tail) {
        int stop = Math.min(Math.max(0, end), t.length());
        String head = t.substring(0, stop);
        int opener = unclosedOpener(head);
        if (opener >= 0) head = head.substring(0, opener);
        head = head.trim();
        if (head.isEmpty()) head = t.substring(0, Math.min(t.length(), Math.max(1, stop))).trim();
        return tail.isEmpty() ? head : head + tail;
    }

    /** 前缀里最后一个没闭合的开引号位置（没有返回 -1）。 */
    static int unclosedOpener(String s) {
        java.util.ArrayDeque<Integer> stack = new java.util.ArrayDeque<>();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '「', '『', '“', '‘' -> stack.push(i);
                case '」', '』', '”', '’' -> {
                    if (!stack.isEmpty()) stack.pop();
                }
                case '"' -> {
                    if (!stack.isEmpty() && s.charAt(stack.peek()) == '"') stack.pop();
                    else stack.push(i);
                }
                default -> { }
            }
        }
        return stack.isEmpty() ? -1 : stack.peek();
    }

    /**
     * 剥掉模型输出开头的"复述模板"，保证同一层引用不会一轮一轮往上套。
     * 例：『对方刚才说「X」，这个判断我不同意：<正文>』→『<正文>』
     */
    private static String stripLeadingTemplate(String src) {
        if (src == null) return "";
        String s = src.trim();
        for (int i = 0; i < 3; i++) {
            String before = s;
            s = s.replaceFirst("^对方刚才说「[^」]{0,60}」，(这个判断我不同意|这一点我不认同|这个说法不成立)[：:]", "");
            s = s.replaceFirst("^顺着我方刚才那句「[^」]{0,60}」，?(再补一层|再补充一点)[：:]", "");
            s = s.replaceFirst("^「[^」]{0,60}」，(这个判断我不同意|这一点我不认同)[：:]", "");
            s = s.trim();
            if (s.equals(before)) break;
        }
        return s.isEmpty() ? src : s;
    }

    /** 历史里已经用过几次"对方刚才说「…」"的引用框架（用来限制频率）。 */
    private static int countOppFrames(List<Map<String, Object>> history) {
        if (history == null) return 0;
        int n = 0;
        for (Map<String, Object> t : history) {
            if (String.valueOf(t.get("content")).startsWith("对方刚才说")) n++;
        }
        return n;
    }

    /** 历史里已经用过几次"承接队友"的模板（用来限制频率）。 */
    private static int countHooks(List<Map<String, Object>> history) {
        if (history == null) return 0;
        int n = 0;
        for (Map<String, Object> t : history) {
            String c = String.valueOf(t.get("content"));
            if (c.startsWith("顺着我方刚才那句") || c.startsWith("接着我方上一位的说法")
                    || c.startsWith("把「")) n++;
        }
        return n;
    }

    /** 把引文截到最近的分句边界，避免「…要满足什」这种半句。 */
    private static String clipAtClause(String s, int max) {
        if (s == null) return "";
        String x = s.trim();
        if (x.length() <= max) return x;
        int cut = -1;
        for (int i = Math.min(max, x.length()) - 1; i >= 6; i--) {
            char c = x.charAt(i);
            if ("，。；、！？：」』".indexOf(c) >= 0) { cut = i; break; }
        }
        return cut > 6 ? x.substring(0, cut) : x.substring(0, max);
    }

    /**
     * 剪掉模型退化式重复。
     *
     * <p>现象：一次输出里把同一段话抄 5–10 遍（一个气泡 1500+ 字，max_tokens 也拦不住）。
     *
     * <p>但旧判据「同句第二次出现即截断、后面全丢」误伤太重：结辩的复现句（「我方判准只有一条…」
     * 开头立一遍、收尾再点一遍）和质询的重复追问都是真辩手会用的修辞（docs/audit/02 A2）。现在：
     * <ol>
     *   <li><b>连续 3 次以上</b>完全相同才算退化（同一句连说 2 遍是修辞，允许）；</li>
     *   <li>判退化时<b>只删重复的那几句</b>，收束句等后续内容照旧保留；</li>
     *   <li>整段是「前半段原样再复制一遍」的周期性循环（abcabc…）时，只留前半段——
     *       这是模型卡死最典型的样子，且不会动到 a b a 这种呼应结构。</li>
     * </ol>
     */
    static String cutRepeats(String src) {
        if (src == null) return "";
        String s = src.trim();
        if (s.length() < 120) return s;

        String[] raw = s.split("(?<=[。！？；])");
        if (raw.length < 4) return s;

        List<String> parts = new ArrayList<>();
        for (String r : raw) {
            String t = r.trim();
            if (!t.isEmpty()) parts.add(t);
        }

        // ① 连续的同一句：≥3 次才收敛成 1 句（2 次 = 修辞复现/重复追问，保留）
        List<String> once = new ArrayList<>();
        for (int i = 0; i < parts.size(); ) {
            String key = repeatKey(parts.get(i));
            int run = 1;
            while (i + run < parts.size() && repeatKey(parts.get(i + run)).equals(key)) run++;
            if (key.length() >= 8 && run >= 3) {
                once.add(parts.get(i));
            } else {
                for (int k = 0; k < run; k++) once.add(parts.get(i + k));
            }
            i += run;
        }

        // ② 周期性循环（abcabc / abab…）：只留前半段
        List<String> out = once;
        while (out.size() >= 4 && out.size() % 2 == 0 && sameBlock(out)) {
            out = new ArrayList<>(out.subList(0, out.size() / 2));
        }

        String joined = String.join("", out).trim();
        return joined.length() < 20 ? s : joined;
    }

    /** 去掉空白后的句子（用来判"是不是同一句"）。 */
    private static String repeatKey(String s) {
        return s == null ? "" : s.replaceAll("[\\s\u3000]", "");
    }

    /** 句子列表是否由前后两个完全相同的块组成。 */
    private static boolean sameBlock(List<String> parts) {
        int half = parts.size() / 2;
        for (int i = 0; i < half; i++) {
            if (!repeatKey(parts.get(i)).equals(repeatKey(parts.get(i + half)))) return false;
        }
        return true;
    }

    private static String shorten(String s, int n) {
        String t = s.replace("\n", " ");
        return t.length() <= n ? t : t.substring(0, n) + "…";
    }

    /** 跳过时的摘要（R-FLOW-09）。 */
    public String summary(String seat, String seg, String topicTitle) {
        String full = template(seat, seg, "", List.of());
        return "（已跳过）" + full.substring(0, Math.min(26, full.length())) + "…";
    }
}
