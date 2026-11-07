package com.siyige.social;

import com.siyige.auth.UserNames;
import com.siyige.community.InMemoryUnreadCounter;
import com.siyige.community.NotificationRepo;
import com.siyige.community.NotificationService;
import com.siyige.community.SensitiveWordMasker;
import org.h2.jdbcx.JdbcDataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 社交单测的公共夹具：真实 H2（schema.sql + community + auth + notify + ai + social）。
 *
 * <p>为什么用真 H2 而不是 mock：本模块的正确性几乎全在 SQL 里 ——
 * 字典序好友对、`unique(user_a,user_b)` 的并发兜底、`greatest` 只前进的已读位置、
 * `id > 已读位置` 的未读口径、`case when` 找对端。mock 掉 repo 等于绕开要测的东西。
 *
 * <p>通知计数器用 {@link InMemoryUnreadCounter}（与 Redis 实现语义逐条对齐），
 * 推送用 {@link RecordingPusher}（把事件记下来给测试断言）。
 */
public final class SocialTestSupport {

    public final JdbcTemplate jdbc;
    public final SocialRepo repo;
    final NotificationRepo notificationRepo;
    final InMemoryUnreadCounter counter;
    final NotificationService notifications;
    public final FriendService friends;
    public final RecordingPusher pusher;
    public final SensitiveWordMasker masker;
    /** 未读缓存用内存实现：语义与 Redis 版逐条对齐，单测不需要起 Redis。 */
    public final InMemorySocialUnreadCounter unread;
    public final ChatService chat;

    private SocialTestSupport(JdbcTemplate jdbc, List<String> words) {
        this.jdbc = jdbc;
        this.repo = new SocialRepo(jdbc);
        this.notificationRepo = new NotificationRepo(jdbc);
        this.counter = new InMemoryUnreadCounter();
        this.notifications = new NotificationService(notificationRepo, counter, new UserNames(jdbc));
        this.pusher = new RecordingPusher();
        this.friends = new FriendService(repo, notifications, pusher);
        this.masker = new SensitiveWordMasker(words);
        this.unread = new InMemorySocialUnreadCounter();
        this.chat = new ChatService(repo, masker, unread, pusher, new com.fasterxml.jackson.databind.ObjectMapper());
    }

    public static SocialTestSupport fresh() {
        return fresh(new String[0]);
    }

    /** 需要验证敏感词打码时传自定义词表。 */
    public static SocialTestSupport fresh(String... words) {
        try {
            JdbcDataSource ds = new JdbcDataSource();
            ds.setURL("jdbc:h2:mem:social" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
            ds.setUser("sa");
            ds.setPassword("");
            JdbcTemplate jdbc = new JdbcTemplate(ds);
            try (Connection c = ds.getConnection()) {
                for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                        "schema-admin.sql", "schema-security.sql", "schema-notify.sql",
                        "schema-ai.sql", "schema-social.sql"}) {
                    ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
                }
            }
            return new SocialTestSupport(jdbc, List.of(words));
        } catch (Exception e) {
            throw new IllegalStateException("初始化测试库失败", e);
        }
    }

    // ==================== 造数据 ====================

    public void user(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status, is_bot) " +
                "values(?, ?, ?, 'x', 1, 0)", id, name, id);
    }

    /** AI 账号：schema-ai.sql 已经种了 ai_deepseek，这里只用于显式造别名的 bot。 */
    public void bot(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status, is_bot) " +
                "values(?, ?, ?, '!no-login!', 1, 1)", id, name, id);
    }

    // ==================== 读数据 ====================

    public long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    boolean isFriend(String a, String b) {
        String[] p = SocialRepo.pair(a, b);
        return count("select count(*) from sy_friend where user_a = ? and user_b = ?", p[0], p[1]) > 0;
    }

    String requestStatus(long id) {
        return jdbc.queryForObject("select status from sy_friend_request where id = ?", String.class, id);
    }

    /** 我收到的第一条 PENDING 请求 id（没有则 -1）。 */
    long firstPendingId(String to) {
        List<Map<String, Object>> items = castList(friends.pendingRequests(to).get("items"));
        return items.isEmpty() ? -1 : ((Number) items.get(0).get("requestId")).longValue();
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> castList(Object o) {
        return (List<Map<String, Object>>) o;
    }

    /** 某个收件人收到的通知（按 type 过滤），返回 type/text/link 便于断言。 */
    List<Map<String, Object>> notificationsOf(String userId) {
        List<Map<String, Object>> page = (List<Map<String, Object>>) notifications.list(userId, 1, 20).get("items");
        return page;
    }

    /** 推送事件记录器：把 (收件人, 事件) 攒起来，供断言"谁收到了什么实时事件"。 */
    public static final class RecordingPusher implements ChatPusher {
        public final List<Map<String, Object>> events = new ArrayList<>();

        @Override
        public void push(String userId, Map<String, Object> event) {
            Map<String, Object> e = new LinkedHashMap<>(event);
            e.put("_to", userId);
            events.add(e);
        }

        public List<Map<String, Object>> ofType(String type) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> e : events) if (type.equals(e.get("type"))) out.add(e);
            return out;
        }

        public List<Map<String, Object>> ofTypeTo(String type, String userId) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> e : events) {
                if (type.equals(e.get("type")) && userId.equals(e.get("_to"))) out.add(e);
            }
            return out;
        }

        void clear() {
            events.clear();
        }
    }
}
