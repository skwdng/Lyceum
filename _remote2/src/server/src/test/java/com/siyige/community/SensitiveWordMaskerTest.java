package com.siyige.community;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** R-COM-39（改版）：命中后用全角＊逐码点替换，不拒绝、不保存原文。 */
class SensitiveWordMaskerTest {

    private final SensitiveWordMasker masker = new SensitiveWordMasker(List.of("加微信", "代写", "赌博"));

    @Test
    void 单词命中_加微信变三个全角星() {
        SensitiveWordMasker.MaskResult r = masker.mask("加微信");
        assertEquals("＊＊＊", r.text());
        assertEquals(1, r.hits());
        assertTrue(r.changed());
    }

    @Test
    void 多词命中_分别打码() {
        SensitiveWordMasker.MaskResult r = masker.mask("加微信 和 代写");
        assertEquals("＊＊＊ 和 ＊＊", r.text());
        assertEquals(2, r.hits());
    }

    @Test
    void 重叠词_加微信与微信不能重复打码() {
        SensitiveWordMasker m = new SensitiveWordMasker(List.of("加微信", "微信"));
        SensitiveWordMasker.MaskResult r = m.mask("加微信");
        assertEquals("＊＊＊", r.text());
        assertEquals(1, r.hits(), "重叠区间应合并成一段");
    }

    @Test
    void 长短词并存_取并集区间() {
        SensitiveWordMasker m = new SensitiveWordMasker(List.of("加微信", "加"));
        SensitiveWordMasker.MaskResult r = m.mask("我加微信了");
        assertEquals("我＊＊＊了", r.text());
        assertEquals(1, r.hits());
    }

    @Test
    void 无命中时原文不变() {
        String text = "今天用反方赢了一局 😀";
        SensitiveWordMasker.MaskResult r = masker.mask(text);
        assertEquals(text, r.text());
        assertEquals(0, r.hits());
        assertFalse(r.changed());
    }

    @Test
    void 全角星的码点正确() {
        SensitiveWordMasker.MaskResult r = masker.mask("赌博");
        assertEquals(2, r.text().codePointCount(0, r.text().length()));
        r.text().codePoints().forEach(cp -> assertEquals(0xFF0A, cp, "必须是全角＊ U+FF0A"));
    }

    @Test
    void emoji前后位置不被破坏() {
        SensitiveWordMasker.MaskResult r = masker.mask("😀加微信😀");
        assertEquals("😀＊＊＊😀", r.text());
        assertEquals(5, r.text().codePointCount(0, r.text().length()));
    }

    @Test
    void 词表重复词只算一次_空格与注释被忽略() {
        SensitiveWordMasker m = new SensitiveWordMasker(SensitiveWordMasker.parse(
                "  # 注释\n\n加微信\n 加微信 \n代写\n"));
        assertEquals(2, m.wordCount());
        assertEquals("＊＊＊", m.mask("加微信").text());
    }

    @Test
    void 已知限制_空格绕过不处理() {
        // 第一版只做原文精确匹配：中间插空格不算命中，后续需要归一化再处理
        SensitiveWordMasker.MaskResult r = masker.mask("加 微信");
        assertFalse(r.changed());
        assertEquals(0, r.hits());
    }

    @Test
    void null与空串安全() {
        assertEquals("", masker.mask(null).text());
        assertEquals("", masker.mask("").text());
        assertFalse(masker.mask("").changed());
    }
}
