package com.siyige.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/** 统一错误响应：前端只认 code，不用去猜 HTTP 500 里是什么。 */
@RestControllerAdvice
public class ApiErrors {

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
