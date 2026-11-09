package com.siyige.billing;

import com.siyige.auth.UserContext;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 用户自带模型配置（BYOK）：读回掩码、保存、连通性测试。 */
@RestController
@RequestMapping("/api/llm")
public class UserLlmController {

    private final UserLlmService svc;

    public UserLlmController(UserLlmService svc) { this.svc = svc; }

    private static String uid() {
        String id = UserContext.current();
        if (id == null || id.isBlank()) throw new IllegalStateException("请先登录");
        return id;
    }

    @GetMapping("/profile")
    public Map<String, Object> get() { return svc.get(uid()); }

    /** body: {baseUrl, model, apiKey, enabled}；apiKey 传空 = 不改密钥。 */
    @PostMapping("/profile")
    public Map<String, Object> save(@RequestBody Map<String, Object> body) {
        return svc.save(uid(),
                String.valueOf(body.getOrDefault("baseUrl", "")),
                String.valueOf(body.getOrDefault("model", "")),
                String.valueOf(body.getOrDefault("apiKey", "")),
                Boolean.TRUE.equals(body.get("enabled")));
    }

    @PostMapping("/test")
    public Map<String, Object> test() { return svc.test(uid()); }
}
