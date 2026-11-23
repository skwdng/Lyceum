package com.siyige.video;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 *
 * <p><b>四个判定参数后台可改</b>（参数管理第三批）：标题长度上下限、是否允许本地上传、
 * 机器通过后是否仍要人工复核。都改成每次审核现读（{@link ConfigService}），改完不用重启。
 * <b>词表（reject-words / review-words）故意不搬</b>：它是一整串词，改一个词要改整串、
 * 还要重启解析，留给以后的「词表管理」页；这里仍然只在构造器里解析一次。
 */
@Service
public class MachineAuditService {

    private static final Logger log = LoggerFactory.getLogger(MachineAuditService.class);

    public record Verdict(String result, String reason) { }

    /** 标题长度的兜底值：两个键各自合法、组合起来却是 min > max 时用它们。 */
    private static final int DEFAULT_TITLE_MIN = 4;
    private static final int DEFAULT_TITLE_MAX = 60;

    private final List<String> rejectWords;
    private final List<String> reviewWords;
    /** 四个判定参数从后台读（每次审核现读）；词表仍在此解析一次。 */
    private final ConfigService cfg;

    public MachineAuditService(
            @Value("${siyige.video.audit.reject-words:}") String rejectWords,
            @Value("${siyige.video.audit.review-words:}") String reviewWords,
            ConfigService cfg) {
        this.rejectWords = split(rejectWords);
        this.reviewWords = split(reviewWords);
        this.cfg = cfg;
    }

    /** 机器通过后是否仍需人工复核（默认 true：宁可慢一点，不让违规内容直接上线）。 */
    private boolean passRequiresReview() { return cfg.getBool(ConfigKey.VIDEO_PASS_REQUIRES_REVIEW); }

    private int titleMin() { return cfg.getInt(ConfigKey.VIDEO_TITLE_MIN); }

    private int titleMax() { return cfg.getInt(ConfigKey.VIDEO_TITLE_MAX); }

    private boolean allowLocalUpload() { return cfg.getBool(ConfigKey.VIDEO_ALLOW_LOCAL_UPLOAD); }

    /**
     * 生效的标题长度区间。
     *
     * <p><b>为什么要这一层</b>：两个键各自都在范围内（min 1-30、max 1-200），但后台可以配成
     * min=50 / max=10 —— 那样**所有标题都会被驳回**。单键校验拦不住组合，所以在读的地方兜一下：
     * 配反了就按默认 4/60 处理并打 WARN，宁可让审核"松一点"，也不能让整个上传入口全废。
     */
    private int[] titleBounds() {
        int min = titleMin();
        int max = titleMax();
        if (min > max) {
            log.warn("参数异常：video.audit.title-min({}) > title-max({})，本次按默认 {}/{} 处理",
                    min, max, DEFAULT_TITLE_MIN, DEFAULT_TITLE_MAX);
            return new int[]{DEFAULT_TITLE_MIN, DEFAULT_TITLE_MAX};
        }
        return new int[]{min, max};
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

        // ① 结构（区间与开关都是现读；min > max 的配置在 titleBounds() 里兜住）
        int[] bounds = titleBounds();
        int min = bounds[0];
        int max = bounds[1];
        if (t.length() < min) return new Verdict("REJECT", "标题过短（少于 " + min + " 字）");
        if (t.length() > max) return new Verdict("REJECT", "标题过长（超过 " + max + " 字）");
        if (url == null || url.isBlank()) return new Verdict("REJECT", "缺少视频地址");
        boolean ok = url.startsWith("http://") || url.startsWith("https://")
                || (allowLocalUpload() && url.startsWith("/uploads/"));
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

        // 机器通过 ≠ 可以上线：默认再进人工队列（可在配置里关掉）
        if (passRequiresReview()) return new Verdict("REVIEW", "机器初审通过，等待人工复核");
        return new Verdict("PASS", "机器初审通过");
    }

    public static final List<String> SEGMENTS =
            List.of("立论", "驳立论", "质询", "自由辩", "总结", "名场面");

    /**
     * 供前端展示的审核规则说明。
     *
     * <p>标题区间走 {@link #titleBounds()}：配反了（min > max）时页面显示的也是**真正生效**的 4/60，
     * 否则页面写着 50-10、实际按 4/60 跑，排查时会怀疑人生。
     */
    public Map<String, Object> rules() {
        int[] bounds = titleBounds();
        return Map.of(
                "titleMin", bounds[0],
                "titleMax", bounds[1],
                "rejectWords", rejectWords,
                "reviewWords", reviewWords,
                "segments", SEGMENTS,
                "flow", List.of("提交 → 机器初审", "命中风险词 → 人工复核", "通过 → 进入 Feed", "驳回 → 通知作者并留痕")
        );
    }
}
