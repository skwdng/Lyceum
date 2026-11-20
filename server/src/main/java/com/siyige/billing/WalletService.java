package com.siyige.billing;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
 * <p><b>服务费与赠送金后台可改</b>（参数管理第一批）：{@code billing.service-fee-cents} /
 * {@code billing.welcome-grant-cents} 改成每次现读，后台改完**下一场**就按新价算，不用重启。
 * 每千 token 单价与预估 token 本期不搬（属第二批）。
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

    /** 每千 token 收多少钱（分）。默认 3 分/千 token ≈ 0.03 元，比官方价略高一点作为毛利。 */
    private final long centsPer1kTokens;
    /** 开局预扣的预估 token（一场约 9k，留点余量）。 */
    private final long estimateTokens;
    /**
     * 服务费 / 新用户赠送从后台参数读（参数管理第一批）。
     *
     * <p>这两个字段原来也是 {@code @Value} 冻在构造期，改完必须重启才生效 ——
     * 而现在它们直接影响**钱**，后台改完必须立刻按新值算。
     */
    private final ConfigService cfg;

    public WalletService(WalletRepo repo, LlmClient llm,
                         @Value("${siyige.billing.cents-per-1k-tokens:3}") long centsPer1kTokens,
                         @Value("${siyige.billing.estimate-tokens:9000}") long estimateTokens,
                         ConfigService cfg) {
        this.repo = repo;
        this.llm = llm;
        this.centsPer1kTokens = centsPer1kTokens;
        this.estimateTokens = estimateTokens;
        this.cfg = cfg;
    }

    /** 每场固定服务费（分）。默认 30 分 = 0.30 元，后台可改。 */
    private long serviceFeeCents() {
        return cfg.getInt(ConfigKey.BILLING_SERVICE_FEE);
    }

    /** 新用户赠送（分）。默认 100 分 = 1 元，后台可改。 */
    private long welcomeGrantCents() {
        return cfg.getInt(ConfigKey.BILLING_WELCOME_GRANT);
    }

    /** 一场的预估费用 = 预估 token 成本 + 服务费（用默认预估）。 */
    public long estimateCents() {
        return estimateCents(estimateTokens);
    }

    /**
     * 按**这一场实际赛制**预估费用。
     *
     * <p>原来所有比赛都按固定 9000 token 预扣，可赛制是 17–24 步随机，
     * 实测费用在 0.6–1.7 元之间漂：估低了会中途余额不足，估高了白占用户额度。
     */
    public long estimateCents(long tokens) {
        return costOf(Math.max(0, tokens)) + serviceFeeCents();
    }

    private long costOf(long tokens) {
        return (long) Math.ceil(tokens / 1000.0 * centsPer1kTokens);
    }

    public long balance(String userId) { return repo.balance(userId); }

    /** 首次使用自动开钱包并赠送体验金（只送一次）。 */
    public long ensureWallet(String userId) {
        long bal = repo.balance(userId);
        List<Map<String, Object>> h = repo.history(userId, 5);
        if (h.isEmpty()) {
            long grant = welcomeGrantCents();
            repo.add(userId, grant);
            bal = repo.balance(userId);
            repo.log(userId, "GRANT", grant, bal, null, "新用户体验金");
        }
        return bal;
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
        return hold(userId, matchId, estimateTokens);
    }

    /** 同上，但用调用方按赛制算出来的预估 token。 */
    public long hold(String userId, String matchId, long estimateTokens) {
        ensureWallet(userId);
        long need = estimateCents(estimateTokens);
        if (repo.balance(userId) < need) return -1L;
        if (!repo.add(userId, -need)) return -1L;
        repo.log(userId, "HOLD", -need, repo.balance(userId), matchId,
                "开局预扣（预估 " + estimateTokens + " token + 服务费）");
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
        out.put("centsPer1kTokens", centsPer1kTokens);
        out.put("serviceFeeCents", serviceFeeCents());
        out.put("estimateTokens", estimateTokens);
        out.put("welcomeGrantCents", welcomeGrantCents());
        return out;
    }

    public List<Map<String, Object>> history(String userId, int limit) {
        return repo.history(userId, Math.min(100, Math.max(1, limit)));
    }
}
