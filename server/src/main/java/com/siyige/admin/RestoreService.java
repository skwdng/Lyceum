package com.siyige.admin;

import com.siyige.community.CommunityRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 一键恢复：撤销某一次「删除内容」的处理。
 *
 * <p><b>只恢复内容</b>（用户决策 E / 3）：
 * 把被软删的帖子/评论 `status` 由 2 改回 1，让它重新可见。
 * **不解除禁言**——禁言要解，请去「用户管理」页手动解禁。
 *
 * <p>恢复后的三件事：
 * <ol>
 *   <li>原审计行 {@code undo_at = now, undo_by = 当前管理员}（保留原文，只标记已撤销）</li>
 *   <li>**另插一条** {@code action = RESTORE} 的审计行（谁撤销的、什么时候、撤销了什么）</li>
 *   <li>关联举报 {@code ACCEPTED -> REOPENED}（内容已恢复，这条举报不再算处理完成）</li>
 * </ol>
 * `REOPENED` 是**终态**：它不会回到处理队列（队列默认只查 PENDING），也不能再被处理
 * ——恢复是"反悔一次"，不是"重开一轮审判"（用户决策 5）。
 *
 * <p>失败口径（用户决策 4）：能恢复却没恢复成，一律 **409** 让管理员看到失败，
 * 不假装成功。两种 409：
 * <ul>
 *   <li>{@code ALREADY_RESTORED}：这条记录已经撤销过了（幂等保护）</li>
 *   <li>{@code NOT_RESTORABLE}：没有可恢复的内容（IGNORE / 纯 BAN），
 *       或目标已不存在/本来就可见</li>
 * </ul>
 */
@Service
public class RestoreService {

    private static final Logger log = LoggerFactory.getLogger(RestoreService.class);

    private final AuditLogRepo auditRepo;
    private final AuditLog audit;
    private final AdminReportRepo reportRepo;
    private final CommunityRepo community;

    public RestoreService(AuditLogRepo auditRepo, AuditLog audit,
                          AdminReportRepo reportRepo, CommunityRepo community) {
        this.auditRepo = auditRepo;
        this.audit = audit;
        this.reportRepo = reportRepo;
        this.community = community;
    }

    /**
     * 撤销一条处理记录。
     *
     * @param auditId   处理记录 id（不是 report id——按记录精确恢复，不按目标恢复）
     * @param adminId   当前管理员（来自 AdminContext，不接受请求参数）
     * @param adminName 当前管理员账号（冗余进审计行）
     * @param ip        客户端 IP
     */
    public void restore(long auditId, long adminId, String adminName, String ip) {
        Map<String, Object> row = auditRepo.findById(auditId);
        if (row == null) throw new IllegalArgumentException("AUDIT_NOT_FOUND: 处理记录不存在");

        if (row.get("undo_at") != null) {
            throw new IllegalArgumentException("ALREADY_RESTORED: 这次处理已经撤销过了");
        }
        if (!AuditLogService.canRestore(row)) {
            String verdict = row.get("verdict") == null ? "" : String.valueOf(row.get("verdict"));
            throw new IllegalArgumentException("NOT_RESTORABLE: 这次处理没有可恢复的内容（"
                    + AuditLogService.actionName(verdict) + "）");
        }

        String targetType = row.get("target_type") == null ? null : String.valueOf(row.get("target_type"));
        Object tid = row.get("target_id");
        if (targetType == null || tid == null) {
            throw new IllegalArgumentException("NOT_RESTORABLE: 该记录没有可定位的目标");
        }
        long targetId = ((Number) tid).longValue();
        long reportId = ((Number) row.get("report_id")).longValue();
        String verdict = String.valueOf(row.get("verdict"));

        // 1) 先恢复内容。返回 0 说明"没东西可恢复"（作者自己删了 / 已可见 / 行不存在）
        int affected = "POST".equals(targetType)
                ? community.restorePost(targetId)
                : community.restoreComment(targetId);
        if (affected == 0) {
            throw new IllegalArgumentException("NOT_RESTORABLE: 目标已不存在或本来可见，没有恢复到内容");
        }

        // 2) 认领这次撤销（并发下第二次会拿到 0 行）
        int claimed = auditRepo.markUndone(auditId, adminId);
        if (claimed == 0) {
            throw new IllegalArgumentException("ALREADY_RESTORED: 这次处理已经撤销过了");
        }

        // 3) 举报状态 ACCEPTED -> REOPENED（终态，不回队列）
        //    仅当这条记录来自举报处理。管理员从内容管理直接处置（source=MANUAL）时
        //    report_id = 0，没有关联举报可改，跳过这一步；其余逻辑与老路径完全一致。
        int reopened = reportId > 0 ? reportRepo.reopenReport(reportId) : 0;

        // 4) 另记一条 RESTORE 审计（失败也不影响已经完成的事实）
        audit.recordRestore(reportId, adminId, adminName, targetType, targetId,
                "撤销「" + AuditLogService.actionName(verdict) + "」："
                        + ("POST".equals(targetType) ? "帖子 #" : "评论 #") + targetId + " 重新可见",
                ip);

        log.info("一键恢复 auditId={} reportId={} target={}#{} verdict={} 举报改REOPENED={} by={}",
                auditId, reportId, targetType, targetId, verdict, reopened, adminId);
    }
}
