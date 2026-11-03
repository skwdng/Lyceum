package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A2：管理员认证。
 *
 * <p>用**低参** Argon2（m=1024,t=1）跑速度，生产参数是 19456/2。
 */
class AdminAuthServiceTest {

    private final AdminRepo repo = mock(AdminRepo.class);
    private final PasswordEncoder encoder = new Argon2PasswordEncoder(8, 16, 1, 1024, 1);
    private final AdminAuthService service = new AdminAuthService(repo, encoder);

    private static AdminRepo.AdminRecord admin(String hash, int status) {
        return new AdminRepo.AdminRecord(1L, "admin", hash, status);
    }

    private static AdminDtos.AdminLoginRequest req(String account, String password) {
        return new AdminDtos.AdminLoginRequest(account, password);
    }

    @Test
    void 登录成功返回管理员视图() {
        when(repo.findByAccount("admin")).thenReturn(admin(encoder.encode("admin123"), 1));

        AdminDtos.AdminView v = service.login(req("admin", "admin123"));

        assertEquals(1L, v.id());
        assertEquals("admin", v.account());
    }

    @Test
    void 账号大小写与首尾空白被规范化() {
        when(repo.findByAccount("admin")).thenReturn(admin(encoder.encode("admin123"), 1));

        AdminDtos.AdminView v = service.login(req("  ADMIN  ", "admin123"));

        assertEquals("admin", v.account());
        verify(repo).findByAccount("admin");
    }

    @Test
    void 密码错误与账号不存在_对外是同一个错误() {
        when(repo.findByAccount("admin")).thenReturn(admin(encoder.encode("admin123"), 1));
        when(repo.findByAccount("ghost")).thenReturn(null);

        AuthException wrongPwd = assertThrows(AuthException.class,
                () -> service.login(req("admin", "wrong12345")));
        AuthException noUser = assertThrows(AuthException.class,
                () -> service.login(req("ghost", "wrong12345")));

        assertEquals("BAD_CREDENTIALS", wrongPwd.code());
        assertEquals("BAD_CREDENTIALS", noUser.code());
        assertEquals(wrongPwd.getMessage(), noUser.getMessage(), "文案必须一致，不能泄露账号是否存在");
    }

    @Test
    void 账号不存在时也跑一次哈希校验_防时序枚举() {
        PasswordEncoder spyEncoder = spy(new Argon2PasswordEncoder(8, 16, 1, 1024, 1));
        AdminAuthService svc = new AdminAuthService(repo, spyEncoder);
        when(repo.findByAccount("ghost")).thenReturn(null);

        assertThrows(AuthException.class, () -> svc.login(req("ghost", "whatever123")));

        verify(spyEncoder, atLeastOnce()).matches(anyString(), anyString());
    }

    @Test
    void 停用的管理员不给过_且文案与其他失败一致() {
        when(repo.findByAccount("admin")).thenReturn(admin(encoder.encode("admin123"), 0));

        AuthException e = assertThrows(AuthException.class, () -> service.login(req("admin", "admin123")));
        assertEquals("BAD_CREDENTIALS", e.code(), "不能告诉对方“这个账号被停用了”");
    }

    @Test
    void 空账号或空密码按参数错误处理() {
        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> service.login(req("", "admin123"))).code());
        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> service.login(req("admin", ""))).code());
        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> service.login(null)).code());
    }

    @Test
    void DTO的toString不含密码() {
        String pwd = "secret12345";
        assertFalse(req("admin", pwd).toString().contains(pwd), "AdminLoginRequest.toString 泄露了密码");
    }

    @Test
    void AdminRecord的toString不含哈希() {
        AdminRepo.AdminRecord r = admin("$argon2id$v=19$m=19456,t=2,p=1$salt$hash", 1);
        assertFalse(r.toString().contains("argon2"), "AdminRecord.toString 泄露了哈希");
    }
}
