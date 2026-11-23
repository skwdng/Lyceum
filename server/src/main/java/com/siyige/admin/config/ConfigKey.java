package com.siyige.admin.config;

import java.util.ArrayList;
import java.util.List;

/**
 * 可以在后台改的参数（第一批 10 项 + 第二批 7 项）—— **白名单 + 类型 + 默认值**的唯一真源。
 *
 * <p>为什么用枚举而不是纯表驱动（设计方案 §3）：
 * <ul>
 *   <li>键名唯一：后台写不进"没人认识的脏 key"（未声明的键直接 400）；</li>
 *   <li>类型明确：布尔/整数/字符串各自有校验，不会把字符串塞进整数参数；</li>
 *   <li>默认值集中：**库里的行被删掉就回落到这里**，而这个值 = 改造前 yml / 常量的原值，
 *       所以"库里没有行"时行为与改造前逐位一致（红线 3）；</li>
 *   <li>分组/文案/范围/生效时机都跟键放在一起，前端只照着渲染，不再各自写死。</li>
 * </ul>
 *
 * <p><b>只收"每次请求 / 每次计算时才用"的值</b>：构造 bean 时读一次就冻住的东西
 * （LlmClient 的 baseUrl、数据源、Redis、端口、JWT 密钥）**不进这里**，
 * 因为改了对运行中的进程没有任何影响，写进后台只会骗人。
 *
 * <p>新增一项的口子：在这里加一行（含默认值 = 现有 yml 的值），业务侧改成
 * `cfg.getInt(ConfigKey.XXX)`，不需要改表结构。
 */
public enum ConfigKey {

    // ==================== 告警（默认值仍是 3 / 10，不趁机改成 30） ====================

    ALERT_REPORT_THRESHOLD("alert.report.threshold", Type.INT, "3", Group.ALERT,
            "举报激增阈值", "24 小时内被举报超过这个数才告警（正好等于不报）", 0, 10000, Effect.NEXT_SCAN),

    ALERT_BACKLOG_THRESHOLD("alert.backlog.threshold", Type.INT, "10", Group.ALERT,
            "举报积压阈值", "全局待处理举报超过这个数才告警", 1, 10000, Effect.NEXT_SCAN),

    // ==================== 审核 ====================

    VIDEO_AUDIT_CONSOLE("video.audit.console-enabled", Type.BOOL, "true", Group.AUDIT,
            "视频复核台开关", "关掉后管理端不能再人工过审（视频侧的开关是另一个，不在这里）", null, null, Effect.NOW),

    // ==================== AI ====================

    AI_TIER_BASIC_ENABLED("ai.tiers.basic.enabled", Type.BOOL, "false", Group.AI,
            "基础版模型是否开放", "关掉后用户只能用自己的 Key 或走高级版", null, null, Effect.NOW),

    AI_TIER_BASIC_BASE_URL("ai.tiers.basic.base-url", Type.STRING,
            "http://127.0.0.1:11434/v1", Group.AI,
            "基础版模型地址", "本地 ollama 的兼容地址，必须以 http:// 或 https:// 开头", null, null, Effect.NOW) {
        @Override
        public String extraProblem(String v) {
            return v.startsWith("http://") || v.startsWith("https://")
                    ? null : "地址要以 http:// 或 https:// 开头";
        }
    },

    AI_DAILY_LIMIT("ai.daily-limit", Type.INT, "5", Group.AI,
            "社区 @AI 每日次数", "每人每天最多问几次（0 = 一次都不给）", 0, 100, Effect.NOW),

    AI_SPEECH_ENABLED("ai.speech-enabled", Type.BOOL, "true", Group.AI,
            "AI 是否用模型说话", "关掉后 llmEnabled=false：AI 发言全部退回模板，不调模型（没有对应前端开关，只影响服务端）",
            null, null, Effect.NOW),

    // ==================== 计费 ====================

    BILLING_SERVICE_FEE("billing.service-fee-cents", Type.INT, "30", Group.BILLING,
            "每场服务费（分）", "30 = 0.30 元；下一场扣费按新值算", 0, 100000, Effect.NOW),

