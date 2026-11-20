package com.siyige.community;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 帖子标签的**业务规则唯一真源**（设计方案 §3 / 执行提示词 1.2~1.6）。
 *
 * <p>管四件事：
 * <ol>
 *   <li><b>规范化</b>：`name`（展示用，保留样子）+ `name_key`（小写去空格，唯一性用）</li>
 *   <li><b>校验</b>：长度按**码点**算 1-12、禁用字符、敏感词（命中直接拒，不打码）</li>
 *   <li><b>限额</b>：每帖 ≤5、每人每天新建 ≤10（Redis 计数，Redis 挂了就放行）；
 *       这两个数**后台可改**（{@code tag.max-per-post} / {@code tag.max-new-per-day}），改完立刻生效</li>
 *   <li><b>use_count 重算</b>：任何关联变动后重算受影响标签（禁止 +1/-1）</li>
 * </ol>
 *
 * <p>软删（sy_post.status=2）**不碰**这里的任何数据 —— 恢复后标签必须还在（红线 4）。
 */
@Service
public class TagService {

    private static final Logger log = LoggerFactory.getLogger(TagService.class);

    /** 目前只有帖子标签（表里留了 scope，将来加辩题标签不用改表）。 */
    public static final String SCOPE_POST = "POST";
    /** 名称长度：按码点算（中文/emoji 用 length() 会算错）。 */
    public static final int NAME_MIN_CP = 1;
    public static final int NAME_MAX_CP = 12;
    /** 热门标签缓存 60 秒（设计方案 §2.1）。 */
    private static final long HOT_TTL_SECONDS = 60;
    /**
     * 热门缓存只存**一份**（最多 24 条），要几个切几个。
     *
     * <p>不按 limit 分 key：否则 `?limit=12` 与 `?limit=5` 是两份缓存，
     * 标签一变就得挨个清（漏一个就出现"热门条里没有刚打的标签"）。
     * 一份 key 的好处是失效只要删一次。
     */
    private static final String HOT_KEY = "tag:hot";
    private static final int HOT_MAX = 24;

    /** 会破坏展示或 URL 的字符：井号 / at / 斜杠 / 反斜杠。 */
    private static final String FORBIDDEN_CHARS = "#@/\\";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final TagRepo repo;
    /** 敏感词检出复用它；**标签命中就拒绝，不做打码**（打码成 ＊ 没有意义）。 */
    private final SensitiveWordMasker masker;
    /** 热门标签缓存 + 每日新建配额；Redis 不可用时全部降级放行（社区其它功能也是这个原则）。 */
    private final StringRedisTemplate redis;
    /** 两个限额从后台参数读（参数管理第一批）：不再写常量，改完立刻生效。 */
    private final ConfigService cfg;
    private final ObjectMapper json = new ObjectMapper();

    public TagService(TagRepo repo, SensitiveWordMasker masker, StringRedisTemplate redis, ConfigService cfg) {
        this.repo = repo;
        this.masker = masker;
        this.redis = redis;
        this.cfg = cfg;
    }

    /** 每帖最多几个标签（每次现读后台参数）。 */
    private int maxPerPost() { return cfg.getInt(ConfigKey.TAG_MAX_PER_POST); }

    /** 每人每天最多新建几个标签（每次现读后台参数）。 */
    private int maxNewPerDay() { return cfg.getInt(ConfigKey.TAG_MAX_NEW_PER_DAY); }

    // ==================== 规范化 / 校验 ====================

    /**
     * 规范化后的标签名。
     *
     * @param name 展示名（去首尾空格、连续空格合一，保留大小写）
     * @param key  归一化键（在 name 基础上转小写；`AI` / `ai` / `Ai ` 共用它）
     */
    public record Normalized(String name, String key) { }

