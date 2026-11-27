package com.siyige.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.AiTier;
import com.siyige.api.SseHub;
import com.siyige.billing.UserLlmService;
import com.siyige.billing.WalletService;
import com.siyige.domain.Format;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import com.siyige.service.FlawService;
import com.siyige.service.MatchService;
import com.siyige.service.ScoreService;
import com.siyige.service.UtteranceCheck;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.Mockito.mock;

/**
 * 审计用的公共台架：真 H2 + 真 Store + 真 MatchService（AI/钱包/推送用 mock）。
 *
 * <p>为什么用真 H2 而不是 mock Store：要被审计的 bug（step 竞态、超时去重、幂等键）
 * 全在「SQL + 状态字段」的组合上，mock 掉就什么都看不出来。
 *
 * <p>这个类本身不是测试（没有 @Test），只给 {@code Audit*Test} 继承。
 */
abstract class AuditSupport {

    static final String TOPIC = "t1";
    static final String USER = "u1";

    JdbcTemplate jdbc;
    Store store;
    MatchService service;
    AiService ai;
    ConfigService cfg;
    /** mock 的推送口：审计里要断言事件内容（比如 match.start 的 seconds）。 */
    SseHub hub;
    /** 真房间库：抢拍席位要从 sy_room/sy_seat 反查。 */
    RoomStore rooms;

    @BeforeEach
    void bootAuditFixture() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:audit" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        // 节奏参数改由 ConfigService 提供（构造器不再吃 4 个 @Value）。
        // 审计里的时间断言（如「自定义 90s 是否生效」）需要 1.0 倍速，否则默认演示档 0.05 会把
        // 300s 压成 15s，断言失败的原因就变成「倍速」而不是「defect」。
        cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        ai = mock(AiService.class);
        hub = mock(SseHub.class);
        rooms = new RoomStore(jdbc);
        service = new MatchService(store, ai, new ScoreService(null), mock(HotRank.class),
                hub, new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                rooms);
    }

    /** 开一场：seats 是「我的席位」，kind = solo / room。 */
    String newMatch(String seats, String kind) throws Exception {
        return service.create(USER, TOPIC, seats, "FULL", 0, "normal", "pro", kind, "PRO", null);
    }

    String newMatch(String seats, String kind, int turnSeconds) throws Exception {
        return service.create(USER, TOPIC, seats, "FULL", turnSeconds, "normal", "pro", kind, "PRO", null);
    }

    Map<String, Object> row(String id) {
        return store.match(id);
    }

    int step(String id) {
        Object v = row(id).get("step");
        return v instanceof Number n ? n.intValue() : 0;
    }

    /** 本场按库里的轮数参数重算出的步骤序列（与 MatchService 内部同一个入口）。 */
    List<Format.Step> stepList(String id) {
        Map<String, Object> m = row(id);
        return Format.stepsOf(String.valueOf(m.get("mode")),
                ((Number) m.get("query_rounds")).intValue(),
                ((Number) m.get("free_rounds")).intValue());
    }

    /** 第 step 号（0-based）之后，库里这一轮留下几条发言。 */
    long turnCount(String id, int step1Based) {
        return store.turns(id).stream()
                .filter(t -> ((Number) t.get("step")).intValue() == step1Based)
                .count();
    }

    /** 把当前步的 deadline 推到过去，模拟「已经到时间了但 tick 还没跑」。 */
    void expireDeadline(String id) {
        long past = System.currentTimeMillis() - 5_000;
        jdbc.update("update sy_match set deadline_at=?, started_at=?, last_active_at=? where id=?",
                new java.sql.Timestamp(past), new java.sql.Timestamp(past), past, id);
    }

    /** 直接把状态机拨到某一步（含 phase），用于构造并发/边界场景。 */
    void jumpTo(String id, int step, String phase, Long deadline) {
        jdbc.update("update sy_match set step=?, phase=?, deadline_at=?, last_active_at=? where id=?",
                step, phase, deadline == null ? null : new java.sql.Timestamp(deadline),
                System.currentTimeMillis(), id);
    }

    /** 当前 deadline 还有多少秒（没有 deadline 返回 -1）。 */
    long remainingSeconds(String id) {
        Object dl = row(id).get("deadline_at");
        if (dl == null) return -1;
        return Duration.between(Instant.now(), ((java.sql.Timestamp) dl).toInstant()).getSeconds();
    }

    /**
     * 造一个真房间并把某场对局挂上去。
     *
     * <p>抢拍席位不再取 `my_seats` 集合的第一个元素，而是按「谁点的」反查：
     * 房间局走 sy_room → sy_seat，所以要真的建出房间与席位，否则测的是兜底分支。
     */
    void attachRoom(String matchId, String code, String meSeat) {
        String host = "host-" + code;
        rooms.createRoom(code, TOPIC, "高校是否应当取消期末考试", "public", host);
        rooms.occupy(code, "A1", host, "Host");
        rooms.occupy(code, meSeat, USER, "Me");
        rooms.setStatus(code, "RUNNING", matchId);
    }

    /** 找第一个「自由辩」步的 0-based 下标（没有则 -1）。 */
    int firstFreeDebateStep(String id) {
        List<Format.Step> ss = stepList(id);
        for (int i = 0; i < ss.size(); i++) if ("自由辩".equals(ss.get(i).seg())) return i;
        return -1;
    }

    /** 轮询等待 step 推进（异步 AI 线程用）。 */
    boolean awaitStepAtLeast(String id, int want, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (step(id) >= want) return true;
            Thread.sleep(50);
        }
        return step(id) >= want;
    }
}
