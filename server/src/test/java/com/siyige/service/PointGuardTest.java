package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.AiTier;
import com.siyige.api.SseHub;
import com.siyige.billing.UserLlmService;
import com.siyige.billing.WalletService;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
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
 * 抓漏（/matches/{id}/point）的防刷闸门。
 *
 * <p>这是被审计出来的真漏洞：原来 {@code point()} 既把 {@code correct} 直接回给客户端，
 * 又没有任何作答次数限制。客户端只要循环换 type 提交，总能命中一次
 * （5 个类型最多 5 次），抓漏分（+3/次、上限 +9）等于白送，还能刷到满分。
 *
 * <p>所以这几条必须一直绿：同一轮只认第一次作答；重复提交不覆盖 hit、不再加分、
 * 也不再吐 correct；不同轮次互不影响。
 */
class PointGuardTest {

    private JdbcTemplate jdbc;
    private Store store;
    private MatchService service;

    private static final String TOPIC = "t1";
    private static final String MATCH = "m-point-1";

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:point" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");
        store.createMatch(MATCH, "u1", TOPIC, "高校是否应当取消期末考试", "STANDARD", "B2",
                0, "normal", "pro", "solo", null, 0, 0, "PRO", null);

        service = new MatchService(store, mock(AiService.class), mock(ScoreService.class),
                mock(HotRank.class), mock(SseHub.class), new FlawService(), new ObjectMapper(),
                new ConfigService(new ConfigRepo(jdbc)),
                new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                new RoomStore(jdbc));
    }

    /** 当前库里某一轮记录的 hit（null = 还没作答）。 */
    private Object storedHit(int step) {
        for (Map<String, Object> r : store.flaws(MATCH)) {
            if (((Number) r.get("step")).intValue() == step) return r.get("hit");
        }
        return "no-flaw-row";
    }

    @Test
    void 同一轮第二次作答被挡住且hit不变() {
        store.insertFlaw(MATCH, 2, "诉诸权威");

        Map<String, Object> first = service.point(MATCH, 2, "诉诸权威");
        assertEquals(Boolean.TRUE, first.get("ok"), "第一次作答应被接受: " + first);
        assertEquals(Boolean.TRUE, first.get("hit"));
        assertEquals("诉诸权威", first.get("correct"), "首次作答才返回正确答案（教学用）");

        // 换个 type 再试：不能被当成新的一次（原来这里会重新判定并+3分）
        Map<String, Object> again = service.point(MATCH, 2, "以偏概全");
        assertEquals(Boolean.FALSE, again.get("ok"), "重复作答必须被拒: " + again);
        assertEquals("already-answered", again.get("reason"));
        assertEquals(Boolean.TRUE, again.get("hit"), "已作答的 hit 不能被改写");
        assertFalse(again.containsKey("correct"), "重复提交不能再吐正确答案: " + again);

        assertEquals(Boolean.TRUE, storedHit(2), "库里的 hit 必须保持第一次的结果");
    }

    @Test
    void 答错之后再试正确答案也不改判() {
        store.insertFlaw(MATCH, 3, "未证前提");

        Map<String, Object> wrong = service.point(MATCH, 3, "以偏概全");
        assertEquals(Boolean.TRUE, wrong.get("ok"));
        assertEquals(Boolean.FALSE, wrong.get("hit"), "答错就是答错");
        assertEquals("未证前提", wrong.get("correct"), "答错后告诉你正确答案");
        assertEquals(Boolean.FALSE, storedHit(3));

        // 拿 correct 回头再提交「正确」类型：也不能补成 hit=true
        Map<String, Object> retry = service.point(MATCH, 3, "未证前提");
        assertEquals(Boolean.FALSE, retry.get("ok"));
        assertEquals("already-answered", retry.get("reason"));
        assertEquals(Boolean.FALSE, retry.get("hit"), "抓漏分只按第一次作答算");
        assertEquals(Boolean.FALSE, storedHit(3), "库里也不能被第二次覆盖");
    }

    @Test
    void 不同轮次各自独立作答() {
        store.insertFlaw(MATCH, 2, "诉诸权威");
        store.insertFlaw(MATCH, 5, "循环论证");

        assertEquals(Boolean.TRUE, service.point(MATCH, 2, "诉诸权威").get("hit"));

        Map<String, Object> other = service.point(MATCH, 5, "偷换概念");
        assertEquals(Boolean.TRUE, other.get("ok"), "另一轮还没作答，应该照常判定: " + other);
        assertEquals(Boolean.FALSE, other.get("hit"));

        // 第 2 轮仍然保持"已作答"，不会被第 5 轮的提交带到
        Map<String, Object> redo2 = service.point(MATCH, 2, "以偏概全");
        assertEquals("already-answered", redo2.get("reason"));
        assertEquals(Boolean.TRUE, redo2.get("hit"));

        Map<String, Object> redo5 = service.point(MATCH, 5, "循环论证");
        assertEquals("already-answered", redo5.get("reason"));
        assertEquals(Boolean.FALSE, redo5.get("hit"), "第 5 轮第一次答错，之后不能翻案");

        // 两轮的 hit 各自独立存着，计分时 flawTries/flawHits 才有意义
        List<Map<String, Object>> rows = store.flaws(MATCH);
        assertEquals(2, rows.size());
    }

    @Test
    void 没有漏洞的轮次直接拒绝() {
        Map<String, Object> r = service.point(MATCH, 7, "诉诸权威");
        assertEquals(Boolean.FALSE, r.get("ok"));
        assertTrue(String.valueOf(r.get("reason")).contains("没有漏洞"), "实际: " + r);
        assertEquals("no-flaw-row", storedHit(7), "没有漏洞不该凭空写一条记录");
    }
}
