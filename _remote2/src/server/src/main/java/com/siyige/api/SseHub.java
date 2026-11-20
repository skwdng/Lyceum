package com.siyige.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.repo.Store;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** 对局进度推送：SSE 给前端，同时落 sy_event 供断线补发。 */
@Component
public class SseHub {

    private final Map<String, List<SseEmitter>> subs = new ConcurrentHashMap<>();
    private final Store store;
    private final ObjectMapper json;

    public SseHub(Store store, ObjectMapper json) {
        this.store = store;
        this.json = json;
        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-heartbeat"); t.setDaemon(true); return t;
        }).scheduleAtFixedRate(this::ping, 20, 20, TimeUnit.SECONDS);
    }

    private void ping() {
        subs.forEach((k, list) -> list.forEach(e -> {
            try { e.send(SseEmitter.event().comment("hb")); } catch (Exception ex) { list.remove(e); }
        }));
    }

    public SseEmitter subscribe(String matchId, int since) {
        SseEmitter emitter = new SseEmitter(0L);
        subs.computeIfAbsent(matchId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> subs.getOrDefault(matchId, List.of()).remove(emitter));
        emitter.onTimeout(emitter::complete);
        emitter.onError(e -> subs.getOrDefault(matchId, List.of()).remove(emitter));
        try {
            for (Map<String, Object> ev : store.events(matchId, since)) {
                emitter.send(SseEmitter.event().id(String.valueOf(ev.get("seq")))
                        .data(String.valueOf(ev.get("payload"))));
            }
        } catch (Exception ignored) {}
        return emitter;
    }

    public void emit(String matchId, String type, Map<String, Object> payload) {
        Map<String, Object> body = new java.util.LinkedHashMap<>(payload);
        body.put("type", type);
        body.put("matchId", matchId);
        String data;
        try { data = json.writeValueAsString(body); } catch (Exception e) { data = "{\"type\":\"" + type + "\"}"; }
        int seq = store.nextSeq(matchId);
        try { store.saveEvent(matchId, seq, type, data); } catch (Exception ignored) {}
        for (SseEmitter e : subs.getOrDefault(matchId, List.of())) {
            try { e.send(SseEmitter.event().id(String.valueOf(seq)).data(data)); }
            catch (Exception ex) { subs.getOrDefault(matchId, List.of()).remove(e); }
        }
    }
}
