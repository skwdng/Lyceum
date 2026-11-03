package com.siyige.admin;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 管理页入口：`http://ip/admin` -> 转发到静态页 `admin.html`。
 *
 * <p>为什么要这个转发：`/admin.html` 是静态资源，Spring Boot 只会按文件路径暴露；
 * 用户要的是干净的 `/admin`。用 forward 而不是 redirect，地址栏保持 `/admin`。
 *
 * <p>页面本身不做访问控制（任何人能打开登录框，但拿不到数据）——
 * 数据接口由 {@link AdminAuthFilter} 把关，见方案 §4。
 */
@Controller
public class AdminPageController {

    @GetMapping("/admin")
    public String page() {
        return "forward:/admin.html";
    }
}
