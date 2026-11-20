package com.siyige.community;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** R-COM-05：摘要服务端截取，按码点算，≤200。 */
class ExcerptsTest {

    @Test
    void 超过200码点_最终不超过200() {
        String body = "汉".repeat(500);
        String out = Excerpts.of(body);
        assertTrue(out.codePointCount(0, out.length()) <= Excerpts.MAX_CODE_POINTS,
                "摘要码点数应 <= 200，实际 " + out.codePointCount(0, out.length()));
        assertTrue(out.endsWith("…"));
        assertEquals(Excerpts.MAX_CODE_POINTS, out.codePointCount(0, out.length()));
    }

    @Test
    void Markdown标记被清理() {
        String body = "# 标题\n\n**加粗** 与 *斜体*，行内 `code`，[链接文字](https://example.com)，"
                + "![图片](https://example.com/a.png)，列表：\n- 第一项\n- 第二项";
        String out = Excerpts.of(body);
        assertFalse(out.contains("#"));
        assertFalse(out.contains("**"));
        assertFalse(out.contains("]("));
        assertTrue(out.contains("加粗"));
        assertTrue(out.contains("斜体"));
        assertTrue(out.contains("code"));
        assertTrue(out.contains("链接文字"));
        assertTrue(out.contains("图片"), "图片替换为 alt");
        assertTrue(out.contains("第一项"));
    }

    @Test
    void 普通标点不被误删() {
        String out = Excerpts.of("正方 3-2 领先 | 反方追平");
        assertTrue(out.contains("-"), "连字符 - 不应被删");
        assertTrue(out.contains("|"), "竖线 | 不应被删");
    }

    @Test
    void emoji不被截半() {
        // 198 个 a + emoji，截断点刚好落在 emoji 上
        String body = "a".repeat(198) + "😀" + "b".repeat(20);
        String out = Excerpts.of(body);
        assertTrue(out.codePointCount(0, out.length()) <= Excerpts.MAX_CODE_POINTS);
        assertTrue(out.contains("😀"), "emoji 应完整保留");
        assertFalse(Character.isHighSurrogate(out.charAt(out.length() - 1)));
        assertFalse(Character.isLowSurrogate(out.charAt(0)));
    }

    @Test
    void 空正文给默认摘要() {
        assertEquals(Excerpts.EMPTY, Excerpts.of(""));
        assertEquals(Excerpts.EMPTY, Excerpts.of("   \n\t "));
        assertEquals(Excerpts.EMPTY, Excerpts.of(null));
    }
}
