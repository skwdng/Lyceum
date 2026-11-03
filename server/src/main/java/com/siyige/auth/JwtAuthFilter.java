package com.siyige.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 社区接口的 JWT 身份过滤器（只注册在 {@code /api/community/*}）。
 *
 * <p>权限矩阵（方案 §5，逐条落实）：
 * <table border="1">
 *   <tr><th>方法 / 路径</th><th>未登录</th><th>已登录</th></tr>
 *   <tr><td>GET 任意（列表 / 详情 / 评论 / 楼中楼）</td><td>放行（liked 恒 false）</td><td>放行</td></tr>
 *   <tr><td>POST /posts/{id}/view</td><td>放行（不计数）</td><td>放行（计数）</td></tr>
 *   <tr><td>其余 POST / PATCH / DELETE</td><td><b>401 UNAUTHORIZED</b></td><td>放行</td></tr>
 * </table>
 *
 * <p>带 token 但 token 无效（签名错 / 过期 / 已登出）一律 401——哪怕是 GET，
 * 因为"你出示了一个坏身份"和"你没出示身份"不是一回事。
 *
 * <p>Redis 不可用时查不到黑名单 → 503（Q1 决策：fail-closed，不放行）。
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    private final JwtService jwt;
    private final TokenBlacklist blacklist;

    public JwtAuthFilter(JwtService jwt, TokenBlacklist blacklist) {
        this.jwt = jwt;
        this.blacklist = blacklist;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        try {
            try {
                String token = bearerToken(req);
                if (token != null) {
                    JwtService.ParsedToken parsed = jwt.parse(token);
                    if (parsed == null) throw AuthException.unauthorized();
                    if (blacklist.contains(parsed.jti())) throw AuthException.unauthorized();
                    UserContext.set(parsed.userId());
                }
                if (requiresLogin(req.getMethod(), pathOf(req)) && !UserContext.isLoggedIn()) {
                    throw AuthException.unauthorized();
                }
            } catch (AuthException e) {
                writeError(res, e);
                return;
            }
            chain.doFilter(req, res);
        } finally {
            // 线程复用必须清干净，否则下一个请求会继承上一个用户的身份
            UserContext.clear();
        }
    }

    // ---------- 规则 ----------

    /**
     * 是否需要登录。读接口一律放行；浏览计数接口匿名也放行（由 Controller 决定不计数）；
     * 其余写操作需要登录。
     */
    static boolean requiresLogin(String method, String path) {
        if (method == null) return true;
        String m = method.toUpperCase();
        if ("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m)) return false;
        if ("POST".equals(m) && path != null && path.matches(".*/posts/\\d+/view$")) return false;
        return true;
    }

    /** 去掉 contextPath 的请求路径，便于本地与 /siyige 子路径部署一致判断。 */
    static String pathOf(HttpServletRequest req) {
        String uri = req.getRequestURI() == null ? "" : req.getRequestURI();
        String ctx = req.getContextPath() == null ? "" : req.getContextPath();
        return uri.startsWith(ctx) ? uri.substring(ctx.length()) : uri;
    }

    private static String bearerToken(HttpServletRequest req) {
        String raw = req.getHeader("Authorization");
        if (raw == null) return null;
        String v = raw.trim();
        if (v.length() <= BEARER.length() || !v.regionMatches(true, 0, BEARER, 0, BEARER.length())) return null;
        String token = v.substring(BEARER.length()).trim();
        return token.isEmpty() ? null : token;
    }

    // ---------- 输出 ----------

    private static void writeError(HttpServletResponse res, AuthException e) throws IOException {
        if (res.isCommitted()) return;
        res.setStatus(e.status().value());
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String json = "{\"code\":\"" + e.code() + "\",\"message\":\"" + escape(e.getMessage()) + "\"}";
        res.getWriter().write(json);
        res.getWriter().flush();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
