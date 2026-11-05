package com.siyige.community.ai;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 提示词拼装（方案 §3.4 / §13）。
 *
 * <p>钉住三件事：
 * <ul>
 *   <li>SYSTEM 里有「不超过 300 字」的约束（决策 6 不做业务截断，字数只能靠 prompt）</li>
 *   <li>用户文本只进 user 消息，不拼进 system（防提示词注入改角色）</li>
 *   <li>上下文都拼进去：帖子标题、摘要、最近评论、被 @ 的那句话</li>
 * </ul>
 */
class AiPromptBuilderTest {

    private static Map<String, Object> post(String title, String body) {
        Map<String, Object> p = new HashMap<>();
        p.put("title", title);
        p.put("body", body);
        return p;
    }

    private static Map<String, Object> comment(String who, String body, boolean bot) {
        Map<String, Object> c = new HashMap<>();
        c.put("author_name", who);
        c.put("body", body);
        c.put("is_bot", bot ? 1 : 0);
        return c;
    }

    @Test
    void 系统提示词要求不超过三百字且不许编造() {
        assertTrue(AiPromptBuilder.SYSTEM.contains("300 字"), "字数上限只能写在 prompt 里");
        assertTrue(AiPromptBuilder.SYSTEM.contains("不要编造") || AiPromptBuilder.SYSTEM.contains("编造"));
        assertTrue(AiPromptBuilder.SYSTEM.contains(AiAccount.NAME) || AiPromptBuilder.SYSTEM.contains("DeepSeek"));
        assertFalse(AiPromptBuilder.SYSTEM.contains("@DeepSeek"), "system 里不该出现具体的 @ 字面量（只描述角色）");
    }

    @Test
    void user消息包含帖子标题摘要最近评论与问题() {
        String u = AiPromptBuilder.buildUser(
                post("论 AI 是否会取代辩手", "我的看法是：不会，但会改变训练方式。"),
                List.of(comment("王同学", "我觉得会取代一部分", false)),
                "DeepSeek 你怎么看？");

        assertTrue(u.contains("论 AI 是否会取代辩手"), u);
        assertTrue(u.contains("我的看法是"), "摘要要带上");
        assertTrue(u.contains("王同学"), "最近评论要带作者");
        assertTrue(u.contains("我觉得会取代一部分"), "最近评论要带内容");
        assertTrue(u.contains("DeepSeek 你怎么看？"), "被 @ 的那句话必须原文带上");
    }

    @Test
    void AI自己的历史回复会被标成AI() {
        String u = AiPromptBuilder.buildUser(post("题", "正文"),
                List.of(comment("DeepSeek", "我之前的回答", true)), "再说说？");
        assertTrue(u.contains("DeepSeek(AI)"), u);
    }

    @Test
    void 空输入不炸且不产生null字样() {
        String u = AiPromptBuilder.buildUser(null, null, null);
        assertNotNull(u);
        assertFalse(u.contains("null"), u);
        assertTrue(u.contains("请直接给出你的回复正文"), "尾部指令要在");
    }

    @Test
    void 超长帖子正文与问题会被裁到上限内() {
        String longText = "很长的正文".repeat(400);        // 2000 字
        String u = AiPromptBuilder.buildUser(post("题", longText), List.of(), longText);

        // user 消息整体有硬上限（6000 码点兜底），不会把 prompt 撑爆
        assertTrue(u.codePointCount(0, u.length()) <= 6000, "user 消息超长必须被兜底截断");
        assertTrue(u.contains("…"), "截断要带省略号");
    }

    @Test
    void 按码点截断不会切坏中文() {
        assertEquals("你好", AiPromptBuilder.clip("你好", 5));
        String clipped = AiPromptBuilder.clip("你好世界再见", 4);
        assertEquals(4, clipped.codePointCount(0, clipped.length()), "截断后长度按码点算");
        assertTrue(clipped.endsWith("…"));
    }

    @Test
    void 最近评论为空时不会出现空的评论区标题() {
        String u = AiPromptBuilder.buildUser(post("题", "正文"), List.of(), "问题");
        assertFalse(u.contains("【最近的评论】"), "没有评论就不该有这个标题");
    }
}
