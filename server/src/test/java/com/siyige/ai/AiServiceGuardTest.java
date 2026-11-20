package com.siyige.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 输出后处理：模型退化循环必须被剪掉。
 *
 * <p>真实踩到的现象：一次生成里同一段「判断标准先立住…」被抄了八遍，
 * 一个气泡 1500+ 字，max_tokens 也拦不住（900 token 正好装得下几轮循环）。
 */
class AiServiceGuardTest {

    @Test
    void 重复段落被剪掉() {
        String para = "判断标准先立住：所谓「加剧信息茧房」，要看算法推荐是否在机制上收窄信息接触面，并让用户难以自主退出。";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 8; i++) sb.append(para);
        String cut = AiService.cutRepeats(sb.toString());

        assertTrue(cut.length() < para.length() * 2, "应该只保留一遍，实际 " + cut.length());
        assertEquals(1, cut.split("判断标准先立住").length - 1, "只应出现一次");
    }

    @Test
    void 正常发言不被误伤() {
        String normal = "我方判断：应当取消期末考试，因为一次性闭卷只考记忆。" +
                "我方判准有三条：一看学分认定是否仍刚性；二看用户能否低成本退出；三看后果是否持续收窄。" +
                "据此，第一点成立，第二点存疑，请对方给出可核查口径。";
        assertEquals(normal, AiService.cutRepeats(normal), "没重复的正常发言不能被改");
    }

    @Test
    void 短文本直接放行() {
        String shortText = "我方认为可以取消，但要给替代口径。";
        assertEquals(shortText, AiService.cutRepeats(shortText));
        assertEquals("", AiService.cutRepeats(null));
    }

    @Test
    void 重复不同句子时保留前半() {
        String a = "第一，机制层面确实偏向强化既有偏好，这一点我方承认。";
        String b = "第二，但退出成本高不等于无法退出，这一点对方始终没有证明。";
        String c = "第三，所以判断加剧与否，关键在于纠偏渠道是否真正可用。";
        String text = a + b + c + a + b + c;
        String cut = AiService.cutRepeats(text);
        assertTrue(cut.contains("第一，"), "前半段要保留");
        assertTrue(cut.length() < text.length(), "后半段的重复要剪掉");
    }
}
