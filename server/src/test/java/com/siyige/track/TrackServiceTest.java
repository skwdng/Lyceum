package com.siyige.track;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** 埋点上报：白名单是硬关口，Redis 故障只降级不打扰用户。 */
class TrackServiceTest {

    private final PvStore store = mock(PvStore.class);
    private final TrackService service = new TrackService(store);

    @Test
    void 白名单内的模块记一次PV() {
        assertTrue(service.record("community", "u1"));
        verify(store).addPv(anyString(), eq("community"), eq(1L));
    }

    @Test
    void 白名单外的模块抛MODULE_NOT_ALLOWED() {
        // 典型脏数据：前端误传路由路径而不是模块名
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.record("community/12", "u1"));
        assertTrue(e.getMessage().startsWith("MODULE_NOT_ALLOWED"));
        verifyNoInteractions(store);       // 脏数据不进 Redis
    }

    @Test
    void 空模块名也拒绝() {
        assertThrows(IllegalArgumentException.class, () -> service.record(null, "u1"));
        assertThrows(IllegalArgumentException.class, () -> service.record("   ", "u1"));
        verifyNoInteractions(store);
    }

    @Test
    void 模块名两侧空格会被去掉() {
        assertTrue(service.record("  hot  ", null));
        verify(store).addPv(anyString(), eq("hot"), eq(1L));
    }

    @Test
    void 登录态才记UV() {
        service.record("chat", "u1");
        verify(store).addUv(anyString(), eq("chat"), eq("u1"));
    }

    @Test
    void 匿名只计PV不记UV() {
        service.record("chat", null);
        service.record("chat", "");
        verify(store, never()).addUv(anyString(), anyString(), any());
    }

    @Test
    void Redis故障时返回false而不是抛异常() {
        doThrow(new RuntimeException("redis down"))
                .when(store).addPv(anyString(), anyString(), anyLong());

        assertFalse(service.record("video", "u1"));   // 降级：统计丢弃，接口仍 200
    }

    @Test
    void 十一个模块全部在册() {
        assertEquals(11, TrackService.MODULES.size());
        for (String m : new String[]{"community", "chat", "match", "solo", "video", "hot",
                "diag", "records", "wallet", "friends", "admin"}) {
            assertTrue(TrackService.MODULES.contains(m), "缺少模块: " + m);
        }
    }
}
