package com.siyige.admin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 内容管理查询：**LIKE 转义**、状态筛选（能看到已屏蔽）、楼中楼分组、分页边界。
 *
 * <p>LIKE 那条是这批最容易出事的地方：不转义的话用户输入一个 `%` 就会全表命中，
 * 表现是"搜什么都能搜到"，而且不报错，很难发现。
 */
class AdminContentRepoTest {

    private JdbcTemplate jdbc;
    private AdminContentRepo repo;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:admin_content;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("drop all objects");
        jdbc.execute("create table sy_user (id varchar(32) primary key, name varchar(64), status tinyint default 1, "
                + "is_bot tinyint default 0, created_at timestamp default current_timestamp)");
        jdbc.execute("create table sy_post (id bigint auto_increment primary key, author_id varchar(32), "
                + "type varchar(8), title varchar(120), body clob, excerpt varchar(220), topic_id varchar(32), "
                + "comment_count int default 0, like_count int default 0, view_count int default 0, "
                + "hot_score double default 0, status tinyint default 1, created_at timestamp default current_timestamp)");
        jdbc.execute("create table sy_post_comment (id bigint auto_increment primary key, post_id bigint, "
                + "user_id varchar(32), root_id bigint, reply_object_type varchar(8) default 'POST', "
                + "reply_object_comment_id bigint, body varchar(1000), like_count int default 0, "
                + "status tinyint default 1, created_at timestamp default current_timestamp)");

        jdbc.update("merge into sy_user(id, name) key(id) values ('u1', '张三')");
        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt, status) values "
                + "('u1','CHAT','普通帖','正文','摘要',1)");
        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt, status) values "
                + "('u1','HELP','含百分号的帖子 100% 有效','正文','摘要',1)");
        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt, status) values "
                + "('u1','GUIDE','已被屏蔽的帖子','正文','摘要',2)");

        repo = new AdminContentRepo(jdbc);
    }

    @Test
    void 搜索默认能看到已屏蔽的内容() {
        assertEquals(3, repo.countPosts(null, null, null, null, null, null));
        List<Map<String, Object>> all = repo.listPosts(null, null, null, null, null, null, 0, 20);
        assertEquals(3, all.size());
        assertNotNull(all.get(0).get("author_name"));      // 左连作者昵称

        // 只看已屏蔽
        assertEquals(1, repo.countPosts(null, null, 2, null, null, null));
    }

    @Test
    void LIKE通配符必须被转义() {
        // 输入 % 不能变成"匹配所有"：只会命中**正文里真的含 %** 的那一条
        assertEquals(1, repo.countPosts("%", null, null, null, null, null));
        assertEquals("含百分号的帖子 100% 有效",
                String.valueOf(repo.listPosts("%", null, null, null, null, null, 0, 20).get(0).get("title")));
        // 输入 _ 同理（否则 '普通帖' 三个字会被 _ 通配匹配到）
        assertEquals(0, repo.countPosts("___", null, null, null, null, null));
        // 正常的百分号内容能搜到
        assertEquals(1, repo.countPosts("100%", null, null, null, null, null));
        assertTrue(AdminContentRepo.like("100%").startsWith("%100!%"));
        assertTrue(AdminContentRepo.like("a_b").contains("a!_b"));
    }

    @Test
    void 分页越界返回空页而不是报错() {
        List<Map<String, Object>> beyond = repo.listPosts(null, null, null, null, null, null, 100, 20);
        assertTrue(beyond.isEmpty());
        assertEquals(1, repo.listPosts(null, null, null, null, null, null, 2, 2).size());
    }

    @Test
    void 按日期与类型筛选() {
        Timestamp today = Timestamp.valueOf(LocalDateTime.of(LocalDate.now(), java.time.LocalTime.MIN));
        Timestamp tomorrow = Timestamp.valueOf(LocalDateTime.of(LocalDate.now().plusDays(1), java.time.LocalTime.MIN));
        assertEquals(3, repo.countPosts(null, null, null, null, today, tomorrow));
        assertEquals(1, repo.countPosts(null, "HELP", null, null, null, null));

        Timestamp yesterday = Timestamp.valueOf(LocalDateTime.of(LocalDate.now().minusDays(1), java.time.LocalTime.MIN));
        assertEquals(0, repo.countPosts(null, null, null, null, yesterday, today));   // 左闭右开
    }

    @Test
    void 评论树_楼与楼中楼按时间正序() {
        jdbc.update("insert into sy_post_comment(post_id, user_id, root_id, body) values (1,'u1',null,'第一楼')");
        long root = ((Number) repo.listRootComments(1, 0, 10).get(0).get("id")).longValue();
        jdbc.update("insert into sy_post_comment(post_id, user_id, root_id, body, status) values (1,'u1',?,'楼中楼',2)", root);
        jdbc.update("insert into sy_post_comment(post_id, user_id, root_id, body) values (1,'u1',null,'第二楼')");

        assertEquals(2, repo.countRootComments(1));
        List<Map<String, Object>> roots = repo.listRootComments(1, 0, 10);
        assertEquals("第一楼", String.valueOf(roots.get(0).get("body")));
        assertEquals("第二楼", String.valueOf(roots.get(1).get("body")));

        List<Map<String, Object>> replies = repo.listReplies(List.of(root));
        assertEquals(1, replies.size());                       // 楼中楼**含已屏蔽**
        assertEquals(2, ((Number) replies.get(0).get("status")).intValue());

        // 跨帖搜索能带出帖子标题
        assertEquals(1, repo.countComments("楼中楼", null, null, null));
        assertEquals("普通帖", String.valueOf(repo.listComments("楼中楼", null, null, null, 0, 10).get(0).get("post_title")));
    }

    @Test
    void 内容存在性与状态查询() {
        Map<String, Object> post = repo.findContent("POST", 3);
        assertEquals(2, ((Number) post.get("status")).intValue());   // 已屏蔽也能查到

        assertNull(repo.findContent("POST", 9999));
        assertNull(repo.findComment(9999));
        assertNotNull(repo.userBrief("u1"));
        assertNull(repo.userBrief("nobody"));
    }
}
