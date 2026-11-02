package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.ai.LlmClient;
import com.siyige.repo.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 赛前材料包（作战卡）。
 *
 * 真实辩论上场前，队伍会有一份「立论骨架 + 论据 + 对方可能的攻击 + 回应模板」。
 * 这里把它做出来：对局中挂成浮窗，随时能看一眼——但**不替你说**，
 * 材料只给结构，具体句子还得自己组织。
 */
@Service
public class BriefService {

    private static final Logger log = LoggerFactory.getLogger(BriefService.class);

    private static final String SYSTEM = """
            你是辩论赛教练。给选手一份上场用的作战卡，只输出 JSON：
            {"definitions":[{"term":"关键词","def":"可操作的定义"}],
             "case":["判准：……","论点一：……","论点二：……"],
             "attacks":["对方最可能说：……","你该怎么接：……"],
             "rebuttals":["如果对方说……，你可以回……"]}
            要求：definitions 最多 3 条，case 3 条，attacks 3 条，rebuttals 3 条；
            每条不超过 40 字；不要写空话，要给可执行的句子结构。
            """;

    private final Store store;
    private final LlmClient llm;
    private final EvidenceService evidence;
    private final ObjectMapper json = new ObjectMapper();

    public BriefService(Store store, LlmClient llm, EvidenceService evidence) {
        this.store = store; this.llm = llm; this.evidence = evidence;
    }

    public Map<String, Object> brief(String topicId, String side) throws Exception {
        Map<String, Object> topic = store.topic(topicId);
        String title = topic == null ? "（未知辩题）" : String.valueOf(topic.get("title"));
        String sideName = "A".equalsIgnoreCase(side) ? "正方" : "反方";

        String cached = store.brief(topicId, sideName);
        if (cached != null) return json.readValue(cached, Map.class);

        Map<String, Object> out;
        if (llm != null && llm.enabled()) {
            try {
                String raw = llm.chatJson(SYSTEM, "辩题：" + title + "\n我方立场：" + sideName, 20);
                out = json.readValue(raw, Map.class);
            } catch (Exception e) {
                log.warn("brief 生成失败，用模板：{}", e.toString());
                out = fallback(title, sideName);
            }
        } else {
            out = fallback(title, sideName);
        }

        out.put("topicId", topicId);
        out.put("topic", title);
        out.put("side", sideName);
        out.put("evidence", evidence.publicCards(topicId));
        store.saveBrief(topicId, sideName, json.writeValueAsString(out));
        return out;
    }

    /** 模板兜底：结构固定，内容随辩题替换。 */
    private Map<String, Object> fallback(String title, String sideName) {
        Map<String, Object> m = new LinkedHashMap<>();
        List<Map<String, String>> defs = new ArrayList<>();
        defs.add(Map.of("term", "核心词", "def", "先把「" + title.replaceAll("[？?]", "") + "」拆成可判断的范围，避免各说各话"));
        defs.add(Map.of("term", "判断标准", "def", "可执行、可监督、可追责——三条缺一不可"));
        defs.add(Map.of("term", "立场", "def", "我方持" + sideName + "，但不主张一步到位，而是主张按可验证的路径推进"));
        m.put("definitions", defs);

        m.put("case", List.of(
                "判准：这件事能不能做，取决于是否可执行、可监督、可追责。",
                "论点一：收益是公共的，成本集中在少数主体，需要制度来分摊。",
                "论点二：反对者常把「有风险」直接推成「不该做」，风险存在只支持「应当规范」。"));

        m.put("attacks", List.of(
                "对方最可能说：「成本太高、执行不了。」——你该怎么接：请他给出具体科目与口径，没有口径就是印象。",
                "对方最可能说：「已有制度能解决。」——你该怎么接：请他指出哪一条、运行了多久、效果怎么衡量。",
                "对方最可能说：「个案不可复制。」——你该怎么接：承认差异，但指出评估标准正是为此存在的。"));

        m.put("rebuttals", List.of(
                "如果对方说「显然」，你可以回：显然不是论据，请给出可核查的依据。",
                "如果对方举例，你可以回：这个例子恰好说明需要统一口径，而不是取消讨论。",
                "如果对方扩大化，你可以回：我方的立场没有走到你概括的那一步，请回到我原话。"));

        m.put("generated", false);
        return m;
    }

    private static String def(String s) { return s; }
}
