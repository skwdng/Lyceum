package com.siyige.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 抓漏判定（核心训练动作）。
 *
 * 辩论最值钱的能力不是"说得好"，是**听得出对方哪一步错了**。
 * 这里让 AI 在发言里故意埋一处逻辑漏洞，玩家从五种类型里指出，
 * 指对了加分、指错了倒扣一点——这是唯一能直接训练"听"的功能。
 */
@Service
public class FlawService {

    public static final List<String> TYPES = List.of(
            "以偏概全", "诉诸权威", "未证前提", "偷换概念", "循环论证");

    /** 每种漏洞对应的"埋雷句"，直接追加在 AI 发言末尾，保证有雷可抓。 */
    private record Bomb(String type, String sentence) {}

    private static final List<Bomb> BOMBS = List.of(
            new Bomb("以偏概全", "我身边遇到的同学都是这么想的，可见所有人都反对这个方案。"),
            new Bomb("诉诸权威", "很多专家都说过这个结论，早就不需要再讨论了。"),
            new Bomb("未证前提", "这一点显然是常识，我方不再赘述。"),
            new Bomb("偷换概念", "对方说要「可执行」，那就等于「必须立刻执行」，二者是一回事。"),
            new Bomb("循环论证", "这个方案是合理的，因为它确实很合理。")
    );

    public record Planted(String text, String type) {}

    /** 按难度决定埋雷概率：新手不埋，进阶四成，竞赛七成半。 */
    public Planted plant(String text, String difficulty) {
        double p = switch (difficulty == null ? "pro" : difficulty.toLowerCase()) {
            case "contest" -> 0.75;
            case "novice" -> 0.0;
            default -> 0.45;
        };
        if (text == null || text.isBlank() || Math.random() > p) return new Planted(text, null);

        Bomb bomb = BOMBS.get(ThreadLocalRandom.current().nextInt(BOMBS.size()));
        String merged = text.trim().replaceAll("[—–-]+$", "").trim();
        if (!merged.endsWith("。") && !merged.endsWith("？") && !merged.endsWith("！")) merged += "。";
        return new Planted(merged + " " + bomb.sentence(), bomb.type());
    }

    public boolean correct(String plantedType, String chosenType) {
        return plantedType != null && plantedType.equals(chosenType);
    }
}
