package com.siyige.billing;

import com.siyige.ai.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 用户自带的模型配置（BYOK）。
 *
 * <p>让用户填自己的 baseUrl / model / apiKey，用他自己的额度跑对局；
 * 这样平台只收服务费，不承担模型成本，也方便用户接自己的代理或本地模型。
 *
 * <p>安全：**apiKey 只在写接口出现一次，读接口永远只回掩码**，
 * 日志里也不打完整 key。
 */
@Service
public class UserLlmService {

    private static final Logger log = LoggerFactory.getLogger(UserLlmService.class);

    private final JdbcTemplate jdbc;
    private final LlmClient llm;

    public UserLlmService(JdbcTemplate jdbc, LlmClient llm) {
        this.jdbc = jdbc;
        this.llm = llm;
    }

    /** 读取（掩码），没配过返回 enabled=false。 */
    public Map<String, Object> get(String userId) {
        var rows = jdbc.queryForList("select * from sy_user_llm where user_id=?", userId);
        Map<String, Object> out = new LinkedHashMap<>();
        if (rows.isEmpty()) {
            out.put("configured", false);
            out.put("enabled", false);
            out.put("baseUrl", "https://api.deepseek.com/v1");
            out.put("model", "deepseek-chat");
            out.put("keyMask", "");
            return out;
        }
        Map<String, Object> r = rows.get(0);
        out.put("configured", true);
        out.put("enabled", Boolean.TRUE.equals(r.get("enabled")));
        out.put("baseUrl", r.get("base_url"));
        out.put("model", r.get("model"));
        out.put("keyMask", mask(String.valueOf(r.get("api_key"))));
        return out;
    }

    /** 保存配置。apiKey 传空表示「不改 key，只改其它字段」。 */
    public Map<String, Object> save(String userId, String baseUrl, String model, String apiKey, boolean enabled) {
        String url = baseUrl == null || baseUrl.isBlank() ? "https://api.deepseek.com/v1" : baseUrl.trim();
        String m = model == null || model.isBlank() ? "deepseek-chat" : model.trim();
        if (!url.startsWith("http")) throw new IllegalArgumentException("baseUrl 必须以 http 开头");

        var rows = jdbc.queryForList("select api_key from sy_user_llm where user_id=?", userId);
        String key = (apiKey == null || apiKey.isBlank())
                ? (rows.isEmpty() ? "" : String.valueOf(rows.get(0).get("api_key")))
                : apiKey.trim();
        if (enabled && key.isBlank()) throw new IllegalArgumentException("启用自带 key 必须填写密钥");

        if (rows.isEmpty()) {
            jdbc.update("insert into sy_user_llm(user_id,base_url,model,api_key,enabled) values(?,?,?,?,?)",
                    userId, url, m, key, enabled);
        } else {
            jdbc.update("""
                    update sy_user_llm set base_url=?, model=?, api_key=?, enabled=?, updated_at=current_timestamp
                     where user_id=?
                    """, url, m, key, enabled, userId);
        }
        log.info("用户 {} 更新自带模型配置 baseUrl={} model={} enabled={}", userId, url, m, enabled);
        return get(userId);
    }

    /** 当前用户对局要用的配置（没有/未启用返回 null）。 */
    public LlmClient.Profile profileOf(String userId) {
        var rows = jdbc.queryForList(
                "select * from sy_user_llm where user_id=? and enabled=true", userId);
        if (rows.isEmpty()) return null;
        Map<String, Object> r = rows.get(0);
        String key = String.valueOf(r.get("api_key"));
        if (key.isBlank()) return null;
        return new LlmClient.Profile(String.valueOf(r.get("base_url")), key, String.valueOf(r.get("model")));
    }

    /** 连通性测试：拿用户的配置发一次极短的请求。 */
    public Map<String, Object> test(String userId) {
        LlmClient.Profile p = profileOf(userId);
        if (p == null) return Map.of("ok", false, "reason", "还没有启用自带配置");

        long t0 = System.currentTimeMillis();
        llm.useProfile(p);
        try {
            String reply = llm.chat("你是连通性测试助手，只回答两个字。", "回复「正常」", 20);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("latencyMs", System.currentTimeMillis() - t0);
            out.put("reply", reply == null ? "" : reply.trim().substring(0, Math.min(40, reply.trim().length())));
            out.put("model", p.model());
            return out;
        } catch (Exception e) {
            return Map.of("ok", false, "reason", e.getMessage() == null ? e.toString() : e.getMessage());
        } finally {
            llm.clearProfile();
        }
    }

    private static String mask(String key) {
        if (key == null || key.isBlank()) return "";
        if (key.length() <= 8) return "****";
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
