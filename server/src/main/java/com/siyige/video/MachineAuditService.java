package com.siyige.video;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 电子审核（机器初审）。
 *
 * <p>三级判定，任何一级命中即停：
 * <ol>
 *   <li><b>结构校验</b>：标题长度、视频地址合法性、环节取值 → 不合法直接 REJECT</li>
 *   <li><b>硬违规词</b>：命中 reject-words → REJECT</li>
 *   <li><b>软风险词</b>：命中 review-words → REVIEW（转人工，不直接驳回）</li>
 * </ol>
 *
 * <p>判定结果与依据都会写进 dv_audit，可追溯、可一键恢复。
 */
@Service
public class MachineAuditService {

    public record Verdict(String result, String reason) { }

    private final List<String> rejectWords;
    private final List<String> reviewWords;
    private final int titleMin;
    private final int titleMax;
    private final boolean allowLocalUpload;

    public MachineAuditService(
            @Value("${siyige.video.audit.reject-words:}") String rejectWords,
            @Value("${siyige.video.audit.review-words:}") String reviewWords,
            @Value("${siyige.video.audit.title-min:4}") int titleMin,
            @Value("${siyige.video.audit.title-max:60}") int titleMax,
            @Value("${siyige.video.audit.allow-local-upload:true}") boolean allowLocalUpload) {
        this.rejectWords = split(rejectWords);
        this.reviewWords = split(reviewWords);
        this.titleMin = titleMin;
        this.titleMax = titleMax;
        this.allowLocalUpload = allowLocalUpload;
    }

    private static List<String> split(String s) {
        List<String> out = new ArrayList<>();
        if (s == null) return out;
        for (String p : s.split(",")) {
            String t = p.trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    /** 审核一条视频的元数据。 */
    public Verdict check(String title, String description, String url, String segment) {
        String t = title == null ? "" : title.trim();
        String d = description == null ? "" : description.trim();

        // ① 结构
        if (t.length() < titleMin) return new Verdict("REJECT", "标题过短（少于 " + titleMin + " 字）");
        if (t.length() > titleMax) return new Verdict("REJECT", "标题过长（超过 " + titleMax + " 字）");
        if (url == null || url.isBlank()) return new Verdict("REJECT", "缺少视频地址");
        boolean ok = url.startsWith("http://") || url.startsWith("https://")
                || (allowLocalUpload && url.startsWith("/uploads/"));
        if (!ok) return new Verdict("REJECT", "视频地址不合法（只接受 http(s) 或 /uploads/）");
        if (segment != null && !segment.isBlank() && !SEGMENTS.contains(segment))
            return new Verdict("REJECT", "环节取值非法：" + segment + "（只能是 " + String.join("/", SEGMENTS) + "）");

        // ② 硬违规
        String all = t + " " + d;
        for (String w : rejectWords) {
            if (all.contains(w)) return new Verdict("REJECT", "命中违禁词：" + w);
        }

        // ③ 软风险 → 人工复核
        for (String w : reviewWords) {
            if (all.contains(w)) return new Verdict("REVIEW", "命中风险词：" + w + "，转人工复核");
        }

        // ④ 辩论内容的最低结构要求：标题里要有可识别的辩题痕迹
        if (t.length() < 8 && d.isEmpty())
            return new Verdict("REVIEW", "信息偏少（标题短且无简介），转人工看一眼");

        return new Verdict("PASS", "机器初审通过");
    }

    public static final List<String> SEGMENTS =
            List.of("立论", "驳立论", "质询", "自由辩", "总结", "名场面");

    /** 供前端展示的审核规则说明。 */
    public Map<String, Object> rules() {
        return Map.of(
                "titleMin", titleMin,
                "titleMax", titleMax,
                "rejectWords", rejectWords,
                "reviewWords", reviewWords,
                "segments", SEGMENTS,
                "flow", List.of("提交 → 机器初审", "命中风险词 → 人工复核", "通过 → 进入 Feed", "驳回 → 通知作者并留痕")
        );
    }
}
