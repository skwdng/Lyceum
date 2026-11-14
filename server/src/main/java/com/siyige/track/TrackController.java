package com.siyige.track;

import com.siyige.auth.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 模块浏览上报：{@code POST /api/track/pv}，**匿名可访问**。
 *
 * <pre>
 *   POST /api/track/pv   { "module": "community" }
 *     200 { "ok": true }                       已记进 Redis
 *     200 { "ok": false }                      Redis 不可用，本次丢弃（统计可丢）
 *     400 { "code": "MODULE_NOT_ALLOWED", ... } module 不在 11 个白名单里
 * </pre>
 *
 * <p>为什么匿名也要能调：社区本来就允许匿名浏览，浏览统计不该逼人登录。
 * 做法是**不注册** {@code JwtAuthFilter}（沿用项目「不注册即匿名」的既有约定），
 * 再自己看一眼 Authorization 头做可选鉴权 —— 验不出来就当匿名，绝不报错。
 *
 * <p>不查令牌黑名单：这里只为了给 UV 记一个"是谁"，
 * 被登出的令牌最多让 UV 多算一个人次，不值得为统计多打一次 Redis。
 */
@RestController
@RequestMapping("/api/track")
public class TrackController {

    private final TrackService service;
    private final JwtService jwt;

    public TrackController(TrackService service, JwtService jwt) {
        this.service = service;
        this.jwt = jwt;
    }

    @PostMapping("/pv")
    public Map<String, Object> pv(@RequestBody(required = false) Map<String, Object> body,
                                  HttpServletRequest http) {
        Object raw = body == null ? null : body.get("module");
        boolean ok = service.record(raw == null ? null : String.valueOf(raw), optionalUserId(http));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", ok);
        return out;
    }

    /** 可选鉴权：读得到有效用户令牌就返回 userId，否则 null（匿名）。 */
    private String optionalUserId(HttpServletRequest http) {
        String header = http.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return null;
        String token = header.substring("Bearer ".length()).trim();
        if (token.isEmpty()) return null;
        try {
            JwtService.ParsedToken parsed = jwt.parse(token);
            // 管理员令牌不算用户活跃（管理台有自己的 PV 统计口径）
            return parsed != null && parsed.isUser() ? parsed.userId() : null;
        } catch (Exception e) {
            return null;      // 过期 / 伪造 / 格式不对：一律当匿名
        }
    }
}
