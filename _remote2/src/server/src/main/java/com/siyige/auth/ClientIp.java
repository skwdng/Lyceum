package com.siyige.auth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 取客户端 IP：优先 `X-Forwarded-For` 第一跳（只有走反向代理时才有意义），否则用 socket 地址。
 *
 * <p>用途只有一个：登录失败的**按 IP 限流**。取错了最多是限流粒度变化，不参与鉴权。
 */
public final class ClientIp {

    private ClientIp() { }

    public static String of(HttpServletRequest req) {
        if (req == null) return null;
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return req.getRemoteAddr();
    }
}
