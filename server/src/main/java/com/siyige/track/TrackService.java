package com.siyige.track;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 模块浏览上报（设计文档 §2）。
 *
 * <p>两条规则，都很关键：
 * <ol>
 *   <li><b>白名单是唯一关口</b>：只收 §1 里的 11 个模块，其他一律 400 —— 防止脏 module 把报表打成一堆杂项；</li>
 *   <li><b>统计失败不影响用户</b>：Redis 抖动时只记 warn 并返回 {@code ok:false}，
 *       接口仍然 200（用户正在跳页面，不能因为一个统计失败让他看到错误）。</li>
 * </ol>
 *
 * <p>为什么不在前端做白名单：前端可以改，白名单必须在服务端才防得住脏数据；
 * 前端那份 {@code MODULE_OF} 只负责「路径 -> 模块」的映射，不是安全边界。
 */
@Service
public class TrackService {

    private static final Logger log = LoggerFactory.getLogger(TrackService.class);

    /** 11 个统计模块（顺序即设计文档 §1 的表格顺序，方便对照）。 */
    public static final Set<String> MODULES = Set.copyOf(new LinkedHashSet<>(java.util.List.of(
            "community", "chat", "match", "solo", "video",
            "hot", "diag", "records", "wallet", "friends", "admin"
    )));

    private final PvStore store;

    public TrackService(PvStore store) {
        this.store = store;
    }

    /**
     * 记一次模块浏览。
     *
     * @param module 模块名（前端传路径映射后的值）
     * @param userId 当前用户 id；匿名为 null（匿名也计 PV，只是不进 UV）
     * @return true = 已记进 Redis；false = Redis 不可用，这次统计丢弃
     * @throws IllegalArgumentException module 不在白名单（由 ApiErrors 转成 400）
     */
    public boolean record(String module, String userId) {
        String m = module == null ? "" : module.trim();
        if (!MODULES.contains(m)) {
            throw new IllegalArgumentException("MODULE_NOT_ALLOWED: 未知模块 " + m);
        }
        try {
            String day = DayKeys.today();
            store.addPv(day, m, 1);
            // 带登录态才记 UV：匿名浏览只算 PV（设计 §2.3：带 token 就顺带把 userId 记进 UV）
            if (userId != null && !userId.isBlank()) store.addUv(day, m, userId);
            return true;
        } catch (Exception e) {
            log.warn("模块浏览上报失败（已忽略，统计可丢） module={} userId={}", m, userId, e);
            return false;
        }
    }
}
