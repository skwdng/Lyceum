package com.siyige.community;

import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 社区模块接口。
 *
 * 边界约定（见 docs/协作规范.md）：
 *   · 路径统一 /api/community/**
 *   · 表统一 sy_post / sy_comment（在 schema-community.sql 里，别人不改）
 *   · 前端页面是独立的 community.html，不塞进 index.html
 */
@RestController
@RequestMapping("/api/community")
public class CommunityController {

    private final CommunityRepo repo;

    public CommunityController(CommunityRepo repo) { this.repo = repo; }

    @GetMapping("/posts")
    public Map<String, Object> list(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        List<Map<String, Object>> rows = repo.posts(Math.max(0, page), Math.min(50, size));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", repo.count());
        out.put("list", rows);
        return out;
    }

    @PostMapping("/posts")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String title = String.valueOf(body.getOrDefault("title", "")).trim();
        String content = String.valueOf(body.getOrDefault("content", "")).trim();
        if (title.isEmpty()) throw new IllegalArgumentException("标题不能为空");
        if (content.length() < 5) throw new IllegalArgumentException("内容太短");
        long id = repo.createPost(
                String.valueOf(body.getOrDefault("userId", "u1")),
                String.valueOf(body.getOrDefault("userName", "匿名辩手")),
                title, content,
                body.get("topicId") == null ? null : String.valueOf(body.get("topicId")));
        return Map.of("ok", true, "id", id);
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        Map<String, Object> post = repo.post(id);
        if (post == null) throw new IllegalArgumentException("帖子不存在");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("post", post);
        out.put("comments", repo.comments(id));
        return out;
    }

    @PostMapping("/posts/{id}/like")
    public Map<String, Object> like(@PathVariable long id) {
        repo.like(id);
        Map<String, Object> p = repo.post(id);
        return Map.of("ok", true, "likes", p == null ? 0 : p.get("likes"));
    }

    @PostMapping("/posts/{id}/comments")
    public Map<String, Object> comment(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String content = String.valueOf(body.getOrDefault("content", "")).trim();
        if (content.isEmpty()) throw new IllegalArgumentException("评论不能为空");
        repo.addComment(id,
                String.valueOf(body.getOrDefault("userId", "u1")),
                String.valueOf(body.getOrDefault("userName", "匿名辩手")),
                content);
        return Map.of("ok", true);
    }
}
