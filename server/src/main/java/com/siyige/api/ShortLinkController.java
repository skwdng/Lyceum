package com.siyige.api;

import com.siyige.service.ShortLinkService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 短链接口：建链（POST /api/shortlinks）+ 跳转（GET /s/{code}）。
 *
 * <p><b>子路径部署</b>：线上挂在 {@code /siyige/} 下，反代会剥掉前缀，所以这里的路由写相对路径
 * {@code /s/{code}}，不写死 {@code /siyige/s/{code}}。回给前端的 {@code url} 才需要带上
 * basePath —— 从 {@code X-Forwarded-Prefix} 取，没有就当根路径。
 */
@RestController
public class ShortLinkController {

    private final ShortLinkService shortLinks;

    public ShortLinkController(ShortLinkService shortLinks) {
        this.shortLinks = shortLinks;
    }

    /** 建链：同 target 重复请求返回同一个 code。 */
    @PostMapping("/api/shortlinks")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest req) {
        String target = body == null || body.get("target") == null ? "" : String.valueOf(body.get("target"));
        ShortLinkService.Link link = shortLinks.create(target);

        String path = "/s/" + link.code();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", link.code());
        out.put("path", path);
        out.put("url", absolute(req, path, link.target()));
        out.put("hits", link.hits());
        return out;
    }

    /** 跳转：302 到 target，并把 hits+1；未知短码 404（不落到 ApiErrors，因为它在 api 包外）。 */
    @GetMapping("/s/{code}")
    public ResponseEntity<Map<String, Object>> go(@PathVariable String code) {
        String target = shortLinks.resolveAndHit(code);
        if (target == null) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "SHORTLINK_NOT_FOUND");
            err.put("message", "短链不存在或已失效");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, target)
                .build();
    }

    /** 按请求头拼绝对地址：反代场景下 scheme/host/前缀都可能在 X-Forwarded-* 里。 */
    private static String absolute(HttpServletRequest req, String path, String target) {
        String proto = firstNonBlank(req.getHeader("X-Forwarded-Proto"), req.getScheme(), "http");
        String host = firstNonBlank(req.getHeader("X-Forwarded-Host"), req.getHeader("Host"),
                req.getServerName() + ":" + req.getServerPort());
        String prefix = req.getHeader("X-Forwarded-Prefix");     // 例如 /siyige；没有就是空
        // 反代没带 X-Forwarded-Prefix 时，从 target 自己推断子路径前缀：
        // 前端传的是 /siyige/v2/#/room?...，说明站点挂在 /siyige 下，短链也必须带这段前缀。
        if (prefix == null || prefix.isBlank()) {
            if (target != null && target.startsWith("/siyige/")) prefix = "/siyige";
        }
        if (prefix == null || prefix.isBlank() || "/".equals(prefix)) prefix = "";
        if (prefix.endsWith("/")) prefix = prefix.substring(0, prefix.length() - 1);
        return proto + "://" + host + prefix + path;
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return "";
    }
}
