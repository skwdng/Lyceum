package com.siyige.admin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 参数读写中枢：**业务代码唯一该调的地方**（别再读 yml、别再写常量）。
 *
 * <pre>
 * 业务代码 ──> ConfigService.getInt(KEY)
 *                  ├─ ① 内存 Map（命中即返回，纳秒级）
 *                  ├─ ② sy_config 表（缓存没有才查，每键最多 30 秒一次）
 *                  └─ ③ ConfigKey 枚举里的默认值（= 改造前的 yml / 常量值）
 * </pre>
 *
 * <p><b>为什么能热更</b>：Spring 单例冻住的是"对象引用"，不是"对象内部读到的数据"。
 * 所以业务侧**不许再持有 {@code @Value} 字段**，改成每次用时调 {@code getXxx()}；
 * 写操作落库后立刻 {@code cache.remove(键)}，下一次读就是新值 —— 不用重启。
 *
 * <p><b>兼容（红线 3）</b>：库里没有行 -> 用 {@link ConfigKey#def()}，而这些默认值就是改造前的原值，
 * 所以「一行不改」的行为与改造前逐位一致；要回滚某项就删掉 sy_config 里那一行。
 *
 * <p><b>多实例</b>（设计方案 §8）：本期按单实例设计（写完立刻失效）。多实例时 A 机改库、B 机缓存还是旧值，
 * 靠 {@link #TTL_MS} 兜底；要秒级一致就上 Redis pub/sub，接口不用改。
 */
@Service
public class ConfigService {

    private static final Logger log = LoggerFactory.getLogger(ConfigService.class);

    /** 缓存有效期：单实例靠写失效，这个只是多实例 / 外部改库时的兜底。 */
    static final long TTL_MS = 30_000L;

    /** 单页历史条数上限（参数页展开历史用）。 */
    static final int HISTORY_MAX = 200;

    private final ConfigRepo repo;
    private final Map<ConfigKey, String> cache = new ConcurrentHashMap<>();
    private final Map<ConfigKey, Long> loadedAt = new ConcurrentHashMap<>();

    public ConfigService(ConfigRepo repo) {
        this.repo = repo;
    }

    // ==================== 读 ====================

    public boolean getBool(ConfigKey k) {
        return Boolean.parseBoolean(raw(k).trim());
    }

    /**
     * 读整数。
     *
     * <p>库里存了坏值（有人直接改库、或某个旧版本写进去的）也不能把接口打崩：
     * 解析不了就回落枚举默认值并打 WARN —— 与设计方案 §10 的"读取失败回落默认值"一致。
     */
    public int getInt(ConfigKey k) {
        String v = raw(k);
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            log.warn("参数不是整数，回落默认值 key={} value={} default={}", k.key(), v, k.def());
            return Integer.parseInt(k.def());
        }
    }

    /**
     * 读小数（第二批加的：pace.time-scale / pace.ai-delay-scale）。
     *
     * <p>与 {@link #getInt} 同一套容错：库里被写成坏值就回落枚举默认值并打 WARN。
     */
    public double getDouble(ConfigKey k) {
        String v = raw(k);
        try {
            return Double.parseDouble(v.trim());
        } catch (NumberFormatException e) {
            log.warn("参数不是数字，回落默认值 key={} value={} default={}", k.key(), v, k.def());
            return Double.parseDouble(k.def());
        }
    }

    public String getStr(ConfigKey k) {
        return raw(k);
    }

    /**
     * 原始字符串：内存缓存 -> 库 -> 枚举默认值。
     *
     * <p>查库抛异常（表没了 / 连接断了）同样回落默认值：参数读不到不该让整个社区/对局功能不可用。
     */
    public String raw(ConfigKey k) {
        String v = cache.get(k);
        Long at = loadedAt.get(k);
        if (v != null && at != null && System.currentTimeMillis() - at < TTL_MS) {
            return v;
        }
        String fromDb;
        try {
            fromDb = repo.find(k.key());
        } catch (RuntimeException e) {
            log.warn("读参数失败，本次用默认值 key={} default={} 原因={}", k.key(), k.def(), e.toString());
            return k.def();
        }
        String value = fromDb == null ? k.def() : fromDb;
        cache.put(k, value);
        loadedAt.put(k, System.currentTimeMillis());
        return value;
    }

    /** 这个键是否被后台改过（参数页「来源」列：DB / 默认值）。 */
    public boolean fromDb(ConfigKey k) {
        try {
            return repo.find(k.key()) != null;
        } catch (RuntimeException e) {
            log.warn("判断参数来源失败，按默认值显示 key={} 原因={}", k.key(), e.toString());
            return false;
        }
    }

    // ==================== 读（参数页） ====================

    /**
     * 全部参数的视图（按枚举顺序；前端按 {@code group} 分组渲染）。
     *
     * <p>每项：key / group / label / hint / type / value / defaultValue / source /
     * min / max / effect / effectLabel / updatedBy / updatedAt。
     */
    public List<Map<String, Object>> list() {
        Map<String, Map<String, Object>> rows = repo.findAll();
        List<Map<String, Object>> items = new ArrayList<>(ConfigKey.values().length);
        for (ConfigKey k : ConfigKey.values()) {
            items.add(view(k, rows.get(k.key())));
        }
        return items;
    }

    /** 单个参数的视图（改完 / 回滚后返回给前端，省一次全量拉取）。 */
    public Map<String, Object> view(ConfigKey k) {
        Map<String, Map<String, Object>> rows = repo.findAll();
        return view(k, rows.get(k.key()));
    }

    private Map<String, Object> view(ConfigKey k, Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", k.key());
        m.put("group", k.group().label());
        m.put("label", k.label());
        m.put("hint", k.hint());
        m.put("type", k.type().name());
        m.put("value", row == null ? k.def() : String.valueOf(row.get("v")));
        m.put("defaultValue", k.def());
        // 来源：一眼看出这个参数有没有被改过（没改过 = 默认值，删掉行就回这里）
        m.put("source", row == null ? "DEFAULT" : "DB");
        m.put("sourceLabel", row == null ? "默认值" : "数据库");
        m.put("min", k.min());
        m.put("max", k.max());
        m.put("effect", k.effect().name());
        m.put("effectLabel", k.effect().label());
        m.put("updatedBy", row == null ? null : row.get("updated_by"));
        m.put("updatedAt", row == null ? null : ConfigRepo.millis(row.get("updated_at")));
        return m;
    }

    /** 分组顺序（枚举出场顺序去重）。 */
    public List<String> groups() {
        return ConfigKey.groups();
    }

    // ==================== 写 ====================

    /**
     * 后台改一个参数：**校验 -> 落库 -> 失效缓存 -> 记历史**。
     *
     * <p>校验不通过时抛 {@code INVALID_PARAM}，**库里一个字节都不变**（红线：坏值进不了库）。
     */
    @Transactional
    public Map<String, Object> set(ConfigKey k, String rawValue, String operator) {
        String value = k.normalize(rawValue);
        String old = repo.find(k.key());

        // 改回默认值 = 恢复出厂：**删掉那一行**，而不是留一行和默认相同的值。
        // 这样「来源」会回到默认值、「N 项已改过」的计数也准，且「删掉库里的行就回默认」这句话才自洽。
        if (value.equals(k.def())) {
            if (old == null) return view(k);          // 本来就是默认值：什么都不用做，也不记历史
            repo.delete(k.key());
            invalidate(k);
            repo.addLog(k.key(), old, value, operator);
            log.info("参数已恢复默认（删行） key={} {} -> {} by={}", k.key(), old, value, operator);
            return view(k);
        }

        repo.upsert(k.key(), value, k.type().name(), operator);
        invalidate(k);
        repo.addLog(k.key(), old, value, operator);
        log.info("参数已改 key={} {} -> {} by={}", k.key(), old, value, operator);
        return view(k);
    }

    /** 按字符串键改（后台接口用：键名不认识直接 400，不会写进脏 key）。 */
    @Transactional
    public Map<String, Object> set(String key, String rawValue, String operator) {
        return set(ConfigKey.of(key), rawValue, operator);
    }

    /**
     * 回滚到某一条历史。
     *
     * <p>两种情形：
     * <ol>
     *   <li>那条历史有 {@code old_v} -> 把值改回去（本身也会再记一条历史，谁回滚的也留痕）；</li>
     *   <li>{@code old_v} 为 null（改之前库里根本没有这一行）-> **删掉那一行**，
     *       于是又回到枚举默认值，等价于"回到改造前"。</li>
     * </ol>
     */
    @Transactional
    public Map<String, Object> rollback(long logId, String operator) {
        Map<String, Object> row = repo.log(logId);
        if (row == null) {
            throw new IllegalArgumentException("CONFIG_LOG_NOT_FOUND: 这条修改历史不存在（可能已被清理）");
        }
        ConfigKey k = ConfigKey.of(str(row.get("k")));
        String oldValue = str(row.get("old_v"));
        if (oldValue != null) {
            return set(k, oldValue, operator);
        }

        String current = repo.find(k.key());
        repo.delete(k.key());
        invalidate(k);
        repo.addLog(k.key(), current, k.def(), operator);
        log.info("参数回滚到默认值（删除库里的行）key={} 原值={} by={}", k.key(), current, operator);
        return view(k);
    }

    /** 修改历史（倒序）。{@code key} 为空 = 全部参数。 */
    public List<Map<String, Object>> history(String key, int limit) {
        String k = key == null || key.isBlank() ? null : ConfigKey.of(key).key();
        return ConfigRepo.logView(repo.logs(k, limit));
    }

    /** 让缓存失效（写操作 / 回滚后必须调；测试里也用它模拟"外部改了库"）。 */
    public void invalidate(ConfigKey k) {
        cache.remove(k);
        loadedAt.remove(k);
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }
}
