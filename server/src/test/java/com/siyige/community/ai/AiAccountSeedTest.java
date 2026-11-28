package com.siyige.community.ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

/**
 * AI 账号种子的守卫（2026-11-28）。
 *
 * <p><b>为什么要有这条测试</b>：H2 的 schema-ai.sql 末尾用 {@code merge into … key(id)} 插种子，
 * 而把 schema 翻成 MySQL 版时只搬了 DDL、这条 insert 整条丢掉了 —— MySQL 库里根本没有
 * {@code ai_deepseek} 这一行，于是 @ 候选搜不到 DeepSeek、mentions 里拿不到 id、
 * AiQueue 的第二道闸永远不通过：整个 @AI 功能在 MySQL 上等于不存在，而 H2 单测一直绿的。
 *
 * <p>这条测试跑在 H2（测试 profile）上，钉住两件事：
 * <ol>
 *   <li>种子行存在且 {@code is_bot = 1}（谁把 schema-ai.sql 从 schema-locations 里删了都会红）；</li>
 *   <li>DSL 里那三个字面量没被改过（{@link AiAccount#ID}/{@link AiAccount#NAME} + 不可登录的占位哈希）。</li>
 * </ol>
 * MySQL 侧靠 {@code docs/migration-mysql/patch-mysql-2026-11-28-ai-account.sql} + 手工 select 验证。
 */
@SpringBootTest
class AiAccountSeedTest {

    /** 占位哈希：故意写成不可解析的串，配合 AuthService 的 is_bot 拦截（决策 1，不可更改）。 */
    private static final String NO_LOGIN_HASH = "!ai-account-no-login!";

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void AI账号种子存在且is_bot为1() {
        Integer n = jdbc.queryForObject(
                "select count(*) from sy_user where id = ? and is_bot = 1", Integer.class, AiAccount.ID);
        assertEquals(1, n, "sy_user 里必须正好有一行 AI 账号（id=" + AiAccount.ID + "、is_bot=1）；"
                + "MySQL 侧见 docs/migration-mysql/patch-mysql-2026-11-28-ai-account.sql");
    }

    @Test
    void 三个字面量没有被改过() {
        assertEquals("deepseek", jdbc.queryForObject(
                "select account from sy_user where id = ?", String.class, AiAccount.ID));
        assertEquals(AiAccount.NAME, jdbc.queryForObject(
                "select name from sy_user where id = ?", String.class, AiAccount.ID),
                "昵称就是用户在正文里 @ 的字面量，改了 @ 不到");
        assertEquals(NO_LOGIN_HASH, jdbc.queryForObject(
                "select password_hash from sy_user where id = ?", String.class, AiAccount.ID));
    }

    /**
     * 种子的写法必须幂等：把 MySQL DDL 里那条 insert 原样再跑一次，行数不能变。
     *
     * <p>（H2 也认 {@code insert … select … where not exists}，所以这条可以在单测里直接验。）
     */
    @Test
    void 种子SQL重复执行不会多出行() {
        int before = jdbc.queryForObject("select count(*) from sy_user", Integer.class);
        for (int i = 0; i < 2; i++) {
            jdbc.update("insert into sy_user(id, account, name, password_hash, status, is_bot) "
                    + "select ?, ?, ?, ?, 1, 1 "
                    + "where not exists (select 1 from sy_user where id = ?)",
                    AiAccount.ID, "deepseek", AiAccount.NAME, NO_LOGIN_HASH, AiAccount.ID);
        }
        assertEquals(before, jdbc.queryForObject("select count(*) from sy_user", Integer.class),
                "幂等写法重复执行不该多出行");
    }
}
