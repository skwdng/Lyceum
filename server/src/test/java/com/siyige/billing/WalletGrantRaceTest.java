package com.siyige.billing;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 钱包并发首用的两个坑（2026-11-27 在 MySQL 上实测踩到，H2 下几乎撞不上）。
 *
 * <ol>
 *   <li><b>建行撞主键</b>：原来是「先 count 为 0 再 insert」，同一用户并发首次使用会 500，
 *       日志 {@code Duplicate entry ... for key 'sy_wallet.PRIMARY'}。
 *       现在 {@code WalletRepo.ensureRow} 吞掉 DuplicateKeyException。</li>
 *   <li><b>体验金重复赠送</b>：原来是「查历史为空 -> 送礼 -> 记一笔」，两个线程都能查到空，
 *       实测 10 个并发首用送了 10 次（金额 10 倍）。现在整段在
 *       {@code WalletRepo.grantIfNoHistory} 里加行锁 + 锁定读，只送一次。</li>
 * </ol>
 *
 * <p><b>注意这个测试的局限</b>：它跑在 H2 上，H2 的写并发窗口很小，**没修也能过**。
 * 真正的证据是 MySQL 实测（见 docs/migration-mysql/README.md §7）。这里守住的是「逻辑上只送一次」。
 */
@SpringBootTest
class WalletGrantRaceTest {

    @Autowired
    private WalletService wallet;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 多个线程同时首次使用钱包_体验金只送一次() throws Exception {
        String uid = "race" + System.nanoTime();
        int threads = 8;

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    wallet.info(uid);        // 首次使用：ensureWallet -> 建行 + 送体验金
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> f : futures) f.get(20, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        Integer grants = jdbc.queryForObject(
                "select count(*) from sy_wallet_tx where user_id = ? and kind = 'GRANT'", Integer.class, uid);
        assertEquals(1, grants, "并发首次使用只该送一次体验金，实际送了 " + grants + " 次");

        Long bal = jdbc.queryForObject(
                "select balance_cents from sy_wallet where user_id = ?", Long.class, uid);
        assertTrue(bal != null && bal >= 100, "体验金应当已入账，余额=" + bal);
        assertEquals(100L, bal, "默认体验金 100 分，重复赠送会让余额翻倍");
    }
}
