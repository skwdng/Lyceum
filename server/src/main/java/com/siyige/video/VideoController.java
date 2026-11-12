package com.siyige.video;

import com.siyige.auth.UserContext;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 视频：辩论短视频接口。
 *
 * 身份统一走思弈阁的 JWT（UserContext.get()），不再自己造账号。
 * 未登录可以浏览（feed/detail），发视频、点赞、评论需要登录。
 */
@RestController
@RequestMapping("/api/video")
public class VideoController {

    private final VideoRepo repo;
    private final MachineAuditService machine;

    /**
     * 人工审核台开关。
     *
     * <p>默认关闭：任何登录用户都能给自己过审是不安全的。
     * 等管理端（admin 分支的管理员认证）接入后，把这里的 flag 判断换成
     * 管理员角色校验即可，接口路径与前端不用改。
     */
    private final boolean consoleEnabled;

    public VideoController(VideoRepo repo, MachineAuditService machine,
                           @org.springframework.beans.factory.annotation.Value("${siyige.video.audit.console-enabled:false}") boolean consoleEnabled) {
        this.repo = repo;
        this.machine = machine;
        this.consoleEnabled = consoleEnabled;
    }

    /**
     * 审核台的身份校验。
     *
     * <p>**这一处是本批唯一改动了既有逻辑的地方**（内容管理台接入视频复核）。
     *
     * <p>原来的实现只判断 `consoleEnabled` 开关 —— 开关一打开，**任何已登录用户**都能调这 4 个接口
     * 给自己/别人的视频过审。现在必须先有管理员身份。
     *
     * <p>顺序刻意是「先校验身份、再看开关」：开关关着时非管理员也应该是 403 而不是 500，
     * 否则"非管理员能不能调"会被开关状态掩盖（验收要求非管理员一律 403）。
     *
     * <p>注：`/api/video/*` 只挂了用户侧的 {@code JwtAuthFilter}，不走 {@code AdminAuthFilter}，
     * 所以这里 `AdminContext` 必然为空 —— 这 4 个接口实际上没人能调通。这正是想要的：
     * 审核台已搬到管理台（{@code /api/admin/video-audit/**}，走管理员令牌）。
     */
    private void requireConsole() {
        com.siyige.admin.AdminContext.requireId();       // 非管理员 -> 403 NOT_ADMIN
        if (!consoleEnabled) {
            throw new IllegalStateException("人工审核台未开放（已在管理台「视频复核」中提供）");
        }
    }

    private static String uid() {
        String id = UserContext.current();
        return id == null ? "" : id;
    }

    private static String s(Object o) { return o == null ? "" : String.valueOf(o); }
    private static long n(Object o) { return o instanceof Number x ? x.longValue() : 0; }

