package com.siyige.billing;

import com.siyige.auth.UserContext;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** 钱包接口：余额、充值、流水。金额一律「分」。 */
@RestController
@RequestMapping("/api/wallet")
public class WalletController {

    private final WalletService wallet;

    public WalletController(WalletService wallet) { this.wallet = wallet; }

    private static String uid() {
        String id = UserContext.current();
        if (id == null || id.isBlank()) throw new IllegalStateException("请先登录");
        return id;
    }

    @GetMapping
    public Map<String, Object> info() { return wallet.info(uid()); }

    /** 充值。amountCents 单位是分（100 = 1 元）。真实支付接入前，这里直接入账。 */
    @PostMapping("/recharge")
    public Map<String, Object> recharge(@RequestBody Map<String, Object> body) {
        long cents = body.get("amountCents") instanceof Number n ? n.longValue() : 0;
        Map<String, Object> out = new LinkedHashMap<>(wallet.recharge(uid(), cents));
        out.putAll(wallet.info(uid()));
        return out;
    }

    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam(defaultValue = "20") int limit) {
        return Map.of("list", wallet.history(uid(), limit));
    }

    /** 价格说明（前端展示用，不涉及用户数据）。 */
    @GetMapping("/price")
    public Map<String, Object> price() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.putAll(wallet.info(uid()));
        out.put("explain", "一场费用 = 模型成本（按 token 实算）+ 服务费；开局预扣，结束按实际用量多退少补");
        return out;
    }
}
