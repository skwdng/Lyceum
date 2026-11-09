package com.siyige.billing;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

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
        ensure(userId);
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

    private void ensure(String userId) {
        Integer n = jdbc.queryForObject("select count(*) from sy_wallet where user_id=?", Integer.class, userId);
        if (n == null || n == 0) {
            jdbc.update("insert into sy_wallet(user_id, balance_cents) values(?, 0)", userId);
        }
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
