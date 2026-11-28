package com.siyige.community.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 守住社区 AI 的**人设**：它是来回答问题的助手，不是来跟提问者抬杠的辩手。
 *
 * <p>2026-11-28 的真实问题：原提示词写「语气像社区里的普通辩手：有立场、可以反驳」，
 * 线上实测输出变成「把锅全甩给算法太省事」「我不认同技术中立所以无责」——
 * 用户只是问了句「你怎么看」，却被当成反方逐条驳。这条测试就是防止那句话被改回去。
 */
class AiPromptTest {

    @Test
    void 人设是助手而不是辩手() {
        String sys = AiPromptBuilder.SYSTEM;
        assertTrue(sys.contains("助手"), "SYSTEM 里必须写明它是「助手」");
        assertFalse(sys.contains("普通辩手"), "不能再把自己定义成辩手（2026-11-28 已改成助手）");
        assertFalse(sys.contains("可以反驳"), "不能鼓励「可以反驳」——那会让它把提问者当反方");
    }

    @Test
    void 先回答再补充角度_且否定不指向人() {
        String sys = AiPromptBuilder.SYSTEM;
        assertTrue(sys.contains("先把问题") || sys.contains("先回答问题"), "必须要求「先回答问题」");
        assertTrue(sys.contains("补充一个不同角度"), "不同看法要作为「补充角度」出现，而不是「驳倒对方」");
        assertTrue(sys.contains("不评价提问的人"), "必须明确：只讨论观点，不评价提问的人");
        assertTrue(sys.contains("也有另一种看法"), "要给出「不同看法」的句式，避免直接否定对方");
    }

    @Test
    void 原有红线一条都没丢() {
        String sys = AiPromptBuilder.SYSTEM;
        assertTrue(sys.contains("200 字"), "字数上限要写明（2026-11-28 由 300 收紧到 200）");
        assertTrue(sys.contains("不要编造"), "不许编造 —— 红线，不能丢");
        assertTrue(sys.contains("不要透露你是被调用的 AI 模型"), "不暴露模型身份 —— 红线，不能丢");
        assertTrue(sys.contains("拉回可讨论的点"), "无关话题要拉回 —— 不能丢");
    }

    @Test
    void 用户文本只进user消息_不进system() {
        // system 是写死的常量，不参与拼接 —— 这条防的是「有人把上面这些规则挪进 buildUser」
        assertFalse(AiPromptBuilder.SYSTEM.contains("【帖子】"), "system 里不应该出现上下文占位符");
        String user = AiPromptBuilder.buildUser(null, null, "@DeepSeek 你怎么看");
        assertTrue(user.contains("@DeepSeek 你怎么看"), "被 @ 的那句话要进 user 消息");
        assertFalse(user.contains("不要透露"), "system 的规则不应该漏进 user 消息");
    }
}
