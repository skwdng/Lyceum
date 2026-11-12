package com.siyige.admin;

import com.siyige.video.MachineAuditService;
import com.siyige.video.VideoRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 视频复核台（管理台侧）。
 *
 * <p>为什么不是直接复用 {@link com.siyige.video.VideoController} 里的 4 个方法：
 * 那 4 个接口挂在 {@code /api/video/*} 下，只经用户侧的 {@code JwtAuthFilter}，
 * 管理台手里只有 `sy_admin_jwt`，根本进不去；而且它们的"操作人"取的是 `UserContext`（用户 id），
 * 管理台要记的是管理员账号。
 *
 * <p>所以这里**复用同样的数据层**（{@link VideoRepo} 的队列/日志/判定/恢复方法原样调用），
 * 只把"谁在操作"换成 {@link AdminContext}。判定规则、字段、状态机一个都没有重写。
 */
@Service
public class AdminVideoAuditService {

    private static final Logger log = LoggerFactory.getLogger(AdminVideoAuditService.class);

    private final VideoRepo repo;
    private final MachineAuditService machine;
    private final boolean consoleEnabled;

    /** 单页上限 / 默认页大小 / 仓储单次最多能取多少条（超过它就只能分页取，见 queue()） */
    static final int SIZE_MAX = 50;
    static final int SIZE_DEFAULT = 20;
    private static final int SIZE_MAX_TOTAL = 100;

    public AdminVideoAuditService(VideoRepo repo, MachineAuditService machine,
                                  @Value("${siyige.video.audit.console-enabled:false}") boolean consoleEnabled) {
        this.repo = repo;
        this.machine = machine;
        this.consoleEnabled = consoleEnabled;
    }

    /** 审核台是否可用（与视频模块共用同一个开关）。 */
    public boolean consoleEnabled() {
        return consoleEnabled;
    }

    /**
     * 队列 + 全局统计（带分页）。
     *
     * <p>分页为什么是"多取再切片"：`VideoRepo.auditQueue(status, size)` 没有 offset 参数，
     * 而 video 包本期不允许改（红线）。所以在管理端这层按 `page*size` 多取一点再自己切 ——
     * 单页最多 100 条，够用且不动既有仓储。`total` 取自 `repo.stats()`（本来就是每个状态的计数），
     * 这样分页栏能显示准确的页数。
     */
    public Map<String, Object> queue(String status, int page, int size) {
        requireEnabled();
        String st = status == null || status.isBlank() ? "REVIEW" : status.trim().toUpperCase();
        int p = Math.max(1, page);
        int s = size <= 0 ? SIZE_DEFAULT : Math.min(size, SIZE_MAX);

        Map<String, Object> stats = repo.stats();
        long total = totalOf(stats, st);
        long pages = Math.max(1, (total + s - 1) / s);

        List<Map<String, Object>> list = List.of();
        if (total > 0 && p <= pages) {
            int fetch = (int) Math.min(SIZE_MAX_TOTAL, (long) p * s);   // 仓储一次最多给这么多
            List<Map<String, Object>> all = repo.auditQueue(st, fetch);
            int from = Math.min(all.size(), (p - 1) * s);
            int to = Math.min(all.size(), from + s);
            list = from >= to ? List.of() : all.subList(from, to);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("stats", stats);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        out.put("pages", pages);
        return out;
    }

    /** 每个状态的总数：全部/通过/驳回能从 stats 拿到精确值，待复核 = pending。 */
    private static long totalOf(Map<String, Object> stats, String status) {
        long n = switch (status) {
            case "ALL" -> num(stats.get("videos"));
            case "PASSED" -> num(stats.get("passed"));
            case "REJECTED" -> num(stats.get("rejected"));
            case "REVIEW", "PENDING" -> num(stats.get("pending"));
            default -> 0;
        };
        return Math.max(0, n);
    }

    private static long num(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    /** 某个视频的完整审核日志 + 视频本身。 */
    public Map<String, Object> logs(long videoId) {
        requireEnabled();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", repo.auditLogs(videoId));
        out.put("video", repo.video(videoId));
        return out;
    }

    /**
     * 人工判定通过 / 驳回。
     *
     * <p>与视频模块 `decide` 的行为保持一致：写一条 HUMAN 审核日志 → 改 audit_status → 改上/下架。
     */
    public Map<String, Object> decide(long videoId, String decision, String reason, long adminId, String adminName) {
        requireEnabled();
        String d = decision == null ? "" : decision.trim().toUpperCase();
        if (!"PASS".equals(d) && !"REJECT".equals(d)) {
            throw new IllegalArgumentException("INVALID_PARAM: decision 只能是 PASS 或 REJECT");
        }
        Map<String, Object> v = repo.video(videoId);
        if (v == null) throw new IllegalArgumentException("VIDEO_NOT_FOUND: 视频不存在");

        String why = reason == null ? "" : reason.trim();
        String note = why.isEmpty() ? ("PASS".equals(d) ? "人工复核通过" : "人工复核驳回") : why;
        String prev = v.get("audit_status") == null ? "" : String.valueOf(v.get("audit_status"));

        repo.insertAudit(videoId, "HUMAN", d, note, operator(adminId, adminName),
                "title=" + (v.get("title") == null ? "" : v.get("title")), prev);
        repo.setAuditStatus(videoId, "PASS".equals(d) ? "PASSED" : "REJECTED", note);
        repo.setOnline(videoId, "PASS".equals(d));

        log.info("管理台视频复核 video={} decision={} by={}", videoId, d, adminName);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("auditStatus", "PASS".equals(d) ? "PASSED" : "REJECTED");
        out.put("visible", "PASS".equals(d));
        return out;
    }

    /** 一键恢复：退回上一次判定之前的状态（与视频模块 `restore` 语义一致）。 */
    public Map<String, Object> restore(long videoId, long adminId, String adminName) {
        requireEnabled();
        Map<String, Object> last = repo.lastAudit(videoId);
        if (last == null) throw new IllegalArgumentException("NOT_RESTORABLE: 这个视频没有审核记录");

        String prev = last.get("prev_status") == null ? "" : String.valueOf(last.get("prev_status"));
        if (prev.isEmpty()) prev = "PENDING";
        long auditId = last.get("id") instanceof Number n ? n.longValue() : 0L;

        repo.markRestored(auditId);
        repo.setAuditStatus(videoId, prev, "已恢复（撤销审核 " + auditId + "）");
        repo.setOnline(videoId, "PASSED".equals(prev));
        repo.insertAudit(videoId, "HUMAN", "RESTORE", "一键恢复至 " + prev,
                operator(adminId, adminName), "restore", prev);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("restoredTo", prev);
        return out;
    }

    /** 机器审核规则（只读，给管理台说明用）。 */
    public Map<String, Object> rules() {
        Map<String, Object> out = new LinkedHashMap<>(machine.rules());
        out.put("consoleEnabled", consoleEnabled);
        return out;
    }

    private void requireEnabled() {
        if (!consoleEnabled) {
            throw new IllegalArgumentException("CONSOLE_DISABLED: 视频复核台未开放（siyige.video.audit.console-enabled=false）");
        }
    }

    /** 审核日志里的操作人：`admin:账号`，与用户侧的 userId 区分开。 */
    private static String operator(long adminId, String adminName) {
        return "admin:" + (adminName == null || adminName.isBlank() ? adminId : adminName);
    }

    /** 给前端筛选用：队列支持的状态。 */
    public static List<String> STATUSES = List.of("REVIEW", "PENDING", "PASSED", "REJECTED");
}
