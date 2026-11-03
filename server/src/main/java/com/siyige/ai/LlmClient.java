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

    private final String baseUrl;
    private final String apiKey;
    private final String model;

    /** 累计用量：调用次数、输入 token、输出 token */
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
                "model", model,
                "temperature", temperature,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", user))
        ));
        String content = post(body, timeoutSec);
        var root = json.readTree(content);
        return root.path("choices").path(0).path("message").path("content").asText("");
    }

    /** 结构化输出：要求模型只返回 JSON 对象。 */
    public String chatJson(String system, String user, int timeoutSec) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "model", model,
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
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl.replaceAll("/+$", "") + "/chat/completions"))
                .timeout(Duration.ofSeconds(timeoutSec))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
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
        } catch (Exception ignore) {
            // 用量统计失败不影响对局
        }
    }
}
