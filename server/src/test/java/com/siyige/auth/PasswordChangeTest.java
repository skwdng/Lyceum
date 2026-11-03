package com.siyige.auth;

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
 * B2：改密码（用户端）。
 *
 * <p>低参 Argon2（m=1024,t=1）跑速度，生产参数 19456/2。
 */
class PasswordChangeTest {

    private final AuthRepo repo = mock(AuthRepo.class);
    private final PasswordEncoder encoder = new Argon2PasswordEncoder(8, 16, 1, 1024, 1);
    private final AuthService service = new AuthService(repo, encoder);

    private AuthRepo.UserRecord user(String password) {
        return new AuthRepo.UserRecord("zhang", "zhang", "老张", encoder.encode(password), 1);
    }

    @Test
    void 改密成功_写新哈希与改密时间() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        service.changePassword("zhang", "abc12345", "newpass123");

        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Timestamp> at = ArgumentCaptor.forClass(Timestamp.class);
        verify(repo).changePassword(eq("zhang"), hash.capture(), at.capture());

        assertNotEquals("newpass123", hash.getValue(), "绝不能存明文");
        assertTrue(hash.getValue().startsWith("$argon2id$"), "应为 argon2id：" + hash.getValue());
        assertTrue(encoder.matches("newpass123", hash.getValue()), "新哈希应能校验新密码");
        assertNotNull(at.getValue(), "必须写 pwd_changed_at，否则旧令牌不会失效");
        assertTrue(Math.abs(at.getValue().getTime() - Instant.now().toEpochMilli()) < 5000);
    }

    @Test
    void 旧密码不正确返回400() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword("zhang", "wrong12345", "newpass123"));

        assertEquals("INVALID_PARAM", e.code(), "用户确认用 400，不用 401");
        assertEquals(400, e.status().value());
        assertTrue(e.getMessage().contains("旧密码不正确"), e.getMessage());
        verify(repo, never()).changePassword(anyString(), anyString(), any());
    }

    @Test
    void 旧密码错时不校验新密码策略_不泄露策略细节() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        // 新密码很弱，但旧密码是错的 -> 报的必须是"旧密码不正确"，不是"密码至少 8 位"
        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword("zhang", "wrong12345", "abc"));

        assertTrue(e.getMessage().contains("旧密码不正确"), "不能先暴露新密码策略：" + e.getMessage());
    }

    @Test
    void 新密码不满足策略一律拒绝() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        String[] bad = {"abc1234", "abcdefgh", "12345678", "a".repeat(65)};
        for (String pwd : bad) {
            AuthException e = assertThrows(AuthException.class,
                    () -> service.changePassword("zhang", "abc12345", pwd), "应拒绝：" + pwd);
            assertEquals("INVALID_PARAM", e.code(), "密码：" + pwd);
        }
        verify(repo, never()).changePassword(anyString(), anyString(), any());
    }

    @Test
    void 新旧密码相同要拒绝() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword("zhang", "abc12345", "abc12345"));

        assertEquals("INVALID_PARAM", e.code());
        assertTrue(e.getMessage().contains("不能与旧密码相同"), e.getMessage());
        verify(repo, never()).changePassword(anyString(), anyString(), any());
    }

    @Test
    void 用户不存在或未登录要拒绝() {
        when(repo.findById("ghost")).thenReturn(null);

        assertEquals("UNAUTHORIZED", assertThrows(AuthException.class,
                () -> service.changePassword("ghost", "a1234567", "b1234567")).code());
        assertEquals("UNAUTHORIZED", assertThrows(AuthException.class,
                () -> service.changePassword(null, "a1234567", "b1234567")).code());
    }

    @Test
    void 空旧密码要拒绝() {
        when(repo.findById("zhang")).thenReturn(user("abc12345"));

        assertEquals("INVALID_PARAM", assertThrows(AuthException.class,
                () -> service.changePassword("zhang", "", "newpass123")).code());
        assertEquals("INVALID_PARAM", assertThrows(AuthException.class,
                () -> service.changePassword("zhang", null, "newpass123")).code());
    }

    @Test
    void 入参DTO的toString不含密码() {
        String oldPwd = "oldpass123", newPwd = "newpass123";
        AuthDtos.ChangePasswordRequest req = new AuthDtos.ChangePasswordRequest(oldPwd, newPwd);

        String s = req.toString();
        assertFalse(s.contains(oldPwd), "toString 泄露了旧密码：" + s);
        assertFalse(s.contains(newPwd), "toString 泄露了新密码：" + s);
    }

    @Test
    void 历史账号没有密码时给友好错误() {
        when(repo.findById("u_demo")).thenReturn(new AuthRepo.UserRecord("u_demo", "u_demo", "演示", null, 1));

        AuthException e = assertThrows(AuthException.class,
                () -> service.changePassword("u_demo", "whatever123", "newpass123"));
        assertEquals("INVALID_PARAM", e.code());
    }
}
