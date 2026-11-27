package com.siyige.admin.words;

import com.siyige.community.SensitiveWordMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 启动时的一次性迁移（设计方案 §3）：把「文件 / yml」里的三份词表搬进库，然后重建内存词表。
 *
 * <pre>
 * ① COMMUNITY   表里 0 条 -> 从 community-sensitive-words.txt（外部文件 &gt; classpath）导入
 * ② VIDEO_REJECT 表里 0 条 -> 从 yml 的 siyige.video.audit.reject-words 导入
 * ③ VIDEO_REVIEW 表里 0 条 -> 从 yml 的 siyige.video.audit.review-words 导入
 * ④ 导入完重建缓存 + Masker 换表（打一行日志说清各导了几条）
 * </pre>
 *
 * <p><b>为什么按 scope 分别判断</b>：只给「空的那一份」导种子，不动已经有人在后台维护的词表；
 * 重复启动不会重复插（唯一索引 + 先查后插双重兜底），所以整个过程幂等。
 *
 * <p><b>yml 的两个键这次保留</b>（当种子用）：等线上确认表里数据齐了再单独删，不和本次混在一起。
 */
@Component
public class WordBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(WordBootstrap.class);

    /** 导入行的 created_by：一眼看出这批词是迁移来的，而不是某个人加的。 */
    static final String SEED_BY = "bootstrap";

    private final WordService words;
    private final List<String> rejectSeeds;
    private final List<String> reviewSeeds;

    public WordBootstrap(WordService words,
                         @Value("${siyige.video.audit.reject-words:}") String rejectWords,
                         @Value("${siyige.video.audit.review-words:}") String reviewWords) {
        this.words = words;
        this.rejectSeeds = split(rejectWords);
        this.reviewSeeds = split(reviewWords);
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int fromFile = seedIfEmpty(WordScope.COMMUNITY, SensitiveWordMasker.seedWords(),
                    "community-sensitive-words.txt");
            int reject = seedIfEmpty(WordScope.VIDEO_REJECT, rejectSeeds, "yml reject-words");
            int review = seedIfEmpty(WordScope.VIDEO_REVIEW, reviewSeeds, "yml review-words");

            words.reload();

            if (fromFile + reject + review == 0) {
                log.info("屏蔽词表已在库中，本次不导入种子（COMMUNITY {} / VIDEO_REJECT {} / VIDEO_REVIEW {} 条）",
                        words.countAll(WordScope.COMMUNITY), words.countAll(WordScope.VIDEO_REJECT),
                        words.countAll(WordScope.VIDEO_REVIEW));
            } else {
                log.info("屏蔽词首次导入完成：文件导入 {} 条、yml 导入 {} + {} 条", fromFile, reject, review);
            }
            if (words.communityEmpty()) {
                log.error("社区词表为空（迁移后仍为 0 条）：发布的内容不会被敏感词打码，请立刻到管理台补词");
            }
        } catch (RuntimeException e) {
            // 迁移失败不能挡住启动：词表还是文件那份，站点照常跑
            log.error("屏蔽词启动导入失败（不影响启动，仍用文件里的词表）：{}", e.toString());
        }
    }

    /** 只在「这个 scope 表里一条都没有」时导入，返回实际写入条数。 */
    private int seedIfEmpty(WordScope scope, List<String> seeds, String source) {
        if (seeds == null || seeds.isEmpty()) return 0;
        long existing = words.countAll(scope);
        if (existing > 0) return 0;
        int added = words.seed(scope, seeds, SEED_BY);
        log.info("屏蔽词迁移：{} 从 {} 导入 {} 条", scope.name(), source, added);
        return added;
    }

    private static List<String> split(String s) {
        List<String> out = new ArrayList<>();
        if (s == null) return out;
        for (String p : s.split(",")) {
            String t = p.trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }
}