    /**
     * 校验并规范化一个标签名。
     *
     * @throws IllegalArgumentException `TAG_INVALID`（长度/字符/空）或 `TAG_BLOCKED`（敏感词）
     */
    public Normalized normalize(String raw) {
        String name = collapseSpaces(raw);
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("TAG_INVALID: 标签不能为空");
        }
        int cp = name.codePointCount(0, name.length());
        if (cp < NAME_MIN_CP || cp > NAME_MAX_CP) {
            throw new IllegalArgumentException("TAG_INVALID: 标签长度需 1-" + NAME_MAX_CP + " 个字符");
        }
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (Character.isISOControl(c)) {
                throw new IllegalArgumentException("TAG_INVALID: 标签不能包含控制字符");
            }
            if (FORBIDDEN_CHARS.indexOf(c) >= 0) {
                throw new IllegalArgumentException("TAG_INVALID: 标签不能包含 # @ / \\ 这些字符");
            }
        }
        // 敏感词：检出即拒（不打码）；正文的打码逻辑与本方法无关
        if (masker.mask(name).hits() > 0) {
            throw new IllegalArgumentException("TAG_BLOCKED: 标签含敏感词，请换一个");
        }
        return new Normalized(name, name.toLowerCase(java.util.Locale.ROOT));
    }

    /** 去首尾空格 + 连续空白合成一个空格；空串归一为 null（后台搜索也用它）。 */
    public static String collapseSpaces(String raw) {
        if (raw == null) return null;
        String s = raw.trim().replaceAll("[\\s\\u3000]+", " ");
        return s.isEmpty() ? null : s;
    }

    // ==================== 读（前台） ====================

    /** 输入联想：只返回用过的标签，按使用次数降序。 */
    public List<Map<String, Object>> suggest(String q, int limit) {
        String key = q == null ? null : q.trim().toLowerCase(java.util.Locale.ROOT);
        int n = Math.min(20, Math.max(1, limit));
        return publicList(repo.suggest(SCOPE_POST, key, n));
    }

    /**
     * 社区页顶部热门标签：使用次数降序，**Redis 缓存 60 秒**。
     *
     * <p>缓存失败/Redis 不可用就直接查库（列表页要能打开，不能因为缓存挂了白屏）。
     * 任何标签变动都会 {@link #invalidateHot()}，所以刚打的标签立刻能在热门条里看到。
     */
    public List<Map<String, Object>> hot(int limit) {
        int n = Math.min(HOT_MAX, Math.max(1, limit));
        List<Map<String, Object>> all = null;
        String cached = redisGet(HOT_KEY);
        if (cached != null) {
            try {
                all = json.readValue(cached, new TypeReference<List<Map<String, Object>>>() { });
            } catch (Exception e) {
                log.warn("热门标签缓存解析失败，回退查库：{}", e.toString());
            }
        }
        if (all == null) {
            all = publicList(repo.hot(SCOPE_POST, HOT_MAX));
            redisSet(HOT_KEY, toJson(all));
        }
        return all.size() > n ? new ArrayList<>(all.subList(0, n)) : all;
    }

    /** 标签有任何变动（新建/挂上/摘掉/改名/合并/删除）就清热门缓存，别让用户等 60 秒。 */
    public void invalidateHot() {
        try {
            redis.delete(HOT_KEY);
        } catch (RuntimeException e) {
            log.warn("清热门标签缓存失败（忽略，最多旧 60 秒）：{}", e.toString());
        }
    }

    /**
     * 出参统一收口：库里是 `ID / NAME / USE_COUNT`（H2 大写列名），
     * 直接吐出去前端就得猜大小写。这里固定成 `{id,name,useCount}`,
     * H2 与 MySQL 两种驱动的列名差异也一并抹平。
     */
    private static List<Map<String, Object>> publicList(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id") instanceof Number n ? n.longValue() : r.get("id"));
            m.put("name", r.get("name"));
            Object used = r.get("use_count");
            m.put("useCount", used instanceof Number n ? n.intValue() : 0);
            out.add(m);
        }
        return out;
    }

    /** 一篇帖子的标签（详情用）。 */
    public List<Map<String, Object>> tagsOfPost(long postId) {
        return repo.tagsOfPost(postId);
    }

    /** 一页帖子的标签（列表用，一次批量查）。 */
    public Map<Long, List<Map<String, Object>>> tagsByPostIds(Collection<Long> postIds) {
        return repo.tagsByPostIds(postIds);
    }

    // ==================== 写（发帖 / 编辑） ====================

    /**
     * 帖子发出去之后绑定标签。
     *
     * @param createdBy 谁创建的（用户 id；后台预置时是管理员账号）
     * @param rawNames  用户传的标签名（可空 = 不打标签，老客户端兼容）
     * @throws IllegalArgumentException `TAG_LIMIT`（超过当前上限，默认 5 个）/
     *     `TAG_INVALID` / `TAG_BLOCKED` / `TAG_QUOTA`
     */
    @Transactional
    public List<Map<String, Object>> bindPostTags(long postId, String createdBy, List<?> rawNames) {
        List<Long> tagIds = resolveTagIds(createdBy, rawNames, true);
        applyTagIds(postId, tagIds);
        return repo.tagsOfPost(postId);
    }

    /**
     * 编辑时的标签替换（**不传 tags 就不改**，PATCH 语义）。
     *
     * @param rawNames null 表示"这次不改标签"
     */
    @Transactional
    public List<Map<String, Object>> replacePostTags(long postId, String createdBy, List<?> rawNames) {
        if (rawNames == null) return repo.tagsOfPost(postId);
        List<Long> tagIds = resolveTagIds(createdBy, rawNames, true);
        applyTagIds(postId, tagIds);
        return repo.tagsOfPost(postId);
    }

    /**
     * 名字 -> 标签 id（缺的新建）。
     *
     * <p>规范化后**按 key 去重**：`AI` 和 `ai` 传两次只会有一个标签。
     */
    public List<Long> resolveTagIds(String createdBy, List<?> rawNames, boolean enforceQuota) {
        List<String> names = readNames(rawNames);
        if (names.isEmpty()) return List.of();
        int max = maxPerPost();
        if (names.size() > max) {
            // 文案里用**当前**上限：后台改成 2 之后，报错要写 2 而不是写死的 5
            throw new IllegalArgumentException("TAG_LIMIT: 每篇帖子最多 " + max + " 个标签");
        }

        List<Long> ids = new ArrayList<>(names.size());
        Set<String> seenKeys = new LinkedHashSet<>();
        for (String raw : names) {
            Normalized nz = normalize(raw);
            if (!seenKeys.add(nz.key())) continue;      // 同一个标签传两次，只算一个

            Map<String, Object> exist = repo.findByKey(SCOPE_POST, nz.key());
            if (exist != null) {
                ids.add(((Number) exist.get("id")).longValue());
                continue;
            }
            if (enforceQuota) assertQuota(createdBy);
            long id = repo.insert(SCOPE_POST, nz.name(), nz.key(), createdBy);
            if (id <= 0) {
                throw new IllegalArgumentException("INTERNAL_ERROR: 标签创建失败，请重试");
            }
            if (enforceQuota) countNewTag(createdBy);
            ids.add(id);
            log.info("新建标签 id={} name={} by={}", id, nz.name(), createdBy);
        }
        return ids;
    }

    /** 把一篇帖子的标签集合设成 {@code tagIds}（旧的减、新的加，再重算受影响标签）。 */
    @Transactional
    public void applyTagIds(long postId, List<Long> tagIds) {
        List<Long> before = repo.tagIdsOfPost(postId);

        Set<Long> target = new LinkedHashSet<>(tagIds);
        for (Long old : before) {
            if (!target.contains(old)) repo.detach(postId, old);
        }
        for (Long id : target) repo.attach(postId, id);

        // 重算：被加的、被删的都要（删掉的那个 use_count 会减回去）
        Set<Long> touched = new LinkedHashSet<>(before);
        touched.addAll(target);
        for (Long id : touched) repo.recount(id);
        invalidateHot();
    }

    /** 帖子被**彻底删除**时才会用到（软删不调用，见类注释）。 */
    @Transactional
    public void clearPostTags(long postId) {
        List<Long> before = repo.tagIdsOfPost(postId);
        repo.detachAllOfPost(postId);
        for (Long id : before) repo.recount(id);
        invalidateHot();
    }

    // ==================== 配额（Redis，挂了就放行） ====================

    private String quotaKey(String createdBy) {
        return "tag:new:" + LocalDate.now().format(DAY) + ":" + (createdBy == null ? "anon" : createdBy);
    }

    private void assertQuota(String createdBy) {
        try {
            String v = redis.opsForValue().get(quotaKey(createdBy));
            int used = v == null ? 0 : Integer.parseInt(v);
            int maxNew = maxNewPerDay();
            if (used >= maxNew) {
                throw new IllegalArgumentException(
                        "TAG_QUOTA: 今天最多新建 " + maxNew + " 个标签，明天再来");
            }
        } catch (IllegalArgumentException e) {
            throw e;                                   // 配额超限要原样抛出去
        } catch (RuntimeException e) {
            log.warn("标签配额检查失败（放行）user={}：{}", createdBy, e.toString());
        }
    }

    private void countNewTag(String createdBy) {
        try {
            String key = quotaKey(createdBy);
            redis.opsForValue().increment(key);
            redis.expire(key, 2, TimeUnit.DAYS);       // 跨天自然过期，不用定时清理
        } catch (RuntimeException e) {
            log.warn("标签配额计数失败（忽略）user={}：{}", createdBy, e.toString());
        }
    }

    // ==================== Redis 小工具（失败一律降级） ====================

    private String redisGet(String key) {
        try {
            return redis.opsForValue().get(key);
        } catch (RuntimeException e) {
            log.warn("读标签缓存失败（回退查库）key={}：{}", key, e.toString());
            return null;
        }
    }

    private void redisSet(String key, String value) {
        if (value == null) return;
        try {
            redis.opsForValue().set(key, value, HOT_TTL_SECONDS, TimeUnit.SECONDS);
        } catch (RuntimeException e) {
            log.warn("写标签缓存失败（忽略）key={}：{}", key, e.toString());
        }
    }

    private String toJson(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    // ==================== 出参形状 ====================

    /** `tags` 入参既接受 `['AI','教育']`，也接受 `[{name:'AI'}]`（前端两种都可能传）。 */
    private static List<String> readNames(List<?> raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        for (Object o : raw) {
            if (o == null) continue;
            if (o instanceof Map<?, ?> m) {
                Object n = m.get("name");
                if (n != null) out.add(String.valueOf(n));
            } else {
                out.add(String.valueOf(o));
            }
        }
        return out;
    }

    /** 供后台/测试：某个标签挂了多少篇帖子。 */
    public long countPostsOfTag(long tagId) {
        return repo.countPostsOfTag(tagId);
    }

    /** 供后台：取标签行（不存在返回 null）。 */
    public Map<String, Object> find(long tagId) {
        return repo.findById(tagId);
    }

    /** 供后台：联想/搜索都走同一套 key 归一。 */
    public String keyOf(String raw) {
        return normalize(raw).key();
    }

    /** 小工具：把 tags 行转成前端要的 `{id,name}`（去掉 use_count 等内部列）。 */
    public static List<Map<String, Object>> toView(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id") instanceof Number n ? n.longValue() : r.get("id"));
            m.put("name", r.get("name"));
            out.add(m);
        }
        return out;
    }
}
