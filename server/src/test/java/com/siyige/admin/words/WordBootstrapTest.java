package com.siyige.admin.words;

import com.siyige.admin.AuditLog;
import com.siyige.community.SensitiveWordMasker;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 启动导入（W1）：按 scope 分别补种子、幂等（重复启动不会重复插）、导入后立刻生效。
 *
 * <p>为什么单独测：这段代码只在**别人重启服务**时跑一次，线上肉眼看不到；
 * 一旦它把老词表覆盖了、或者每次启动都重复插一遍，后果都要等到内容侧出问题才发现。
 */
class WordBootstrapTest {

    private WordService words;
    private SensitiveWordMasker masker;
    private WordBootstrap bootstrap;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:boot" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-word.sql"));
        }
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        masker = new SensitiveWordMasker(List.of());
        words = new WordService(new WordRepo(jdbc), masker, mock(AuditLog.class));
        // yml 的两个键（现在是「种子」）
        bootstrap = new WordBootstrap(words, "违禁词甲,违禁词乙", "争议词");
    }

    @Test
    void 首次启动把三份种子导进库_并重建内存词表() {
        bootstrap.run(null);

        assertTrue(words.countAll(WordScope.COMMUNITY) >= 7, "社区词表来自文件（至少 7 条）");
        assertEquals(2, words.countAll(WordScope.VIDEO_REJECT), "yml reject-words 两条");
        assertEquals(1, words.countAll(WordScope.VIDEO_REVIEW), "yml review-words 一条");

        // 导入完立刻可用：Masker 不再是空表
        assertEquals("db", masker.source());
        assertTrue(masker.wordCount() >= 7);
        assertFalse(words.communityEmpty());
    }

    @Test
    void 再启动一次不会重复导入_词数不变() {
        bootstrap.run(null);
        long community = words.countAll(WordScope.COMMUNITY);
        long reject = words.countAll(WordScope.VIDEO_REJECT);

        bootstrap.run(null);   // 模拟第二次启动

        assertEquals(community, words.countAll(WordScope.COMMUNITY), "社区词表不该翻倍");
        assertEquals(reject, words.countAll(WordScope.VIDEO_REJECT));
        assertEquals(1, words.countAll(WordScope.VIDEO_REVIEW));
    }

    @Test
    void 表里已经有词就完全不碰它_不拿种子覆盖运营改过的词表() {
        words.add(WordScope.COMMUNITY, List.of("只管这一个"), 1L, "admin", "127.0.0.1");
        words.add(WordScope.VIDEO_REJECT, List.of("只管这一个"), 1L, "admin", "127.0.0.1");

        bootstrap.run(null);

        assertEquals(1, words.countAll(WordScope.COMMUNITY), "非空就不导入种子");
        assertEquals(1, words.countAll(WordScope.VIDEO_REJECT));
        // 但空的 VIDEO_REVIEW 照样补上
        assertEquals(1, words.countAll(WordScope.VIDEO_REVIEW));
        assertTrue(words.words(WordScope.VIDEO_REVIEW).contains("争议词"));
    }
}
