package com.siyige.community;

import com.siyige.community.ai.AiAccount;
import com.siyige.community.ai.AiQueue;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 评论接口要能区分 AI 与真人（决策：前端靠 {@code isBot} 显示「AI」徽章）。
 *
 * <p>覆盖三层：
 * <ol>
 *   <li>SQL 层：四处评论查询都带出 {@code u.is_bot}</li>
 *   <li>Repo 层：{@code countAiReplies} / {@code countAiPostReply} / {@code listRecentForAi} 能认 AI 回复</li>
 *   <li>Service 层：列表 item 里有 {@code isBot} 布尔字段</li>
 * </ol>
 */
class CommentIsBotTest {

    private JdbcTemplate jdbc;
    private CommunityRepo repo;
    private CommentService service;
    private long postId;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:isbot" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                    "schema-notify.sql", "schema-ai.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        repo = new CommunityRepo(jdbc);

        jdbc.update("insert into sy_user(id, account, name, password_hash, status, is_bot) " +
                "values('u-bob', 'bob', '王同学', 'x', 1, 0)");

        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt) " +
                "values('u-bob', 'CHAT', '论 AI 是否会取代辩手', '正文', '摘要')");
        postId = jdbc.queryForObject("select max(id) from sy_post", Long.class);

        service = new CommentService(repo, new SensitiveWordMasker(List.of()), mock(MuteGuard.class),
                new NotificationService(new NotificationRepo(jdbc), new InMemoryUnreadCounter(),
                        new com.siyige.auth.UserNames(jdbc)),
                mock(AiQueue.class));
    }

    private long comment(String userId, Long rootId, Long replyTo, String type, String body) {
        return repo.insertComment(postId, userId, rootId, type, replyTo,
                replyTo == null ? null : "u-bob", body);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }

    // ==================== Service 层：isBot 字段 ====================

    @Test
    void 楼层列表里AI与真人都能区分() {
        long human = comment("u-bob", null, null, "POST", "真人评论");
        long ai = comment(AiAccount.ID, human, human, "COMMENT", "AI 的回复");

        Map<String, Object> page = service.list(postId, 1, 10, "u-bob", null);
        List<Map<String, Object>> roots = items(page);

        // 倒序：AI 的那条是楼中楼，不进楼列表；楼列表只有真人那条
        assertEquals(1, roots.size());
        assertEquals(false, roots.get(0).get("isBot"), "真人评论必须 isBot=false");
        assertEquals("王同学", roots.get(0).get("authorName"));

        // 楼中楼预览里能看到 AI
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> replies = (List<Map<String, Object>>) roots.get(0).get("replies");
        assertEquals(1, replies.size());
        assertEquals(true, replies.get(0).get("isBot"), "AI 回复必须 isBot=true");
        assertEquals("DeepSeek", replies.get(0).get("authorName"), "AI 昵称来自 sy_user.name");
    }

    @Test
    void 展开楼中楼也带isBot() {
        long human = comment("u-bob", null, null, "POST", "真人评论");
        comment(AiAccount.ID, human, human, "COMMENT", "AI 的楼中楼");

        Map<String, Object> page = service.replies(human, 1, 10, "u-bob");
        List<Map<String, Object>> list = items(page);

        assertEquals(1, list.size());
        assertEquals(true, list.get(0).get("isBot"));
    }

    // ==================== Repo 层：AI 相关查询 ====================

    @Test
    void countAiReplies只数AI对这条评论的回复() {
        long human = comment("u-bob", null, null, "POST", "真人评论");
        assertEquals(0L, repo.countAiReplies(human));

        comment(AiAccount.ID, human, human, "COMMENT", "AI 回复一");
        assertEquals(1L, repo.countAiReplies(human));

        // 真人回复不算
        comment("u-bob", human, human, "COMMENT", "真人回复");
        assertEquals(1L, repo.countAiReplies(human));
    }

    @Test
    void countAiReplies忽略已删除的AI回复() {
        long human = comment("u-bob", null, null, "POST", "真人评论");
        long ai = comment(AiAccount.ID, human, human, "COMMENT", "AI 回复");
        jdbc.update("update sy_post_comment set status = 2 where id = ?", ai);

        assertEquals(0L, repo.countAiReplies(human), "被删的回复不算答过（允许重新问）");
    }

    @Test
    void countAiPostReply只数发帖场景的楼() {
        assertEquals(0L, repo.countAiPostReply(postId));

        long ai = comment(AiAccount.ID, null, null, "POST", "AI 在帖子下的楼");
        assertEquals(1L, repo.countAiPostReply(postId));

        // 楼中楼不算（只认楼级别）
        long human = comment("u-bob", null, null, "POST", "真人楼");
        comment(AiAccount.ID, human, human, "COMMENT", "AI 的楼中楼");
        assertEquals(1L, repo.countAiPostReply(postId));
        assertNotNull(ai);
    }

    @Test
    void listRecentForAi按时间正序且带昵称与isBot() {
        comment("u-bob", null, null, "POST", "第一条");
        comment(AiAccount.ID, null, null, "POST", "第二条");

        List<Map<String, Object>> recent = repo.listRecentForAi(postId, 8);

        assertEquals(2, recent.size());
        assertEquals("第一条", recent.get(0).get("body"), "最老的在前（给模型看时间顺序）");
        assertEquals("第二条", recent.get(1).get("body"));
        assertEquals(0L, CommunityService.num(recent.get(0).get("is_bot")));
        assertEquals(1L, CommunityService.num(recent.get(1).get("is_bot")));
        assertEquals("DeepSeek", recent.get(1).get("author_name"));
    }

    @Test
    void listRecentForAi只取最近若干条() {
        for (int i = 1; i <= 12; i++) comment("u-bob", null, null, "POST", "第" + i + "条");

        List<Map<String, Object>> recent = repo.listRecentForAi(postId, 8);

        assertEquals(8, recent.size());
        assertEquals("第5条", recent.get(0).get("body"), "取最近 8 条并按时间正序");
        assertEquals("第12条", recent.get(7).get("body"));
    }
}
