package com.siyige.ai;

import com.siyige.domain.Format;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
            "我方核心主张：这件事收益是公共的，成本却集中在少数主体，整体值得推进。")),
        Map.entry("B立论", List.of(
            "我方先把议题拉回现实：今天讨论的不是理想状态该不该，而是此时此刻能不能。",
            "我方立场明确：这一命题在现实层面缺乏可行性，成本与收益结构性错配。")),
        Map.entry("A驳立论", List.of(
            "对方一辩把「技术可行」直接推成了「制度应当」，这是从实然跳到应然。",
            "对方始终没说清成本由谁承担，只谈收益不谈分摊，论证不完整。")),
        Map.entry("B驳立论", List.of(
            "对方立的标准太宽——按它的说法，任何有试错成本的政策都不该做。",
            "对方举的例子只能说明个别地区可行，推不出普遍可复制。")),
        Map.entry("A质询", List.of(
            "我请教对方：你方说的「成本过高」，具体高在哪个科目？没有口径，这就只是印象。",
            "我想追问：按你方的标准，现有制度里有几项能通过？")),
        Map.entry("B质询", List.of(
            "我请教对方一辩：你说的「可行」，是实验室可行还是大规模推行可行？",
            "对方一直在谈原则，我想问：执行主体是谁？出了问题向谁追责？")),
        Map.entry("A自由辩", List.of(
            "对方把风险直接推成了禁止——风险存在只支持「应当规范」，支撑不到「不应推进」。",
            "对方始终没有回答成本由谁承担，分摊机制缺位，这个论证就是不完整的。")),
        Map.entry("B自由辩", List.of(
            "对方说我方只会否定，但我方给了替代路径：先试点、再评估、后铺开。",
            "请对方正面回答：如果现在就全面推进，第一年的执行主体是谁？")),
        Map.entry("A总结", List.of(
            "整场下来，对方始终回避成本由谁承担。我方结论：值得做，但要按可监督的路径做。",
            "三个分歧收一下：标准、成本、执行。前两个对方没答，第三个答错了。")),
        Map.entry("B总结", List.of(
            "我方结辩：对方没有拿出任何一期执行评估。在评估缺位时不应全面推进。",
            "真正的分歧不在该不该，而在能不能——这一点我方从立论守到了现在。"))
    );

    /** 每个环节该怎么说——这是让 AI 像正常辩手的关键 */
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
    private final boolean speechEnabled;
    private final Random random = new Random();

    public AiService(LlmClient llm, com.siyige.service.EvidenceService evidence,
                     @Value("${siyige.llm.speech-enabled:true}") boolean speechEnabled) {
        this.llm = llm;
        this.evidence = evidence;
        this.speechEnabled = speechEnabled;
    }

    public boolean llmEnabled() { return llm.enabled() && speechEnabled; }

    // ---------------------------------------------------------------- 主入口

    public String speak(String seat, String seg, String topicTitle, List<Map<String, Object>> history) {
        return speak(seat, seg, topicTitle, null, history);
    }

    public String speak(String seat, String seg, String topicTitle, String topicId, List<Map<String, Object>> history) {
        return speak(seat, seg, topicTitle, topicId, "pro", history);
    }

    public String speak(String seat, String seg, String topicTitle, String topicId, String difficulty,
                        List<Map<String, Object>> history) {
        Personas.Persona p = Personas.of(seat);
        String mateLast = lastSameSide(history, seat);
        String oppLast = lastOpposite(history, seat);
        String mine = myKeyLines(history, seat);

        String text;
        if (llmEnabled()) {
            try {
                text = llm.chat(SYSTEM, buildPrompt(seat, seg, topicTitle, topicId, difficulty, p, mateLast, oppLast, mine, history), p.temperature(), 25);
            } catch (Exception e) {
                log.warn("LLM 发言失败，降级模板：{}", e.toString());
                text = template(seat, seg, mateLast, history);
            }
        } else {
            text = template(seat, seg, mateLast, history);
        }
        return guard(text, p, mateLast, oppLast, seat, history);
    }

    public String speak(String seat, String seg, String topicTitle) {
        return speak(seat, seg, topicTitle, List.of());
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
        StringBuilder sb = new StringBuilder();
        sb.append("【身份】").append(Personas.side(seat)).append(Personas.role(seat))
          .append("（").append(seat).append("），说话风格：").append(p.style())
          .append("，语气：").append(p.tone()).append("。习惯：").append(p.habit()).append("\n");
        sb.append("【辩题】").append(topic).append("\n");
        sb.append("【当前环节】").append(seg).append("\n");
        sb.append("【你的推理方式】").append(p.strategy()).append("\n");
        sb.append("【陪练强度】").append(switch (difficulty == null ? "pro" : difficulty.toLowerCase()) {
            case "novice" -> "新手：语气友好，先接住对方再给台阶，不主动抓对方漏洞";
            case "contest" -> "竞赛：严厉、节奏快，主动抓对方每一步的漏洞，会质疑对方的前提与定义";
            default -> "进阶：正常对抗，点出主要分歧，遇到明显错误会当场反驳";
        }).append("\n");
        if (!mine.isBlank()) sb.append("【我方已说过】").append(mine).append("\n");
        if (!mateLast.isBlank())
            sb.append("【同侧队友刚才说】").append(shorten(mateLast, 150)).append("\n");
        if (!oppLast.isBlank()) {
            sb.append("【对方最近说】").append(shorten(oppLast, 200)).append("\n");
            sb.append("【必须回应的具体主张】").append(coreClaim(oppLast)).append("\n");
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

        sb.append("\n【本轮要求】\n");
        sb.append("1. 输出 ").append(segChars(seg, p)).append(" 字，最多 3 段。\n");
        sb.append("2. 环节结构（必须照做）：\n").append(SEG_GUIDE.getOrDefault(seg, "正常发言即可。")).append("\n");
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

    /** 截断上限：按环节放宽，避免把半句话切掉。 */
    private static int segCap(String text) {
        int n = text == null ? 0 : text.length();
        if (n > 340) return 400;
        if (n > 280) return 320;
        if (n > 200) return 260;
        return 180;
    }

    /** 每个环节的字数区间：立论最长，自由辩最短。 */
    private static String segChars(String seg, Personas.Persona p) {
        return switch (seg) {
            case "立论" -> "220–320";
            case "驳立论" -> "150–220";
            case "质询" -> "60–110";
            case "自由辩" -> "60–100";
            case "总结" -> "200–280";
            default -> p.minChars() + "–" + p.maxChars();
        };
    }

    // ---------------------------------------------------------------- 兜底

    private String template(String seat, String seg, String mateLast, List<Map<String, Object>> history) {
        String key = Format.side(seat) + seg;
        List<String> pool = LINES.getOrDefault(key, LINES.get("A自由辩"));
        String base = pool.get(random.nextInt(pool.size()));
        if (mateLast == null || mateLast.isBlank()) return base;
        String hook = hookOf(mateLast);
        if (hook.isBlank() || alreadyQuoted(history, hook, mateLast)) return base;   // 已被引用过就讲自己的
        String lead = "对方说「" + hook + "」，这个问题在于：";
        return lead + base;
    }

    /** 从一句话里挑一个可引用的「意群」：优先引号内，其次第一个分句，绝不从词中间硬切。 */
    public static String hookOf(String line) {
        if (line == null) return "";
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

    /** 输出后处理：承接检查 + 去 AI 味 + 长度截断。 */
    String guard(String text, Personas.Persona p, String mateLast, String oppLast, String seat, List<Map<String, Object>> history) {
        String t = text == null ? "" : text.trim();
        t = t.replaceAll("(?i)作为(一个)?(AI|人工智能|语言模型)[，,]?", "")
             .replaceAll("(?i)I'?m an AI\\.?", "")
             .replaceAll("\\n{3,}", "\n\n")
             .trim();
        if (t.isEmpty()) t = LINES.get("A自由辩").get(0);

        // 优先级：先针对对方（用户最在意这点），再谈承接队友
        boolean hitsOpponent = t.matches("(?s).*(对方|你方|反方|正方).*");
        if (!oppLast.isBlank() && !hitsOpponent) {
            String claim = coreClaim(oppLast);
            if (!claim.isBlank()) t = "对方刚才说「" + claim + "」，这个判断我不同意：" + t;
        }
        boolean hasLink = t.matches("(?s).*(顺着|接着|接住|补充|回应|刚才.*说的|讲了|这一条我认|我方[一二三四]辩|「).*");
        if (!mateLast.isBlank() && !hasLink) {
            String hook = hookOf(mateLast);
            if (!hook.isBlank() && !alreadyQuoted(history, hook, mateLast)) {
                String lead = "对方说「" + hook + "」，问题在于：";
                t = lead + t;
            }
        }
        int cap = Math.max(p.maxChars(), segCap(t));
        if (t.length() > cap) {
            int cut = t.lastIndexOf('。', cap);
            t = cut > cap * 0.6 ? t.substring(0, cut + 1) : t.substring(0, cap) + '。';
        }
        return t;
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
