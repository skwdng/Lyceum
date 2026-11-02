package com.siyige.service;

import com.siyige.repo.Store;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 辩题 AI 审核（规格 §3.7 R-TOPIC-01~11）。
 * 默认走规则；配置了 llm 后可扩展为模型审核，结论三态不变。
 */
@Service
public class AuditService {

    public record Result(String result, String reason, List<String> suggestions, boolean cached) {}

    private static final Pattern BLACK = Pattern.compile("(傻|智障|去死|色情|裸|辱骂|恶心|滚)");
    private static final Pattern ABSOLUTE = Pattern.compile("(绝对|永远|一定|所有|必然)");
    private static final Pattern STANCE = Pattern.compile("(是否|该不该|应不应该|应当|利大于弊|弊大于利|优于|取代|取消|禁止|合法|值得)");

    private final Store store;
    private final com.siyige.ai.LlmClient llm;

    public AuditService(Store store, com.siyige.ai.LlmClient llm) {
        this.store = store;
        this.llm = llm;
    }

    private static final String AUDIT_SYSTEM = """
            你是辩论赛的辩题审核员。判断用户给的题目能不能作为正式辩题。
            只输出 JSON：{"result":"PASS|REJECT|NEED_EDIT","reason":"一句话理由",
            "suggestions":["改写示例1","改写示例2"]}
            判定标准：是否有正反两种合理立场；是否一方天然压倒；是否含绝对化表述；
            是否涉政敏感/色情/暴力/人身攻击（这类一律 REJECT）；是否不少于 6 字且是完整命题。
            """;

    /** 模型审核；模型不可用或解析失败时回退规则（R-TOPIC-08）。 */
    public Result judge(String t) {
        if (llm != null && llm.enabled()) {
            try {
                String raw = llm.chatJson(AUDIT_SYSTEM, "题目：" + t, 12);
                var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
                String result = node.path("result").asText("").toUpperCase();
                if (result.equals("PASS") || result.equals("REJECT") || result.equals("NEED_EDIT")) {
                    java.util.List<String> sug = new java.util.ArrayList<>();
                    for (var s : node.path("suggestions")) sug.add(s.asText());
                    return new Result(result, node.path("reason").asText("模型未给出理由"), sug, false);
                }
            } catch (Exception ignored) {
                // 落回规则审核
            }
        }
        return judgeByRules(t);
    }


    public Result audit(String title) {
        String t = title == null ? "" : title.trim();
        String hash = sha256(t);

        Map<String, Object> hit = store.auditByHash(hash);
        if (hit != null) {
            return new Result(str(hit.get("result")), str(hit.get("reason")),
                    split(str(hit.get("suggestions"))), true);
        }

        Result r = judge(t);
        store.insertAudit(t, hash, r.result(), r.reason(), String.join("|", r.suggestions()));
        return r;
    }

    /** 自定义辩题必须先过审核；通过则落库并返回 topicId。 */
    public String ensureTopic(String title) {
        Result r = audit(title);
        if (!"PASS".equals(r.result())) {
            throw new IllegalArgumentException("TOPIC_REJECTED:" + r.reason());
        }
        String hash = sha256(title.trim());
        String id = "c" + hash.substring(0, 8);
        if (store.topic(id) == null) {
            store.insertTopic(id, title.trim(), "自定义", "进阶", "custom", hash);
        }
        return id;
    }

    public Result judgeByRules(String t) {
        if (t.length() < 6) {
            return new Result("NEED_EDIT", "少于 6 个字，凑不成一个可判断的命题",
                    List.of("应不应该全面推行远程办公", "高校是否应当取消期末考试"), false);
        }
        if (BLACK.matcher(t).find()) {
            return new Result("REJECT", "含人身攻击或违规表述，不能作为辩题",
                    List.of("网络匿名是否应当被限制", "平台对极端言论的责任边界在哪"), false);
        }
        if (!STANCE.matcher(t).find()) {
            return new Result("NEED_EDIT", "没有明确的正反立场，无法分正反方",
                    List.of(t + "是否应当被推广", t + "利大于弊还是弊大于利"), false);
        }
        if (ABSOLUTE.matcher(t).find()) {
            return new Result("NEED_EDIT", "含绝对化表述，正反方无法公平论证",
                    List.of(ABSOLUTE.matcher(t).replaceAll("通常"), t + "在现实条件下是否可行"), false);
        }
        return new Result("PASS", "存在正反两种合理立场，边界清晰，可以开辩", List.of(), false);
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    private static List<String> split(String s) {
        if (s == null || s.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String x : s.split("\\|")) if (!x.isBlank()) out.add(x);
        return out;
    }

    public static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
