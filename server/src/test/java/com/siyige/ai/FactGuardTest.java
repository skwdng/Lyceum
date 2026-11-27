package com.siyige.ai;

import com.siyige.admin.config.ConfigService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 事实护栏（防编造数字/出处）。
 *
 * <p>用户投诉原话：「AI 发言时一定要说正确的话，不要造假」。prompt 里已经写了硬约束，
 * 但模型被要求"给个数字"时几乎一定会编，而且编出来的数字最像真的——所以输出侧必须有一道
 * 可判定的检查：**带单位的具体事实（%、百分点、倍、年份、法条条号、书名号出处、据…统计）
 * 必须能在「论据卡 + 辩题标题 + 历史发言原文」里找到**，找不到就标成「（需核实）」，
 * 主张保留、数字不落地，并把处数交给调用方（{@code Speech.unsupported}）。
 */
class FactGuardTest {

    private static ConfigService enabledCfg() {
        ConfigService cfg = mock(ConfigService.class);
        when(cfg.getBool(any())).thenReturn(true);
        return cfg;
    }

    private static AiService offline() {
        return new AiService(new LlmClient("http://127.0.0.1:9/v1", "", "fact-test"), null, null, enabledCfg());
    }

    private static Map<String, Object> turn(String seat, String content) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("seat", seat);
        t.put("content", content);
        return t;
    }

    private static List<String> sources(String... s) {
        List<String> out = new ArrayList<>();
        for (String x : s) if (x != null) out.add(x);
        return out;
    }

    // ------------------------------------------------------------------ 编的数字要拦

    @Test
    void 编造百分比被标需核实() {
        String text = "据公开报道，取消期末后不及格率下降 37%，覆盖率提升 21 个百分点。";

        AiService.FactResult r = AiService.checkFacts(text, List.of());

        assertEquals(2, r.unsupported(), "37% 与 21 个百分点都没有出处");
        assertTrue(r.text().contains("（需核实）"), "要被标注：" + r.text());
        assertFalse(r.text().contains("37%"), "编的数字不能留在正文里：" + r.text());
        assertFalse(r.text().contains("21 个百分点"), "同上：" + r.text());
        assertTrue(r.text().contains("不及格率下降"), "主张要保留：" + r.text());
    }

    @Test
    void 编造年份与法条条号被拦() {
        String text = "教育部在 2023 年就明确要求，相关条款见《普通高等学校学生管理规定》第四十一条。";

        AiService.FactResult r = AiService.checkFacts(text, List.of());

        assertEquals(3, r.unsupported(), "年份 + 书名号 + 条号 各一处");
        assertFalse(r.text().contains("2023"), r.text());
        assertFalse(r.text().contains("第四十一条"), r.text());
        assertFalse(r.text().contains("《"), r.text());
    }

    @Test
    void 书名号后面跟编造数字被拦() {
        String text = "《中国教育发展报告》显示，取消期末后不及格率下降 37%。";

        AiService.FactResult r = AiService.checkFacts(text, sources("我方判断：期末考试的学分认定必须有刚性凭证。"));

        assertEquals(2, r.unsupported(), "书名号与 37% 都不可回指");
        assertFalse(r.text().contains("《中国教育发展报告》"), r.text());
        assertFalse(r.text().contains("37"), r.text());
    }

    // ------------------------------------------------------------------ 有出处的数字要放行

    @Test
    void 论据卡里的数字与出处放行() {
        // 论据卡原文（EvidenceService.promptBlock 的输出形如这样）
        String cards = "卡片1：课程考核合格即可获得学分，据《普通高等学校学生管理规定》（教育部令第41号，2017）。";
        String text = "据《普通高等学校学生管理规定》，2017 年教育部令第41号已经写明：考核合格即获学分。";

        AiService.FactResult r = AiService.checkFacts(text, sources(cards));

        assertEquals(0, r.unsupported(), "卡片里有原文，一律放行：" + r.text());
        assertEquals(text, r.text(), "放行时正文一个字都不改");
    }

    @Test
    void 历史发言里出现过的数字放行() {
        String historyLine = "对方说：2023 年试点只有 12 所，覆盖率 8%。";
        String text = "对方刚才说「2023 年试点只有 12 所」，覆盖率只有 8%，这个规模说明不了什么。";

        AiService.FactResult r = AiService.checkFacts(text, sources(historyLine));

        assertEquals(0, r.unsupported(), "真实引用对方说过的数字，不能误杀：" + r.text());
        assertFalse(r.text().contains("（需核实）"), r.text());
    }

    @Test
    void 辩题标题里的数字放行() {
        String text = "这道题问的是 2023 年的政策，我方认为执行比方向更重要。";
        AiService.FactResult r = AiService.checkFacts(text, sources("辩题：2023 年该不该全面推行该政策"));
        assertEquals(0, r.unsupported(), "标题里就有这个年份：" + r.text());
    }

    @Test
    void 没有带单位的事实断言时一个字都不改() {
        String text = "我方认为应当保留期末考试，因为学分认定需要刚性凭证。";
        AiService.FactResult r = AiService.checkFacts(text, List.of());
        assertEquals(0, r.unsupported());
        assertEquals(text, r.text());
    }

    @Test
    void 序数第一条不算法条条号() {
        String text = "我方判准第一条先立住：标准可查。第二条再谈成本，第三条落到追责。";
        AiService.FactResult r = AiService.checkFacts(text, List.of());
        assertEquals(0, r.unsupported(), "「第一条」是序数不是法条，不能误标：" + r.text());
        assertEquals(text, r.text());
    }

    @Test
    void 带法律语境的中文条号才查() {
        String law = "《普通高等学校学生管理规定》";
        String text = "按该规定第四十一条，考核成绩要留档。";
        AiService.FactResult r = AiService.checkFacts(text, sources(law));
        assertEquals(1, r.unsupported(), "有法律语境、但原文里没有这一条 → 要标：" + r.text());
        assertFalse(r.text().contains("第四十一条"), r.text());
    }

    @Test
    void 法条原文里有该条则放行() {
        String law = "《普通高等学校学生管理规定》第四十一条：考核成绩记入档案。";
        String text = "按《普通高等学校学生管理规定》第四十一条，成绩必须留档。";
        AiService.FactResult r = AiService.checkFacts(text, sources(law));
        assertEquals(0, r.unsupported(), "原文里就有这一条，放行：" + r.text());
    }
    // ------------------------------------------------------------------ 与 guard / Speech 的接线

    @Test
    void 护栏走通_计数进Speech_真引用不受影响() {
        AiService ai = offline();
        ai.resetUnsupportedCount();

        String opp = "对方说：2023 年试点只有 12 所。";
        List<Map<String, Object>> h = List.of(turn("B1", opp));

        AiService.GuardResult g = ai.guardDetailed(
                "我方判断：2023 年试点只有 12 所，覆盖率已达 37%，规模已经足够。",
                Personas.of("A2"), "", opp, "A2", "自由辩", "自由辩", h, "取消期末考试利大于弊", null);

        assertEquals(1, g.unsupported(), "历史里有的 2023 放行，37% 没有出处要被标注");
        assertTrue(g.text().contains("（需核实）"), g.text());
        assertFalse(g.text().contains("37"), "编的百分比不能落库：" + g.text());
        assertEquals(1, ai.unsupportedCount(), "实例上要能查到累计处数");
    }

    @Test
    void 模板兜底不含数字_不会误标() {
        AiService ai = offline();
        AiService.Speech sp = ai.speakForSolo("A2", "驳立论", "驳立论", "辩题", "t", "pro",
                List.of(turn("B1", "我方判断：期末考试的学分认定必须有刚性凭证。")));

        assertEquals(0, sp.unsupported(), "模板句里没有带单位的事实断言：" + sp.text());
        assertFalse(sp.text().contains("（需核实）"));
    }

    @Test
    void Speech新字段不破坏旧构造() {
        AiService.Speech three = new AiService.Speech("正文", true, "");
        assertEquals(0, three.unsupported());
        assertEquals(0, three.fabricated());

        AiService.Speech five = new AiService.Speech("正文", false, "{\"claim\":\"x\"}", "ok", 2);
        assertEquals(2, five.fabricated());
        assertEquals(0, five.unsupported(), "旧五参构造默认 unsupported=0");
    }
}
