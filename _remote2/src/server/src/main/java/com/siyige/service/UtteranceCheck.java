package com.siyige.service;

import org.springframework.stereotype.Component;

/**
 * 发言有效性判断。
 *
 * <p>真实辩论里，如果一方只回「11」或者「对」，对方不会假装他说了论点继续讲下去，
 * 而是会直接点出来：「你这一轮没有回答问题」。这个类就是那条判据。
 */
@Component
public class UtteranceCheck {

    /** 一句话是不是「敷衍/无效发言」：没有可回应的实质内容。 */
    public boolean vacuous(String text) {
        if (text == null) return true;
        String t = text.trim();
        if (t.isEmpty()) return true;

        // 去掉标点与空白后看剩余内容
        String core = t.replaceAll("[\\s\\p{Punct}，。！？、；：\"'（）《》【】…—~]", "");
        if (core.isEmpty()) return true;

        // 1) 纯数字（「11」「123」）
        if (core.matches("^[0-9]+$")) return true;
        // 2) 单字重复（「对对对」「哈哈哈」）
        if (core.length() <= 4 && core.chars().distinct().count() <= 2) return true;
        // 3) 极短且无实词（「ok」「嗯」「好」「随便」）
        if (core.length() <= 3) return true;
        // 4) 长度过短且没有判断/论据迹象（<6 字且不含任何结构词）
        if (core.length() < 6 && !hasAnyMarker(core)) return true;

        return false;
    }

    private static final String[] MARKERS = {
            "因为", "所以", "但是", "虽然", "如果", "我方", "对方", "应当", "认为", "标准", "判准", "问题"
    };

    private boolean hasAnyMarker(String s) {
        for (String m : MARKERS) if (s.contains(m)) return true;
        return false;
    }

    /**
     * 给 AI 的一句话提示：对方这轮是敷衍的。
     *
     * <p>注意：**不能把对方那句话原文写进提示**。之前写「对方只回了『11』」，
     * 模型就会照着引述，产出「对方刚才说『11』，这个判断我不同意」这种荒唐句子。
     * 这里只说「极短、无实质内容」，并明确禁止引述。
     */
    public String vacuousHint(String text) {
        return "对方这一轮的发言极短、没有给出任何实质主张（不要引述那句原文，也不要说「对方说……」）。"
                + "正确做法：先用一句点出来「你这一轮没有回答问题」，"
                + "再把你上一轮的问题原样追一次（要求他给口径/给主体/给条件），"
                + "最后补一句你自己要立的论点。整段不要出现对方那串原文。";
    }
}
