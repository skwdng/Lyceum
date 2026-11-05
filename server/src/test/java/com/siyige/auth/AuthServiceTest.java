package com.siyige.auth;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * T2：账号与密码核心。
 *
 * <p>用**低参** Argon2（m=1024,t=1）跑，生产参数是 19456/2——否则每个用例 40-80ms，十几条就拖成几秒。
 */
class AuthServiceTest {

    private final AuthRepo repo = mock(AuthRepo.class);
    private final PasswordEncoder encoder = new Argon2PasswordEncoder(8, 16, 1, 1024, 1);
    private final AuthService service = new AuthService(repo, encoder);

    private static AuthRepo.UserRecord user(String account, String hash, int status) {
        return new AuthRepo.UserRecord(account, account, "昵称-" + account, hash, status, false);
    }

    private static AuthDtos.RegisterRequest reg(String account, String password) {
        return new AuthDtos.RegisterRequest(account, password);
    }

    private static AuthDtos.LoginRequest login(String account, String password) {
        return new AuthDtos.LoginRequest(account, password);
    }

    // ==================== 注册 ====================

    @Test
    void 注册成功_昵称默认等于账号_存的是哈希不是明文() {
        when(repo.findByAccount("zhang")).thenReturn(null);

        AuthDtos.AuthUser u = service.register(reg("zhang", "abc12345"));

        ArgumentCaptor<String> hash = ArgumentCaptor.forClass(String.class);
        verify(repo).insert(eq("zhang"), eq("zhang"), hash.capture());

        assertEquals("zhang", u.id());
        assertEquals("zhang", u.account());
        assertEquals("zhang", u.name(), "昵称默认=账号");
        assertNotEquals("abc12345", hash.getValue(), "绝不能存明文");
        assertTrue(hash.getValue().startsWith("$argon2id$"), "应为 argon2id，实际：" + hash.getValue());
    }

    @Test
    void 注册_账号统一转小写存储() {
        when(repo.findByAccount("zhang")).thenReturn(null);

        AuthDtos.AuthUser u = service.register(reg("  Zhang  ", "abc12345"));

        assertEquals("zhang", u.account(), "账号应统一小写并去空白");
        verify(repo).insert(eq("zhang"), eq("zhang"), anyString());
    }

    @Test
    void 注册_重复账号返回ACCOUNT_TAKEN() {
        when(repo.findByAccount("zhang")).thenReturn(user("zhang", "$argon2id$", 1));

        AuthException e = assertThrows(AuthException.class, () -> service.register(reg("zhang", "abc12345")));
        assertEquals("ACCOUNT_TAKEN", e.code());
        verify(repo, never()).insert(anyString(), anyString(), anyString());
    }

    @Test
    void 注册_并发撞唯一索引也返回ACCOUNT_TAKEN() {
        when(repo.findByAccount("zhang")).thenReturn(null);   // 预检时还没有
        doThrow(new DuplicateKeyException("ux_user_account"))
                .when(repo).insert(anyString(), anyString(), anyString());

        AuthException e = assertThrows(AuthException.class, () -> service.register(reg("zhang", "abc12345")));
        assertEquals("ACCOUNT_TAKEN", e.code(), "唯一索引兜底应转成同一个错误码");
    }

    @Test
    void 注册_密码不满足策略全部拒绝() {
        when(repo.findByAccount(anyString())).thenReturn(null);

        String[] bad = {"abc1234", "abcdefgh", "12345678", "abc1234567890123456789012345678901234567890123456789012345678901234"};
        for (String pwd : bad) {
            AuthException e = assertThrows(AuthException.class, () -> service.register(reg("zhang", pwd)),
                    "应拒绝密码：" + pwd);
            assertEquals("INVALID_PARAM", e.code(), "密码：" + pwd);
        }
        verify(repo, never()).insert(anyString(), anyString(), anyString());
    }

    @Test
    void 注册_账号格式不合法全部拒绝() {
        String[] bad = {"ab", "a".repeat(33), "zhang-1", "张 三", "zhang@x", ""};
        for (String acc : bad) {
            AuthException e = assertThrows(AuthException.class, () -> service.register(reg(acc, "abc12345")),
                    "应拒绝账号：" + acc);
            assertEquals("INVALID_PARAM", e.code(), "账号：" + acc);
        }
    }

    // ==================== 登录 ====================

    @Test
    void 登录成功返回用户视图() {
        String hash = encoder.encode("abc12345");
        when(repo.findByAccount("zhang")).thenReturn(user("zhang", hash, 1));

        AuthDtos.AuthUser u = service.login(login("Zhang", "abc12345"));

        assertEquals("zhang", u.id());
        assertEquals("昵称-zhang", u.name());
    }

