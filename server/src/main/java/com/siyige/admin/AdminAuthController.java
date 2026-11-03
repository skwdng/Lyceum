package com.siyige.admin;

import com.siyige.auth.AuthException;
import com.siyige.auth.ClientIp;
import com.siyige.auth.JwtService;
import com.siyige.auth.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理员登录 + 改密（独立于用户登录的 `/api/auth/login`）。
 *
 * <pre>
 *   POST  /api/admin/auth/login     {account,password}            -> {token}   // typ=ADMIN, role=ADMIN
 *   PATCH /api/admin/auth/password  {oldPassword,newPassword}     -> 204
 * </pre>
 *
 * <p>限流用**管理端专用**的那套计数器（`adm:` 前缀），与用户登录失败次数完全隔离。
 *
 * <p>两个端点的鉴权方式不同，别看混了：
 * <ul>
 *   <li>`login`：{@link AdminAuthFilter} 里**明确放行**，不需要令牌（它也不解析请求里带的旧令牌）</li>
 *   <li>`password`：**不走放行名单**，由过滤器先验令牌；能进到这里说明已经认证过，
 *       身份直接取 {@link AdminContext#requireId()}——不接受请求体里自报的 id</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private static final Logger log = LoggerFactory.getLogger(AdminAuthController.class);

    private final AdminAuthService auth;
    private final JwtService jwt;
    private final LoginRateLimiter limiter;

    public AdminAuthController(AdminAuthService auth, JwtService jwt,
                               @Qualifier("adminLoginRateLimiter") LoginRateLimiter limiter) {
        this.auth = auth;
        this.jwt = jwt;
        this.limiter = limiter;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody(required = false) AdminDtos.AdminLoginRequest req,
                                     HttpServletRequest http) {
        String account = AdminAuthService.normalize(req == null ? null : req.account());
        String ip = ClientIp.of(http);

        // 先看是否已被锁（Redis 不可用 -> 503，不放行）
        limiter.assertAllowed(account, ip);

        try {
            AdminDtos.AdminView admin = auth.login(req);
            limiter.onSuccess(account);
            Map<String, Object> out = new LinkedHashMap<>();
            // 只回 token：管理员视图里的 id / account 不对外暴露，后台不需要
            out.put("token", jwt.issueAdmin(String.valueOf(admin.id()), admin.account()));
            log.info("管理员登录成功 account={}", admin.account());
            return out;
        } catch (AuthException e) {
            if ("BAD_CREDENTIALS".equals(e.code())) {
                limiter.onFailure(account, ip);
            }
            throw e;
        }
    }

    /**
     * 管理员改密：`{oldPassword,newPassword}` → **204**。
     *
     * <p>改完该管理员**所有旧令牌立刻失效**（含当前这个）——前端收到 204 后要清
     * `sy_admin_jwt` 回登录页。错误：400 `INVALID_PARAM`（旧密码不正确 / 新密码不合规 /
     * 新旧相同）或 401（令牌过期 / `TOKEN_STALE`）。
     *
     * <p>这里**不写审计**：审计只记举报处理与恢复（用户决策 2）。
     */
    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(
            @RequestBody(required = false) AdminDtos.ChangeAdminPasswordRequest req) {
        auth.changePassword(AdminContext.requireId(),
                req == null ? null : req.oldPassword(),
                req == null ? null : req.newPassword());
        return ResponseEntity.noContent().build();
    }
}
