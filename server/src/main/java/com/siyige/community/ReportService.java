package com.siyige.community;

import com.siyige.admin.analytics.Active;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 用户侧举报（提交 + 我的举报）。
 *
 * <p>规则（方案 §3.1）：
 * <ul>
 *   <li>目标只能是 {@code POST} / {@code COMMENT}，本期不做「举报用户」</li>
 *   <li>不能举报自己的内容 → 400</li>
 *   <li>同人同目标只能一次 → 409 {@code ALREADY_REPORTED}（先查一次给友好提示，
 *       并发竞态由唯一索引 ux_report_once 兜底）</li>
 *   <li>补充说明 {@code detail} 必须过 {@link SensitiveWordMasker} 打码后落库——
 *       不能借举报入口骂人</li>
 *   <li>只能举报**还在的**内容（软删除的不让举报）</li>
 * </ul>
 */
@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    /** 举报原因白名单（前端四个选项）。 */
    public static final Set<String> REASONS = Set.of("SPAM", "ABUSE", "ILLEGAL", "OTHER");
    /** 目标类型白名单。 */
    public static final Set<String> TARGET_TYPES = Set.of("POST", "COMMENT");

    private static final int DETAIL_MAX = 500;
    private static final int PAGE_SIZE_DEFAULT = 20;
    private static final int PAGE_SIZE_MAX = 50;

    private final ReportRepo repo;
    private final CommunityRepo community;
    private final SensitiveWordMasker masker;

    public ReportService(ReportRepo repo, CommunityRepo community, SensitiveWordMasker masker) {
        this.repo = repo;
        this.community = community;
        this.masker = masker;
    }

    // ==================== 提交举报 ====================

    @Active
    public Map<String, Object> submit(String userId, Map<String, Object> body) {
        if (body == null) throw new IllegalArgumentException("INVALID_PARAM: 请求体不能为空");

        String targetType = upper(body.get("targetType"));
        if (!TARGET_TYPES.contains(targetType)) {
            throw new IllegalArgumentException("INVALID_PARAM: targetType 只能是 POST 或 COMMENT");
        }

        long targetId = CommunityService.num(body.get("targetId"));
        if (targetId <= 0) throw new IllegalArgumentException("INVALID_PARAM: targetId 不合法");

        String reason = upper(body.get("reason"));
        if (!REASONS.contains(reason)) {
            throw new IllegalArgumentException("INVALID_PARAM: reason 只能是 SPAM / ABUSE / ILLEGAL / OTHER");
        }

        // 补充说明：先打码再落库（D8）
        String rawDetail = trimToNull(body.get("detail"));
        String detail = null;
        if (rawDetail != null) {
            if (rawDetail.length() > DETAIL_MAX) {
                throw new IllegalArgumentException("INVALID_PARAM: 补充说明最多 " + DETAIL_MAX + " 字");
            }
            SensitiveWordMasker.MaskResult masked = masker.mask(rawDetail);
            detail = masked.text();
            if (masked.hits() > 0) {
                log.info("举报补充说明打码 userId={} target={}#{} hits={}",
                        userId, targetType, targetId, masked.hits());
            }
        }

        // 目标必须还在（软删除的不让举报）
        Map<String, Object> target = "POST".equals(targetType)
                ? community.findPost(targetId) : community.findComment(targetId);
        if (target == null || !isActive(targetType, target)) {
            throw new IllegalArgumentException(("POST".equals(targetType) ? "POST_NOT_FOUND" : "COMMENT_NOT_FOUND")
                    + ": 被举报的内容不存在或已删除");
        }

        // 不能举报自己
        String authorId = str("POST".equals(targetType)
                ? target.get("author_id") : target.get("user_id"));
        if (userId.equals(authorId)) {
            throw new IllegalArgumentException("INVALID_PARAM: 不能举报自己的内容");
        }

        // 先查一次给友好错误；并发竞态靠唯一索引
        if (repo.exists(targetType, targetId, userId)) throw alreadyReported();

        long id;
        try {
            id = repo.insert(targetType, targetId, userId, reason, detail);
        } catch (DuplicateKeyException e) {
            throw alreadyReported();
        }

        log.info("举报成功 reporter={} target={}#{} reason={} reportId={}",
                userId, targetType, targetId, reason, id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reportId", id);
        return out;
    }

    private static IllegalArgumentException alreadyReported() {
        return new IllegalArgumentException("ALREADY_REPORTED: 你已经举报过这条内容，请等待处理");
    }

    // ==================== 我的举报 ====================

    public Map<String, Object> listMine(String userId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(PAGE_SIZE_MAX, Math.max(1, size <= 0 ? PAGE_SIZE_DEFAULT : size));
        long total = repo.countMine(userId);

        List<Map<String, Object>> rows = repo.listMine(userId, (p - 1) * s, s);
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reportId", CommunityService.num(row.get("id")));
            m.put("targetType", row.get("target_type"));
            m.put("targetId", CommunityService.num(row.get("target_id")));
            m.put("targetSummary", excerpt(row.get("target_summary")));
            m.put("reason", row.get("reason"));
            m.put("detail", row.get("detail"));
            m.put("status", row.get("status"));
            m.put("action", row.get("action"));
            m.put("createdAt", millis(row.get("created_at")));
            m.put("handledAt", millis(row.get("handled_at")));
            items.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    // ==================== 小工具 ====================

    /**
     * 目标是否仍然可见。
     *
     * <p>两种目标的行形状不一样：
     * <ul>
     *   <li>帖子：{@code findPost} 的 SQL 里已经带 `status = 1`，返回非 null 即代表"还在"，
     *       而且它没 select status 列——这里**不能**再按 status 判一次，否则字段取到 null
     *       会被当成"已删除"，好好的帖子也举报不了</li>
     *   <li>评论：{@code findComment} 返回 {@code c.*}（含 status），软删除的也在，所以要判</li>
     * </ul>
     */
    private static boolean isActive(String targetType, Map<String, Object> row) {
        if ("POST".equals(targetType)) return true;
        return CommunityService.num(row.get("status")) == 1;
    }

    private static String upper(Object v) {
        String s = trimToNull(v);
        return s == null ? "" : s.toUpperCase();
    }

    private static String trimToNull(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    /** 目标摘要：帖子标题可能很长，评论正文也一样，统一截 60 字。 */
    private static String excerpt(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.length() <= 60 ? s : s.substring(0, 60) + "…";
    }

    static Long millis(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Timestamp ts) return ts.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (v instanceof java.util.Date d) return d.getTime();
        if (v instanceof Number n) return n.longValue();
        return null;
    }
}
