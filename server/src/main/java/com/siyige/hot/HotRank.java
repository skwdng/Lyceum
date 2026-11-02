package com.siyige.hot;

import org.springframework.stereotype.Component;

import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 热辩榜 = Redis ZSET 的同一套语义。
 * 生产环境换成 RedisTemplate.opsForZSet()，方法一一对应：
 *   zincrby   → opsForZSet().incrementScore(key, member, delta)
 *   zrevrange → opsForZSet().reverseRangeWithScores(key, 0, n-1)
 *   zrevrank  → opsForZSet().reverseRank(key, member)
 *   expire    → opsForZSet().getOperations().expire(key, ttl)
 */
public interface HotRank {

    double zincrby(String member, double delta);

    double zscore(String member);

    /** 按分数倒序返回 [member → score]。 */
    List<Map.Entry<String, Double>> zrevrangeWithScores(int start, int stop);

    long zrevrank(String member);

    int zcard();

    String key();

    void decay(double amount);

    @Component
    class MemoryHotRank implements HotRank {

        private final Map<String, Double> map = new ConcurrentHashMap<>();

        public MemoryHotRank() {
            // 演示初始热度（与前端一致）
            zincrby("t1", 86); zincrby("t4", 152); zincrby("t11", 121);
            zincrby("t3", 178); zincrby("t6", 97); zincrby("t12", 64);
            zincrby("t7", 73); zincrby("t2", 41); zincrby("t10", 55); zincrby("t5", 33);
        }

        @Override public double zincrby(String member, double delta) {
            return map.merge(member, delta, Double::sum);
        }

        @Override public double zscore(String member) { return map.getOrDefault(member, 0.0); }

        @Override public List<Map.Entry<String, Double>> zrevrangeWithScores(int start, int stop) {
            List<Map.Entry<String, Double>> list = new ArrayList<>(map.entrySet());
            list.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
            int from = Math.max(0, start);
            int to = stop < 0 ? list.size() : Math.min(list.size(), stop + 1);
            return from >= to ? List.of() : new ArrayList<>(list.subList(from, to));
        }

        @Override public long zrevrank(String member) {
            List<Map.Entry<String, Double>> list = new ArrayList<>(map.entrySet());
            list.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
            for (int i = 0; i < list.size(); i++) if (list.get(i).getKey().equals(member)) return i;
            return -1;
        }

        @Override public int zcard() { return map.size(); }

        @Override public String key() { return "hot:debate:" + java.time.LocalDate.now(); }

        @Override public void decay(double amount) {
            map.replaceAll((k, v) -> Math.max(0, v - amount));
        }

        public Map.Entry<String, Double> entry(String member) {
            return new AbstractMap.SimpleEntry<>(member, zscore(member));
        }
    }
}
