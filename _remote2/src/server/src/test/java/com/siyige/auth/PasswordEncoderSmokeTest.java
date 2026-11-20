package com.siyige.auth;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

/**
 * T1 的依赖自检：证明 Argon2id 在这套依赖下真的能跑。
 *
 * <p>重点验证 <b>BouncyCastle（bcprov-jdk18on）已经就位</b>：缺它时
 * {@code Argon2PasswordEncoder} 会直接抛 {@code NoClassDefFoundError}，
 * 而不是编译期报错——所以必须有一条运行期断言。
 *
 * <p>这里用的是**生产参数**（m=19456, t=2），故意不用低参版本：
 * 就是要确认生产配置本身可用。单次约 40–80ms，整个测试类只有 1 次 encode，可接受。
 */
class PasswordEncoderSmokeTest {

    /** 与决策 4 完全一致：saltLen=16, hashLen=32, parallelism=1, memoryKB=19456, iterations=2。 */
    private static final Argon2PasswordEncoder ENCODER =
            new Argon2PasswordEncoder(16, 32, 1, 19456, 2);

    @Test
    void 生产参数能生成argon2id哈希_且长度适合varchar255() {
        String hash = ENCODER.encode("abc12345");

        assertNotNull(hash);
        assertTrue(hash.startsWith("$argon2id$"), "必须是 argon2id，实际：" + hash);
        assertTrue(hash.length() <= 255, "哈希长度 " + hash.length() + " 超过 varchar(255)");
        assertTrue(hash.length() > 60, "argon2id 串应明显长于 bcrypt 的 60 字符，实际 " + hash.length());
    }

    @Test
    void 同一密码两次哈希不同_说明自带随机盐() {
        String a = ENCODER.encode("abc12345");
        String b = ENCODER.encode("abc12345");

        assertNotEquals(a, b, "两次哈希相同说明盐没随机，不能接受");
        assertTrue(ENCODER.matches("abc12345", a));
        assertTrue(ENCODER.matches("abc12345", b));
    }

    @Test
    void 错误密码不匹配() {
        String hash = ENCODER.encode("abc12345");

        assertFalse(ENCODER.matches("abc1234", hash));
        assertFalse(ENCODER.matches("ABC12345", hash));
        assertFalse(ENCODER.matches("", hash));
    }
}
