package com.siyige.billing;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 充值 + 按对局计费。
 *
 * <p>计费模型（把「模型成本」和「服务费」分开算，用户看得懂）：
 * <pre>
 *   一场费用 = 模型成本 + 服务费
 *   模型成本 = 本场 token 数 / 1000 * 每千 token 单价
 *   服务费   = 固定一小笔（默认 0.30 元）
 * </pre>
 *
 * <p><b>四个计费参数全部后台可改</b>：第一批搬了服务费与赠送金
 * （{@code billing.service-fee-cents} / {@code billing.welcome-grant-cents}），
 * 第二批搬了单价与预估 token（{@code billing.cents-per-1k-tokens} / {@code billing.estimate-tokens}）。
 * 四个都改成每次现读，后台改完**下一场**就按新价算，不用重启 ——
 * 关键是"预扣"和"结算"必须读**同一份**配置，否则会出现"按新价冻结、按旧价结算"。
 *
 * <p>流程：开局**预扣**（按预估 token 冻结）→ 结束**结算**（按实际用量多退少补）。
 * 单人本地运行时每个进程只有一个用户在对局，token 归属用「开局/结束时的全局计数差值」，
 * 多用户并发时应改为按请求线程打标（见 settle 的注释）。
 */
@Service
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    private final WalletRepo repo;
    private final LlmClient llm;

    /**
     * 四个计费参数全部从后台参数读（参数管理第一、二批）。
     *
     * <p>它们原来都是 {@code @Value} 冻在构造期的字段，改完必须重启才生效 ——
     * 而这些值直接影响**钱**，后台改完必须立刻按新值算。
     */
    private final ConfigService cfg;

    public WalletService(WalletRepo repo, LlmClient llm, ConfigService cfg) {
        this.repo = repo;
        this.llm = llm;
        this.cfg = cfg;
    }

    /** 每千 token 收多少钱（分）。默认 3 分/千 token ≈ 0.03 元，后台可改。 */
    private long centsPer1kTokens() {
        return cfg.getInt(ConfigKey.BILLING_CENTS_PER_1K);
    }

    /** 开局预扣的预估 token（一场约 9k）。默认 9000，后台可改。 */
    private long estimateTokens() {
        return cfg.getInt(ConfigKey.BILLING_ESTIMATE_TOKENS);
    }

    /** 每场固定服务费（分）。默认 30 分 = 0.30 元，后台可改。 */
    private long serviceFeeCents() {
        return cfg.getInt(ConfigKey.BILLING_SERVICE_FEE);
    }

    /** 新用户赠送（分）。默认 100 分 = 1 元，后台可改。 */
    private long welcomeGrantCents() {
        return cfg.getInt(ConfigKey.BILLING_WELCOME_GRANT);
    }

    /** 一场的预估费用 = 预估 token 成本 + 服务费。 */
    public long estimateCents() {
        return costOf(estimateTokens()) + serviceFeeCents();
    }

    /** 模型成本：单价每次现读（同一场里预扣与结算必须读同一个函数，才不会一涨一落）。 */
    private long costOf(long tokens) {
        return (long) Math.ceil(tokens / 1000.0 * centsPer1kTokens());
    }

    public long balance(String userId) { return repo.balance(userId); }

    /**
     * 首次使用自动开钱包并赠送体验金（只送一次）。
     *
     * <p>整段放在一个事务里，由 WalletRepo.grantIfNoHistory 用行锁串起来：
     * 原来是「查历史为空 -> 送礼 -> 记一笔」，同一用户并发首次使用时两个线程都能查到空，
     * 结果是**送两次体验金**。H2 下几乎撞不上，MySQL 下很容易复现（2026-11-27 实测）。
     */
    @Transactional
    public long ensureWallet(String userId) {
        repo.ensureRow(userId);
        repo.grantIfNoHistory(userId, welcomeGrantCents(), "新用户体验金");
        return repo.balance(userId);
    }

    public Map<String, Object> recharge(String userId, long amountCents) {
        if (amountCents <= 0) throw new IllegalArgumentException("充值金额必须大于 0");
        if (amountCents > 100_000) throw new IllegalArgumentException("单次充值上限 1000 元");
        ensureWallet(userId);
        boolean ok = repo.add(userId, amountCents);
        long bal = repo.balance(userId);
        if (ok) repo.log(userId, "RECHARGE", amountCents, bal, null, "充值");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", ok);
        out.put("balanceCents", bal);
        return out;
    }

    /**
     * 开局预扣。
     *
     * @return 预扣金额；余额不足返回 -1
     */
    public long hold(String userId, String matchId) {
        ensureWallet(userId);
        long need = estimateCents();
        if (repo.balance(userId) < need) return -1L;
        if (!repo.add(userId, -need)) return -1L;
        repo.log(userId, "HOLD", -need, repo.balance(userId), matchId,
                "开局预扣（预估 " + estimateTokens() + " token + 服务费）");
        return need;
    }

    /**
     * 结算：按本场实际 token 用量算账，预扣多退少补。
     *
     * @param actualTokens 本场消耗的 token（多用户并发时应改为按对局归属统计）
     */
    public Map<String, Object> settle(String userId, String matchId, long actualTokens) {
        ensureWallet(userId);
        long used = Math.max(0, actualTokens);
        long fee = serviceFeeCents();
        long should = costOf(used) + fee;

        // 已预扣
        long held = -repo.matchNet(userId, matchId);   // 净支出（正数）
        long delta = held - should;                     // >0 应退，<0 应补
        String note = "结算：本场 " + used + " token，模型成本 " + costOf(used)
                + " 分 + 服务费 " + fee + " 分";
        if (delta > 0) {
            repo.add(userId, delta);
            repo.log(userId, "REFUND", delta, repo.balance(userId), matchId, note + "（退差额）");
        } else if (delta < 0) {
            repo.add(userId, delta);   // 余额可能不足，允许透支到 0 为止
            repo.log(userId, "SETTLE", delta, repo.balance(userId), matchId, note + "（补差额）");
        } else {
            repo.log(userId, "SETTLE", 0, repo.balance(userId), matchId, note);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tokens", used);
        out.put("modelCostCents", costOf(used));
        out.put("serviceFeeCents", fee);
        out.put("totalCents", should);
        out.put("refundCents", Math.max(0, delta));
        out.put("extraCents", Math.max(0, -delta));
        out.put("balanceCents", repo.balance(userId));
        return out;
    }

    /**
     * 用户自带 key 的结算：**全免**。
     *
     * <p>自带 Key 意味着用户可能把 baseUrl 指到自己机器上的本地模型（ollama / LM Studio），
     * 平台零成本，就不该收服务费。这里只把可能的预扣退回去，并把这一场记成 0 元流水，留痕。
     */
    public Map<String, Object> settleOwnKey(String userId, String matchId) {
        ensureWallet(userId);
        long held = -repo.matchNet(userId, matchId);
        long should = 0;
        long delta = held - should;
        String note = "结算（自带 Key）：平台零成本，本场免费";
        if (delta > 0) {
            repo.add(userId, delta);
            repo.log(userId, "REFUND", delta, repo.balance(userId), matchId, note + "（退差额）");
        } else if (delta < 0) {
            repo.add(userId, delta);
            repo.log(userId, "SETTLE", delta, repo.balance(userId), matchId, note + "（补差额）");
        } else {
            repo.log(userId, "SETTLE", 0, repo.balance(userId), matchId, note);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ownKey", true);
        out.put("tokens", 0);
        out.put("modelCostCents", 0);
        out.put("serviceFeeCents", serviceFeeCents());
        out.put("totalCents", should);
        out.put("refundCents", Math.max(0, delta));
        out.put("extraCents", Math.max(0, -delta));
        out.put("balanceCents", repo.balance(userId));
        return out;
    }

    /** 对局开始时的 token 快照（结算用差值）。 */
    public long tokenSnapshot() { return llm == null ? 0 : llm.totalTokens(); }

    public Map<String, Object> info(String userId) {
        ensureWallet(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("balanceCents", repo.balance(userId));
        out.put("estimateCents", estimateCents());
        out.put("centsPer1kTokens", centsPer1kTokens());
        out.put("serviceFeeCents", serviceFeeCents());
        out.put("estimateTokens", estimateTokens());
        out.put("welcomeGrantCents", welcomeGrantCents());
        return out;
    }

    public List<Map<String, Object>> history(String userId, int limit) {
        return repo.history(userId, Math.min(100, Math.max(1, limit)));
    }
}
