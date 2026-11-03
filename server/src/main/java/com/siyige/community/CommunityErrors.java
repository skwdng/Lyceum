package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 社区专用错误体：{@code {"code":"POST_NOT_FOUND","message":"..."}}（契约 §4.4）。
 *
 * <p>为什么单开一个 advice 而不是改 {@code com.siyige.api.ApiErrors}：
 * 协作规范 §6.1 把 {@code com/siyige/api/**} 划给辩论方独占，而辩论侧也用
 * {@code IllegalArgumentException} 表达业务错误。这里用
 * {@code assignableTypes = CommunityController.class} 把作用域钉死在社区控制器上，
 * 社区的错误码 / HTTP 状态完全按契约走，辩论侧一个字都不受影响。
 *
 * <p>服务层沿用 A 仓的约定：消息形如 {@code "CODE: 中文说明"}，取冒号前为 code。
 */
@RestControllerAdvice(assignableTypes = CommunityController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CommunityErrors {

    private static final Logger log = LoggerFactory.getLogger(CommunityErrors.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> onIllegalArgument(IllegalArgumentException e) {
        String msg = e.getMessage() == null ? "INVALID_PARAM: 参数不合法" : e.getMessage();
        String code = codeOf(msg);
        HttpStatus status = switch (code) {
            case "POST_NOT_FOUND", "COMMENT_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "ALREADY_REPORTED" -> HttpStatus.CONFLICT;
            case "NOT_AUTHOR" -> HttpStatus.FORBIDDEN;
            // CONTENT_BLOCKED 已废弃（§18 R-COM-39 / D5：命中敏感词打码放行）
            default -> HttpStatus.BAD_REQUEST;
        };
        return body(code, msg, status);
    }

    /**
     * 登录相关异常（社区写接口未登录时的兜底）。
     *
     * <p>正常情况下 {@code JwtAuthFilter} 已经拦掉匿名写请求；这里兜的是
     * {@code UserContext.require()} 抛出的 401，保证即使过滤器被摘掉也不会变成 500。
     */
    @ExceptionHandler(com.siyige.auth.AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(com.siyige.auth.AuthException e) {
        return body(e.code(), e.getMessage(), e.status());
    }

    /** 兜底：未预期异常也要返回契约形状，前端按 code 分支，不必解析 Spring 默认错误页。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onOther(Exception e) {
        log.error("社区接口未预期异常", e);
        return body("INTERNAL_ERROR", "INTERNAL_ERROR: 服务异常，请重试", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private static String codeOf(String msg) {
        int i = msg.indexOf(':');
        String code = i > 0 ? msg.substring(0, i).trim() : msg.trim();
        // 不是 "CODE: ..." 形状的中文消息（B 侧历史写法）统一归到 INVALID_PARAM
        return code.matches("[A-Z][A-Z0-9_]*") ? code : "INVALID_PARAM";
    }

    private static ResponseEntity<Map<String, Object>> body(String code, String msg, HttpStatus status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", msg);
        return ResponseEntity.status(status).body(out);
    }
}
