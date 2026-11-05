package com.siyige.community.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.time.Duration;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 任务队列：生产者 {@link #maybeEnqueue} + 消费者线程（方案 §3.2 / §3.3 / §7）。
 *
 * <pre>
 * stream  community:ai:tasks
 * group   ai-worker
 * consumer c-{hostname}-{pid}
 * </pre>
 *
 * <h3>生产者三道闸（顺序不能反）</h3>
 * <ol>
 *   <li>总开关：没配 key / 没 Redis → 整体关闭，{@code @DeepSeek} 只是普通文本</li>
 *   <li>@ 判定：正文**含** {@code @DeepSeek} 且 mentions 数组里**有** {@code ai_deepseek}（决策 2，与现有 @ 规则一致）</li>
 *   <li>限额：每账号每自然日 5 次（{@link AiUsageGuard}，入队即扣）</li>
 * </ol>
 *
 * <h3>消费者</h3>
 * XREADGROUP 取一条 → {@link AiReplyHandler#handle} → **finally 里 XACK**；
 * 每约 60 秒做一次 {@code pending + claim}（等价 XAUTOCLAIM，回收闲置 &gt;5 分钟的消息，
 * 覆盖「消费者崩溃后消息留在 PEL」的场景）。
 *
 * <p>队列只是**加速器**：Redis 挂了 / 队列积压 / 消费者异常都只影响"AI 这次没答"，
 * 绝不会让用户的发帖、评论失败（所有异常在各自层被吃掉 + warn）。
 */
@Component
public class AiQueue implements ApplicationRunner, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(AiQueue.class);

    static final String STREAM = "community:ai:tasks";
    static final String GROUP = "ai-worker";

    /** 每次 read 阻塞时长（毫秒级空转，不烧 CPU）。 */
    private static final Duration READ_BLOCK = Duration.ofSeconds(5);
    /** PEL 里的消息闲置多久算"僵尸"（进程崩溃留下的）。 */
    private static final Duration CLAIM_MIN_IDLE = Duration.ofMinutes(5);
    /** 每隔多少轮 read 做一次 claim（≈60 秒）。 */
    private static final int CLAIM_EVERY_N_ROUNDS = 12;

    private final AiConfig config;
    private final AiUsageGuard usageGuard;
    private final AiReplyHandler handler;
    /** 生产者/快命令用共享模板（50ms 快速失败，不拖慢用户请求）。 */
    private final StringRedisTemplate redis;
    /** 阻塞读用长超时模板（见 {@link AiRedis} 的说明：50ms 会掐断 BLOCK 5s）。 */
    private final StreamOperations<String, String, String> streams;

    private final String consumerName = buildConsumerName();
    private volatile Thread worker;
    private volatile boolean running;

    public AiQueue(AiConfig config, AiUsageGuard usageGuard, AiReplyHandler handler,
                   StringRedisTemplate redis, AiRedis aiRedis) {
        this.config = config;
        this.usageGuard = usageGuard;
        this.handler = handler;
        this.redis = redis;
        this.streams = aiRedis.template().opsForStream();
    }

    // ==================== 生产者 ====================

    /**
     * 判断要不要为这次发言叫 AI，要的话丢进队列。
     *
     * <p>这是**同步且极快**的（三道闸 + 一次 XADD），绝不阻塞用户的发帖/评论请求。
     *
     * @param commentId 评论/回复的 id；发帖时传 null
     * @param rootId    楼中楼所属楼的 id；不是楼中楼传 null
     * @param mentions  请求体里的 {@code mentions} 数组（可能为 null）
     */
    public void maybeEnqueue(long postId, Long commentId, String askerId,
                             Long rootId, String text, Object mentions) {
        if (!config.enabled()) return;                        // 闸 ①
        if (!mentionsAi(text, mentions)) return;              // 闸 ②
        if (!usageGuard.tryAcquire(askerId)) return;          // 闸 ③（入队即扣，决策 3）

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("postId", String.valueOf(postId));
        fields.put("commentId", commentId == null ? "" : String.valueOf(commentId));
        fields.put("askerId", askerId == null ? "" : askerId);
        fields.put("rootId", rootId == null ? "" : String.valueOf(rootId));
        fields.put("text", text == null ? "" : text);
        fields.put("ts", String.valueOf(System.currentTimeMillis()));

        try {
            var recordId = streams.add(org.springframework.data.redis.connection.stream.StreamRecords
                    .mapBacked(fields).withStreamKey(STREAM));
            log.info("AI 任务入队 id={} postId={} commentId={} asker={}",
                    recordId, postId, commentId, askerId);
        } catch (RuntimeException e) {
            log.warn("AI 任务入队失败（不影响用户操作）postId={} 原因={}", postId, e.toString());
        }
    }

    /**
     * 决策 2：正文里**含** {@code @DeepSeek}，**且** mentions 数组里有 {@code ai_deepseek}。
     *
     * <p>两个条件缺一不可——只看 mentions 会被伪造请求刷（正文根本没 @ 也触发），
     * 只看正文则偏离「@ 只认 userId」的既有规则。
     */
    static boolean mentionsAi(String text, Object mentions) {
        if (text == null || !text.contains("@" + AiAccount.NAME)) return false;
        if (!(mentions instanceof Collection<?> list) || list.isEmpty()) return false;
        for (Object o : list) {
            if (o != null && AiAccount.ID.equals(String.valueOf(o).trim())) return true;
        }
        return false;
    }

    // ==================== 消费者 ====================

    @Override
    public void run(ApplicationArguments args) {
        if (!config.enabled()) {
            log.info("AI 队列未启动（{}）", config.reason());
            return;
        }
        ensureGroup();
        running = true;
        worker = new Thread(this::loop, "ai-consumer");
        worker.setDaemon(true);
        worker.start();
        log.info("AI 消费者已启动 consumer={} stream={} group={}", consumerName, STREAM, GROUP);
    }

    private void loop() {
        int rounds = 0;
        while (running && !Thread.currentThread().isInterrupted()) {
            try {
                List<MapRecord<String, String, String>> records = streams.read(
                        Consumer.from(GROUP, consumerName),
                        StreamReadOptions.empty().count(1).block(READ_BLOCK),
                        StreamOffset.create(STREAM, ReadOffset.lastConsumed()));

                if (records != null) {
                    for (MapRecord<String, String, String> rec : records) {
                        try {
                            handler.handle(rec.getId().getValue(), rec.getValue());
                        } catch (RuntimeException e) {
                            // handler 自己已经兜过一层，这里再兜：一条任务炸了不能拖死消费者
                            log.warn("AI 任务处理异常 id={} 原因={}", rec.getId(), e.toString());
                        } finally {
                            ack(rec.getId().getValue());
                        }
                    }
                }

                if (++rounds % CLAIM_EVERY_N_ROUNDS == 0) reclaimZombies();
            } catch (Exception e) {
                if (!running || Thread.currentThread().isInterrupted()) break;
                log.warn("AI 队列读取失败（5 秒后重试）: {}", e.toString());
                sleepQuietly(5000);
            }
        }
    }

    /**
     * XGROUP CREATE ... MKSTREAM；组已存在（BUSYGROUP）时静默。
     *
     * <p><b>为什么要把异常链走一遍</b>：Spring Data Redis 抛的是
     * {@code RedisSystemException: Error in execution}，真正的 {@code BUSYGROUP} 在
     * {@code getCause()} 里。只看 {@code getMessage()} 会把「组已存在」这个**正常情况**
     * 误报成「创建失败」，每次启动都刷一条吓人的 WARN。
     */
    private void ensureGroup() {
        try {
            streams.createGroup(STREAM, ReadOffset.from("0"), GROUP);
            log.info("AI 消费组已创建 group={} stream={}", GROUP, STREAM);
        } catch (RuntimeException e) {
            if (isBusyGroup(e)) {
                log.info("AI 消费组已存在，复用 group={} stream={}", GROUP, STREAM);
            } else {
                log.warn("AI 消费组创建失败（消费者会持续重试）group={} 原因={}", GROUP, rootMessage(e));
            }
        }
    }

    /** 判定是否为「消费组已存在」：沿异常链找 BUSYGROUP。 */
    static boolean isBusyGroup(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String msg = t.getMessage();
            if (msg != null && msg.contains("BUSYGROUP")) return true;
            if (t.getCause() == t) break;   // 防自环
        }
        return false;
    }

    /** 取异常链最内层的一句话，日志里看得懂。 */
    static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) t = t.getCause();
        String msg = t.getMessage();
        return t.getClass().getSimpleName() + (msg == null ? "" : ": " + msg);
    }

    /**
     * 回收僵尸消息：PEL 里闲置 &gt; 5 分钟的抢回来处理。
     *
     * <p>等价于 {@code XAUTOCLAIM}，用 {@code XPENDING} + {@code XCLAIM} 两步实现
     * （Spring Data 的 {@code pending(...)} 没有 min-idle 过滤参数，idle 时间要自己比）。
     */
    private void reclaimZombies() {
        try {
            PendingMessages pending = streams.pending(STREAM, Consumer.from(GROUP, consumerName));
            if (pending == null || pending.isEmpty()) return;

            int n = 0;
            for (PendingMessage p : pending) {
                if (n >= 20) break;
                if (p.getElapsedTimeSinceLastDelivery().compareTo(CLAIM_MIN_IDLE) < 0) continue;

                List<MapRecord<String, String, String>> claimed = streams.claim(STREAM, GROUP, consumerName,
                        CLAIM_MIN_IDLE, p.getId());
                if (claimed == null) continue;
                for (MapRecord<String, String, String> rec : claimed) {
                    n++;
                    try {
                        handler.handle(rec.getId().getValue(), rec.getValue());
                    } catch (RuntimeException e) {
                        log.warn("AI 回收任务处理异常 id={} 原因={}", rec.getId(), e.toString());
                    } finally {
                        ack(rec.getId().getValue());
                    }
                }
            }
            if (n > 0) log.info("AI 回收僵尸任务 {} 条", n);
        } catch (RuntimeException e) {
            log.debug("AI 回收僵尸任务失败（下轮再试）: {}", e.toString());
        }
    }

    private void ack(String recordId) {
        try {
            streams.acknowledge(STREAM, GROUP, recordId);
        } catch (RuntimeException e) {
            log.warn("AI XACK 失败 id={}（可能被重投，结果层会挡住）原因={}", recordId, e.toString());
        }
    }

    @Override
    public void destroy() {
        running = false;
        if (worker != null) worker.interrupt();
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** consumer 名带主机与 pid：多实例部署时能看出是谁在处理。 */
    private static String buildConsumerName() {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "unknown";
        }
        String pid = ManagementFactory.getRuntimeMXBean().getName().split("@")[0];
        return "c-" + host + "-" + pid;
    }
}