    @Test
    void 登录_密码错误与账号不存在_对外是同一个错误() {
        String hash = encoder.encode("abc12345");
        when(repo.findByAccount("zhang")).thenReturn(user("zhang", hash, 1));
        when(repo.findByAccount("nobody")).thenReturn(null);

        AuthException wrongPwd = assertThrows(AuthException.class, () -> service.login(login("zhang", "wrong12345")));
        AuthException noUser = assertThrows(AuthException.class, () -> service.login(login("nobody", "wrong12345")));

        assertEquals("BAD_CREDENTIALS", wrongPwd.code());
        assertEquals("BAD_CREDENTIALS", noUser.code());
        assertEquals(wrongPwd.getMessage(), noUser.getMessage(), "文案必须完全一致，不能泄露账号是否存在");
        assertEquals("用户名或密码错误", wrongPwd.getMessage().replace("BAD_CREDENTIALS: ", ""));
    }

    @Test
    void 登录_账号不存在时也跑一次哈希校验_防时序枚举() {
        PasswordEncoder spyEncoder = spy(new Argon2PasswordEncoder(8, 16, 1, 1024, 1));
        AuthService svc = new AuthService(repo, spyEncoder);
        when(repo.findByAccount("nobody")).thenReturn(null);

        assertThrows(AuthException.class, () -> svc.login(login("nobody", "whatever123")));

        verify(spyEncoder, atLeastOnce()).matches(anyString(), anyString());
    }

    @Test
    void 登录_全站封禁账号返回ACCOUNT_DISABLED() {
        String hash = encoder.encode("abc12345");
        when(repo.findByAccount("zhang")).thenReturn(user("zhang", hash, 2));

        AuthException e = assertThrows(AuthException.class, () -> service.login(login("zhang", "abc12345")));
        assertEquals("ACCOUNT_DISABLED", e.code(), "全站封禁要明确返回 ACCOUNT_DISABLED（验收 #15）");
    }

    @Test
    void 登录_历史行没有密码时拒绝且不抛其他异常() {
        when(repo.findByAccount("u_demo")).thenReturn(new AuthRepo.UserRecord("u_demo", "u_demo", "演示用户", null, 1, false));

        AuthException e = assertThrows(AuthException.class, () -> service.login(login("u_demo", "abc12345")));
        assertEquals("BAD_CREDENTIALS", e.code());
    }

    @Test
    void 登录_哈希参数变弱时自动重算回写() {
        // 库里是更弱的参数（m=1024），服务用更强参数（m=2048）-> upgradeEncoding = true
        String weakHash = new Argon2PasswordEncoder(8, 16, 1, 1024, 1).encode("abc12345");
        PasswordEncoder stronger = new Argon2PasswordEncoder(8, 16, 1, 2048, 1);
        assertTrue(stronger.upgradeEncoding(weakHash), "前置条件：应判定为需要升级");

        AuthService svc = new AuthService(repo, stronger);
        when(repo.findByAccount("zhang")).thenReturn(user("zhang", weakHash, 1));

        AuthDtos.AuthUser u = svc.login(login("zhang", "abc12345"));

        assertEquals("zhang", u.id());
        ArgumentCaptor<String> newHash = ArgumentCaptor.forClass(String.class);
        verify(repo).updatePasswordHash(eq("zhang"), newHash.capture());
        assertNotEquals(weakHash, newHash.getValue());
        assertTrue(stronger.matches("abc12345", newHash.getValue()));
    }

    // ==================== 我 / 改名 ====================

    @Test
    void 改名成功_并且只改昵称不改账号() {
        when(repo.findById("zhang")).thenReturn(user("zhang", "$argon2id$", 1));

        AuthDtos.AuthUser u = service.updateName("zhang", "  新昵称  ");

        assertEquals("新昵称", u.name());
        assertEquals("zhang", u.account(), "账号不可变");
        verify(repo).updateName("zhang", "新昵称");
    }

    @Test
    void 改名_空昵称或超长拒绝() {
        when(repo.findById("zhang")).thenReturn(user("zhang", "$argon2id$", 1));

        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> service.updateName("zhang", "   ")).code());
        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> service.updateName("zhang", "x".repeat(65))).code());
    }

    @Test
    void me_用户不存在返回UNAUTHORIZED() {
        when(repo.findById("ghost")).thenReturn(null);

        assertEquals("UNAUTHORIZED", assertThrows(AuthException.class, () -> service.me("ghost")).code());
        assertEquals("UNAUTHORIZED", assertThrows(AuthException.class, () -> service.me(null)).code());
    }

    // ==================== 安全：DTO 不泄露密码 ====================

    @Test
    void DTO的toString不含密码() {
        String pwd = "secret12345";
        assertFalse(reg("zhang", pwd).toString().contains(pwd), "RegisterRequest.toString 泄露了密码");
        assertFalse(login("zhang", pwd).toString().contains(pwd), "LoginRequest.toString 泄露了密码");
    }

    @Test
    void UserRecord的toString不含哈希() {
        AuthRepo.UserRecord r = user("zhang", "$argon2id$v=19$m=19456,t=2,p=1$salt$hash", 1);
        assertFalse(r.toString().contains("argon2"), "UserRecord.toString 泄露了哈希");
    }
}
