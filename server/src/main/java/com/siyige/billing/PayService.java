package com.siyige.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 充值订单与支付回调。
 *
 * <p>流程（与真实支付网关一致，只是渠道换成模拟）：
 * <pre>
 *   1. 下单  POST /api/pay/orders {amountCents}      → 订单 CREATED（不入账）
 *   2. 支付  前端展示模拟收银台，用户点「我已付款」
 *   3. 回调  POST /api/pay/callback {orderId,amountCents,sign}  → 验签 + 幂等入账
 *   4. 查询  GET  /api/pay/orders/{id}              → 前端轮询状态
 * </pre>
 *
 * <p>三个必须守住的点，真接微信/支付宝时也一样：
 * <ul>
 *   <li><b>验签</b>：回调必须校验签名，否则谁都能给自己充钱</li>
 *   <li><b>金额比对</b>：回调金额必须与订单金额一致，防篡改</li>
 *   <li><b>幂等</b>：同一订单重复回调只入账一次（用状态机 CAS 更新）</li>
 * </ul>
 */
@Service
public class PayService {

    private static final Logger log = LoggerFactory.getLogger(PayService.class);

    private final JdbcTemplate jdbc;
    private final WalletService wallet;
    private final String secret;

    public PayService(JdbcTemplate jdbc, WalletService wallet,
                      @Value("${siyige.billing.pay-secret:dev-secret-change-me}") String secret) {
        this.jdbc = jdbc;
        this.wallet = wallet;
        this.secret = secret;
    }

    // ---------------- 下单 ----------------

    public Map<String, Object> createOrder(String userId, long amountCents) {
        if (amountCents <= 0) throw new IllegalArgumentException("充值金额必须大于 0");
        if (amountCents > 100_000) throw new IllegalArgumentException("单次充值上限 1000 元");

        String orderId = "O" + Instant.now().toEpochMilli() + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
        jdbc.update("insert into sy_order(id,user_id,amount_cents,status,channel) values(?,?,?,'CREATED','MOCK')",
                orderId, userId, amountCents);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderId", orderId);
        out.put("amountCents", amountCents);
        out.put("status", "CREATED");
        out.put("channel", "MOCK");
        // 模拟收银台的「回调签名」，真实场景由渠道生成，前端拿不到
        out.put("sign", sign(orderId, amountCents));
        out.put("payUrl", "/api/pay/mock-cashier?orderId=" + orderId + "&amount=" + amountCents);
        return out;
    }

    // ---------------- 回调（核心） ----------------

    /**
     * 支付回调：验签 → 校验金额 → 幂等置为 PAID → 入账。
     *
     * @return 处理结果；重复回调返回 already=true
     */
    public Map<String, Object> callback(String orderId, long amountCents, String sign, String tradeNo) {
        if (orderId == null || orderId.isBlank()) throw new IllegalArgumentException("缺少订单号");
        if (!sign(orderId, amountCents).equalsIgnoreCase(sign == null ? "" : sign.trim()))
            throw new IllegalArgumentException("签名校验失败");

        var rows = jdbc.queryForList("select * from sy_order where id=?", orderId);
        if (rows.isEmpty()) throw new IllegalArgumentException("订单不存在");
        Map<String, Object> order = rows.get(0);

        long expect = ((Number) order.get("amount_cents")).longValue();
        if (expect != amountCents) {
            log.warn("订单金额不符 order={} expect={} got={}", orderId, expect, amountCents);
            throw new IllegalArgumentException("订单金额不一致");
        }
        String status = String.valueOf(order.get("status"));
        if ("PAID".equals(status)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("already", true);
            out.put("balanceCents", wallet.balance(String.valueOf(order.get("user_id"))));
            return out;
        }
        if (!"CREATED".equals(status)) throw new IllegalArgumentException("订单状态不可支付：" + status);

        // 幂等：只有 CREATED → PAID 的那一次能拿到 1 行
        int updated = jdbc.update("""
                update sy_order set status='PAID', trade_no=?, paid_at=current_timestamp
                 where id=? and status='CREATED'
                """, tradeNo == null ? "MOCK-" + System.currentTimeMillis() : tradeNo, orderId);
        if (updated == 0) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("already", true);
            out.put("balanceCents", wallet.balance(String.valueOf(order.get("user_id"))));
            return out;
        }

        String userId = String.valueOf(order.get("user_id"));
        wallet.recharge(userId, expect);   // 走钱包统一入口（含流水）

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("already", false);
        out.put("amountCents", expect);
        out.put("balanceCents", wallet.balance(userId));
        return out;
    }

    // ---------------- 查询 ----------------

    public Map<String, Object> order(String orderId, String userId) {
        var rows = jdbc.queryForList("select * from sy_order where id=?", orderId);
        if (rows.isEmpty()) throw new IllegalArgumentException("订单不存在");
        Map<String, Object> r = rows.get(0);
        if (!String.valueOf(r.get("user_id")).equals(userId)) throw new IllegalStateException("无权查看该订单");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderId", r.get("id"));
        out.put("amountCents", ((Number) r.get("amount_cents")).longValue());
        out.put("status", r.get("status"));
        out.put("channel", r.get("channel"));
        out.put("paidAt", r.get("paid_at"));
        return out;
    }

    // ---------------- 签名 ----------------

    /** HMAC-SHA256(orderId + "|" + amount)，真实渠道换成各自的签名算法。 */
    public String sign(String orderId, long amountCents) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal((orderId + "|" + amountCents).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(raw);
        } catch (Exception e) {
            throw new IllegalStateException("签名失败", e);
        }
    }
}