    // ---------- 广场 ----------
    @GetMapping("/feed")
    public Map<String, Object> feed(@RequestParam(defaultValue = "0") long cursor,
                                    @RequestParam(defaultValue = "6") int size,
                                    @RequestParam(required = false) String topic,
                                    @RequestParam(required = false) String segment) {
        List<Map<String, Object>> list = repo.feed(cursor, Math.min(20, Math.max(1, size)), topic, segment);
        String me = uid();
        list.forEach(v -> v.put("liked", n(v.get("id")) > 0 && repo.liked(n(v.get("id")), me)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("nextCursor", list.isEmpty() ? 0 : n(list.get(list.size() - 1).get("id")));
        out.put("stats", repo.stats());
        return out;
    }

    @GetMapping("/search")
    public Map<String, Object> search(@RequestParam String q) {
        return Map.of("list", repo.search(q == null ? "" : q.trim(), 30));
    }

    @GetMapping("/videos/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        Map<String, Object> v = repo.video(id);
        if (v == null) throw new IllegalArgumentException("视频不存在");
        repo.view(id);
        String me = uid();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("video", v);
        out.put("comments", repo.comments(id));
        out.put("liked", repo.liked(id, me));
        return out;
    }

    // ---------- 互动（需登录）----------
    @PostMapping("/videos/{id}/like")
    public Map<String, Object> like(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String me = uid();
        if (me.isBlank()) throw new IllegalStateException("请先登录");
        boolean cancel = body != null && Boolean.TRUE.equals(body.get("cancel"));
        if (cancel) repo.unlike(id, me); else repo.like(id, me);
        Map<String, Object> v = repo.video(id);
        return Map.of("ok", true, "likes", v == null ? 0 : v.get("likes"), "liked", !cancel);
    }

    @PostMapping("/videos/{id}/comments")
    public Map<String, Object> comment(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String me = uid();
        if (me.isBlank()) throw new IllegalStateException("请先登录");
        String content = s(body.get("content")).trim();
        if (content.isEmpty()) throw new IllegalArgumentException("评论不能为空");
        if (content.length() > 200) throw new IllegalArgumentException("评论太长（>200 字）");
        repo.addComment(id, me, content);
        return Map.of("ok", true, "comments", repo.comments(id));
    }

    // ---------- 发布：机器初审 ----------
    @PostMapping("/videos")
    public Map<String, Object> publish(@RequestBody Map<String, Object> body) {
        String me = uid();
        if (me.isBlank()) throw new IllegalStateException("请先登录");

        String title = s(body.get("title")).trim();
        String desc = s(body.get("description")).trim();
        String url = s(body.get("url")).trim();
        String topic = s(body.get("topic")).trim();
        String segment = s(body.get("segment")).trim();
        String side = s(body.get("side")).trim();

        MachineAuditService.Verdict v = machine.check(title, desc, url, segment);

        long id = repo.create(me, title, desc, url, s(body.get("poster")), topic, segment, side,
                (int) n(body.get("durationSec")));

        repo.insertAudit(id, "MACHINE", v.result(), v.reason(), "machine",
                "title=" + title + " | desc=" + desc + " | seg=" + segment, "PENDING");

        String status = switch (v.result()) {
            case "PASS" -> "PASSED";
            case "REVIEW" -> "REVIEW";
            default -> "REJECTED";
        };
        repo.setAuditStatus(id, status, v.reason());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("videoId", id);
        out.put("auditStatus", status);
        out.put("reason", v.reason());
        out.put("visible", "PASSED".equals(status));
        return out;
    }

    // ---------- 审核台 ----------
    @GetMapping("/audit/queue")
    public Map<String, Object> queue(@RequestParam(defaultValue = "REVIEW") String status,
                                     @RequestParam(defaultValue = "30") int size) {
        requireConsole();
        return Map.of("list", repo.auditQueue(status, Math.min(100, size)), "stats", repo.stats());
    }

    @GetMapping("/audit/{videoId}/logs")
    public Map<String, Object> logs(@PathVariable long videoId) {
        requireConsole();
        return Map.of("list", repo.auditLogs(videoId), "video", repo.video(videoId));
    }

    @PostMapping("/audit/{videoId}/decide")
    public Map<String, Object> decide(@PathVariable long videoId, @RequestBody Map<String, Object> body) {
        requireConsole();
        String me = uid();
        if (me.isBlank()) throw new IllegalStateException("请先登录");
        Map<String, Object> v = repo.video(videoId);
        if (v == null) throw new IllegalArgumentException("视频不存在");

        String decision = s(body.get("decision")).toUpperCase();
        String reason = s(body.get("reason")).trim();
        if (!decision.equals("PASS") && !decision.equals("REJECT"))
            throw new IllegalArgumentException("decision 只能是 PASS / REJECT");

        String prev = s(v.get("audit_status"));
        repo.insertAudit(videoId, "HUMAN", decision,
                reason.isEmpty() ? (decision.equals("PASS") ? "人工复核通过" : "人工复核驳回") : reason,
                me, "title=" + s(v.get("title")), prev);
        repo.setAuditStatus(videoId, decision.equals("PASS") ? "PASSED" : "REJECTED",
                reason.isEmpty() ? "人工复核" : reason);
        repo.setOnline(videoId, decision.equals("PASS"));

        return Map.of("ok", true, "auditStatus", decision.equals("PASS") ? "PASSED" : "REJECTED",
                "visible", decision.equals("PASS"));
    }

    @PostMapping("/audit/{videoId}/restore")
    public Map<String, Object> restore(@PathVariable long videoId) {
        requireConsole();
        String me = uid();
        if (me.isBlank()) throw new IllegalStateException("请先登录");
        Map<String, Object> last = repo.lastAudit(videoId);
        if (last == null) throw new IllegalArgumentException("没有审核记录");
        String prev = s(last.get("prev_status"));
        if (prev.isEmpty()) prev = "PENDING";
        repo.markRestored(n(last.get("id")));
        repo.setAuditStatus(videoId, prev, "已恢复（撤销审核 " + n(last.get("id")) + "）");
        repo.setOnline(videoId, "PASSED".equals(prev));
        repo.insertAudit(videoId, "HUMAN", "RESTORE", "一键恢复至 " + prev, me, "restore", prev);
        return Map.of("ok", true, "restoredTo", prev);
    }

    @GetMapping("/audit/rules")
    public Map<String, Object> rules() {
        Map<String, Object> m = new java.util.LinkedHashMap<>(machine.rules());
        m.put("consoleEnabled", consoleEnabled);
        return m;
    }
}
