package com.siyige.ai;

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

/**
 * 与 OpenAI 兼容的大模型客户端（DeepSeek / 通义 / GLM 都是这个协议）。
 * 没配 api-key 时 enabled()=false，业务侧自动走本地模板，不影响任何流程。
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final com.fasterxml.jackson.databind.ObjectMapper json = new com.fasterxml.jackson.databind.ObjectMapper();

    public LlmClient(@Value("${siyige.llm.base-url:}") String baseUrl,
                     @Value("${siyige.llm.api-key:}") String apiKey,
                     @Value("${siyige.llm.model:deepseek-chat}") String model) {
        this.baseUrl = baseUrl; this.apiKey = apiKey; this.model = model;
    }

    public boolean enabled() { return apiKey != null && !apiKey.isBlank(); }

    public String model() { return model; }

    /** 普通对话：返回纯文本。失败抛异常，由调用方降级。 */
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
        return resp.body();
    }
}
