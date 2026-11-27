package com.siyige;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 守卫：**单测必须跑在 H2 上**。
 *
 * <p>背景：827 个测试里，凡是 @SpringBootTest 都要连数据库。现在默认 profile 恰好是 H2，
 * 所以"测试连的是什么库"这件事一直是隐式的；一旦把默认数据源切成 MySQL（切库），
 * 测试会跟着去连 MySQL —— 本地没起容器、CI 上没有 MySQL，就是整片红。
 *
 * <p>所以加了 test profile（application-test.yml：H2 + 那 16 个建表脚本），
 * 由 src/test/resources/application.properties 的 spring.profiles.active=test 自动叠加。
 * 这个测试就是确认这件事没被谁不小心改掉。
 */
@SpringBootTest
class TestProfileGuardTest {

    @Autowired
    private Environment env;

    @Autowired
    private DataSource dataSource;

    @Test
    void 单测跑在testProfile且连的是H2() throws Exception {
        assertTrue(Arrays.asList(env.getActiveProfiles()).contains("test"),
                "test profile 没生效，当前激活的 profile = " + Arrays.toString(env.getActiveProfiles())
                        + "。检查 src/test/resources/application.properties 里的 spring.profiles.active=test");

        String url;
        try (Connection c = dataSource.getConnection()) {
            url = c.getMetaData().getURL();
        }
        assertTrue(url != null && url.startsWith("jdbc:h2"),
                "单测必须连 H2（切库后测试不该连 MySQL），实际连的是：" + url);
    }
}
