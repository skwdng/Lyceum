package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 浏览计数：去重日期、异常不阻塞、回写只动 view_count。 */
class CommunityViewServiceTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final ViewStore store = mock(ViewStore.class);
    private final CommunityViewService service = new CommunityViewService(repo, store);

    // ---------- 日期 / Key ----------

    @Test
    void 日期按上海时区取yyyyMMdd() {
        // UTC 11-01 16:30 == 上海 11-02 00:30，必须算 11-02
        assertEquals("20261102", CommunityViewService.dayKey(Instant.parse("2026-11-01T16:30:00Z")));
        assertEquals("20261102", CommunityViewService.dayKey(Instant.parse("2026-11-02T02:30:00Z")));
        assertEquals("20261102", CommunityViewService.dayKey(Instant.parse("2026-11-02T15:59:00Z")));
        assertEquals("20261103", CommunityViewService.dayKey(Instant.parse("2026-11-02T16:00:00Z")));
    }

    @Test
    void 过期时间是次日凌晨两点() {
        long expected = ZonedDateTime.parse("2026-11-03T02:00:00+08:00").toEpochSecond();
        assertEquals(expected, CommunityViewService.expireAtEpochSecond(Instant.parse("2026-11-02T10:00:00Z")));
        assertEquals(expected, CommunityViewService.expireAtEpochSecond(ZonedDateTime.parse("2026-11-02T23:59:00+08:00").toInstant()));
        assertEquals(expected, CommunityViewService.expireAtEpochSecond(ZonedDateTime.parse("2026-11-02T00:30:00+08:00").toInstant()));
        assertEquals(ZonedDateTime.parse("2026-11-04T02:00:00+08:00").toEpochSecond(),
                CommunityViewService.expireAtEpochSecond(ZonedDateTime.parse("2026-11-03T00:30:00+08:00").toInstant()));
    }

    @Test
    void seenKey格式正确() {
        assertEquals("view:seen:7:20261102", CommunityViewService.seenKey(7L, "20261102"));
    }

    // ---------- recordView ----------

    @Test
    void 首次浏览_added为1也成功() {
        when(repo.existsActive(1L)).thenReturn(true);
        when(store.recordSeen(anyString(), eq(CommunityViewService.PENDING_KEY), eq("u1"), eq(1L), anyLong())).thenReturn(1L);

        assertDoesNotThrow(() -> service.recordView("u1", 1L));

        ArgumentCaptor<String> seen = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Long> expire = ArgumentCaptor.forClass(Long.class);
        verify(store).recordSeen(seen.capture(), eq(CommunityViewService.PENDING_KEY), eq("u1"), eq(1L), expire.capture());
        assertTrue(seen.getValue().startsWith("view:seen:1:"));
        assertTrue(expire.getValue() > Instant.now().getEpochSecond(), "过期时间必须在未来");
        assertTrue(expire.getValue() - Instant.now().getEpochSecond() <= 26 * 3600, "过期时间不应超过次日 02:00 的范围");
    }

    @Test
    void 重复浏览_added为0也成功() {
        when(repo.existsActive(1L)).thenReturn(true);
        when(store.recordSeen(anyString(), anyString(), anyString(), anyLong(), anyLong())).thenReturn(0L);

        assertDoesNotThrow(() -> service.recordView("u1", 1L));
        verify(store).recordSeen(anyString(), anyString(), eq("u1"), eq(1L), anyLong());
    }

    @Test
    void Redis异常不向外抛() {
        when(repo.existsActive(1L)).thenReturn(true);
        when(store.recordSeen(anyString(), anyString(), anyString(), anyLong(), anyLong()))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"));

        assertDoesNotThrow(() -> service.recordView("u1", 1L));
    }

    @Test
    void 帖子不存在返回POST_NOT_FOUND() {
        when(repo.existsActive(404L)).thenReturn(false);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.recordView("u1", 404L));
        assertTrue(ex.getMessage().startsWith("POST_NOT_FOUND"));
        verifyNoInteractions(store);
    }

    @Test
    void 数据库异常也不抛且不写Redis() {
        when(repo.existsActive(1L)).thenThrow(new RuntimeException("mysql down"));

        assertDoesNotThrow(() -> service.recordView("u1", 1L));
        verifyNoInteractions(store);
    }

    // ---------- flushPending ----------

    @Test
    void 回写只更新view_count不碰热度() {
        Map<Long, Long> pending = new LinkedHashMap<>();
        pending.put(1L, 3L);
        pending.put(2L, 5L);
        when(store.takePending(CommunityViewService.PENDING_KEY)).thenReturn(pending);
        when(repo.addViewCount(anyLong(), anyLong())).thenReturn(1);

        int applied = service.flushPending();

        assertEquals(2, applied);
        verify(repo).addViewCount(1L, 3L);
        verify(repo).addViewCount(2L, 5L);
        verifyNoMoreInteractions(repo);
        verify(store, never()).restorePending(anyString(), anyMap());
    }

    @Test
    void 空Hash不碰数据库() {
        when(store.takePending(CommunityViewService.PENDING_KEY)).thenReturn(Map.of());

        assertEquals(0, service.flushPending());
        verifyNoInteractions(repo);
    }

    @Test
    void 数据库异常时补回增量并抛出() {
        Map<Long, Long> pending = new LinkedHashMap<>();
        pending.put(1L, 4L);
        when(store.takePending(CommunityViewService.PENDING_KEY)).thenReturn(pending);
        when(repo.addViewCount(1L, 4L)).thenThrow(new RuntimeException("db down"));

        assertThrows(RuntimeException.class, () -> service.flushPending());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<Long, Long>> captor = ArgumentCaptor.forClass(Map.class);
        verify(store).restorePending(eq(CommunityViewService.PENDING_KEY), captor.capture());
        assertEquals(4L, captor.getValue().get(1L));
    }

    @Test
    void 帖子已删除时丢弃增量不报错() {
        Map<Long, Long> pending = new LinkedHashMap<>();
        pending.put(9L, 2L);
        when(store.takePending(CommunityViewService.PENDING_KEY)).thenReturn(pending);
        when(repo.addViewCount(9L, 2L)).thenReturn(0);

        assertEquals(0, service.flushPending());
        verify(repo).addViewCount(9L, 2L);
        verify(store, never()).restorePending(anyString(), anyMap());
    }

    @Test
    void 读取pending失败时跳过本次回写() {
        when(store.takePending(CommunityViewService.PENDING_KEY))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"));

        assertEquals(0, service.flushPending());
        verifyNoInteractions(repo);
    }

    // ---------- Controller 行为（R-COM-37：异常也必须 204） ----------

    /** Controller 用例默认按"已登录 u1"跑；匿名场景的用例自己 clear。 */
    @org.junit.jupiter.api.BeforeEach
    void loginAsU1() { com.siyige.auth.UserContext.set("u1"); }

    @org.junit.jupiter.api.AfterEach
    void clearUser() { com.siyige.auth.UserContext.clear(); }

    private MockMvc mvc() {
        return MockMvcBuilders.standaloneSetup(new CommunityController(
                        mock(CommunityService.class), mock(CommentService.class),
                        mock(LikeService.class), service))
                .setControllerAdvice(new CommunityErrors())
                .build();
    }

    @Test
    void controller_匿名浏览返回204且不写Redis() throws Exception {
        com.siyige.auth.UserContext.clear();

        mvc().perform(post("/api/community/posts/1/view"))
                .andExpect(status().isNoContent());

        verify(store, never()).recordSeen(anyString(), anyString(), anyString(), anyLong(), anyLong());
    }

    @Test
    void controller_匿名写操作返回401_UNAUTHORIZED() throws Exception {
        com.siyige.auth.UserContext.clear();

        mvc().perform(post("/api/community/posts")
                        .contentType("application/json").content("{\"type\":\"CHAT\",\"title\":\"t\",\"body\":\"b\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void controller_浏览成功返回204() throws Exception {
        when(repo.existsActive(1L)).thenReturn(true);
        when(store.recordSeen(anyString(), anyString(), anyString(), anyLong(), anyLong())).thenReturn(1L);

        mvc().perform(post("/api/community/posts/1/view"))
                .andExpect(status().isNoContent());
    }

    @Test
    void controller_Redis故障仍返回204() throws Exception {
        when(repo.existsActive(1L)).thenReturn(true);
        when(store.recordSeen(anyString(), anyString(), anyString(), anyLong(), anyLong()))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"));

        mvc().perform(post("/api/community/posts/1/view"))
                .andExpect(status().isNoContent());
    }

    @Test
    void controller_数据库故障仍返回204() throws Exception {
        when(repo.existsActive(1L)).thenThrow(new RuntimeException("mysql down"));

        mvc().perform(post("/api/community/posts/1/view"))
                .andExpect(status().isNoContent());
    }

    @Test
    void controller_帖子不存在返回404() throws Exception {
        when(repo.existsActive(404L)).thenReturn(false);

        mvc().perform(post("/api/community/posts/404/view"))
                .andExpect(status().isNotFound());
    }

    // ==================== 读时叠加：pendingCounts ====================

    @Test
    void pendingCounts_空集合直接返回空Map且不碰Redis() {
        Map<Long, Long> got = service.pendingCounts(java.util.List.of());

        assertNotNull(got);
        assertTrue(got.isEmpty());
        verifyNoInteractions(store);
    }

    @Test
    void pendingCounts_null集合也不碰Redis() {
        Map<Long, Long> got = service.pendingCounts(null);

        assertNotNull(got);
        assertTrue(got.isEmpty());
        verifyNoInteractions(store);
    }

    @Test
    void pendingCounts_Redis抛异常时返回空Map不抛出() {
        when(store.peekPending(anyString(), any()))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"));

        Map<Long, Long> got = service.pendingCounts(java.util.List.of(1L, 2L));

        assertNotNull(got);
        assertTrue(got.isEmpty(), "Redis 故障应降级为只显示数据库值");
    }

    @Test
    void pendingCounts_正常时透传store结果() {
        when(store.peekPending(eq(CommunityViewService.PENDING_KEY), any()))
                .thenReturn(java.util.Map.of(1L, 3L, 5L, 2L));

        Map<Long, Long> got = service.pendingCounts(java.util.List.of(1L, 2L, 5L));

        assertEquals(3L, got.get(1L));
        assertEquals(2L, got.get(5L));
        assertFalse(got.containsKey(2L), "没有增量的 id 不应出现");
    }

    @Test
    void pendingCounts_store返回null时也返回空Map() {
        when(store.peekPending(anyString(), any())).thenReturn(null);

        Map<Long, Long> got = service.pendingCounts(java.util.List.of(1L));

        assertNotNull(got);
        assertTrue(got.isEmpty());
    }

    @Test
    void pendingCounts_只读窥视_绝不调用takePending或restorePending() {
        when(store.peekPending(anyString(), any())).thenReturn(java.util.Map.of(1L, 1L));

        service.pendingCounts(java.util.List.of(1L));

        verify(store, never()).takePending(anyString());
        verify(store, never()).restorePending(anyString(), any());
    }
}
