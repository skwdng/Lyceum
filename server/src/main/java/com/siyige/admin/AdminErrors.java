package com.siyige.admin;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理端的统一错误体：{@code {"code":"...","message":"..."}}。
 *
 * <p>作用域用 {@code basePackages = "com.siyige.admin"} 钉死，只覆盖管理端控制器；
 * 社区（`CommunityErrors`）与用户认证（`AuthErrors`）各有自己的 advice，互不影响。
 */
@RestControllerAdvice(basePackages = "com.siyige.admin")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AdminErrors {

    private static final Logger log = LoggerFactory.getLogger(AdminErrors.class);

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthException e) {
        return body(e.code(), e.getMessage(), e.status());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onUnreadable(HttpMessageNotReadableException e) {
        return body("INVALID_PARAM", "INVALID_PARAM: 请求体格式不正确", HttpStatus.BAD_REQUEST);
    }

    /**
     * 业务校验失败（沿用社区那套 `CODE: message` 约定）。
     *
     * <p>社区侧的错误码在 `CommunityErrors` 里映射 HTTP 状态；管理端这边自己映射一份，
     * 免得为了一个 404 去改社区的 advice。
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> onIllegalArgument(IllegalArgumentException e) {
        String msg = e.getMessage() == null ? "INVALID_PARAM: 参数不合法" : e.getMessage();
        int colon = msg.indexOf(':');
        String code = colon > 0 ? msg.substring(0, colon).trim() : "INVALID_PARAM";
        HttpStatus status = switch (code) {
            case "REPORT_NOT_FOUND", "USER_NOT_FOUND", "AUDIT_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            // 恢复类冲突一律 409：ALREADY_RESTORED 表示已经撤销过，NOT_RESTORABLE 表示没东西可恢复
            case "ALREADY_REPORTED", "ALREADY_RESTORED", "NOT_RESTORABLE" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        return body(code, msg, status);
    }

    /** 查询参数类型不对（如 {@code ?page=abc}）：400，不要掉进兜底 500。 */
    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(Exception e) {
        return body("INVALID_PARAM", "INVALID_PARAM: 参数类型不对", HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onOther(Exception e) {
        log.error("管理接口未预期异常", e);
        return body("INTERNAL_ERROR", "INTERNAL_ERROR: 服务异常，请重试", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    static ResponseEntity<Map<String, Object>> body(String code, String message, HttpStatus status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", message);
        return ResponseEntity.status(status).body(out);
    }
}
