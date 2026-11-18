package com.siyige.admin.alert;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 告警规则的**唯一真源**：规则键、级别、窗口、去重键拼法。
 *
 * <p><b>阈值已经搬走了</b>（参数管理第一批）：举报激增阈值 = {@code ConfigKey.ALERT_REPORT_THRESHOLD}，
 * 举报积压阈值 = {@code ConfigKey.ALERT_BACKLOG_THRESHOLD}，后台可改、下次扫描生效。
 *
 * <p>为什么不再留常量：同一个阈值如果既有常量又有配置，就会出现"两处真相"——
 * 改了后台没生效，或者改了常量又被库里的值盖掉，排查起来极难受。所以这里**只留窗口时长**
 * （{@link #WINDOW_HOURS}，本期不搬：它决定聚合口径，不适合让人随手改）。
 *
 * <p>判定口径是「&gt; 阈值」不是「&gt;=」：正好等于阈值不报（设计 §3、A4 的边界测试都按这个口径）。
 *
 * <p>去重口径（设计 §2）：**规则 + 对象 + 日期**。对象类规则带对象 id，
 * 所以「处理掉 u_1029」不会影响 u_2001，也不会影响任何帖子。
 */
public final class AlertRule {

    private AlertRule() { }

    /** 统计窗口：24 小时（告警标题里的"24 小时"也用这个拼，别写死）。 */
    public static final int WINDOW_HOURS = 24;

    // ==================== 规则键 ====================

    public static final String USER_REPORT_BURST = "USER_REPORT_BURST";
    public static final String POST_REPORT_BURST = "POST_REPORT_BURST";
    public static final String REPORT_BACKLOG = "REPORT_BACKLOG";
    public static final String DAU_MISSING = "DAU_MISSING";

    /** 四条规则（顺序即界面上「静音规则」下拉的顺序）。 */
    public static final String[] ALL = {USER_REPORT_BURST, POST_REPORT_BURST, REPORT_BACKLOG, DAU_MISSING};

    // ==================== 级别 ====================

    public static final String LEVEL_WARN = "WARN";
    public static final String LEVEL_CRIT = "CRIT";

    // ==================== 状态 ====================

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_ACKED = "ACKED";
    public static final String STATUS_RESOLVED = "RESOLVED";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /** 规则的中文名（界面下拉与静音列表用；人读，别塞进 SQL）。 */
    public static String label(String ruleKey) {
        return switch (ruleKey == null ? "" : ruleKey) {
            case USER_REPORT_BURST -> "用户被举报激增";
            case POST_REPORT_BURST -> "内容被举报激增";
            case REPORT_BACKLOG -> "举报积压";
            case DAU_MISSING -> "活跃统计缺失";
            default -> ruleKey;
        };
    }

    public static boolean isKnown(String ruleKey) {
        for (String k : ALL) if (k.equals(ruleKey)) return true;
        return false;
    }

    // ==================== 去重键（唯一真源，别在 Service 里手拼） ====================

    /** 人：`USER_REPORT_BURST:u_1029:2026-11-16` */
    public static String userKey(String userId, LocalDate day) {
        return USER_REPORT_BURST + ":" + userId + ":" + day.format(DAY);
    }

    /** 内容：`POST_REPORT_BURST:POST:12:2026-11-16` */
    public static String contentKey(String targetType, String targetId, LocalDate day) {
        return POST_REPORT_BURST + ":" + targetType + ":" + targetId + ":" + day.format(DAY);
    }

    /** 全局积压：`REPORT_BACKLOG:2026-11-16` */
    public static String backlogKey(LocalDate day) {
        return REPORT_BACKLOG + ":" + day.format(DAY);
    }

    /**
     * 活跃缺失：`DAU_MISSING:2026-11-15` —— 带的是**缺的那一天**，
     * 所以昨天缺一次只报一次；今天再缺（变成昨天是今天）又会有新键，该报还得报。
     */
    public static String dauKey(LocalDate missingDay) {
        return DAU_MISSING + ":" + missingDay.format(DAY);
    }
}
