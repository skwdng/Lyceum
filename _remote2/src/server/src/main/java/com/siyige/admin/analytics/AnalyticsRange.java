package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * 报表的时间范围与「日期桶」（纯计算，方便单测）。
 *
 * <p>三条约定：
 * <ul>
 *   <li>日期一律 Asia/Shanghai（{@link DayKeys}），与埋点、落库同一口径；
 *   <li>`range=7d|30d|90d` 是**含今天**的最近 N 天（7d = 今天 + 前 6 天）；
 *   <li>最多 366 天 —— 防止有人传个 2010-01-01 让报表全表扫。</li>
 * </ul>
 *
 * <p>非法参数一律抛 {@link IllegalArgumentException}，由 {@code ApiErrors} 转成
 * 400 {@code INVALID_RANGE}（与其它接口的错误体一致）。
 */
public record AnalyticsRange(LocalDate from, LocalDate to) {

    public static final int MAX_DAYS = 366;

    /** `7d` / `30d` / `90d`；不传用 defaultDays。 */
    public static AnalyticsRange ofRange(String range, int defaultDays) {
        int days = (range == null || range.isBlank()) ? defaultDays : parseDays(range);
        LocalDate to = DayKeys.todayDate();
        return new AnalyticsRange(to.minusDays(days - 1L), to);
    }

    /** 解析 `Nd`。 */
    public static int parseDays(String range) {
        String r = range == null ? "" : range.trim().toLowerCase();
        if (r.endsWith("d")) {
            try {
                int n = Integer.parseInt(r.substring(0, r.length() - 1));
                if (n >= 1 && n <= MAX_DAYS) return n;
            } catch (NumberFormatException ignored) {
                // 落到下面统一报错
            }
        }
        throw new IllegalArgumentException("INVALID_RANGE: range 只支持 7d / 30d / 90d 这类写法");
    }

    /** `from` / `to`（yyyy-MM-dd）；都不传就是最近 7 天。 */
    public static AnalyticsRange ofDates(String from, String to) {
        LocalDate t;
        LocalDate f;
        try {
            t = (to == null || to.isBlank()) ? DayKeys.todayDate() : LocalDate.parse(to.trim());
            f = (from == null || from.isBlank()) ? t.minusDays(6) : LocalDate.parse(from.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("INVALID_RANGE: 日期格式应为 yyyy-MM-dd");
        }
        if (f.isAfter(t)) throw new IllegalArgumentException("INVALID_RANGE: from 不能晚于 to");
        if (t.toEpochDay() - f.toEpochDay() + 1 > MAX_DAYS) {
            throw new IllegalArgumentException("INVALID_RANGE: 一次最多查 " + MAX_DAYS + " 天");
        }
        return new AnalyticsRange(f, t);
    }

    public List<LocalDate> days() {
        List<LocalDate> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) out.add(d);
        return out;
    }

    public int lengthDays() {
        return (int) (to.toEpochDay() - from.toEpochDay() + 1);
    }

    /** 紧挨着的、等长的上一个周期（用于「与上周期对比」）。 */
    public AnalyticsRange previous() {
        return new AnalyticsRange(from.minusDays(lengthDays()), from.minusDays(1));
    }

    /** 缓存 key 里的参数段。 */
    public String paramKey() {
        return from + "_" + to;
    }
}
