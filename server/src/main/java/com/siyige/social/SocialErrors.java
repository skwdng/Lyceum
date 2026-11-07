package com.siyige.social;

import com.siyige.auth.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 社交接口的错误体：{@code {"code":"NOT_FRIEND","message":"..."}}。
 *
 * <p>为什么单开一个 advice 而不是复用 {@code CommunityErrors}：后者用
 * {@code assignableTypes = CommunityController.class} 把作用域钉死在社区控制器上，
 * 社交控制器不在里面。这里照同样写法钉在 {@link SocialController} 上，
 * 两边的错误码、HTTP 状态完全各走各的，互不影响。
 *
 * <p>服务层沿用 A 仓的约定：消息形如 {@code "CODE: 中文说明"}，取冒号前为 code。
 */
@RestControllerAdvice(assignableTypes = SocialController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SocialErrors {

    private static final Logger log = LoggerFactory.getLogger(SocialErrors.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> onIllegalArgument(IllegalArgumentException e) {
        String msg = e.getMessage() == null ? "INVALID_PARAM: 参数不合法" : e.getMessage();
        String code = codeOf(msg);
        HttpStatus status = switch (code) {
            case "USER_NOT_FOUND", "REQUEST_NOT_FOUND", "CONV_NOT_FOUND", "MESSAGE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "ALREADY_FRIEND", "PENDING_EXISTS", "REQUEST_NOT_PENDING" -> HttpStatus.CONFLICT;
            case "NOT_FRIEND", "NOT_MEMBER", "NOT_REQUEST_TARGET" -> HttpStatus.FORBIDDEN;
            default -> HttpStatus.BAD_REQUEST;
        };
        return body(code, msg, status);
    }

    /**
     * 未登录的兜底（正常由过滤器拦，这里保证「过滤器被摘掉」时也不会变成 500）。
     */
    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthException e) {
        return body(e.code(), e.getMessage(), e.status());
    }

    /** 查询参数类型不对（如 {@code ?convId=abc}）：400，不能掉进兜底 500。 */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException e) {
        return body("INVALID_PARAM", "INVALID_PARAM: 参数 " + e.getName() + " 类型不对", HttpStatus.BAD_REQUEST);
    }

    /** 兜底：未预期异常也返回契约形状，前端按 code 分支，不必解析 Spring 默认错误页。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onOther(Exception e) {
        log.error("社交接口未预期异常", e);
        return body("INTERNAL_ERROR", "INTERNAL_ERROR: 服务异常，请重试", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private static String codeOf(String msg) {
        int i = msg.indexOf(':');
        String code = i > 0 ? msg.substring(0, i).trim() : msg.trim();
        return code.matches("[A-Z][A-Z0-9_]*") ? code : "INVALID_PARAM";
    }

    private static ResponseEntity<Map<String, Object>> body(String code, String msg, HttpStatus status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", msg);
        return ResponseEntity.status(status).body(out);
    }
}
