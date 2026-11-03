package com.siyige.admin;

import com.siyige.auth.AuthException;
import com.siyige.auth.AuthState;
import com.siyige.auth.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 管理端的鉴权过滤器（**只注册在 `/api/admin/*`**）。
 *
 * <p>与社区那个 {@code JwtAuthFilter} 是**两个**过滤器、认**两套**令牌：
 * <ul>
 *   <li>这里只认 `typ=ADMIN` + `role=ADMIN` 的令牌；拿普通用户令牌来 → 403 {@code NOT_ADMIN}</li>
 *   <li>社区过滤器反过来：见到 `typ=ADMIN` 直接 401 {@code NOT_ADMIN}</li>
 * </ul>
 * 两条规则合起来保证"管理员不能用普通身份发帖、普通用户不能进后台"。
 *
 * <p>`/api/admin/auth/login` 直接放行，且**不解析**请求里可能带的旧令牌——
 * 否则一个过期的管理员令牌会把人卡在登录页外面。
 */
public class AdminAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String LOGIN_PATH = "/api/admin/auth/login";

    private final JwtService jwt;
    /** 管理员认证状态（停用 + 改密时间），一条 SQL 取回。 */
    private final AdminStatusSource adminStatus;

    public AdminAuthFilter(JwtService jwt, AdminStatusSource adminStatus) {
        this.jwt = jwt;
        this.adminStatus = adminStatus;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        try {
            String path = pathOf(req);

            // 登录口放行（不校验令牌，见类注释）
            if (LOGIN_PATH.equals(path)) {
                chain.doFilter(req, res);
                return;
            }

            try {
                String token = bearerToken(req);
                if (token == null) throw AuthException.unauthorized();

                JwtService.ParsedToken parsed = jwt.parse(token);
                if (parsed == null) throw AuthException.unauthorized();
                // 普通用户令牌不能进后台
                if (!parsed.isAdmin()) throw AuthException.notAdmin();

                long adminId = Long.parseLong(parsed.userId());
                AuthState state = adminStatus.authState(adminId);
                if (state.disabled()) throw AuthException.notAdmin();
                // 改密后，改密之前签发的管理员令牌立刻失效
                if (state.isTokenStale(parsed.issuedAt())) throw AuthException.tokenStale();

                AdminContext.set(adminId, parsed.account());
            } catch (AuthException e) {
                writeError(res, e);
                return;
            } catch (NumberFormatException e) {
                // sub 不是数字说明令牌不是本系统签的，按未登录处理
                writeError(res, AuthException.unauthorized());
                return;
            }

            chain.doFilter(req, res);
        } finally {
            AdminContext.clear();
        }
    }

    /** 去掉 contextPath 的请求路径。 */
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
