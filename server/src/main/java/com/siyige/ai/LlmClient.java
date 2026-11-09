package com.siyige.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * DeepSeek（OpenAI 兼容）客户端。
 *
 * 除了发请求，还顺手把每次调用的 token 用量累计下来，
 * 方便在 /api/usage 看「一场比赛花多少 token」。
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    /** 用户自带的模型配置（baseUrl / key / model）。为 null 表示用服务端默认。 */
    public record Profile(String baseUrl, String apiKey, String model) { }

    /** 当前线程使用的配置覆盖（按对局绑定，调用完必须清）。 */
    private static final ThreadLocal<Profile> OVERRIDE = new ThreadLocal<>();

    /** 使用用户自己的 key 跑这一轮（计费时模型成本为 0）。 */
    public void useProfile(Profile p) {
        if (p == null) OVERRIDE.remove();
        else OVERRIDE.set(p);
    }

    public void clearProfile() { OVERRIDE.remove(); }

    public boolean usingOwnKey() { return OVERRIDE.get() != null; }

    private String activeBaseUrl() {
        Profile p = OVERRIDE.get();
        return p == null ? baseUrl : (p.baseUrl() == null || p.baseUrl().isBlank() ? baseUrl : p.baseUrl());
    }

    private String activeKey() {
        Profile p = OVERRIDE.get();
        return p == null ? apiKey : (p.apiKey() == null || p.apiKey().isBlank() ? apiKey : p.apiKey());
    }

    private String activeModel() {
        Profile p = OVERRIDE.get();
        return p == null ? model : (p.model() == null || p.model().isBlank() ? model : p.model());
    }

    private final String baseUrl;
    private final String apiKey;
    private final String model;

    /** 累计用量：调用次数、输入 token、输出 token */
    /** 当前线程正在为哪一场对局调用模型（由业务侧 bind，用于精确计费）。 */
    private static final ThreadLocal<String> CURRENT_MATCH = new ThreadLocal<>();
    /** matchId → 该场合计 token */
    private final java.util.concurrent.ConcurrentHashMap<String, AtomicLong> perMatch =
            new java.util.concurrent.ConcurrentHashMap<>();

    private final AtomicLong calls = new AtomicLong();
    private final AtomicLong promptTokens = new AtomicLong();
    private final AtomicLong completionTokens = new AtomicLong();

    public LlmClient(@Value("${siyige.llm.base-url:https://api.deepseek.com/v1}") String baseUrl,
                     @Value("${siyige.llm.api-key:}") String apiKey,
                     @Value("${siyige.llm.model:deepseek-chat}") String model) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    public boolean enabled() { return apiKey != null && !apiKey.isBlank(); }

    /** 把当前线程的调用归到某一场对局；用完必须 unbind，否则账会串。 */
    public void bindMatch(String matchId) {
        if (matchId == null || matchId.isBlank()) CURRENT_MATCH.remove();
        else CURRENT_MATCH.set(matchId);
    }

    public void unbindMatch() { CURRENT_MATCH.remove(); }

    /** 某场对局消耗的 token（按对局精确归集，不靠全局差值）。 */
    public long tokensForMatch(String matchId) {
        AtomicLong v = perMatch.get(matchId);
        return v == null ? 0 : v.get();
    }

    public void clearMatchUsage(String matchId) { perMatch.remove(matchId); }

    public long calls() { return calls.get(); }
    public long promptTokensTotal() { return promptTokens.get(); }
    public long completionTokensTotal() { return completionTokens.get(); }
    public long totalTokens() { return promptTokens.get() + completionTokens.get(); }

    public void resetUsage() { calls.set(0); promptTokens.set(0); completionTokens.set(0); }

    /** 普通对话。 */
    public String chat(String system, String user, int timeoutSec) throws Exception {
        return chat(system, user, 0.8, timeoutSec);
    }

    /** 普通对话（可指定温度——每个席位人设的温度不一样）。 */
    public String chat(String system, String user, double temperature, int timeoutSec) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "model", activeModel(),
                "temperature", temperature,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user))
        ));
        String content = post(body, timeoutSec);
        var root = json.readTree(content);
        return root.path("choices").path(0).path("message").path("content").asText("");
    }

    /**
     * 普通对话（可指定温度、超时**和输出上限**）。
     *
     * <p>为什么需要这个重载：本地反代背后是**推理模型**，{@code completion_tokens} 里含思考 token。
     * {@code max_tokens} 给小了会直接拿到空 content（实测给 16 → {@code finish_reason=length} 且 content 为空）。
     * 社区 AI 用 800（思考约 300 + 回答约 300 + 余量）。
     *
     * <p>同时把 {@code finish_reason} 打进日志：{@code stop} 正常 / {@code length} 被截断 / 其它异常。
     *
     * <p>⚠️ 这个重载是**纯新增**：上面两个 {@code chat(...)} 与 {@code chatJson(...)} 的签名与行为一行都没改
     * ——辩论侧（engine / ai 席位）还在调用它们。
     */
    public String chat(String system, String user, double temperature, int timeoutSec, int maxTokens)
            throws Exception {
        String body = json.writeValueAsString(Map.of(
                "model", activeModel(),
                "temperature", temperature,
                "max_tokens", maxTokens,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user))
        ));
        String content = post(body, timeoutSec);
        var root = json.readTree(content);
        var choice = root.path("choices").path(0);
        String finish = choice.path("finish_reason").asText("");
        String text = choice.path("message").path("content").asText("");
        if ("length".equals(finish)) {
            log.warn("LLM 输出被 max_tokens 截断（maxTokens={} content 长度={}）", maxTokens, text.length());
        }
        log.debug("LLM finish_reason={} content 长度={}", finish, text.length());
        return text;
    }

    /** 结构化输出：要求模型只返回 JSON 对象。 */
    public String chatJson(String system, String user, int timeoutSec) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "model", activeModel(),
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user))
        ));
        String content = post(body, timeoutSec);
        var root = json.readTree(content);
        String text = root.path("choices").path(0).path("message").path("content").asText("");
        int a = text.indexOf('{'), b = text.lastIndexOf('}');
        if (a < 0 || b <= a) throw new IllegalStateException("LLM 没有返回 JSON");
        return text.substring(a, b + 1);
    }

    private String post(String body, int timeoutSec) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(activeBaseUrl().replaceAll("/+$", "") + "/chat/completions"))
                .timeout(Duration.ofSeconds(timeoutSec))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + activeKey())
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() / 100 != 2) {
            log.warn("LLM {} -> {}", resp.statusCode(), resp.body());
            throw new IllegalStateException("LLM HTTP " + resp.statusCode());
        }
        recordUsage(resp.body());
        return resp.body();
    }

    /** 解析 usage 并累计；解析失败不影响主流程。 */
    private void recordUsage(String body) {
        try {
            JsonNode u = json.readTree(body).path("usage");
            if (u.isMissingNode()) return;
            long p = u.path("prompt_tokens").asLong(0);
            long c = u.path("completion_tokens").asLong(0);
            long n = calls.incrementAndGet();
            long pt = promptTokens.addAndGet(p);
            long ct = completionTokens.addAndGet(c);
            log.info("LLM usage #{} prompt={} completion={} · 累计 {}/{}", n, p, c, pt, ct);
            String mid = CURRENT_MATCH.get();
            if (mid != null) {
                perMatch.computeIfAbsent(mid, k -> new AtomicLong()).addAndGet(p + c);
            }
        } catch (Exception ignore) {
            // 用量统计失败不影响对局
        }
    }
}