    BILLING_WELCOME_GRANT("billing.welcome-grant-cents", Type.INT, "100", Group.BILLING,
            "新用户赠送（分）", "100 = 1 元；只影响之后第一次开钱包的用户", 0, 100000, Effect.NOW),

    BILLING_CENTS_PER_1K("billing.cents-per-1k-tokens", Type.INT, "3", Group.BILLING,
            "模型成本单价（分/千 token）", "3 = 每千 token 收 0.03 元；下一次计价按新值算", 0, 100000, Effect.NOW),

    BILLING_ESTIMATE_TOKENS("billing.estimate-tokens", Type.INT, "9000", Group.BILLING,
            "开局预扣估算 token", "按这个数预扣，结算时多退少补", 0, 1000000, Effect.NOW),

    // ==================== 对局节奏（第二批） ====================

    PACE_TIME_SCALE("pace.time-scale", Type.DOUBLE, "0.05", Group.BATTLE,
            "对局节奏倍速", "0.05 = 演示压缩；正式环境用 1.0。只影响新算出的 deadline", 0.05, 3.0, Effect.NOW),

    PACE_TURN_SECONDS("pace.turn-seconds", Type.INT, "300", Group.BATTLE,
            "每步发言时长（秒）", "0 = 不限时；用户显式指定时长时，恰好等于这个值视为\"没指定\"", 0, 3600, Effect.NOW),

    PACE_AI_THINK_MS("pace.ai-think-ms", Type.INT, "700", Group.BATTLE,
            "AI 思考停顿下限（毫秒）", "会被倍速缩放（压到 400ms 下限）", 0, 60000, Effect.NOW),

    PACE_AI_DELAY_SCALE("pace.ai-delay-scale", Type.DOUBLE, "1.0", Group.BATTLE,
            "AI 回应间隔倍率", "1.0 = 正常；不跟 time-scale 压缩", 0.05, 5.0, Effect.NOW),

    // ==================== 社区 ====================

    TAG_MAX_PER_POST("tag.max-per-post", Type.INT, "5", Group.COMMUNITY,
            "每帖最多标签数", "发帖/改帖时校验，超了直接拒（TAG_LIMIT）", 1, 20, Effect.NOW),

    TAG_MAX_NEW_PER_DAY("tag.max-new-per-day", Type.INT, "10", Group.COMMUNITY,
            "每人每天最多新建标签数", "0 = 只允许用已有标签", 0, 100, Effect.NOW);

    /** 参数类型（决定校验与前端控件）。DOUBLE 是第二批加的（pace.time-scale 这类小数）。 */
    public enum Type { BOOL, INT, DOUBLE, STRING }

    /**
     * 分组（前端按这个分组渲染，顺序 = 枚举里的出场顺序）。
     *
     * <p>常量名用 ASCII、中文放 {@link #label()}：中文标识符虽然合法，
     * 但一旦有人用非 UTF-8 的工具链编译就会变成乱码标识符，得不偿失。
     */
    public enum Group {
        ALERT("告警"),
        AUDIT("审核"),
        AI("AI"),
        BILLING("计费"),
        COMMUNITY("社区"),
        /** 第二批（对局节奏 pace.*）才会用到，先占位，避免以后改枚举顺序。 */
        BATTLE("对局");

        private final String label;

        Group(String label) { this.label = label; }

        public String label() { return label; }
    }

    /**
     * 生效时机（前端那枚「立即生效 / 下次扫描生效」的徽标就是它）。
     *
     * <p>告警阈值是**扫描时才读**的，所以改完要等下一次扫描（或手动点一次扫描）；
     * 其余 8 项每次请求都现读，改完立刻生效。
     */
    public enum Effect {
        NOW("立即生效"),
        NEXT_SCAN("下次扫描生效");

        private final String label;

        Effect(String label) { this.label = label; }

        public String label() { return label; }
    }

    private final String key;
    private final Type type;
    private final String def;
    private final Group group;
    private final String label;
    private final String hint;
    /** 下界：INT 传整数、DOUBLE 传小数（用 Number 才不用在 17 个常量里到处写 0d / 0.05d）。 */
    private final Number min;
    private final Number max;
    private final Effect effect;

