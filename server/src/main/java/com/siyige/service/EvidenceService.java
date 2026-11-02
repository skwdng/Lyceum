package com.siyige.service;

import com.siyige.repo.Store;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 论据库（P1）。
 *
 * 设计取舍：不提供「结论」，只提供**可以查证的锚点**——每条卡片都带出处与可信度标记。
 * 目的不是让 AI 说得更像，而是让「有没有用证据」这件事变成可判定的：
 *   · AI 只能从卡片里挑（结构性杜绝编数字）
 *   · 玩家引用卡片 → 论据分上升
 *   · 玩家编数字 → 直接扣分并点名
 */
@Service
public class EvidenceService {

    /** 数字 + 单位的模式，用来抓"凭空出现的统计" */
    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(%|％|万|亿|倍|元|人|所|年)");

    private final Store store;

    public EvidenceService(Store store) { this.store = store; }

    public List<Map<String, Object>> cards(String topicId) {
        return store.evidence(topicId);
    }

    /** 给 AI 的论据段落：只给本方 + 中立卡片，最多 4 条。 */
    public String promptBlock(String topicId, String side) {
        List<Map<String, Object>> all = cards(topicId);
        List<String> lines = new ArrayList<>();
        for (Map<String, Object> c : all) {
            String s = String.valueOf(c.get("side"));
            if (!s.equals(side) && !"C".equals(s)) continue;
            lines.add("· " + c.get("claim") + "（出处：" + c.get("source")
                    + (c.get("pub_year") == null ? "" : "，" + c.get("pub_year"))
                    + (isTrue(c.get("verified")) ? "" : " ·待核实") + "）");
            if (lines.size() >= 4) break;
        }
        return String.join("\n", lines);
    }

    public record Audit(int cited, List<String> citedClaims, List<String> fabricated) {}

    /** 检查一段发言：引用了几条卡片、有没有凭空造数字。 */
    public Audit audit(String text, List<Map<String, Object>> cards) {
        String t = text == null ? "" : text;
        int cited = 0;
        List<String> citedClaims = new ArrayList<>();
        for (Map<String, Object> c : cards) {
            String claim = String.valueOf(c.get("claim"));
            if (shares(t, claim, 8) || shares(t, String.valueOf(c.get("source")), 6)) {
                cited++;
                citedClaims.add(shorten(claim, 18));
            }
        }
        List<String> fabricated = new ArrayList<>();
        Matcher m = NUMBER.matcher(t);
        while (m.find()) {
            String raw = m.group();
            boolean inCards = cards.stream().anyMatch(c ->
                    String.valueOf(c.get("claim")).contains(raw)
                            || String.valueOf(c.get("source")).contains(raw));
            if (!inCards) fabricated.add(raw);
        }
        return new Audit(cited, citedClaims, fabricated);
    }

    /** 卡片列表 → 精简 JSON 友好的结构（前端用）。 */
    public List<Map<String, Object>> publicCards(String topicId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> c : cards(topicId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.get("id"));
            m.put("side", c.get("side"));
            m.put("claim", c.get("claim"));
            m.put("source", c.get("source"));
            m.put("year", c.get("pub_year"));
            m.put("verified", isTrue(c.get("verified")));
            m.put("tags", c.get("tags"));
            out.add(m);
        }
        return out;
    }

    /** H2 的 boolean 回来可能是 Boolean / "TRUE" / "1"，统一判一下。 */
    static boolean isTrue(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        String s = String.valueOf(v).toLowerCase();
        return s.equals("true") || s.equals("1") || s.equals("t");
    }

    static boolean shares(String a, String b, int n) {
        String x = strip(a), y = strip(b);
        if (y.length() < n) return x.contains(y);
        for (int i = 0; i + n <= y.length(); i++) {
            if (x.contains(y.substring(i, i + n))) return true;
        }
        return false;
    }

    private static String strip(String s) {
        return s == null ? "" : s.replaceAll("[\\s，。；：、！？「」（）“”\"']", "");
    }

    private static String shorten(String s, int n) {
        String t = s == null ? "" : s.trim();
        return t.length() <= n ? t : t.substring(0, n) + "…";
    }
}
