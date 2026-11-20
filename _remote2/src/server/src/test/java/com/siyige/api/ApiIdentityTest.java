package com.siyige.api;

import com.siyige.auth.AuthException;
import com.siyige.auth.MatchAccess;
import com.siyige.auth.UserContext;
import com.siyige.auth.UserNames;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import com.siyige.service.AuditService;
import com.siyige.service.BriefService;
import com.siyige.service.EvidenceService;
import com.siyige.service.MatchService;
import com.siyige.service.RoomService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * D2：两个 Controller 的「身份只认令牌」与「对局归属校验」。
 *
 * <p>这组用例守的是本期最容易悄悄退化的两件事：
 * <ol>
 *   <li>身份**不能**再从请求参数/请求体里读（`?userId=`、`body.userId` 一律忽略）</li>
 *   <li>别人的对局必须 403，而不是 200/404</li>
 * </ol>
 *
 * <p>用 standalone MockMvc：现成的单测里没有任何一个碰 api 包，这里补上；
 * `UserContext` 是 ThreadLocal，测试同线程直接 set 即可（等价于过滤器已放行）。
 */
class ApiIdentityTest {

    private static final String ME = "b-user";

    private final Store store = mock(Store.class);
    private final AuditService audit = mock(AuditService.class);
    private final MatchService matches = mock(MatchService.class);
    private final HotRank hot = mock(HotRank.class);
    private final SseHub sse = mock(SseHub.class);
    private final EvidenceService evidence = mock(EvidenceService.class);
    private final BriefService brief = mock(BriefService.class);
    private final MatchAccess access = mock(MatchAccess.class);

    private final RoomService rooms = mock(RoomService.class);
    private final RoomStore roomStore = mock(RoomStore.class);
    private final UserNames userNames = mock(UserNames.class);

    private MockMvc api;
    private MockMvc roomApi;

