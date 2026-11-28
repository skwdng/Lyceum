package com.siyige.service;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;
import java.util.Map;

/**
 * 短链：把「房间邀请」这类长链接压成 6 位码。
 *
 * <p>为什么要它：邀请链接原样是 {@code /siyige/#/room?join=SY-7KQ2}，
 * 贴进群里又长又容易在换行处被截断；压成 {@code /s/Ab3xY9} 才好发。
 *
 * <p>三个刻意的约束：
 * <ul>
 *   <li><b>同 target 幂等</b>：反复点「复制邀请链接」不该生成一堆短码；</li>
 *   <li><b>字母表去掉 0O1lI</b>：这串码是要被人口念/手抄的；</li>
 *   <li><b>只认站内相对路径或 http(s)</b>：短链服务被拿来当开放跳板（钓鱼跳转）是常见事故，
 *       这里直接拒掉 {@code javascript:} / {@code data:} / 裸域名之类。</li>
 * </ul>
 */
@Service
public class ShortLinkService {

    /** 去掉 0/O/1/l/I 的 56 个字符（4+52 里剔除易混的 4 个）。 */
    private static final String ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnopqrstuvwxyz" + "23456789";

    private static final int CODE_LEN = 6;
    private static final int MAX_TARGET = 500;
    private static final int MAX_RETRY = 5;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    /** 一条短链：{@code code} 与累计点击 {@code hits}。 */
    public record Link(String code, int hits, String target) {}

    public ShortLinkService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 建链（同 target 幂等）。
     *
     * @throws IllegalArgumentException {@code BAD_TARGET} 目标不合法 / 超长
     */
    public Link create(String target) {
        String t = target == null ? "" : target.trim();
        validate(t);

        List<Map<String, Object>> exists = jdbc.queryForList(
                "select code, hits, target from sy_shortlink where target=? order by created_at limit 1", t);
        if (!exists.isEmpty()) {
            Map<String, Object> row = exists.get(0);
            return new Link(String.valueOf(row.get("code")), intOf(row.get("hits")), t);
        }

        for (int attempt = 0; attempt < MAX_RETRY; attempt++) {
            String code = newCode();
            try {
                jdbc.update("insert into sy_shortlink(code, target, hits) values(?,?,0)", code, t);
                return new Link(code, 0, t);
            } catch (DuplicateKeyException e) {
                // 撞码：换一个再试（6 位 56 字符够用几亿次，撞上只是概率游戏）
            }
        }
        throw new IllegalStateException("SHORTLINK_EXHAUSTED: 短码连续冲突，请稍后重试");
    }

    /**
     * 解析并计数：命中就 hits+1。
     *
     * @return 目标地址；短码不存在返回 {@code null}（由 Controller 决定 404 怎么表达）
     */
    public String resolveAndHit(String code) {
        if (code == null || code.isBlank()) return null;
        List<String> rows = jdbc.queryForList(
                "select target from sy_shortlink where code=?", String.class, code);
        if (rows.isEmpty()) return null;
        jdbc.update("update sy_shortlink set hits=hits+1 where code=?", code);
        return rows.get(0);
    }

    /** 当前 hits（建链响应里要带上，前端可能显示「已被打开 N 次」）。 */
    public int hits(String code) {
        List<Integer> rows = jdbc.queryForList(
                "select hits from sy_shortlink where code=?", Integer.class, code);
        return rows.isEmpty() || rows.get(0) == null ? 0 : rows.get(0);
    }

    /** 站内相对路径（以 / 开头）或 http(s) 绝对地址，长度 ≤ 500。 */
    static void validate(String target) {
        if (target.isEmpty()) throw new IllegalArgumentException("BAD_TARGET: 目标不能为空");
        if (target.length() > MAX_TARGET)
            throw new IllegalArgumentException("BAD_TARGET: 目标太长（上限 " + MAX_TARGET + " 字符）");
        String lower = target.toLowerCase(java.util.Locale.ROOT);
        boolean ok = lower.startsWith("http://") || lower.startsWith("https://")
                || (target.startsWith("/")            // 站内相对路径
                    && !target.startsWith("//")      // 协议相对 URL（//evil.com）是跳板，拒
                    && !lower.startsWith("/\\"));
        if (!ok) throw new IllegalArgumentException("BAD_TARGET: 只支持站内相对路径或 http(s) 地址");
    }

    private String newCode() {
        StringBuilder sb = new StringBuilder(CODE_LEN);
        for (int i = 0; i < CODE_LEN; i++) sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return sb.toString();
    }

    private static int intOf(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }
}
