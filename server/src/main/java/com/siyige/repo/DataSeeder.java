package com.siyige.repo;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/** 首次启动灌入官方辩题（题库内题目默认已审核，不再走 AI 审核）。 */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final String[][] TOPICS = {
            {"t1",  "人工智能生成内容是否应当享有著作权", "科技", "进阶"},
            {"t2",  "应不应该全面推行远程办公",           "社会", "新手"},
            {"t3",  "大数据算法推荐是否加剧了信息茧房",   "科技", "竞赛"},
            {"t4",  "高校是否应当取消期末考试",           "教育", "新手"},
            {"t5",  "公平与效率哪一个更应优先",           "价值", "竞赛"},
            {"t6",  "短视频对青少年的影响利大于弊",       "社会", "进阶"},
            {"t7",  "是否应当立法限制未成年人使用社交媒体", "社会", "进阶"},
            {"t8",  "大学教育应以就业为导向还是以通识为本", "教育", "进阶"},
            {"t9",  "人类是否应当主动与外星文明接触",     "价值", "竞赛"},
            {"t10", "自动驾驶应当优先于公共交通发展吗",   "科技", "竞赛"},
            {"t11", "考研热是理性选择还是盲目跟风",       "教育", "新手"},
            {"t12", "人工智能应当拥有法律人格吗",         "科技", "进阶"}
    };

    private final Store store;

    public DataSeeder(Store store) { this.store = store; }

    @Override
    public void run(String... args) {
        if (!store.topics(null, null).isEmpty()) return;
        for (String[] t : TOPICS) {
            store.insertTopic(t[0], t[1], t[2], t[3], "official",
                    com.siyige.service.AuditService.sha256(t[1]));
        }
    }
}
