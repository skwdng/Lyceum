package com.siyige.admin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 处理记录的**写入门面**：所有写审计的动作都从这里过。
 *
 * <p><b>硬性要求（红线）</b>：审计写失败**绝不能影响主流程**。
 * 管理员删内容/禁言已经做了，不能因为"日志没写进去"就回滚或者报 500。
 * 所以这里两条记录方法都是 {@code try/catch} + {@code log.warn}，吞掉异常后正常返回。
 *
 * <p>为什么不直接让 Service 调 {@link AuditLogRepo}：怕哪天有人忘了包 try/catch。
 * 统一从这个门面走，红线就只有一处需要守。
 *
 * <p>**不记**：管理员登录、登录失败、管理员改密、用户侧任何动作（用户决策 2）。
 */
@Component
public class AuditLog {

    private static final Logger log = LoggerFactory.getLogger(AuditLog.class);

    private final AuditLogRepo repo;

    public AuditLog(AuditLogRepo repo) {
        this.repo = repo;
    }

    /** 记一条「管理员处理举报」。detail 只写人读描述，禁止任何凭据。 */
    public void recordResolve(long reportId, long adminId, String adminName, String verdict,
                              String targetType, long targetId, String detail, String ip) {
        write(reportId, adminId, adminName, AuditLogRepo.ACTION_RESOLVE, verdict,
                targetType, targetId, detail, ip);
    }

    /** 记一条「撤销上一次处理」。verdict 留空（它不是一次判定，而是一次反悔）。 */
    public void recordRestore(long reportId, long adminId, String adminName,
                              String targetType, long targetId, String detail, String ip) {
        write(reportId, adminId, adminName, AuditLogRepo.ACTION_RESTORE, null,
                targetType, targetId, detail, ip);
    }

    private void write(long reportId, long adminId, String adminName, String action, String verdict,
                       String targetType, Long targetId, String detail, String ip) {
        try {
            repo.insert(reportId, adminId, adminName, action, verdict, targetType, targetId,
                    truncate(detail, 500), ip);
        } catch (RuntimeException e) {
            // 吞掉：审计失败不能影响"内容已经删除/禁言已经生效"这个既成事实
            log.warn("写处理记录失败（不影响主流程） reportId={} action={} adminId={}：{}",
                    reportId, action, adminId, e.toString());
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
