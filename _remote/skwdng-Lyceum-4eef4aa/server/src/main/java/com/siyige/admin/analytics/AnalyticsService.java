package com.siyige.admin.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 报表聚合（设计文档 §5.2 / §5.3）：所有分桶、补零、占比、环比都在这里做，SQL 只取原始行。
 *
 * <p>三个统一约定，前端拿到就能直接画：
 * <ol>
 *   <li><b>补零</b>：区间内每一天都有点（没数据的那天 y=0），折线不会断成碎片；</li>
 *   <li><b>排序</b>：排行类按数值降序；</li>
 *   <li><b>占比</b>：sharePct 保留 1 位小数，分母为 0 时给 0（不给 NaN）。</li>
 * </ol>
 *
 * <p>缓存见 {@link AnalyticsCache}：60 秒；Redis 挂了自动退化为直查（统计可以慢一点，不能报错）。
 */
@Service
public class AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsService.class);

    /** trend 支持的指标（与前端下拉一致）。 */
    public static final List<String> METRICS =
            List.of("matches", "posts", "active", "revenue", "reports", "newUsers");

    private final AnalyticsRepo repo;
    private final PvStore pv;
    private final AnalyticsCache cache;
    private final ObjectMapper json;

    public AnalyticsService(AnalyticsRepo repo, PvStore pv, AnalyticsCache cache, ObjectMapper json) {
        this.repo = repo;
        this.pv = pv;
        this.cache = cache;
        this.json = json;
    }

    // ==================== 1. 概览 ====================

    public AnalyticsDtos.Overview overview(String from, String to) {
        AnalyticsRange r = AnalyticsRange.ofDates(from, to);
        return cached("overview", r.paramKey(), AnalyticsDtos.Overview.class, () -> buildOverview(r));
    }

    private AnalyticsDtos.Overview buildOverview(AnalyticsRange r) {
        AnalyticsRange p = r.previous();

        long matches = repo.countMatches(r.from(), r.to());
        long posts = repo.countPosts(r.from(), r.to());
        long users = repo.countUsers(r.from(), r.to());
        long reports = repo.countReports(r.from(), r.to());
        long revenue = repo.sumRevenueCents(r.from(), r.to());
        long dauAvg = Math.round(avgDau(r));
        long dauAvgPrev = Math.round(avgDau(p));

        List<AnalyticsDtos.KpiItem> items = new ArrayList<>();
        items.add(kpi("newUsers", "新增用户", users, repo.countUsers(p.from(), p.to()), "人"));
        items.add(kpi("matches", "对局数", matches, repo.countMatches(p.from(), p.to()), "场"));
        items.add(kpi("posts", "发帖数", posts, repo.countPosts(p.from(), p.to()), "篇"));
        items.add(kpi("reports", "举报数", reports, repo.countReports(p.from(), p.to()), "条"));
        items.add(kpi("revenueCents", "充值收入", revenue, repo.sumRevenueCents(p.from(), p.to()), "分"));
        items.add(kpi("avgDau", "日均活跃", dauAvg, dauAvgPrev, "人"));
        // 这两个是「此刻的存量」，没有周期对比：prev 与 value 相同、deltaPct 为 null
        items.add(current("pendingReports", "待处理举报", repo.pendingReports(), "条"));
        items.add(current("bannedUsers", "封禁中", repo.bannedUsers(), "人"));

        return new AnalyticsDtos.Overview(r.from().toString(), r.to().toString(),
                p.from().toString(), p.to().toString(), items);
    }

    /** 区间内日均活跃（按天补零后取平均）。 */
    private double avgDau(AnalyticsRange r) {
        List<LocalDate> days = r.days();
        if (days.isEmpty()) return 0;
        Map<LocalDate, Long> raw = dauWithToday(r.from(), r.to());
        long sum = 0;
        for (LocalDate d : days) sum += raw.getOrDefault(d, 0L);
        return (double) sum / days.size();
    }

    /**
     * 日活数据 + **今天的实时值**。
     *
     * <p>为什么需要这一步：{@code sy_daily_active} 只在每天 00:05 落**昨天**的数据
     * （当天还没过完，HLL 还在长），所以「今天」这一格在库里永远是空的 ——
     * 直接查库的话，概览的日均活跃和活跃页的 DAU 会一整天显示 0，要等第二天才出现。
     * 这里把 Redis 里今天的 {@code act:dau:*} 补进 map（取较大值，避免与历史值打架）。
     */
    private Map<LocalDate, Long> dauWithToday(LocalDate from, LocalDate to) {
        Map<LocalDate, Long> raw = new java.util.LinkedHashMap<>(repo.dauByDay(from, to));
        LocalDate today = DayKeys.todayDate();
        if (!today.isBefore(from) && !today.isAfter(to)) {
            long realtime = todayDauFromRedis();
            if (realtime > raw.getOrDefault(today, 0L)) raw.put(today, realtime);
        }
        return raw;
    }

    /** 读 Redis 里今天的 DAU；Redis 不可用时按 0 处理（统计不能因此 500）。 */
    private long todayDauFromRedis() {
        try {
            return pv.countActive(DayKeys.dayKey(DayKeys.todayDate()));
        } catch (Exception e) {
            log.debug("读取今日实时 DAU 失败（按 0 处理）", e);
            return 0;
        }
    }

    private static AnalyticsDtos.KpiItem kpi(String key, String label, long value, long prev, String unit) {
        Double delta = prev > 0 ? round1((value - prev) * 100.0 / prev) : null;
        return new AnalyticsDtos.KpiItem(key, label, value, prev, delta, unit);
    }

    private static AnalyticsDtos.KpiItem current(String key, String label, long value, String unit) {
        return new AnalyticsDtos.KpiItem(key, label, value, value, null, unit);
    }

    // ==================== 2. 模块浏览 ====================

    public AnalyticsDtos.Modules modules(String range) {
        AnalyticsRange r = AnalyticsRange.ofRange(range, 30);
        return cached("modules", r.paramKey(), AnalyticsDtos.Modules.class, () -> buildModules(range, r));
    }

    private AnalyticsDtos.Modules buildModules(String range, AnalyticsRange r) {
        List<LocalDate> days = r.days();
        LocalDate today = DayKeys.todayDate();
        boolean includesToday = !today.isBefore(r.from()) && !today.isAfter(r.to());

        // 一次查询拿到所有逐日行：合计 / 单日峰值 / 趋势全从它推（少查两次，也不会出现口径不一致）
        Map<String, Map<LocalDate, AnalyticsRepo.ModuleDay>> byModule = new LinkedHashMap<>();
        for (AnalyticsRepo.ModuleDay row : repo.moduleByDay(r.from(), r.to())) {
            byModule.computeIfAbsent(row.module(), k -> new LinkedHashMap<>()).put(row.day(), row);
        }

        // ★ 今天的实时增量：Redis 里还没回写的 PV + HLL 的当日 UV。
        //   只读不删 —— 落库仍由定时任务原子取走，所以不会重复计数。
        //   不叠加这一步的话，用户刚浏览完在报表里看不到变化（最多差 5 分钟回写 + 60 秒缓存）。
        Map<String, Long> pending = includesToday ? safePendingPv(today) : Map.of();
        pending.keySet().forEach(m -> byModule.computeIfAbsent(m, k -> new LinkedHashMap<>()));

        List<ModuleAgg> aggs = new ArrayList<>();
        for (Map.Entry<String, Map<LocalDate, AnalyticsRepo.ModuleDay>> e : byModule.entrySet()) {
            Map<LocalDate, AnalyticsRepo.ModuleDay> rows = e.getValue();
            List<Long> pvList = new ArrayList<>(days.size());
            List<Long> uvList = new ArrayList<>(days.size());
            long pvSum = 0;
            long uvSum = 0;
            long uvPeak = 0;
            for (LocalDate d : days) {
                AnalyticsRepo.ModuleDay row = rows.get(d);
                long pv = row == null ? 0L : row.pv();
                long uv = row == null ? 0L : row.uv();
                if (includesToday && d.equals(today)) {
                    pv += pending.getOrDefault(e.getKey(), 0L);
                    // UV 快照是每小时的，可能落后于 HLL：取较大值，避免"今天的 UV 反而比昨天小"。
                    // 只在有 PV 的行上补 UV —— 否则会冒出"PV=0 但 UV=10"的幻影行
                    // （典型场景：后台是内存库、重启把 PV 清了，而 Redis 里的 HLL 还在）。
                    if (pv > 0) uv = Math.max(uv, safeModuleUv(today, e.getKey()));
                }
                pvList.add(pv);
                uvList.add(uv);
                pvSum += pv;
                uvSum += uv;
                uvPeak = Math.max(uvPeak, uv);
            }
            if (pvSum == 0 && uvSum == 0) continue;      // 这段时间完全没数据的模块不出现在表里
            aggs.add(new ModuleAgg(e.getKey(), pvSum, uvSum, uvPeak, pvList, uvList));
        }

        aggs.sort((a, b) -> Long.compare(b.pv(), a.pv()));
        long totalPv = aggs.stream().mapToLong(ModuleAgg::pv).sum();

        List<AnalyticsDtos.ModuleStat> stats = new ArrayList<>(aggs.size());
        List<AnalyticsDtos.ModuleSeries> series = new ArrayList<>(aggs.size());
        for (ModuleAgg a : aggs) {
            double share = totalPv > 0 ? round1(a.pv() * 100.0 / totalPv) : 0;
            stats.add(new AnalyticsDtos.ModuleStat(a.module(), a.pv(), a.uv(), a.uvPeak(), share));
            series.add(new AnalyticsDtos.ModuleSeries(a.module(), a.pvList(), a.uvList()));
        }

        List<String> dayLabels = new ArrayList<>(days.size());
        for (LocalDate d : days) dayLabels.add(mmdd(d));

        return new AnalyticsDtos.Modules(normalizeRange(range), r.from().toString(), r.to().toString(),
                includesToday, stats, new AnalyticsDtos.ModuleTrend(dayLabels, series));
    }

    /** 一个模块的合计 + 逐日序列（内部用，排完序再转成 DTO）。 */
    private record ModuleAgg(String module, long pv, long uv, long uvPeak, List<Long> pvList, List<Long> uvList) { }

    /** 读 Redis 里今天的待回写 PV；Redis 不可用按空处理（报表不能因此 500）。 */
    private Map<String, Long> safePendingPv(LocalDate day) {
        try {
            Map<String, Long> m = pv.pendingPv(DayKeys.dayKey(day));
            return m == null ? Map.of() : m;
        } catch (Exception e) {
            log.debug("读取待回写 PV 失败（按 0 处理）", e);
            return Map.of();
        }
    }

    /** 读某个模块今天的 HLL 去重 UV；失败按 0 处理。 */
    private long safeModuleUv(LocalDate day, String module) {
        try {
            return pv.countUv(DayKeys.dayKey(day), module);
        } catch (Exception e) {
            log.debug("读取模块实时 UV 失败（按 0 处理）module={}", module, e);
            return 0L;
        }
    }

    // ==================== 3. 趋势 ====================

    public AnalyticsDtos.Trend trend(String metric, String range, String granularity) {
        String m = metric == null || metric.isBlank() ? "matches" : metric.trim();
        if (!METRICS.contains(m)) {
            throw new IllegalArgumentException("INVALID_METRIC: 只支持 " + String.join(" / ", METRICS));
        }
        if (granularity != null && !granularity.isBlank() && !"day".equals(granularity.trim())) {
            // 诚实一点的错误：小时级数据现在没采集，别假装支持
            throw new IllegalArgumentException("INVALID_GRANULARITY: 目前只支持 day（小时级未采集）");
        }
        AnalyticsRange r = AnalyticsRange.ofRange(range, 30);
        return cached("trend", m + "_" + r.paramKey(), AnalyticsDtos.Trend.class, () -> {
            Map<LocalDate, Long> raw = switch (m) {
                case "posts" -> repo.postsByDay(r.from(), r.to());
                case "active" -> repo.dauByDay(r.from(), r.to());
                case "revenue" -> repo.revenueByDay(r.from(), r.to());
                case "reports" -> repo.reportsByDay(r.from(), r.to());
                case "newUsers" -> repo.usersByDay(r.from(), r.to());
                default -> repo.matchesByDay(r.from(), r.to());
            };
            return new AnalyticsDtos.Trend(m, normalizeRange(range), "day", fill(r.days(), raw));
        });
    }

    // ==================== 4. 分布 ====================

    public AnalyticsDtos.Breakdown breakdown(String dim, String range) {
        String d = dim == null || dim.isBlank() ? "tier" : dim.trim();
        if (!AnalyticsRepo.DIMS.contains(d)) {
            throw new IllegalArgumentException("INVALID_DIM: 只支持 " + String.join(" / ", AnalyticsRepo.DIMS));
        }
        AnalyticsRange r = AnalyticsRange.ofRange(range, 30);
        return cached("breakdown", d + "_" + r.paramKey(), AnalyticsDtos.Breakdown.class, () -> {
            List<AnalyticsRepo.KeyCount> rows = repo.breakdown(d, r.from(), r.to());
            List<AnalyticsDtos.Point> points = new ArrayList<>(rows.size());
            long total = 0;
            for (AnalyticsRepo.KeyCount row : rows) {
                points.add(new AnalyticsDtos.Point(row.key() == null ? "UNKNOWN" : row.key(), row.n()));
                total += row.n();
            }
            return new AnalyticsDtos.Breakdown(d, normalizeRange(range), points, total);
        });
    }

    // ==================== 5. 活跃 ====================

    public AnalyticsDtos.Active active(String range) {
        AnalyticsRange r = AnalyticsRange.ofRange(range, 30);
        return cached("active", r.paramKey(), AnalyticsDtos.Active.class, () -> {
            Map<LocalDate, Long> raw = dauWithToday(r.from(), r.to());
            List<AnalyticsDtos.Point> points = fill(r.days(), raw);
            long dau = raw.getOrDefault(DayKeys.todayDate(), 0L);
            // WAU / MAU 必须用 HLL 合并去重（把每天的 DAU 相加会把同一个人算成好几个人）
            long wau = pv.unionActive(lastDays(7));
            long mau = pv.unionActive(lastDays(30));
            return new AnalyticsDtos.Active(normalizeRange(range), points, dau, wau, mau);
        });
    }

    private static List<String> lastDays(int n) {
        LocalDate today = DayKeys.todayDate();
        List<String> out = new ArrayList<>(n);
        for (int i = n - 1; i >= 0; i--) out.add(DayKeys.dayKey(today.minusDays(i)));
        return out;
    }

    // ==================== 6. 质量 ====================

    /** 六维的固定顺序（与 MatchService 写进 dims_json 的键一致）。 */
    private static final List<String> DIM_ORDER = List.of("立论", "论证", "表达", "应变", "论据", "协同");

    public AnalyticsDtos.Quality quality(String range) {
        AnalyticsRange r = AnalyticsRange.ofRange(range, 30);
        return cached("quality", r.paramKey(), AnalyticsDtos.Quality.class, () -> {
            double avgTurns = repo.avgTurns(r.from(), r.to());
            long samples = repo.recordSamples(r.from(), r.to());

            AnalyticsRepo.AiTurns turns = repo.aiTurns(r.from(), r.to());
            double aiRatio = turns.total() > 0 ? round1(turns.ai() * 100.0 / turns.total()) : 0;

            // 六维：每场一个 JSON（{"立论":72,...}），Java 里求平均
            Map<String, double[]> acc = new LinkedHashMap<>();   // key -> [sum, count]
            for (String raw : repo.dimsJson(r.from(), r.to())) {
                try {
                    Map<?, ?> map = json.readValue(raw, Map.class);
                    for (Map.Entry<?, ?> e : map.entrySet()) {
                        double v = Double.parseDouble(String.valueOf(e.getValue()));
                        acc.computeIfAbsent(String.valueOf(e.getKey()), k -> new double[2]);
                        double[] pair = acc.get(String.valueOf(e.getKey()));
                        pair[0] += v;
                        pair[1] += 1;
                    }
                } catch (Exception e) {
                    // 单条脏数据跳过，不影响整体平均（历史数据里可能有旧格式）
                    log.debug("跳过无法解析的 dims_json: {}", raw, e);
                }
            }
            List<AnalyticsDtos.DimAvg> dims = new ArrayList<>();
            for (String key : DIM_ORDER) {
                double[] pair = acc.get(key);
                if (pair != null && pair[1] > 0) dims.add(new AnalyticsDtos.DimAvg(key, key, round1(pair[0] / pair[1])));
            }
            // 以后新增的维度（不在固定顺序里的）追加在后面，不丢数据
            for (Map.Entry<String, double[]> e : acc.entrySet()) {
                if (DIM_ORDER.contains(e.getKey())) continue;
                if (e.getValue()[1] > 0) {
                    dims.add(new AnalyticsDtos.DimAvg(e.getKey(), e.getKey(), round1(e.getValue()[0] / e.getValue()[1])));
                }
            }

            return new AnalyticsDtos.Quality(normalizeRange(range), round1(avgTurns), aiRatio, dims, samples);
        });
    }

    // ==================== 内部小工具 ====================

    /** 缓存包装：命中就反序列化返回；否则算完写回。任何缓存异常都退化为直查。 */
    private <T> T cached(String api, String paramKey, Class<T> type, Supplier<T> compute) {
        String hit = cache.get(api, paramKey);
        if (hit != null) {
            try {
                return json.readValue(hit, type);
            } catch (Exception e) {
                log.warn("报表缓存反序列化失败，改为直查 api={} key={}", api, paramKey, e);
            }
        }
        T fresh = compute.get();
        try {
            cache.put(api, paramKey, json.writeValueAsString(fresh));
        } catch (Exception e) {
            log.warn("报表结果序列化失败（不影响返回） api={}", api, e);
        }
        return fresh;
    }

    /** 按天补零：区间里每一天都要有点。 */
    private static List<AnalyticsDtos.Point> fill(List<LocalDate> days, Map<LocalDate, Long> raw) {
        List<AnalyticsDtos.Point> out = new ArrayList<>(days.size());
        for (LocalDate d : days) out.add(new AnalyticsDtos.Point(mmdd(d), raw.getOrDefault(d, 0L)));
        return out;
    }

    private static String mmdd(LocalDate d) {
        return String.format("%02d-%02d", d.getMonthValue(), d.getDayOfMonth());
    }

    private static String normalizeRange(String range) {
        return (range == null || range.isBlank()) ? "30d" : range.trim().toLowerCase();
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
