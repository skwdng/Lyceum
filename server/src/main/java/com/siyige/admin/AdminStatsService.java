package com.siyige.admin;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 管理端顶部统计（决策 D11：只有三个字段）。
 *
 * <p>刻意**不做**「今日删除数」——`sy_post` / `sy_post_comment` 没有 `updated_at`，
 * 数不出"今天删了多少"，口径含糊的数字不如不给；为此加列不值当。
 */
@Service
public class AdminStatsService {

    private final AdminReportRepo reports;
    private final AdminUserService users;

    public AdminStatsService(AdminReportRepo reports, AdminUserService users) {
        this.reports = reports;
        this.users = users;
    }

    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pendingReports", reports.countByStatus("PENDING"));
        out.put("todayReports", reports.countCreatedToday());
        out.put("bannedUsers", users.bannedUserCount());   // 社区禁言中的人数（按人去重）
        return out;
    }
}
