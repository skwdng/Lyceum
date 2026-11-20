package com.siyige.track;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 统计用的「自然日」——**一律 Asia/Shanghai**，与社区浏览计数（R-COM-30）同一口径。
 *
 * <p>为什么统一放一处：模块浏览、UV 快照、日活落库三个定时任务要用同一个 day key，
 * 各写一份迟早会因为时区/格式不一致而错位（典型症状：跨零点后 UV 记到前一天）。
 *
 * <p>key 里的日期是 {@code yyyyMMdd}（如 {@code 20261111}），落库的列是 {@link LocalDate}。
 */
public final class DayKeys {

    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    private DayKeys() { }

    /** 今天（Asia/Shanghai）的 {@code yyyyMMdd}。 */
    public static String today() {
        return dayKey(Instant.now());
    }

    /** 指定时刻对应的 {@code yyyyMMdd}（Asia/Shanghai）。 */
    public static String dayKey(Instant instant) {
        return DAY.format(LocalDate.ofInstant(instant, ZONE));
    }

    /** 指定日期对应的 {@code yyyyMMdd}。 */
    public static String dayKey(LocalDate date) {
        return DAY.format(date);
    }

    /** 今天（Asia/Shanghai）的日期对象，落库用。 */
    public static LocalDate todayDate() {
        return LocalDate.now(ZONE);
    }
}
