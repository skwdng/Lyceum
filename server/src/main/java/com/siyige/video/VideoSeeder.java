package com.siyige.video;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 辩场种子：三条过审 + 一条待复核 + 一条被驳回，方便直接看效果。 */
@Configuration
public class VideoSeeder {

    private static final String[] DEMO = {
            "https://www.w3schools.com/html/mov_bbb.mp4",
            "https://www.w3schools.com/html/movie.mp4"
    };

    @Bean
    ApplicationRunner seedVideo(VideoRepo repo) {
        return (ApplicationArguments args) -> {
            Integer n = repo.stats().get("videos") instanceof Integer i ? i : 0;
            if (n > 0) return;

            seed(repo, "zheng_yi", "质询名场面：三句话逼出对方口径矛盾",
                    "对方说「可执行」，但没说谁来执行。", DEMO[0], "取消期末考试", "质询", "正", 42);
            seed(repo, "su_wan", "立论骨架四步：界定→判准→论点→收束",
                    "缺一步，评委就不知道你在证什么。", DEMO[1], "人工智能是否应当拥有法律人格", "立论", "正", 96);
            seed(repo, "lu_jianwei", "自由辩被连追三个问题怎么破",
                    "先认小前提，再把战场拉回判准。", DEMO[0], "短视频对青少年的影响利大于弊", "自由辩", "反", 58);

            long pending = repo.create("su_wan", "这场骂战值得复盘：双方都在偷换概念",
                    "情绪很冲，但逻辑漏洞明显。", DEMO[1], null, "算法推荐是否加剧信息茧房", "名场面", "反", 31);
            repo.insertAudit(pending, "MACHINE", "REVIEW", "命中风险词：骂战，转人工复核", "machine",
                    "title=这场骂战值得复盘", "PENDING");
            repo.setAuditStatus(pending, "REVIEW", "命中风险词：骂战，转人工复核");

            long rejected = repo.create("lu_jianwei", "牛", "", DEMO[0], null, "", "名场面", "", 12);
            repo.insertAudit(rejected, "MACHINE", "REJECT", "标题过短（少于 4 字）", "machine", "title=牛", "PENDING");
            repo.setAuditStatus(rejected, "REJECTED", "标题过短（少于 4 字）");
        };
    }

    private void seed(VideoRepo repo, String uid, String title, String desc, String url,
                      String topic, String seg, String side, int dur) {
        long id = repo.create(uid, title, desc, url, null, topic, seg, side, dur);
        repo.insertAudit(id, "MACHINE", "PASS", "机器初审通过", "machine", "title=" + title, "PENDING");
        repo.setAuditStatus(id, "PASSED", "机器初审通过");
    }
}