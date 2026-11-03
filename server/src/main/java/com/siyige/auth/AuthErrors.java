package com.siyige.auth;

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
 * 认证模块的错误体：{@code {"code":"BAD_CREDENTIALS","message":"..."}}。
 *
 * <p>作用域用 {@code assignableTypes = AuthController.class} 钉死，不碰社区与辩论侧的
 * 错误处理；也不修改 {@code api/ApiErrors}（那个归辩论方）。
 */
@RestControllerAdvice(assignableTypes = AuthController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthErrors {

    private static final Logger log = LoggerFactory.getLogger(AuthErrors.class);

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthException e) {
        return body(e.code(), e.getMessage(), e.status());
    }

    /** 请求体不是合法 JSON / 字段类型不符：按参数错误处理，不要暴露框架细节。 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onUnreadable(HttpMessageNotReadableException e) {
        return body("INVALID_PARAM", "INVALID_PARAM: 请求体格式不正确", HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onOther(Exception e) {
        log.error("认证接口未预期异常", e);
        return body("INTERNAL_ERROR", "INTERNAL_ERROR: 服务异常，请重试", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private static ResponseEntity<Map<String, Object>> body(String code, String message, HttpStatus status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", message);
        return ResponseEntity.status(status).body(out);
    }
}