    @BeforeEach
    void setUp() {
        api = MockMvcBuilders
                .standaloneSetup(new ApiController(store, audit, matches, hot, sse, evidence, brief, access))
                .setControllerAdvice(new ApiErrors())
                .build();
        roomApi = MockMvcBuilders
                .standaloneSetup(new RoomController(rooms, roomStore, userNames))
                .setControllerAdvice(new ApiErrors())
                .build();
        UserContext.set(ME);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ==================== 身份来源 ====================

    @Test
    void 建对局时身份来自令牌_忽略body里的userId() throws Exception {
        // AI 三档后 create 多了 tier / payerUserId 两个参数（10 参），桩也跟着补两个 any()
        when(matches.create(anyString(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any()))
                .thenReturn("m-new");

        api.perform(post("/api/matches")
                .contentType("application/json")
                .content("{\"topicId\":\"t3\",\"userId\":\"a-user\",\"seats\":\"A1\"}"));

        verify(matches).create(eq(ME), any(), any(), any(), anyInt(), any(), any(), any(), any(), any());
        verify(matches, never()).create(eq("a-user"), any(), any(), any(), anyInt(), any(), any(), any(), any(), any());
    }

    @Test
    void 战绩只查自己的_忽略userId参数() throws Exception {
        when(store.records(anyString())).thenReturn(List.of());

        api.perform(get("/api/records").param("userId", "a-user"));

        verify(store).records(ME);
        verify(store, never()).records("a-user");
    }

    @Test
    void 诊断只查自己的_忽略userId参数() throws Exception {
        when(store.diag(anyString())).thenReturn(null);

        api.perform(get("/api/diag").param("userId", "a-user"));

        verify(store).diag(ME);
        verify(store, never()).diag("a-user");
    }

    // ==================== 对局归属 ====================

    @Test
    void 别人的对局返回403_FORBIDDEN() throws Exception {
        doThrow(AuthException.forbidden("无权访问这场对局")).when(access).requireAccess("m1", ME);

        var res = api.perform(get("/api/matches/m1")).andReturn().getResponse();

        assertEquals(403, res.getStatus());
        assertTrue(res.getContentAsString().contains("FORBIDDEN"), res.getContentAsString());
        verify(matches, never()).detail(anyString());
    }

    @Test
    void 自己的对局放行() throws Exception {
        when(matches.detail("m1")).thenReturn(Map.of("matchId", "m1"));

        var res = api.perform(get("/api/matches/m1")).andReturn().getResponse();

        assertEquals(200, res.getStatus());
        verify(access).requireAccess("m1", ME);
    }

    @Test
    void 对局内所有操作都要过归属校验() throws Exception {
        doThrow(AuthException.forbidden("无权访问这场对局")).when(access).requireAccess(eq("m1"), anyString());

        for (String path : new String[]{"/api/matches/m1/skip", "/api/matches/m1/buzz",
                "/api/matches/m1/keepalive"}) {
            var res = api.perform(post(path)).andReturn().getResponse();
            assertEquals(403, res.getStatus(), path + " 应 403");
        }
        assertEquals(403, api.perform(get("/api/matches/m1/flaws")).andReturn().getResponse().getStatus());
        assertEquals(403, api.perform(get("/api/matches/m1/review")).andReturn().getResponse().getStatus());
        assertEquals(403, api.perform(get("/api/matches/m1/events")).andReturn().getResponse().getStatus());

        verify(matches, never()).skip(anyString());
        verify(sse, never()).subscribe(anyString(), anyInt());
    }

    @Test
    void SSE归属校验在建连接之前_sse不通过就不订阅() throws Exception {
        doThrow(AuthException.forbidden("无权访问这场对局")).when(access).requireAccess("m1", ME);

        api.perform(get("/api/matches/m1/events"));

        verify(sse, never()).subscribe(anyString(), anyInt());
    }

    // ==================== 未登录 ====================

    @Test
    void 没有登录态时取身份直接401() throws Exception {
        UserContext.clear();

        var res = api.perform(get("/api/matches/m1")).andReturn().getResponse();

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("UNAUTHORIZED"), res.getContentAsString());
    }

    // ==================== 房间 ====================

    @Test
    void 建房时身份来自令牌_昵称来自账号表() throws Exception {
        when(userNames.name(ME)).thenReturn("小明");
        when(rooms.create(any(), any(), any(), anyString(), anyString())).thenReturn("R9");
        when(rooms.detail("R9", ME)).thenReturn(Map.of("code", "R9"));

        roomApi.perform(post("/api/rooms").contentType("application/json")
                .content("{\"topicId\":\"t3\",\"userId\":\"a-user\",\"userName\":\"房主\"}"));

        verify(rooms).create(any(), any(), any(), eq(ME), eq("小明"));   // 昵称查库，不用 body.userName
        verify(rooms, never()).create(any(), any(), any(), eq("a-user"), any());
    }

    @Test
    void 加入房间时身份来自令牌_昵称来自账号表() throws Exception {
        when(userNames.name(ME)).thenReturn("小明");
        when(rooms.join(eq("R9"), eq(ME), anyString())).thenReturn(Map.of("ok", true));

        roomApi.perform(post("/api/rooms/R9/join").contentType("application/json")
                .content("{\"userId\":\"a-user\",\"userName\":\"玩家\"}"));

        verify(rooms).join("R9", ME, "小明");
        verify(rooms, never()).join(eq("R9"), eq("a-user"), anyString());
    }

    @Test
    void 看房间详情用令牌身份_可以看别人的房() throws Exception {
        when(rooms.detail("R9", ME)).thenReturn(Map.of("code", "R9"));

        var res = roomApi.perform(get("/api/rooms/R9").param("userId", "a-user")).andReturn().getResponse();

        assertEquals(200, res.getStatus());
        verify(rooms).detail("R9", ME);
        verify(rooms, never()).detail(eq("R9"), eq("a-user"));
    }

    @Test
    void 准备与开局用令牌身份() throws Exception {
        when(rooms.ready("R9", ME, true)).thenReturn(Map.of("ok", true));
        when(rooms.start("R9", ME)).thenReturn(Map.of("matchId", "m1"));

        roomApi.perform(post("/api/rooms/R9/ready").contentType("application/json")
                .content("{\"userId\":\"a-user\",\"ready\":true}"));
        roomApi.perform(post("/api/rooms/R9/start").contentType("application/json")
                .content("{\"userId\":\"a-user\"}"));

        verify(rooms).ready("R9", ME, true);
        verify(rooms).start("R9", ME);
    }
}
