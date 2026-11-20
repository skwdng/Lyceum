package com.siyige.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 密码哈希的唯一装配点。
 *
 * <p>决策 4：Argon2id，参数按 OWASP 2023 推荐档
 * {@code m=19456 KiB, t=2, p=1, salt=16B, hash=32B}。
 * 构造参数顺序是 {@code (saltLength, hashLength, parallelism, memoryKB, iterations)}。
 *
 * <p>返回类型故意声明成接口 {@link PasswordEncoder}：单测里可以塞低参版本
 * （如 m=1024,t=1）而不拖慢测试，生产仍是 19456/2。
 *
 * <p>Argon2 依赖 BouncyCastle（bcprov-jdk18on），缺它是运行期
 * {@code NoClassDefFoundError}，所以 T1 已经加了一次真实 encode 的单测。
 */
@Configuration
public class PasswordConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
    }
}
