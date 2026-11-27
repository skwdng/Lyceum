package com.siyige.repo;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;

/**
 * JDBC 时间列的**统一出口**。
 *
 * <p>为什么需要它：同一个 `timestamp` 列，不同驱动交给 `JdbcTemplate` 的对象类型不一样 ——
 * <ul>
 *   <li>H2（本项目默认 profile）：{@link java.sql.Timestamp}</li>
 *   <li>MySQL Connector/J 8：{@link LocalDateTime}（timestamp 列不再包成 Timestamp）</li>
 * </ul>
 * 于是 `(Timestamp) row.get("deadline_at")` 在 H2 下好好的，换 MySQL 就是
 * {@code ClassCastException}（2026-11-27 加 mysql profile 时在 tick 里炸的就是它）。
 *
 * <p>这里用 {@code instanceof} 分派而不是「按驱动分支」：两种驱动跑同一份代码，
 * 谁返回什么类型都认，将来换驱动也不用再改业务代码。
 */
public final class Times {

    private Times() {
    }

    /**
     * 把 JDBC 返回的时间列统一成 {@link Instant}。
     *
     * @param v 一般是 Timestamp / LocalDateTime / OffsetDateTime / Date；null 原样返回 null
     * @return null 入参返回 null（调用方按「没有截止时间」处理）
     * @throws IllegalArgumentException 遇到没见过的类型（宁可报清楚，也别静默返回 null）
     */
    public static Instant toInstant(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Timestamp t) return t.toInstant();
        // MySQL Connector/J 8 对 timestamp 列默认给 LocalDateTime（已按 serverTimezone 解释）
        if (v instanceof LocalDateTime ldt) return ldt.atZone(ZoneId.systemDefault()).toInstant();
        if (v instanceof OffsetDateTime odt) return odt.toInstant();
        if (v instanceof LocalDate d) return d.atStartOfDay(ZoneId.systemDefault()).toInstant();
        if (v instanceof Date d) return d.toInstant();   // java.sql.Date/Time 兜底
        throw new IllegalArgumentException("不认识的时间类型: " + v.getClass().getName());
    }
}
