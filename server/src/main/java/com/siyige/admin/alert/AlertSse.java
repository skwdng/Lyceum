package com.siyige.admin.alert;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 告警的 SSE 通道：**只推「未处理数」这一件事**（设计 §7）。
 *
 * <p>为什么不推具体告警：前端全局只关心红点；列表由页面自己拉，
 * 推整条告警反而要处理"合并/去重/顺序"这些破事，收益为零。
 *
 * <p>与 {@code api/SseHub} 是**两个**类不复用：那个按 `matchId` 维度订阅 + 落 sy_event 补发，
 * 这个按「全部在线管理员」广播、不落库（红点从库里现算，不在线也不补发 —— 决策 6）。
 *
 * <p>生命周期与 SseHub 一致：`onCompletion` / `onTimeout` / `onError` 三处都要把 emitter 摘掉，
 * 否则断线会一直留在 map 里，`send` 每次都抛异常。
 */
@Component
public class AlertSse {

    private static final Logger log = LoggerFactory.getLogger(AlertSse.class);

    /** adminId -> 该管理员的连接（同一人开多个标签页会有多条）。 */
    private final Map<Long, List<SseEmitter>> subs = new ConcurrentHashMap<>();
    private final ObjectMapper json;
    /**
     * 建连后的第一次推送**必须**晚一点做（放到这个单线程调度器上）。
     *
     * <p>在控制器方法返回 emitter 之前直接 {@code send}，等于在 Spring MVC 还没把请求切成
     * async 的时候就写响应：轻则抛 "response already committed"，重则把这条连接留在
     * 半开状态 —— 浏览器那侧的连接槽被占住，后续 fetch 全部排队，表现就是
     * 「页面点开一会儿之后，所有请求都卡住」（自检里表现为"抽屉评论树 timeout"）。
     * 100ms 足够让容器把 emitter 注册好，用户也感觉不到。
     */
    private final java.util.concurrent.ScheduledExecutorService firstPush =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "alert-sse-first-push");
                t.setDaemon(true);
                return t;
            });

    public AlertSse(ObjectMapper json) {
        this.json = json;
    }

    /**
     * 订阅：0L 不超时（SSE 长连接），断线由 onCompletion/onError 收尸。
     *
     * <p>建连就先推一次当前未处理数：前端不用再多打一次 /unread，
     * 自检脚本也能"连上就拿到一个事件"而不用等 20 秒心跳。
     */
    public SseEmitter subscribe(long adminId, long initialUnread) {
        // 5 分钟强制超时：万一客户端进程被杀/网络断在半路，连接不会**永远**挂着。
        // 前端会自己重连（带退避），用户完全无感；不设超时的话，
        // 反复刷新页面会把浏览器的同源连接槽占满（6 个），之后所有请求都排队。
        SseEmitter emitter = new SseEmitter(5 * 60_000L);
        subs.computeIfAbsent(adminId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(adminId, emitter));
        emitter.onTimeout(() -> { remove(adminId, emitter); emitter.complete(); });
        emitter.onError(e -> remove(adminId, emitter));
        final String data = payload(initialUnread);
        firstPush.schedule(() -> push(adminId, emitter, data), 100, java.util.concurrent.TimeUnit.MILLISECONDS);
        return emitter;
    }

    /** 广播最新未处理数（`event: alert` + `{unread:n}`）。 */
    public void broadcastUnread(long unread) {
        final String data = payload(unread);      // 放进 lambda 前必须是 effectively final
        subs.forEach((adminId, list) -> list.forEach(e -> push(adminId, e, data)));
    }

    private String payload(long unread) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("unread", unread);
            body.put("at", System.currentTimeMillis());
            return json.writeValueAsString(body);
        } catch (Exception e) {
            return "{\"unread\":" + unread + "}";
        }
    }

    /** 心跳：20 秒一次 comment，防代理/浏览器把空闲连接掐掉（照 SseHub 的节奏）。 */
    @Scheduled(fixedDelay = 20_000, initialDelay = 20_000)
    public void heartbeat() {
        subs.forEach((adminId, list) -> list.forEach(e -> {
            try {
                e.send(SseEmitter.event().comment("hb"));
            } catch (Throwable ex) {
                // 浏览器关页面/换网络时这里必然抛 IOException，属于正常现象：
                // 摘掉这条连接就行，**绝不能让异常冒到调度线程**（会把整轮心跳打断）
                remove(adminId, e);
            }
        }));
    }

    /** 当前在线连接数（健康检查/测试用）。 */
    public int onlineCount() {
        return subs.values().stream().mapToInt(List::size).sum();
    }

    private void push(long adminId, SseEmitter emitter, String data) {
        try {
            emitter.send(SseEmitter.event().name("alert").data(data));
        } catch (Exception ex) {
            // 发不出去说明对端已断（关页面/换网络），立刻摘掉，别留垃圾
            remove(adminId, emitter);
            log.debug("告警 SSE 推送失败已摘除 adminId={}：{}", adminId, ex.toString());
        }
    }

    private void remove(long adminId, SseEmitter emitter) {
        List<SseEmitter> list = subs.get(adminId);
        if (list == null) return;
        list.remove(emitter);
        if (list.isEmpty()) subs.remove(adminId);
    }
}
