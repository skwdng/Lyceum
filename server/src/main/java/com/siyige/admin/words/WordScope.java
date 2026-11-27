package com.siyige.admin.words;

import java.util.Locale;

/**
 * 词表的三个 scope —— **不要合并成一个「敏感词」**（设计方案 §1）。
 *
 * <p>三个 scope 的差别在「命中之后怎么处置」，所以必须分开维护：
 * <ul>
 *   <li>{@link #COMMUNITY}：帖子/评论<b>打码</b>（{@code ＊}），标签<b>直接拒</b>（TAG_BLOCKED）</li>
 *   <li>{@link #VIDEO_REJECT}：视频<b>直接驳回</b>（内容是分发场景，宁可错杀）</li>
 *   <li>{@link #VIDEO_REVIEW}：视频<b>转人工复核</b>（争议词不该自动杀）</li>
 * </ul>
 *
 * <p>同一个词允许同时出现在多个 scope 里（「赌博」既要社区打码、又要视频驳回）。
 */
public enum WordScope {

    COMMUNITY("社区", "打码"),
    VIDEO_REJECT("视频-硬违规", "驳回"),
    VIDEO_REVIEW("视频-转人工", "审查");

    private final String label;
    private final String effect;

    WordScope(String label, String effect) {
        this.label = label;
        this.effect = effect;
    }

    public String label() { return label; }

    /** 命中后果（页面 tab 上的说明就是它）。 */
    public String effect() { return effect; }

    /** 解析后端传入的 scope 字符串；不认识就 400（不让后台写进脏 scope）。 */
    public static WordScope of(String raw) {
        if (raw == null || raw.isBlank()) return COMMUNITY;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("INVALID_PARAM: 未知的词表范围 " + raw
                    + "（只能是 COMMUNITY / VIDEO_REJECT / VIDEO_REVIEW）");
        }
    }

    /** 宽松解析：不认识返回 null（列表筛选场景，别因为一个脏参数报错）。 */
    public static WordScope ofOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
