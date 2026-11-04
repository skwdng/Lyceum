package com.siyige.api;

import com.siyige.auth.AuthException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/** 统一错误响应：前端只认 code，不用去猜 HTTP 500 里是什么。 */
@RestControllerAdvice
public class ApiErrors {

    /**
     * 认证/鉴权异常：401（UNAUTHORIZED / TOKEN_STALE / ACCOUNT_DISABLED）与
     * 403（FORBIDDEN：不是这场对局的人）。
     *
     * <p>没有这个 handler 的话，Controller 里 {@code UserContext.requireId()} 与
     * {@code MatchAccess.requireAccess()} 抛出的异常会掉到 Spring 默认处理 → **500**，
     * 前端就拿不到准确的 401/403 了。
     */
    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthException e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", e.code());
        out.put("message", e.getMessage());
        return ResponseEntity.status(e.status()).body(out);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> onState(IllegalStateException e) {
        return body(e.getMessage(), HttpStatus.CONFLICT);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> onArg(IllegalArgumentException e) {
        String msg = e.getMessage() == null ? "BAD_REQUEST" : e.getMessage();
        HttpStatus status = msg.startsWith("ROOM_NOT_FOUND") || msg.startsWith("对局不存在")
                ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        return body(msg, status);
    }

    private ResponseEntity<Map<String, Object>> body(String msg, HttpStatus status) {
        String code = msg == null ? "ERROR" : msg.split(":")[0];
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", msg);
        return ResponseEntity.status(status).body(out);
    }
}
