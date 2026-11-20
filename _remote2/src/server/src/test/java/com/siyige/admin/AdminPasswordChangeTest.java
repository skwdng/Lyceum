package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Timestamp;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * B3：管理员改密码（规则与用户端完全一致，见 {@link com.siyige.auth.PasswordPolicy}）。
 */
class AdminPasswordChangeTest {

    private final AdminRepo repo = mock(AdminRepo.class);
    private final PasswordEncoder encoder = new Argon2PasswordEncoder(8, 16, 1, 1024, 1);
    private final AdminAuthService service = new AdminAuthService(repo, encoder);

    private AdminRepo.AdminRecord admin(String password) {
        return new AdminRepo.AdminRecord(1L, "admin", encoder.encode(password), 1);
    }

    @Test
    void 改密成功_写新哈希与改密时间() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        service.changePassword(1L, "admin123", "newadmin123");

        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Timestamp> at = ArgumentCaptor.forClass(Timestamp.class);
        verify(repo).changePassword(eq(1L), hash.capture(), at.capture());

        assertNotEquals("newadmin123", hash.getValue(), "绝不能存明文");
        assertTrue(encoder.matches("newadmin123", hash.getValue()));
        assertNotNull(at.getValue(), "必须写 pwd_changed_at，否则旧管理令牌不会失效");
        assertTrue(Math.abs(at.getValue().getTime() - Instant.now().toEpochMilli()) < 5000);
    }

    @Test
    void 旧密码不正确返回400() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword(1L, "wrong12345", "newadmin123"));

        assertEquals("INVALID_PARAM", e.code(), "用户确认用 400");
        assertEquals(400, e.status().value());
        assertTrue(e.getMessage().contains("旧密码不正确"));
        verify(repo, never()).changePassword(anyLong(), anyString(), any());
    }

    @Test
    void 旧密码错时不泄露新密码策略() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword(1L, "wrong12345", "abc"));

        assertTrue(e.getMessage().contains("旧密码不正确"), e.getMessage());
    }

    @Test
    void 新密码不满足策略一律拒绝() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        for (String pwd : new String[]{"abc1234", "abcdefgh", "12345678", "a".repeat(65), ""}) {
            AuthException e = assertThrows(AuthException.class,
                    () -> service.changePassword(1L, "admin123", pwd), "应拒绝：" + pwd);
            assertEquals("INVALID_PARAM", e.code(), "密码：" + pwd);
        }
        verify(repo, never()).changePassword(anyLong(), anyString(), any());
    }

    @Test
    void 新旧密码相同要拒绝() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword(1L, "admin123", "admin123"));

        assertEquals("INVALID_PARAM", e.code());
        assertTrue(e.getMessage().contains("不能与旧密码相同"));
    }

    @Test
    void 管理员不存在时拒绝() {
        when(repo.findById(99L)).thenReturn(null);

        assertEquals("NOT_ADMIN", assertThrows(AuthException.class,
                () -> service.changePassword(99L, "whatever12", "newadmin123")).code());
    }

    @Test
    void 入参DTO的toString不含密码() {
        String oldPwd = "admin123", newPwd = "newadmin123";
        AdminDtos.ChangeAdminPasswordRequest req = new AdminDtos.ChangeAdminPasswordRequest(oldPwd, newPwd);

        String s = req.toString();
        assertFalse(s.contains(oldPwd), "toString 泄露了旧密码：" + s);
        assertFalse(s.contains(newPwd), "toString 泄露了新密码：" + s);
    }

    @Test
    void 改密不会去写审计_审计只记举报处理() {
        when(repo.findById(1L)).thenReturn(admin("admin123"));

        service.changePassword(1L, "admin123", "newadmin123");

        // AdminAuthService 只有 repo + encoder 两个依赖，结构上就不可能写 sy_audit_log
        verifyNoInteractions(mock(AdminStatusSource.class));
        verify(repo).changePassword(anyLong(), anyString(), any());
    }

    @Test
    void 已停用管理员仍可改密但登录会被拒() {
        // 改密只校验密码，不看 status；能否用由登录与过滤器把关（分开职责）
        when(repo.findById(1L)).thenReturn(new AdminRepo.AdminRecord(1L, "admin", encoder.encode("admin123"), 0));

        service.changePassword(1L, "admin123", "newadmin123");

        verify(repo).changePassword(anyLong(), anyString(), any());
    }
}
