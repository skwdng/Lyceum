package com.siyige.admin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * B4 红线：**审计写失败不能影响主流程**。
 *
 * <p>{@link AuditLog} 是唯一的写入门面，两条 record* 方法都必须把异常吞掉、只打 warn。
 * 这组用例就是在守这条线——如果哪天有人"顺手"把 try/catch 去掉，
 * 举报处理会因为日志表出问题而整体 500，那是本末倒置。
 */
class AuditLogTest {

    private final AuditLogRepo repo = mock(AuditLogRepo.class);
    private final AuditLog audit = new AuditLog(repo);

    @Test
    void 正常写入会带上动作与判定() {
        audit.recordResolve(7L, 1L, "admin", "DELETE", "POST", 100L, "删除内容", "127.0.0.1");

        verify(repo).insert(7L, 1L, "admin", AuditLogRepo.ACTION_RESOLVE, "DELETE",
                "POST", 100L, "删除内容", "127.0.0.1");
    }

    @Test
    void 恢复记录不带verdict() {
        audit.recordRestore(7L, 2L, "admin2", "POST", 100L, "撤销「删除内容」：帖子 #100 重新可见", "10.0.0.1");

        verify(repo).insert(7L, 2L, "admin2", AuditLogRepo.ACTION_RESTORE, null,
                "POST", 100L, "撤销「删除内容」：帖子 #100 重新可见", "10.0.0.1");
    }

    @Test
    void 写处理记录失败时不抛异常() {
        doThrow(new RuntimeException("audit table gone"))
                .when(repo).insert(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(), any());

        assertDoesNotThrow(() -> audit.recordResolve(7L, 1L, "admin", "DELETE", "POST", 100L, "x", "ip"));
    }

    @Test
    void 写恢复记录失败时也不抛异常() {
        doThrow(new RuntimeException("disk full"))
                .when(repo).insert(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(), any());

        assertDoesNotThrow(() -> audit.recordRestore(7L, 1L, "admin", "POST", 100L, "x", "ip"));
    }

    @Test
    void detail超长会被截断到500字() {
        String longDetail = "字".repeat(800);

        audit.recordResolve(7L, 1L, "admin", "DELETE", "POST", 100L, longDetail, "ip");

        verify(repo).insert(eq(7L), eq(1L), eq("admin"), eq(AuditLogRepo.ACTION_RESOLVE), eq("DELETE"),
                eq("POST"), eq(100L), argThat(d -> d != null && d.length() == 500), eq("ip"));
    }
}
