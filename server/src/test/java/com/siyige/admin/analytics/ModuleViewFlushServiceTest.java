package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 回写服务：跨零点不丢数（昨天 + 今天都处理）、落库失败要把增量补回 Redis、UV 用「取大」不累加。
 */
class ModuleViewFlushServiceTest {

    private final PvStore store = mock(PvStore.class);
    private final ModuleViewRepo repo = mock(ModuleViewRepo.class);
    private final ModuleViewFlushService service = new ModuleViewFlushService(store, repo);

    private static String today() {
        return DayKeys.dayKey(DayKeys.todayDate());
    }

    private static String yesterday() {
        return DayKeys.dayKey(DayKeys.todayDate().minusDays(1));
    }

    @Test
    void PV把昨天和今天的增量分别落到对应日期() {
        Map<String, Long> y = new LinkedHashMap<>();
        y.put("community", 3L);
        Map<String, Long> t = new LinkedHashMap<>();
        t.put("chat", 5L);
        t.put("video", 2L);
        when(store.takePv(yesterday())).thenReturn(y);
        when(store.takePv(today())).thenReturn(t);

        assertEquals(3, service.flushPv());

        verify(repo).addPv(DayKeys.todayDate().minusDays(1), "community", 3L);
        verify(repo).addPv(DayKeys.todayDate(), "chat", 5L);
        verify(repo).addPv(DayKeys.todayDate(), "video", 2L);
    }

    @Test
    void 没有增量时不写库() {
        when(store.takePv(anyString())).thenReturn(Map.of());
        assertEquals(0, service.flushPv());
        verify(repo, never()).addPv(any(), anyString(), anyLong());
    }

    @Test
    void 落库失败要把增量补回Redis并抛出() {
        Map<String, Long> t = new LinkedHashMap<>();
        t.put("community", 4L);
        when(store.takePv(yesterday())).thenReturn(Map.of());
        when(store.takePv(today())).thenReturn(t);
        doThrow(new RuntimeException("db down")).when(repo).addPv(any(), anyString(), anyLong());

        assertThrows(RuntimeException.class, () -> service.flushPv());
        verify(store).restorePv(today(), t);        // 不能静默丢计数
    }

    @Test
    void Redis读失败时不中断且不写库() {
        when(store.takePv(anyString())).thenThrow(new RuntimeException("redis down"));
        assertEquals(0, service.flushPv());
        verify(repo, never()).addPv(any(), anyString(), anyLong());
    }

    @Test
    void UV快照只写变大的值() {
        when(store.countUv(anyString(), eq("community"))).thenReturn(7L);
        when(store.snapUv(anyString(), eq("community"))).thenReturn(5L);   // 比上次大 -> 写
        when(store.countUv(anyString(), eq("chat"))).thenReturn(3L);
        when(store.snapUv(anyString(), eq("chat"))).thenReturn(3L);        // 没变 -> 跳过

        int written = service.snapshotUv();

        assertEquals(2, written);     // 昨天 + 今天各写一次 community（chat 跳过）
        verify(repo, times(2)).mergeUv(any(LocalDate.class), eq("community"), eq(7L));
        verify(repo, never()).mergeUv(any(LocalDate.class), eq("chat"), anyLong());
        verify(store, times(2)).saveUvSnap(anyString(), eq("community"), eq(7L));
    }

    @Test
    void UV为0的模块不写库() {
        when(store.countUv(anyString(), anyString())).thenReturn(0L);
        assertEquals(0, service.snapshotUv());
        verify(repo, never()).mergeUv(any(LocalDate.class), anyString(), anyLong());
    }
}
