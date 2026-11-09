package com.siyige.billing;

import com.siyige.auth.UserContext;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/** 支付接口：下单 / 查询 / 模拟回调。 */
@RestController
@RequestMapping("/api/pay")
public class PayController {

    private final PayService pay;

    public PayController(PayService pay) { this.pay = pay; }

    private static String uid() {
        String id = UserContext.current();
        if (id == null || id.isBlank()) throw new IllegalStateException("请先登录");
        return id;
    }

    /** 下单：只创建订单，不入账。 */
    @PostMapping("/orders")
    public Map<String, Object> createOrder(@RequestBody Map<String, Object> body) {
        long cents = body.get("amountCents") instanceof Number n ? n.longValue() : 0;
        Map<String, Object> out = new LinkedHashMap<>(pay.createOrder(uid(), cents));
        out.put("ok", true);
        return out;
    }

    @GetMapping("/orders/{id}")
    public Map<String, Object> order(@PathVariable String id) { return pay.order(id, uid()); }

    /**
     * 支付回调。
     *
     * <p>真实渠道是服务端对服务端调用；这里由前端「模拟收银台」触发，
     * 但**签名与幂等逻辑和真实回调一致**——签名不对或金额不符一律拒绝。
     */
    @PostMapping("/callback")
    public Map<String, Object> callback(@RequestBody Map<String, Object> body) {
        String orderId = String.valueOf(body.getOrDefault("orderId", ""));
        long amount = body.get("amountCents") instanceof Number n ? n.longValue() : 0;
        String sign = String.valueOf(body.getOrDefault("sign", ""));
        String tradeNo = body.get("tradeNo") == null ? null : String.valueOf(body.get("tradeNo"));
        return pay.callback(orderId, amount, sign, tradeNo);
    }

    /** 模拟收银台：真实场景这里会 302 到微信/支付宝。 */
    @GetMapping("/mock-cashier")
    public void cashier(@RequestParam String orderId, @RequestParam long amount,
                        HttpServletResponse res) throws IOException {
        res.setContentType("text/html;charset=UTF-8");
        res.getWriter().write("""
                <!doctype html><html><head><meta charset="utf-8"><title>模拟收银台</title>
                <style>body{font:15px/1.7 -apple-system,"Microsoft YaHei",sans-serif;background:#F6F4EF;
                display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
                .c{background:#fff;border:1px solid #E6E3DC;border-radius:14px;padding:28px 30px;max-width:360px;text-align:center}
                .a{font-size:30px;font-weight:700;margin:10px 0}.s{color:#8A909C;font-size:12px}
                button{margin-top:18px;width:100%;background:#2F5BEA;color:#fff;border:none;border-radius:10px;padding:12px;font-size:15px;cursor:pointer}
                </style></head><body><div class="c">
                <div class="s">模拟收银台（不会真实扣款）</div>
                <div class="a">¥%s</div>
                <div class="s">订单 %s</div>
                <button onclick="window.close()">关闭</button>
                </div></body></html>
                """.formatted(String.format("%.2f", amount / 100.0), orderId));
    }
}
