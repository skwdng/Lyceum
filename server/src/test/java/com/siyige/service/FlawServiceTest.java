package com.siyige.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 漏洞植入与判定。
 *
 * <p>两个关键行为：
 * <ul>
 *   <li>新手难度不埋漏洞（否则新手一上来就被扣分）；</li>
 *   <li>埋了漏洞的句子能被 {@code correct} 对上类型，判错类型算没抓住。</li>
 * </ul>
 */
class FlawServiceTest {

    private final FlawService flaw = new FlawService();

    @Test
    void 新手难度不埋漏洞() {
        for (int i = 0; i < 50; i++) {
            FlawService.Planted p = flaw.plant("我方认为应当取消期末考试，因为可以改成过程性评价。", "novice");
            assertNull(p.type(), "novice 不应埋漏洞");
            assertEquals("我方认为应当取消期末考试，因为可以改成过程性评价。", p.text());
        }
    }

    @Test
    void 埋了漏洞会带上类型并改写文本() {
        boolean plantedAtLeastOnce = false;
        for (int i = 0; i < 80; i++) {
            FlawService.Planted p = flaw.plant("显然所有人都同意取消期末考试，这是常识。", "contest");
            if (p.type() != null) {
                plantedAtLeastOnce = true;
                assertTrue(FlawService.TYPES.contains(p.type()), "漏洞类型必须在白名单里: " + p.type());
                // 文本可能被加粗标记，但内容不能被删光
                assertFalse(p.text().isBlank());
            }
        }
        assertTrue(plantedAtLeastOnce, "contest 难度多次尝试应至少埋上一次");
    }

    @Test
    void 抓对与抓错() {
        assertTrue(flaw.correct("以偏概全", "以偏概全"));
        assertFalse(flaw.correct("以偏概全", "诉诸权威"));
        assertFalse(flaw.correct(null, "以偏概全"));
    }

    @Test
    void 空文本不炸() {
        FlawService.Planted p = flaw.plant("", "pro");
        assertNotNull(p.text());
    }
}
