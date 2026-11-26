package com.siyige.admin.words;

import com.siyige.admin.AuditLog;
import com.siyige.admin.AuditLogRepo;
import com.siyige.community.SensitiveWordMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 屏蔽词的**读写中枢**（设计方案 §1~§4）。
 *
 * <p>三条硬约束：
 * <ol>
 *   <li><b>热点路径不查库</b>：{@link #words(WordScope)} 只读内存（{@code volatile} 不可变 Map），
 *       发帖/评论/标签每条内容都会过一遍，不能每条都 select；</li>
 *   <li><b>写完整套动作</b>：落库 → 重建缓存 → 让 {@link SensitiveWordMasker} 原子换表，
 *       所以后台改词**立刻生效**（不用重启、不用发版）；</li>
 *   <li><b>空词表不清空内存</b>：后台把 COMMUNITY 删光时，Masker 继续用旧表打码（宁可多遮，不能全裸），
 *       同时打 WARN，页面靠 {@link #summary()} 里的 {@code communityEmpty} 显示红条。</li>
 * </ol>
 *
 * <p>归属方向说明：本类在 admin 包（与 {@code admin/config} 同一套写法），被 community 的 Masker
 * 与 video 的 MachineAuditService 读用 —— 只读依赖，没有任何管理台逻辑泄漏到业务侧。
 */
@Service
public class WordService {

    private static final Logger log = LoggerFactory.getLogger(WordService.class);

    /** 单条最长 32 个码点（太长的多半是误粘贴）。 */
    public static final int MAX_WORD_CP = 32;
    /** 单批最多 500 条（防止一次粘贴几万行把页面/事务拖死）。 */
    public static final int MAX_BATCH = 500;

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final WordRepo repo;
    private final SensitiveWordMasker masker;
    private final AuditLog audit;

    /** scope -> 启用中的词（不可变）；null = 还没加载过。整体替换，读者不会看到半张表。 */
    private volatile Map<WordScope, List<String>> cache;

    public WordService(WordRepo repo, SensitiveWordMasker masker, AuditLog audit) {
        this.repo = repo;
        this.masker = masker;
        this.audit = audit;
    }

    // ==================== 读（热点路径，只读内存） ====================

    /** 某个 scope 下**启用中**的词（按 id 顺序）。第一次调用会懒加载一次。 */
    public List<String> words(WordScope scope) {
        Map<WordScope, List<String>> c = cache;
        if (c == null) c = load();
        return c.getOrDefault(scope, List.of());
    }

    /** 社区词表是不是空的（页面红条 + 启动告警都用它）。 */
    public boolean communityEmpty() {
        return words(WordScope.COMMUNITY).isEmpty();
    }

    /** 兼容语义：所有 scope 合计有多少条启用中的词。 */
    public int totalWords() {
        int n = 0;
        for (WordScope s : WordScope.values()) n += words(s).size();
        return n;
    }

    // ==================== 缓存重建 ====================

    /**
     * 从库里重建内存词表，并让 Masker 换表（写操作后必须调）。
     *
     * @return 各 scope 的启用词数
     */
    public synchronized Map<String, Object> reload() {
        Map<WordScope, List<String>> fresh = load();
        List<String> community = fresh.getOrDefault(WordScope.COMMUNITY, List.of());
        if (community.isEmpty()) {
            // 空表保护（设计方案 §3）：库里空了**不等于**不屏蔽了。
            // 逐条删光时，"上一张表"可能只剩最后一条 —— 只"保留旧表"兜不住，
            // 所以这里显式回落**文件里那份种子词表**（保命兜底），并让 source=file-fallback 可查。
            log.warn("社区词表为空（sy_sensitive_word scope=COMMUNITY 且 enabled=1 为 0 条）："
                    + "回落到 community-sensitive-words.txt 继续打码；请到管理台「屏蔽词」页补词");
            List<String> fallback = SensitiveWordMasker.seedWords();
            if (!fallback.isEmpty()) {
                masker.reload(fallback, "file-fallback");
            } else if (masker.wordCount() == 0) {
                log.error("社区词表为空且文件兜底也是空：当前发布的内容不会被任何敏感词打码！");
            }
        } else {
            masker.reload(community);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (WordScope s : WordScope.values()) out.put(s.name(), fresh.getOrDefault(s, List.of()).size());
        return out;
    }

    private Map<WordScope, List<String>> load() {
        Map<WordScope, List<String>> fresh = new EnumMap<>(WordScope.class);
        try {
            for (WordScope s : WordScope.values()) fresh.put(s, List.copyOf(repo.enabledWords(s)));
        } catch (RuntimeException e) {
            // 读库失败也不能把站点打挂：先用空表跑，下一次写/启动会再试
            log.warn("读取词表失败，本次按空表处理（不影响其它功能）：{}", e.toString());
        }
        Map<WordScope, List<String>> frozen = Collections.unmodifiableMap(fresh);
        this.cache = frozen;
        return frozen;
    }

    // ==================== 写（每个都走：校验 -> 落库 -> 重建 -> 审计） ====================

    /**
     * 批量新增。
     *
     * <p>重复（同 scope 同归一化键）**幂等跳过**并计数，不让一条重复把整批搞失败；
     * 不合法的词单独列进 {@code invalid}，页面能逐条告诉用户为什么没收。
     */
    @Transactional
    public Map<String, Object> add(WordScope scope, Collection<String> raw, long adminId, String adminName, String ip) {
        if (scope == null) throw new IllegalArgumentException("INVALID_PARAM: 缺少 scope");
        if (raw == null || raw.isEmpty()) throw new IllegalArgumentException("INVALID_PARAM: 没有要添加的词");
        if (raw.size() > MAX_BATCH) {
            throw new IllegalArgumentException("INVALID_PARAM: 一次最多 " + MAX_BATCH + " 条，本次 " + raw.size() + " 条");
        }

        List<Map<String, String>> invalid = new ArrayList<>();
        List<String[]> valid = prepare(raw, invalid);
        Set<String> existing = repo.existingKeys(scope);

        int added = 0;
        int skipped = 0;
        for (String[] pair : valid) {
            String display = pair[0];
            String key = pair[1];
            if (!existing.add(key)) { skipped++; continue; }
            try {
                repo.insert(scope, display, key, adminName);
                added++;
            } catch (DataIntegrityViolationException e) {
                // 并发下别人刚插了同一个词：当作重复跳过，别整批回滚
                skipped++;
            }
        }

        Map<String, Object> reloaded = reload();
        if (added > 0) {
            audit.record(adminId, adminName, AuditLogRepo.ACTION_WORD_ADD, null, AuditLogRepo.TARGET_WORD,
                    null, scope.name(), "屏蔽词新增 " + added + " 条（" + scope.label() + "，跳过重复 "
                            + skipped + " 条，不合法 " + invalid.size() + " 条）", ip);
        }
        log.info("屏蔽词新增 scope={} added={} skipped={} invalid={} by={}",
                scope, added, skipped, invalid.size(), adminName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scope", scope.name());
        out.put("added", added);
        out.put("skipped", skipped);
        out.put("invalid", invalid);
        out.put("counts", reloaded);
        return out;
    }

    /**
     * 粘贴导入：换行 / 英文逗号 / 中文逗号 / 顿号 都当分隔符。
     *
     * <p>与 {@link #add} 同一条路（同一套校验、幂等、审计），只是先把一大段文本切开。
     */
    @Transactional
    public Map<String, Object> importText(WordScope scope, String text, long adminId, String adminName, String ip) {
        if (text == null || text.isBlank()) throw new IllegalArgumentException("INVALID_PARAM: 没有要导入的内容");
        List<String> parts = new ArrayList<>();
        for (String line : text.split("\\R")) {
            for (String piece : line.split("[,，、]")) {
                if (!piece.isBlank()) parts.add(piece);
            }
        }
        if (parts.isEmpty()) throw new IllegalArgumentException("INVALID_PARAM: 没有识别到任何词（空行不算）");
        if (parts.size() > MAX_BATCH) {
            throw new IllegalArgumentException("INVALID_PARAM: 一次最多 " + MAX_BATCH + " 条，本次 " + parts.size() + " 条");
        }
        return add(scope, parts, adminId, adminName, ip);
    }

    /**
     * 启动导入（{@link WordBootstrap} 用）：只把**表里还没有**的词补进去，幂等、不写审计。
     *
     * <p>与 {@link #add} 共用同一套校验与归一化，区别只有两点：没有管理员上下文（createdBy 记来源），
     * 以及**不写 sy_audit_log**（启动期导入不是「某人干了什么」）。
     *
     * @return 实际写入条数
     */
    @Transactional
    public int seed(WordScope scope, Collection<String> raw, String createdBy) {
        if (raw == null || raw.isEmpty()) return 0;
        List<Map<String, String>> invalid = new ArrayList<>();
        List<String[]> valid = prepare(raw, invalid);
        Set<String> existing = repo.existingKeys(scope);
        int added = 0;
        for (String[] pair : valid) {
            if (!existing.add(pair[1])) continue;
            try {
                repo.insert(scope, pair[0], pair[1], createdBy);
                added++;
            } catch (DataIntegrityViolationException e) {
                // 唯一索引兜底：重复就跳过，绝不因为一条重复让启动失败
            }
        }
        return added;
    }

    /** 某个 scope 下有多少条（含停用的）—— 启动时判断要不要导入种子。 */
    public long countAll(WordScope scope) {
        return repo.count(scope);
    }

    /** 启停：停用后不参与匹配（各 scope 都是），历史内容不回滚。 */
    @Transactional
    public Map<String, Object> setEnabled(long id, boolean enabled, long adminId, String adminName, String ip) {
        Map<String, Object> row = repo.findById(id);
        if (row == null) throw new IllegalArgumentException("WORD_NOT_FOUND: 这个词不存在（可能已被删除）");
        WordScope scope = WordScope.of(String.valueOf(row.get("scope")));
        repo.setEnabled(id, enabled);
        reload();
        audit.record(adminId, adminName, AuditLogRepo.ACTION_WORD_TOGGLE, enabled ? "ENABLE" : "DISABLE",
                AuditLogRepo.TARGET_WORD, id, String.valueOf(row.get("word")),
                "屏蔽词" + (enabled ? "启用" : "停用") + "「" + row.get("word") + "」（" + scope.label() + "）", ip);
        log.info("屏蔽词{} id={} word={} by={}", enabled ? "启用" : "停用", id, row.get("word"), adminName);
        return repo.findById(id);
    }

    /** 删除：硬删（词表没有「历史内容回滚」的概念，删了就是以后不再命中）。 */
    @Transactional
    public Map<String, Object> delete(long id, long adminId, String adminName, String ip) {
        Map<String, Object> row = repo.findById(id);
        if (row == null) throw new IllegalArgumentException("WORD_NOT_FOUND: 这个词不存在（可能已被删除）");
        WordScope scope = WordScope.of(String.valueOf(row.get("scope")));
        repo.delete(id);
        reload();
        audit.record(adminId, adminName, AuditLogRepo.ACTION_WORD_DELETE, null, AuditLogRepo.TARGET_WORD,
                id, String.valueOf(row.get("word")),
                "屏蔽词删除「" + row.get("word") + "」（" + scope.label() + "）", ip);
        log.info("屏蔽词删除 id={} word={} by={}", id, row.get("word"), adminName);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("deleted", true);
        return out;
    }

    // ==================== 列表 / 汇总 / 导出（后台页面用） ====================

    public Map<String, Object> list(String scopeRaw, String q, int page, int size) {
        WordScope scope = WordScope.ofOrNull(scopeRaw);
        int p = Math.max(1, page);
        int s = Math.min(200, Math.max(1, size));
        long total = repo.countList(scope, q);
        List<Map<String, Object>> items = total == 0
                ? List.of()
                : views(repo.list(scope, q, (p - 1) * s, s));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        out.put("pages", Math.max(1, (total + s - 1) / s));
        out.put("scope", scope == null ? null : scope.name());
        return out;
    }

    /** 各 scope 的词数 + 最近一次变更（页面头部与红条判定）。 */
    public Map<String, Object> summary() {
        Map<WordScope, long[]> counts = repo.counts();
        List<Map<String, Object>> scopes = new ArrayList<>();
        for (WordScope s : WordScope.values()) {
            long[] c = counts.getOrDefault(s, new long[]{0, 0});
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("scope", s.name());
            m.put("label", s.label());
            m.put("effect", s.effect());
            m.put("enabled", c[0]);
            m.put("disabled", c[1]);
            m.put("total", c[0] + c[1]);
            m.put("lastChangedAt", repo.lastChangedAt(s));
            m.put("lastChangedBy", repo.lastChangedBy(s));
            scopes.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scopes", scopes);
        out.put("communityEmpty", communityEmpty());
        out.put("maskedBy", masker.source());
        return out;
    }

    /** 导出 txt：`#` 注释头 + 一行一个（只导启用的）。 */
    public String export(WordScope scope) {
        List<String> words = repo.wordsForExport(scope);
        StringBuilder sb = new StringBuilder();
        sb.append("# 屏蔽词导出 scope=").append(scope.name())
                .append("（").append(scope.label()).append("，命中后果：").append(scope.effect()).append("）\n");
        sb.append("# 导出于 ").append(LocalDateTime.now().format(TS)).append("，共 ").append(words.size()).append(" 条\n");
        sb.append("# 本文件可直接粘回后台「屏蔽词」页导入（# 开头的行会被忽略）\n");
        for (String w : words) sb.append(w).append('\n');
        return sb.toString();
    }

    // ==================== 校验与归一化 ====================

    /**
     * 校验 + 归一化。
     *
     * <p>规则（设计方案 §4）：码点 1..32；不能是空白；不能是纯符号（至少含一个字母/数字/汉字）；
     * 归一化 = trim + 英文小写（中文原样）。
     *
     * @param invalid 收集「为什么不收」，格式 {word, reason}
     * @return 通过校验的 {展示名, 归一化键}
     */
    private static List<String[]> prepare(Collection<String> raw, List<Map<String, String>> invalid) {
        List<String[]> ok = new ArrayList<>(raw.size());
        for (String w : raw) {
            String display = w == null ? "" : w.strip();
            if (display.isEmpty()) {
                invalid.add(reason(w == null ? "" : w, "空白"));
                continue;
            }
            int cp = display.codePointCount(0, display.length());
            if (cp > MAX_WORD_CP) {
                invalid.add(reason(display, "超过 " + MAX_WORD_CP + " 个字符"));
                continue;
            }
            if (!hasWordChar(display)) {
                invalid.add(reason(display, "纯符号或无意义字符"));
                continue;
            }
            // 批内重复**不在这里去重**：交给 add/seed 里那一份 existing.add(key) 统一算「跳过」，
            // 这样「库里有」和「同一批里重了」在出参里是同一个口径（skipped）
            ok.add(new String[]{display, display.toLowerCase(Locale.ROOT)});
        }
        return ok;
    }

    private static boolean hasWordChar(String s) {
        return s.codePoints().anyMatch(c -> Character.isLetterOrDigit(c));
    }

    private static Map<String, String> reason(String word, String why) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("word", word);
        m.put("reason", why);
        return m;
    }

    private static List<Map<String, Object>> views(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>(r);
            WordScope s = WordScope.ofOrNull(String.valueOf(r.get("scope")));
            m.put("scopeLabel", s == null ? r.get("scope") : s.label());
            m.put("effect", s == null ? null : s.effect());
            out.add(m);
        }
        return out;
    }
}
