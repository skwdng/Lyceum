package com.siyige.community;

/**
 * 摘要工具（SPEC-v4.2 R-COM-05）：摘要必须由服务端在写入时截取。
 *
 * <p>处理顺序：剥掉常用 Markdown 标记 -> 合并连续空白 -> 按 <b>Unicode 码点</b> 截断。
 * 截断口径：超过 200 个码点时，取前 199 个码点 + U+2026（…），保证结果 ≤ 200 码点。
 *
 * <p>注意：只删除 Markdown 语法符号，不删除普通标点（-、| 等），否则正文语义会被破坏。
 */
public final class Excerpts {

    /** 摘要最多 200 个码点（R-COM-05）。 */
    public static final int MAX_CODE_POINTS = 200;

    /** 空正文时的默认摘要。 */
    public static final String EMPTY = "（无正文摘要）";

    private Excerpts() {
    }

    /** 生成摘要；入参可为 null。 */
    public static String of(String markdown) {
        String plain = stripMarkdown(markdown == null ? "" : markdown);
        plain = plain.replaceAll("\\s+", " ").trim();
        if (plain.isEmpty()) return EMPTY;

        int count = plain.codePointCount(0, plain.length());
        if (count <= MAX_CODE_POINTS) return plain;

        // 取前 199 个码点再补一个省略号，最终正好 200 个码点
        int end = plain.offsetByCodePoints(0, MAX_CODE_POINTS - 1);
        return plain.substring(0, end) + "…";
    }

    /** 去掉常见 Markdown 标记，保留文字与普通标点。 */
    static String stripMarkdown(String s) {
        String out = s;
        // 代码围栏 ``` ... ``` 整段丢弃
        out = out.replaceAll("(?s)```[^\\n]*\\n?.*?```", " ");
        // 行内代码：保留里面的文字
        out = out.replaceAll("`([^`]*)`", "$1");
        // 图片 ![alt](url) -> alt
        out = out.replaceAll("!\\[([^\\]]*)]\\([^)]*\\)", "$1");
        // 链接 [text](url) -> text
        out = out.replaceAll("\\[([^\\]]*)]\\([^)]*\\)", "$1");
        // 行首标题
        out = out.replaceAll("(?m)^\\s{0,3}#{1,6}\\s+", "");
        // 行首引用
        out = out.replaceAll("(?m)^\\s{0,3}>\\s?", "");
        // 行首列表符号
        out = out.replaceAll("(?m)^\\s{0,3}(?:[-*+]|\\d+\\.)\\s+", "");
        // 强调符号（只去符号，保留文字）
        out = out.replaceAll("(\\*\\*|__|~~|\\*|_)", "");
        return out;
    }
}
