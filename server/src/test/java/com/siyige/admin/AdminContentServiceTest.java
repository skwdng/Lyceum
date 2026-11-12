package com.siyige.admin;

import com.siyige.community.CommunityRepo;
import com.siyige.community.NotificationService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 内容处置的编排：**复用既有实现**（软删 / 禁言）+ 写 MANUAL 审计（source=MANUAL、report_id=0、target_owner=作者）。
 */
class AdminContentServiceTest {

    private final AdminContentRepo repo = mock(AdminContentRepo.class);
    private final CommunityRepo community = mock(CommunityRepo.class);
    private final BanService bans = mock(BanService.class);
    private final AuditLog audit = mock(AuditLog.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final AdminReportRepo reports = mock(AdminReportRepo.class);
    private final AdminContentService service =
            new AdminContentService(repo, community, bans, audit, notifications, reports);

    private static Map<String, Object> content(String author, int status) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", 7L);
        m.put("author_id", author);
        m.put("status", status);
        return m;
    }

    @Test
    void 屏蔽评论_走既有的softDeleteComment并写MANUAL审计() {
        when(repo.findContent("COMMENT", 7)).thenReturn(content("u1", 1));
        when(community.softDeleteComment(7)).thenReturn(1);

        service.hide("comment", 7, 1L, "admin", "127.0.0.1", "广告");

        verify(community).softDeleteComment(7);
        verify(community, never()).softDeletePost(anyLong());
        // 作者会收到「被管理员删除 + 理由」
        verify(notifications).onContentDeleted(eq("COMMENT"), eq(7L), eq("u1"), eq("广告"));
        // MANUAL 审计：report_id=0、target_owner=作者
        verify(audit).recordManual(eq(1L), eq("admin"), eq("DELETE"), eq("COMMENT"), eq(7L), eq("u1"),
                anyString(), eq("127.0.0.1"));
    }

    @Test
    void 屏蔽时把这目标下的PENDING举报一次性结案() {
        when(repo.findContent("POST", 7)).thenReturn(content("u1", 1));
        when(community.softDeletePost(7)).thenReturn(1);
        when(reports.resolveTarget("POST", 7L, "ACCEPTED", "DELETE", 1L)).thenReturn(2);

        service.hide("post", 7, 1L, "admin", "ip", "广告");

        // 与举报处置 DELETE 分支同款副作用：不留"待处理"的旧举报（否则处理记录里永远挂着一条点了没用的）
        verify(reports).resolveTarget("POST", 7L, "ACCEPTED", "DELETE", 1L);
    }

    @Test
    void 已经是屏蔽状态再屏蔽_409而不是静默成功() {
        when(repo.findContent("POST", 7)).thenReturn(content("u1", 2));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.hide("post", 7, 1L, "admin", "ip", null));
        assertTrue(e.getMessage().startsWith("ALREADY_HIDDEN"));
        verify(community, never()).softDeletePost(anyLong());
    }

    @Test
    void 内容不存在_404() {
        when(repo.findContent("POST", 9)).thenReturn(null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.hide("post", 9, 1L, "admin", "ip", null));
        assertTrue(e.getMessage().startsWith("POST_NOT_FOUND"));
    }

    @Test
    void type只接受post和comment() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.hide("video", 1, 1L, "admin", "ip", null));
        assertTrue(e.getMessage().startsWith("INVALID_TYPE"));
    }

    @Test
    void 解除屏蔽_走restore并写MANUAL的RESTORE审计() {
        when(repo.findContent("POST", 7)).thenReturn(content("u1", 2));
        when(community.restorePost(7)).thenReturn(1);

        service.unhide("post", 7, 1L, "admin", "ip");

        verify(community).restorePost(7);
        verify(audit).recordManualRestore(eq(1L), eq("admin"), eq("POST"), eq(7L), eq("u1"),
                anyString(), eq("ip"));
    }

    @Test
    void 本来就没屏蔽_解除时报NOT_HIDDEN() {
        when(repo.findContent("POST", 7)).thenReturn(content("u1", 1));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.unhide("post", 7, 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("NOT_HIDDEN"));
        verify(community, never()).restorePost(anyLong());
    }

    @Test
    void 禁言_复用BanService并写MANUAL审计() {
        when(repo.userBrief("u1")).thenReturn(Map.of("id", "u1", "name", "张三"));
        Timestamp until = Timestamp.from(Instant.now().plusSeconds(3 * 86400L));
        when(bans.ban("u1", 3, "刷屏", 1L)).thenReturn(until);

        Timestamp got = service.mute("u1", 3, "刷屏", 1L, "admin", "ip");

        assertEquals(until, got);
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(audit).recordManual(eq(1L), eq("admin"), eq("BAN"), eq("USER"), isNull(), eq("u1"),
                detail.capture(), eq("ip"));
        assertTrue(detail.getValue().contains("禁言 3 天"));
        assertTrue(detail.getValue().contains("刷屏"));
    }

    @Test
    void 禁言不存在的用户_404() {
        when(repo.userBrief("nobody")).thenReturn(null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.mute("nobody", 1, null, 1L, "admin", "ip"));
        assertTrue(e.getMessage().startsWith("USER_NOT_FOUND"));
        verify(bans, never()).ban(anyString(), org.mockito.ArgumentMatchers.anyInt(), any(), anyLong());
    }

    @Test
    void 分页_size上限50_page从1开始() {
        int[] pg = AdminContentService.page(0, 999);
        assertEquals(1, pg[0]);
        assertEquals(50, pg[1]);
        assertEquals(0, pg[2]);

        int[] pg2 = AdminContentService.page(3, 20);
        assertEquals(3, pg2[0]);
        assertEquals(40, pg2[2]);
    }
}
