package com.siyige.billing;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 钱包数据访问。金额单位一律「分」（整数），不用浮点。 */
@Repository
public class WalletRepo {

    private final JdbcTemplate jdbc;

    public WalletRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }

    public long balance(String userId) {
        List<Map<String, Object>> rows =
                jdbc.queryForList("select balance_cents from sy_wallet where user_id=?", userId);
        if (rows.isEmpty()) return 0L;
        Object v = rows.get(0).get("balance_cents");
        return v instanceof Number n ? n.longValue() : 0L;
    }

    /** 加/减余额；返 false 表示减扣时余额不足。 */
    public boolean add(String userId, long deltaCents) {
        ensureRow(userId);
        if (deltaCents < 0) {
            int n = jdbc.update(
                    "update sy_wallet set balance_cents = balance_cents + ?, updated_at=current_timestamp " +
                            "where user_id=? and balance_cents + ? >= 0",
                    deltaCents, userId, deltaCents);
            return n > 0;
        }
        jdbc.update("update sy_wallet set balance_cents = balance_cents + ?, updated_at=current_timestamp where user_id=?",
                deltaCents, userId);
        return true;
    }

    /**
     * 确保钱包行存在（幂等）。返回 true 表示**这次调用真的插入了行**（首次使用）。
     *
     * <p>为什么要吞 DuplicateKeyException：原来是「先 count，为 0 再 insert」，
     * 同一用户并发首次使用时两个线程都数到 0、都去 insert，后到的撞主键 ——
     * H2 内存库因为写串行、窗口极小基本撞不上，换 MySQL 后**必现**（2026-11-27 实测：
     * 同一用户并发开 5 局，4 个 500，日志里是 Duplicate entry ... for key 'sy_wallet.PRIMARY'）。
     * 行已经在了就达到目的，忽略异常即可。
     */
    public boolean ensureRow(String userId) {
        Integer n = jdbc.queryForObject("select count(*) from sy_wallet where user_id=?", Integer.class, userId);
        if (n != null && n > 0) return false;
        try {
            jdbc.update("insert into sy_wallet(user_id, balance_cents) values(?, 0)", userId);
            return true;
        } catch (DuplicateKeyException e) {
            return false;      // 并发首次使用：另一线程刚插进去，不是我建的
        }
    }

    /**
     * 首次使用送体验金 —— **必须在一个事务里**调（配合 lockRow）。
     *
     * <p>光靠 ensureRow 的返回值不够：真正的重复赠送来自
     * 「查历史为空 -> 送礼 -> 记一笔」这段读-改-写，两个线程可以都查到空。
     * 所以这里先在钱包行上 for update 排队，再判断有没有流水。
     *
     * @return true 表示这次真的送了
     */
    @Transactional
    public boolean grantIfNoHistory(String userId, long cents, String note) {
        lockRow(userId);
        // 这一步必须是**锁定读**（for update），不能是普通 count：
        // MySQL 默认 REPEATABLE READ，事务快照在第一次普通 select 时就定了，
        // 普通 count 看不到别的线程刚提交的 GRANT 流水 -> 还是重复赠送
        // （2026-11-27 实测：10 个并发首用送了 10 次体验金）。
        List<Map<String, Object>> used = jdbc.queryForList(
                "select id from sy_wallet_tx where user_id=? limit 1 for update", userId);
        if (!used.isEmpty()) return false;
        jdbc.update("update sy_wallet set balance_cents = balance_cents + ?, updated_at=current_timestamp " +
                "where user_id=?", cents, userId);
        log(userId, "GRANT", cents, balance(userId), null, note);
        return true;
    }

    /** 在钱包行上加行锁（同一用户的并发首用在这里排队）。必须在事务内调用。 */
    public void lockRow(String userId) {
        jdbc.queryForList("select balance_cents from sy_wallet where user_id=? for update", userId);
    }

    public void log(String userId, String kind, long amountCents, long balanceAfter,
                    String matchId, String note) {
        jdbc.update("""
                insert into sy_wallet_tx(user_id,kind,amount_cents,balance_after,match_id,note)
                values(?,?,?,?,?,?)
                """, userId, kind, amountCents, balanceAfter, matchId, note);
    }

    public List<Map<String, Object>> history(String userId, int limit) {
        return jdbc.queryForList(
                        "select * from sy_wallet_tx where user_id=? order by id desc limit ?", userId, limit)
                .stream().map(WalletRepo::lower).toList();
    }

    /** 某场对局已扣/已退的净额（用于结算幂等）。 */
    public long matchNet(String userId, String matchId) {
        Long v = jdbc.queryForObject(
                "select coalesce(sum(amount_cents),0) from sy_wallet_tx where user_id=? and match_id=?",
                Long.class, userId, matchId);
        return v == null ? 0L : v;
    }
}
