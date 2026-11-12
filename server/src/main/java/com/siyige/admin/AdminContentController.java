package com.siyige.admin;

import com.siyige.auth.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 内容管理台的后台接口（管理端专用，鉴权由 {@link AdminAuthFilter} 统一做）。
 *
 * <pre>
 *   GET  /api/admin/posts?q=&type=&status=&authorId=&from=&to=&page=&size=   帖子搜索（含已屏蔽）
 *   GET  /api/admin/posts/{id}                                              帖子详情（正文 + 统计 + 作者摘要）
 *   GET  /api/admin/posts/{id}/comments?page=&size=                         该帖评论树（含已屏蔽，按楼分页）
 *   GET  /api/admin/comments?q=&status=&authorId=&postId=&page=&size=        评论跨帖搜索
 *   POST /api/admin/content/{type}/{id}/hide    {note?}                      屏蔽（type = post | comment）
 *   POST /api/admin/content/{type}/{id}/unhide                              解除屏蔽
 *   POST /api/admin/users/{id}/mute             {days,reason?}               禁言（带审计）
 * </pre>
 *
 * <p>`mute` 放在这个控制器里而不是 {@link AdminUserController}：它要做的事是
 * 「BanService 禁言 + 写一条 MANUAL 审计」，和内容处置是同一条链路；放到用户控制器里会变成
 * 一个用户控制器依赖内容服务，读起来更绕。路径仍然是 {@code /api/admin/users/{id}/mute}。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminContentController {

    private final AdminContentService service;

    public AdminContentController(AdminContentService service) {
        this.service = service;
    }

    @GetMapping("/posts")
    public Map<String, Object> posts(@RequestParam(required = false) String q,
                                     @RequestParam(required = false) String type,
                                     @RequestParam(required = false) Integer status,
                                     @RequestParam(required = false) String authorId,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        return service.posts(q, type, status, authorId, from, to, page, size);
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> postDetail(@PathVariable long id) {
        return service.postDetail(id);
    }

    @GetMapping("/posts/{id}/comments")
    public Map<String, Object> postComments(@PathVariable long id,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        return service.postComments(id, page, size);
    }

    @GetMapping("/comments")
    public Map<String, Object> comments(@RequestParam(required = false) String q,
                                        @RequestParam(required = false) Integer status,
                                        @RequestParam(required = false) String authorId,
                                        @RequestParam(required = false) Long postId,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        return service.comments(q, status, authorId, postId, page, size);
    }

    @PostMapping("/content/{type}/{id}/hide")
    public ResponseEntity<Void> hide(@PathVariable String type, @PathVariable long id,
                                     @RequestBody(required = false) AdminDtos.HideRequest req,
                                     HttpServletRequest http) {
        service.hide(type, id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http),
                req == null ? null : req.note());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/content/{type}/{id}/unhide")
    public ResponseEntity<Void> unhide(@PathVariable String type, @PathVariable long id,
                                       HttpServletRequest http) {
        service.unhide(type, id, AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/mute")
    public ResponseEntity<Void> mute(@PathVariable String id,
                                     @RequestBody(required = false) AdminDtos.BanRequest req,
                                     HttpServletRequest http) {
        service.mute(id, req == null ? null : req.days(), req == null ? null : req.reason(),
                AdminContext.requireId(), AdminContext.account(), ClientIp.of(http));
        return ResponseEntity.noContent().build();
    }
}