    ConfigKey(String key, Type type, String def, Group group, String label, String hint,
              Number min, Number max, Effect effect) {
        this.key = key;
        this.type = type;
        this.def = def;
        this.group = group;
        this.label = label;
        this.hint = hint;
        this.min = min;
        this.max = max;
        this.effect = effect;
    }

    /** 键名（写进 sy_config.k，也是后台接口里的 {@code key}）。 */
    public String key() { return key; }

    public Type type() { return type; }

    /** **默认值 = 改造前的原值**：库里没有行时就返回它。 */
    public String def() { return def; }

    public Group group() { return group; }

    public String label() { return label; }

    public String hint() { return hint; }

    /** 下界（INT 是整数、DOUBLE 是小数；null = 不限制）。 */
    public Number min() { return min; }

    /** 上界（同上）。 */
    public Number max() { return max; }

    public Effect effect() { return effect; }

    /**
     * 类型之外的额外校验：返回 null 表示通过，否则返回一句人话（拼在 400 的 message 里）。
     *
     * <p>默认不限制；需要"格式"的键（如 base-url）在常量体里覆写。
     */
    public String extraProblem(String v) { return null; }

    /**
     * 校验 + 归一化：把后台传进来的字符串变成**要落库的那个值**。
     *
     * @throws IllegalArgumentException `INVALID_PARAM: ...`（库里不变，见 ConfigService#set）
     */
    public String normalize(String raw) {
        String v = raw == null ? "" : raw.trim();
        String bad = "INVALID_PARAM: " + label + "（" + key + "）";
        switch (type) {
            case BOOL -> {
                if (!"true".equalsIgnoreCase(v) && !"false".equalsIgnoreCase(v)) {
                    throw new IllegalArgumentException(bad + "只能是 true 或 false");
                }
                return v.toLowerCase(java.util.Locale.ROOT);
            }
            case INT -> {
                int n;
                try {
                    n = Integer.parseInt(v);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException(bad + "必须是整数");
                }
                if (min != null && n < min.intValue()) {
                    throw new IllegalArgumentException(bad + "不能小于 " + min);
                }
                if (max != null && n > max.intValue()) {
                    throw new IllegalArgumentException(bad + "不能大于 " + max);
                }
                return String.valueOf(n);
            }
            case DOUBLE -> {
                double d;
                try {
                    d = Double.parseDouble(v);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException(bad + "必须是数字");
                }
                if (Double.isNaN(d) || Double.isInfinite(d)) {
                    throw new IllegalArgumentException(bad + "必须是有限的数字");
                }
                if (min != null && d < min.doubleValue()) {
                    throw new IllegalArgumentException(bad + "不能小于 " + min);
                }
                if (max != null && d > max.doubleValue()) {
                    throw new IllegalArgumentException(bad + "不能大于 " + max);
                }
                // 存 trim 后的原样字符串：**不**把 1 改写成 1.0（用户写的什么样，库里就是什么样）。
                // 代价：写 1 与默认值 1.0 字符串不相等，会被当成"改过"——值相同、语义相同，不值得改写输入。
                return v;
            }
            default -> {
                if (v.isEmpty()) {
                    throw new IllegalArgumentException(bad + "不能为空");
                }
                if (v.length() > 500) {
                    throw new IllegalArgumentException(bad + "太长（最多 500 字符）");
                }
                String extra = extraProblem(v);
                if (extra != null) {
                    throw new IllegalArgumentException(bad + extra);
                }
                return v;
            }
        }
    }

    /** 按键名找枚举（找不到 = 未知参数，后台接口直接 400）。 */
    public static ConfigKey of(String key) {
        for (ConfigKey k : values()) {
            if (k.key.equals(key)) return k;
        }
        throw new IllegalArgumentException("INVALID_PARAM: 未知参数 " + key);
    }

    /** 按枚举出场顺序去重后的分组名（前端直接照着分组，不用自己排序）。 */
    public static List<String> groups() {
        List<String> out = new ArrayList<>();
        for (ConfigKey k : values()) {
            if (!out.contains(k.group.label())) out.add(k.group.label());
        }
        return out;
    }
}
