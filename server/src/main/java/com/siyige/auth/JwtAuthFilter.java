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
 * JWT 身份过滤器。同一个类注册多个实例，用 {@link Scope} 区分路径组的登录策略。
 *
 * <p>权限矩阵：
 * <table border="1">
 *   <tr><th>Scope（注册在哪些路径）</th><th>未登录</th><th>已登录</th></tr>
 *   <tr><td>{@link Scope#COMMUNITY}（{@code /api/community/*}）</td>
 *       <td>GET 放行；写操作 401</td><td>放行</td></tr>
 *   <tr><td>{@link Scope#DEBATE}（{@code /api/matches/**}、{@code /api/records}、
 *       {@code /api/diag}、{@code /api/rooms/**}）</td>
 *       <td><b>一律 401</b>（连 GET 详情、SSE 都要登录）</td><td>放行</td></tr>
 *   <tr><td>{@link Scope#DEBATE_WRITE}（{@code /api/topics/audit}、{@code /api/hot/*}）</td>
 *       <td>写操作 401，读放行</td><td>放行</td></tr>
 * </table>
 *
 * <p>匿名可访问的辩论侧接口（{@code /api/health}、{@code /api/topics}、{@code /api/hot}、
 * {@code /api/format}）**根本不注册过滤器** —— 靠"不注册"而不是"注册了再放行"，
 * 少一层容易写错的判断。
 *
 * <p>带 token 但 token 无效（签名错 / 过期 / 已登出 / 已改密 / 已被封禁）一律 401——
 * 哪怕是 GET，因为"你出示了一个坏身份"和"你没出示身份"不是一回事。
 *
 * <p>Redis 不可用时查不到黑名单 → 503（Q1 决策：fail-closed，不放行）。
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    /**
     * 过滤器策略。一个类，三种注册：
     *
     * <ul>
     *   <li>{@link #COMMUNITY} —— 社区：读放行、写要登录（社区契约的既有行为）</li>
     *   <li>{@link #DEBATE} —— 辩论主体：**全部**要登录（含 GET 详情 / SSE）</li>
     *   <li>{@link #DEBATE_WRITE} —— 辩论侧的"内容类写接口"：只有写操作要登录</li>
     * </ul>
     */
    public enum Scope {
        COMMUNITY,
        DEBATE,
        DEBATE_WRITE
    }

    private final JwtService jwt;
    private final TokenBlacklist blacklist;
    /** 全站封禁 + 改密校验：每个带 token 的请求查一次 sy_user（不加缓存，决策 8）。 */
    private final UserStatusSource userStatus;
    private final Scope scope;

    /** 社区行为（既有调用方与测试都走这个构造器）。 */
    public JwtAuthFilter(JwtService jwt, TokenBlacklist blacklist, UserStatusSource userStatus) {
        this(jwt, blacklist, userStatus, Scope.COMMUNITY);
    }

    public JwtAuthFilter(JwtService jwt, TokenBlacklist blacklist, UserStatusSource userStatus, Scope scope) {
        this.jwt = jwt;
        this.blacklist = blacklist;
        this.userStatus = userStatus;
        this.scope = scope == null ? Scope.COMMUNITY : scope;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = pathOf(req);
        try {
            try {
                String token = bearerToken(req, path);
                if (token != null) {
                    JwtService.ParsedToken parsed = jwt.parse(token);
                    if (parsed == null) throw AuthException.unauthorized();
                    // 管理员令牌不认：出示了类型不对的身份 = 401，不能当匿名放行，
                    // 否则管理员就能以普通用户身份发帖 / 点赞 / 打对局（权限串线）。
                    if (!parsed.isUser()) {
                        throw scope == Scope.COMMUNITY
                                ? AuthException.notAdminOnCommunity()
                                : AuthException.notAdminOnDebate();
                    }
                    if (blacklist.contains(parsed.jti())) throw AuthException.unauthorized();
                    // 一次查询同时拿到「封禁」与「改密时间」，不查两次库（用户决策 1）
                    AuthState state = userStatus.authState(parsed.userId());
                    if (state.disabled()) throw AuthException.accountDisabled();
                    // 改密后所有旧令牌立刻失效（iat 早于 pwd_changed_at）
                    if (state.isTokenStale(parsed.issuedAt())) throw AuthException.tokenStale();
                    UserContext.set(parsed.userId());
                }
                if (needsLogin(req.getMethod(), path) && !UserContext.isLoggedIn()) {
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

    /** 这个 scope 下的路径，这个方法的请求要不要登录。 */
    boolean needsLogin(String method, String path) {
        return switch (scope) {
            case COMMUNITY -> requiresLogin(method, path);
            // 辩论主体：GET 详情、GET /events 也一样要登录
            case DEBATE -> true;
            // 内容类写接口：只拦写
            case DEBATE_WRITE -> !isReadMethod(method);
        };
    }

    /**
     * 社区策略：读接口一律放行；浏览计数接口匿名也放行（由 Controller 决定不计数）；
     * 其余写操作需要登录。
     */
    static boolean requiresLogin(String method, String path) {
        if (method == null) return true;
        if (isReadMethod(method)) return false;
        if ("POST".equalsIgnoreCase(method) && path != null && path.matches(".*/posts/\\d+/view$")) {
            return false;
        }
        return true;
    }

    static boolean isReadMethod(String method) {
        if (method == null) return false;
        String m = method.toUpperCase();
        return "GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m);
    }

    /** 去掉 contextPath 的请求路径，便于本地与 /siyige 子路径部署一致判断。 */
    static String pathOf(HttpServletRequest req) {
        String uri = req.getRequestURI() == null ? "" : req.getRequestURI();
        String ctx = req.getContextPath() == null ? "" : req.getContextPath();
        return uri.startsWith(ctx) ? uri.substring(ctx.length()) : uri;
    }

    /**
     * 取令牌：正常走 `Authorization: Bearer`；
     * **只对 SSE 端点**回退读查询参数 `?token=`。
     *
     * <p>为什么需要回退：浏览器 `EventSource` 不支持自定义请求头，带不了 Authorization。
     * 为什么**只**给 `/events`（方案 §1.2 的取舍）：令牌进 URL 会留在访问日志与浏览器历史里，
     * 把暴露面压到最小 —— 其它任何接口都只认请求头。
     */
    private static String bearerToken(HttpServletRequest req, String path) {
        String raw = req.getHeader("Authorization");
        if (raw == null && path != null && path.endsWith("/events")) {
            String q = req.getParameter("token");
            if (q != null && !q.isBlank()) raw = BEARER + q.trim();
        }
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
