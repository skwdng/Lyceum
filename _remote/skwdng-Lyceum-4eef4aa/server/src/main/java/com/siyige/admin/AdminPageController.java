package com.siyige.admin;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 管理页入口：`/admin` -> 跳到 Vue 版管理台 `v2/index.html#/admin`。
 *
 * <p>旧前端删除后（见 docs/协作规范.md §10），`/admin.html` 已经不存在，
 * 这里原来 forward 到 `admin.html` 的写法会 404。现在改成 redirect，原因有两点：
 *
 * <ul>
 *   <li><b>不能用 forward</b>：forward 会保留地址栏 `/admin`，而 SPA 的资源是相对路径
 *       （vite `base: './'`），浏览器会去 `/assets/**` 找 JS -> 白屏；</li>
 *   <li><b>不能用根绝对路径</b>：线上按 §10.3 部署在 `/siyige/` 下，写死 `/v2/...` 会跳到
 *       `http://host/v2/index.html`（404）。相对路径让浏览器自己拼前缀：
 *       本地 `/admin` -> `/v2/index.html#/admin`，线上 `/siyige/admin` -> `/siyige/v2/index.html#/admin`。
 *       这与 `static/index.html` 里 `location.replace('v2/index.html' + ...)` 的做法完全一致。</li>
 * </ul>
 *
 * <p>页面本身不做访问控制（任何人能打开登录框，但拿不到数据）——
 * 数据接口由 {@link AdminAuthFilter} 把关，见方案 §4。
 */
@Controller
public class AdminPageController {

    @GetMapping("/admin")
    public String page() {
        return "redirect:v2/index.html#/admin";
    }
}
