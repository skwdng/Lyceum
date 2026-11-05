package com.siyige.community.ai;

/**
 * AI 账号常量（决策 1，不可更改）。
 *
 * <p>AI 在数据库里就是一个**普通用户行**：{@code sy_user(id='ai_deepseek', name='DeepSeek', is_bot=1)}。
 * 它出现在评论区、有自己的昵称、走和普通用户一样的落库与通知逻辑——用户看不出差别，
 * 唯一额外的是前端会给它挂一个「AI」徽章。
 *
 * <p>两个值不要混用：
 * <ul>
 *   <li>{@link #ID} —— 主键 / {@code mentions} 数组里传的值 / 幂等 SQL 里判的值</li>
 *   <li>{@link #NAME} —— 展示用昵称，用户在正文里打的是 {@code @DeepSeek}</li>
 * </ul>
 */
public final class AiAccount {

    /** 数据库主键（sy_user.id）。 */
    public static final String ID = "ai_deepseek";

    /** 展示昵称（sy_user.name），也是正文里被 @ 的字面量。 */
    public static final String NAME = "DeepSeek";

    private AiAccount() {}
}
