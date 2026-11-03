package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Map;

/**
 * 浏览计数（SPEC-v4.2 §18.5 R-COM-30~38）。
 *
 * <p>写路径：只动 Redis（去重 Set + 待回写 Hash），绝不更新 post.view_count，也不阻塞详情页；
 * 连数据库存在性检查失败也只记 warn（浏览是后台统计，不能拖垮详情页）。
 * 回写路径：定时任务每 5 分钟只更新 view_count，热度由 CommunityHotScoreScheduler 每 10 分钟统一重算。
 *
 * <p>时区一律 Asia/Shanghai（R-COM-30）：去重集按自然日过期，用 EXPIREAT 指定次日 02:00（R-COM-32）。
 */
@Service
public class CommunityViewService {

    private static final Logger log = LoggerFactory.getLogger(CommunityViewService.class);

    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    static final String PENDING_KEY = "view:pending";
    private static final String SEEN_KEY_PREFIX = "view:seen:";

    private final CommunityRepo repo;
    private final ViewStore store;

    public CommunityViewService(CommunityRepo repo, ViewStore store) {
        this.repo = repo;
        this.store = store;
    }

    // ==================== 写（浏览器触发） ====================

    /**
     * 记录一次浏览（R-COM-37）：只有「帖子确实不存在」才 404；
     * 数据库故障、Redis 故障都只记日志并正常返回，不能阻塞详情页。
     */
    public void recordView(String userId, long postId) {
        boolean exists;
        try {
            exists = repo.existsActive(postId);
        } catch (Exception e) {
            // 数据库不可用：浏览是后台统计，不能因此让详情页 500
            log.warn("浏览计数：帖子存在性检查失败，已忽略以不阻塞详情页 postId={}", postId, e);
            return;
        }
        if (!exists) {
            throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在或已删除");
        }

        String uid = userId == null || userId.isBlank() ? "u-demo" : userId.trim();
        try {
            Instant now = Instant.now();
            String seenKey = seenKey(postId, dayKey(now));
            long added = store.recordSeen(seenKey, PENDING_KEY, uid, postId, expireAtEpochSecond(now));
            log.info("浏览计数 postId={} userId={} added={}", postId, uid, added);
        } catch (Exception e) {
            log.warn("浏览计数失败，已忽略以不阻塞详情页 postId={} userId={}", postId, uid, e);
        }
    }

    // ==================== 读时叠加（列表 / 详情） ====================

    /**
     * 批量查询"尚未回写"的浏览增量，供读路径叠加显示（界面值 = 数据库值 + 这里的增量）。
     *
     * <p>这是<b>只读窥视</b>，不会清空 {@code view:pending}，不影响回写语义。
     * 任何异常都降级为空 Map（= 只显示数据库值），绝不让详情页/列表 500（R-COM-37）。
     *
     * @param postIds 本页要展示的帖子 id
     * @return postId -> 增量；查询失败或空集合时返回空 Map（不为 null）
     */
    public Map<Long, Long> pendingCounts(Collection<Long> postIds) {
        if (postIds == null || postIds.isEmpty()) return Map.of();
        try {
            Map<Long, Long> got = store.peekPending(PENDING_KEY, postIds);
            return got == null ? Map.of() : got;
        } catch (Exception e) {
            // Redis 故障：退化为只显示数据库值，接口仍 200（R-COM-37）
            log.warn("读取 view:pending 增量失败，本次按 0 叠加（只显示数据库值） size={}", postIds.size(), e);
            return Map.of();
        }
    }

    // ==================== 回写（定时任务触发） ====================

    /**
     * 把 view:pending 的增量批量回写到 post.view_count（只改浏览数，不动 hot_score）。
     *
     * @return 实际更新成功的帖子数
     */
    @Transactional
    public int flushPending() {
        Map<Long, Long> pending;
        try {
            pending = store.takePending(PENDING_KEY);
        } catch (Exception e) {
            log.error("读取 view:pending 失败，跳过本次回写", e);
            return 0;
        }
        if (pending == null || pending.isEmpty()) return 0;

        try {
            int applied = 0;
            for (Map.Entry<Long, Long> entry : pending.entrySet()) {
                long postId = entry.getKey();
                long delta = entry.getValue() == null ? 0 : entry.getValue();
                if (delta <= 0) continue;

                int rows = repo.addViewCount(postId, delta);
                if (rows == 0) {
                    // 帖子已删除：增量直接丢弃，不报错
                    continue;
                }
                applied++;
            }
            log.info("浏览回写完成 pendingPosts={} applied={}", pending.size(), applied);
            return applied;
        } catch (RuntimeException e) {
            // 事务会回滚；增量必须补回，不能静默吞掉（R-COM-36）
            restore(pending);
            log.error("浏览回写失败，已回滚并把增量补回 view:pending", e);
            throw e;
        }
    }

    private void restore(Map<Long, Long> pending) {
        try {
            store.restorePending(PENDING_KEY, pending);
        } catch (Exception e) {
            // R-COM-38：Redis 重启导致的少计视为可接受，只告警
            log.error("补回 view:pending 失败，本次增量丢失（按 R-COM-38 可接受）", e);
        }
    }

    // ==================== 日期 / Key ====================

    /** 当天（Asia/Shanghai）的 yyyyMMdd。 */
    static String dayKey(Instant instant) {
        return DAY.format(LocalDate.ofInstant(instant, ZONE));
    }

    /** 次日 02:00（Asia/Shanghai）的 epoch 秒，用于 EXPIREAT。 */
    static long expireAtEpochSecond(Instant instant) {
        ZonedDateTime now = instant.atZone(ZONE);
        return now.toLocalDate().plusDays(1).atTime(2, 0).atZone(ZONE).toEpochSecond();
    }

    static String seenKey(long postId, String day) {
        return SEEN_KEY_PREFIX + postId + ":" + day;
    }
}
