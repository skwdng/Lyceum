# rubric-v3 · 评分口径（机器可读）

> 供后端（评分引擎 / 复盘生成 / 专练入口）与前端（画像、档位标签、薄弱项排序）共同引用的**唯一口径**。
> 依据：`docs/辩论教练评审-赛制与评分口径.md`。设计原则：**能被稳定判定的才进总分，不能稳定判定的进诊断标签**。
> 状态：口径已定，代码未改。`calibration.status = pending_reanchor` 表示档位边界待重标（见 `calibration`）。
> 解析约定：`min` 含、`max` 不含（整数档位，0–100）。

```yaml
version: "3.0"
supersedes: "v2"
status: approved_for_doc
effective_from: null          # 需与重标定同批上线；未重标前仍以 v2 引擎实际输出为准
owner: debate-advisor
scope: [score, review, drill, profile]
language: zh-CN

# ─────────────────────────────────────────────────────────────
# 一、刻度与聚合
# ─────────────────────────────────────────────────────────────
scale:
  dimension_clamp: {min: 30, max: 95}
  total_clamp: {min: 0, max: 100}
  zero_condition: "okTurns == 0  →  total = 0（整场无一句有效内容）"
  round: nearest_int

aggregate:
  formula: "total = round(Σ weight(d) × score(d)) + Σ bonus - Σ guard_penalty"
  weights_sum: 100
  bonuses:
    collab: {min: 0, max: 3, note: "接队友：复用其论点 3 / 仅衔接语 2 / 无 0"}
    flaw:   {min: 0, max: 9, per_hit: 3, note: "抓漏，首答计分（见 guardRules G6）"}
  invariant: "五维加权最高 95 分；100 分必须由 bonus 补足或由 guard 扣分反推——不存在纯维度满分"

# ─────────────────────────────────────────────────────────────
# 二、五维（唯一计分口径）
# ─────────────────────────────────────────────────────────────
dimensions:

  - key: matter
    name: 立论
    weight: 25
    weight_v2: 25
    changed: false
    intent: 有没有明确判断 + 可被检验的判准 + 分论点结构
    judge: hybrid
    bands:
      excellent:
        rank: 3
        score: {min: 75, max: 100}
        criteria:
          - 有明确判断句（我方认为 / 应当 / 不应），不是只描述现象
          - 有一句可被对方检验的判准（含 判准 / 口径 / 只要…就… / 怎么算达到）
          - 至少两个分论点，且各自带理由
        observables:
          - {signal: judge_sentence, check: "regex JUDGE 命中", judge: rule}
          - {signal: standard, check: "regex STANDARD 命中", judge: rule}
          - {signal: precision, check: "regex PRECISION 命中", judge: rule}
          - {signal: standard_testable, check: "判准能否分出胜负", judge: human}
      pass:
        rank: 2
        score: {min: 50, max: 75}
        criteria:
          - 有判断 + 有理由
          - 判准缺位，或判准不可检验（只说 更重要 / 更合理 / 大势所趋）
        observables:
          - {signal: judge_sentence, check: "regex JUDGE 命中", judge: rule}
          - {signal: standard_missing, check: "regex PRECISION 未命中", judge: rule}
      revise:
        rank: 1
        score: {min: 0, max: 50}
        criteria:
          - 只有态度与形容词；无判准、无据、无例
        observables:
          - {signal: slogan_only, check: "SLOGAN 命中 且 PRECISION / EXAMPLE / 据 全缺", judge: rule}
    evidenceRule:
      must_quote_user_text: true
      attach: [rule_id, turn_id, span]
      examples_per_band: "1-2"
      min_quote_chars: 6
      forbidden: [无出处断言, 空泛评语]
      improve_sentence: required      # R-SCORE-02：必须给可照抄的改进句式

  - key: method
    name: 论证
    weight: 30
    weight_v2: 30
    changed: false
    intent: 有没有因果链 / 让步转折 / 前提到结论，而不是并列喊口号
    judge: hybrid
    bands:
      excellent:
        rank: 3
        score: {min: 75, max: 100}
        criteria:
          - 至少两条完整因果链（因 → 机制 → 果）
          - 至少一处让步后收束（即便…也… / 退一步… 但是…）
          - 不靠堆叠关联词充数
        observables:
          - {signal: causal_chain, check: "causal_count >= 3", judge: rule}
          - {signal: concession, check: "regex CONCEDE 命中", judge: rule}
          - {signal: mechanism_real, check: "链条是否跳步", judge: human}
      pass:
        rank: 2
        score: {min: 50, max: 75}
        criteria:
          - 一条因果链 + 一个例子
          - 无让步、无假设推演
        observables:
          - {signal: causal_chain, check: "causal_count >= 1", judge: rule}
          - {signal: concession, check: "regex CONCEDE 未命中", judge: rule}
      revise:
        rank: 1
        score: {min: 0, max: 50}
        criteria:
          - 并列罗列论点，无因果（causal_count == 0）
          - 或只有 因为…所以… 的壳，中间没有机制
        observables:
          - {signal: causal_chain, check: "causal_count == 0", judge: rule}
    evidenceRule:
      must_quote_user_text: true
      attach: [rule_id, turn_id, span]
      examples_per_band: "1-2"
      min_quote_chars: 6
      forbidden: [笼统评语如 论证不够深入]
      improve_sentence: required

  - key: adapt
    name: 应变
    weight: 25          # v2 为 20：产品主张 抓漏是核心训练动作，交锋权重应高于表达
    weight_v2: 20
    changed: true
    intent: 有没有真的点对方、引对方原话、指出跳步、反问施压
    judge: hybrid
    bands:
      excellent:
        rank: 3
        score: {min: 75, max: 100}
        criteria:
          - 点名（对方 / 你方）
          - 引述对方原话（连续重合 >= 6 字）
          - 指出其具体跳步（您从 A 直接跳到 C）
          - 以追问收尾
        observables:
          - {signal: opponent_named, check: "regex OPPONENT 命中", judge: rule}
          - {signal: opponent_quoted, check: "shares(text, opp_last, 6) == true", judge: rule}
          - {signal: gap_named, check: "是否指到跳步", judge: human}
          - {signal: ends_with_question, check: "regex QUESTION 命中", judge: rule}
      pass:
        rank: 2
        score: {min: 50, max: 75}
        criteria:
          - 点名对方 + 提出自己的观点
          - 未引述原话，或未指出跳步
        observables:
          - {signal: opponent_named, check: "regex OPPONENT 命中", judge: rule}
          - {signal: opponent_quoted, check: "shares == false", judge: rule}
      revise:
        rank: 1
        score: {min: 0, max: 50}
        criteria:
          - 无对方指称、无问句，自说自话
          - 逐回合判定为 脱靶
        observables:
          - {signal: off_target, check: "OPPONENT 与 QUESTION 均未命中", judge: rule}
    evidenceRule:
      must_quote_user_text: true
      attach: [rule_id, turn_id, span, opponent_turn_id]
      examples_per_band: "1-2"
      min_quote_chars: 6
      paired_evidence: true     # 必须同时给出 对方原话 + 我方回应，否则不作数为应变证据
      forbidden: [只引我方原句而不引对方原句]

  - key: language
    name: 语言
    weight: 10          # v2 的 表达 15：更名 + 降权；仪态不进总分（无视频证据源）
    weight_v2: 15
    renamed_from: 表达
    changed: true
    intent: 说得出、听得完（句长 / 口癖 / 句读），不判观点对错、不判仪态
    judge: rule
    bands:
      excellent:
        rank: 3
        score: {min: 75, max: 100}
        criteria:
          - 平均句长 <= 35 字
          - 超过 60 字的长句为 0 个
          - 口癖 <= 1 次/百字
        observables:
          - {signal: avg_sentence_len, check: "avg <= 35", judge: rule}
          - {signal: long_sentence_count, check: "count(len>60) == 0", judge: rule}
          - {signal: filler_density, check: "fillers_per_100 <= 1", judge: rule}
      pass:
        rank: 2
        score: {min: 50, max: 75}
        criteria:
          - 平均句长 36–50 字，或长句 1–2 个
          - 口癖 <= 3 次/百字
        observables:
          - {signal: avg_sentence_len, check: "36 <= avg <= 50", judge: rule}
          - {signal: filler_density, check: "fillers_per_100 <= 3", judge: rule}
      revise:
        rank: 1
        score: {min: 0, max: 50}
        criteria:
          - 长句 >= 3 个
          - 或口癖 >= 5 次/百字
          - 或整段无句读
        observables:
          - {signal: long_sentence_count, check: "count(len>60) >= 3", judge: rule}
          - {signal: filler_density, check: "fillers_per_100 >= 5", judge: rule}
    evidenceRule:
      must_quote_user_text: true
      attach: [rule_id, turn_id, span]
      examples_per_band: "1-2"
      metric_evidence: required    # 必须给统计值（平均句长 / 长句数 / 口癖密度）
      forbidden: [仅给形容词如 表达一般]
      excluded: [仪态, 语速, 音量, 表情]   # 文本产品无可观测证据，不得计分

  - key: evidence
    name: 论据
    weight: 10
    weight_v2: 10
    changed: false
    intent: 引用是否可回指、是否与结论同口径；编数字由 guardRules 在总分层倒扣，不在本维度内消化
    judge: hybrid
    bands:
      excellent:
        rank: 3
        score: {min: 75, max: 100}
        criteria:
          - 至少两条可回指的引用（论据卡 id，或 机构 + 年份 + 文号/报告名）
          - 引用与结论同口径
        observables:
          - {signal: cited_refs, check: "count(ref 完整) >= 2", judge: rule}
          - {signal: same_scope, check: "数字口径 == 结论口径", judge: human}
      pass:
        rank: 2
        score: {min: 50, max: 75}
        criteria:
          - 一条可回指引用，或一个可查的具体案例（无出处）
        observables:
          - {signal: cited_refs, check: "count(ref 完整) == 1", judge: rule}
      revise:
        rank: 1
        score: {min: 0, max: 50}
        criteria:
          - 零引用；或只有 据说 / 很多专家 / 大家都
          - 或出现查不到的数字（同时触发 G2 倒扣）
        observables:
          - {signal: cited_refs, check: "count == 0", judge: rule}
          - {signal: fabricated_number, check: "NUMBER 命中且不在卡片白名单", judge: rule}
    evidenceRule:
      must_quote_user_text: true
      attach: [rule_id, turn_id, span, card_id OR source]
      examples_per_band: "1-2"
      min_quote_chars: 6
      same_scope_required: true   # 拿 A 口径的数字证明 B 结论 → 不计 cited
      forbidden: [据说, 很多专家都说, 大家都]

# ─────────────────────────────────────────────────────────────
# 三、档位不变量
# ─────────────────────────────────────────────────────────────
bandInvariants:
  - "each dimension: excellent.min == pass.max, pass.min == revise.max  （区间闭合、无重叠、无空洞）"
  - "rank 单调：excellent.rank > pass.rank > revise.rank"
  - "每个 band 至少 1 条 observables 且 judge 取值 ∈ {rule, human}"
  - "judge: rule 的 observables 必须是可计算的量，不允许出现 是否精彩 这类判断"
  - "band 边界必须可达：重标后 20 题 80 条评测集中，excellent 档至少命中 1 条"

# ─────────────────────────────────────────────────────────────
# 四、档位重标定（现行引擎实测 vs v3 语义档）
# ─────────────────────────────────────────────────────────────
calibration:
  status: pending_reanchor
  reason: "现行规则引擎实测 优秀 59–70 / 中等 42–49 / 较差 38–43 / 敷衍 0，与 v3 语义档边界（75 / 50）不重合；直接套用会产生不可达档位"
  source: "docs/评分有效性评测报告.md:54"
  observed_anchor:
    excellent: [59, 70]
    pass: [45, 58]
    revise: [0, 44]
  rule_while_pending: "对外展示档位标签时，以 observed_anchor 判定；v3 语义档仅用于口径沟通与重标目标"
  reanchor_actions:
    - 按 dimensions[].bands 重写 ScoreService 各维度取值分布（目标：优秀样例 >= 75）
    - 重跑 ScoreEvalTest，pairwise >= 0.75、结构合法率 >= 99%、同条漂移 <= 5
    - 重标 80 条评测集档位，写回 rubric 字段
    - 同步刷新 docs/评分有效性评测报告.md 的分布段
  comparability: "v2 与 v3 的五维分不可直接比较（权重与锚点均变）；能力分析的趋势对比需在 v3 上线后标注 口径已更新"

# ─────────────────────────────────────────────────────────────
# 五、focusRule：从最低加权维到专练
# ─────────────────────────────────────────────────────────────
focusRule:
  id: FOCUS-01
  formula: "lost(d) = weight(d) * (100 - score(d))"
  select: argmax_lost
  tie_break: [adapt, method, matter, evidence, language]
  min_loss: 8
  fallback: {action: comprehensive_review, drill_type: null}
  rationale: "按 最低原始分 选弱项会让低权重维度（论据 10）绑架训练方向；必须先乘权重"
  drill_map:
    adapt:   query_press
    method:  rebut_three_lines
    matter:  standard_grounding
    evidence: null      # 可训练性低，暂不设 drill
    language: null
  drill_defaults:
    rounds: 3
    score_of: best
    record_table: drill_record
    reuse_api: "POST /api/matches  {mode: DRILL, seats: [], drill_type: <type>}"
    spec_refs: [R-DRILL-01, R-DRILL-02, R-DRILL-03, R-DRILL-04]

# ─────────────────────────────────────────────────────────────
# 六、guardRules：全局守卫（优先于维度分）
# ─────────────────────────────────────────────────────────────
guardRules:

  - id: G1
    name: 引用必须可回指
    applies_to: [evidence, method]
    condition: "发言中出现数据、法规、机构、他人观点"
    required_ref:
      one_of:
        - {card_id: "<论据卡 id>"}
        - {source: {org: "<机构>", year: "<年份>", title: "<文号或报告名>"}}
      plus: [turn_id, span]
    on_missing:
      cited_counted: false
      may_use_as_evidence: false
      review_tag: 未回指
    note: "现状只按 8 字重合判 cited，不记录引了哪张卡 → 复盘无法回指；本条是 rubric 层的强约束"

  - id: G2
    name: 编数字倒扣
    applies_to: [total]
    condition: "数字 + 单位（% / ％ / 万 / 亿 / 倍 / 元 / 人 / 所 / 年）且不在论据卡或已核白名单内"
    penalty: {per_item: 3, max_total: 9}
    action: [复盘点名原串, problem 文案优先于此项]
    rationale: "v2 在论据维度扣 8 分 = 总分 -0.8，与 论据裁判 扣到 50 以下 冲突；改总分层后与抓漏 +9 对称"
    replacement_of: "evidence = max(20, clamp(40 + cited*10) - 8*fabricated)"

  - id: G3
    name: 不可解释的扣分不入账
    applies_to: [all]
    condition: "任何扣分或降档"
    required: [quote, rule_id]
    on_missing: {apply: false}
    spec_ref: R-SCORE-03

  - id: G4
    name: 地板与天花板
    applies_to: [all]
    dimension_clamp: {min: 30, max: 95}
    total_clamp: {min: 0, max: 100}
    zero_when_no_content: true
    note: "地板 30 意味着一句有效发言即得 30；这是产品取舍，需在复盘中明示 基准分"

  - id: G5
    name: 口号判定不得误伤辩题核心词
    applies_to: [matter, method]
    condition: "SLOGAN 词表命中（含 内卷 / 电子毒品 / 落后 等辩题核心词）"
    require_all: [no_standard, no_evidence, no_example]
    forbid: "对辩题核心词单独判罚"
    note: "评测集优秀样例以 先界定：内卷指… 开头却因命中 SLOGAN 被扣 20 分；本条收紧为四条件同时成立"

  - id: G6
    name: 抓漏按首答计分
    applies_to: [bonus.flaw]
    condition: "抓漏提交"
    rule: "只计首次提交的结果；后续提交不改变 hit"
    wrong_penalty: -1
    must_not_return: [planted_type]     # 响应体不得回传正确答案
    note: "现状 point() 无次数限制且回传 correct → 5 类穷举必中；训练价值归零"

  - id: G7
    name: 论据与结论必须同口径
    applies_to: [evidence]
    condition: "引用数字/事实支撑某个结论"
    requirement: "被引数据的统计对象、地域、时间与结论所指一致"
    on_mismatch: {count_as_cited: false, review_tag: 口径错配}

# ─────────────────────────────────────────────────────────────
# 七、抓漏类型（唯一词表；detectFlaws 只做映射，不另立类目）
# ─────────────────────────────────────────────────────────────
flawTypes:
  - {key: hasty_generalization, name: 以偏概全, example: "我身边同学都这样，可见所有人都这样。", pattern: "个体样本 + 所有/都", in_v2: true, stage: [立论, 驳立论]}
  - {key: appeal_to_authority, name: 诉诸权威, example: "专家都这么说，不需要再讨论。", pattern: "专家/权威/大家都 + 无需论证", in_v2: true, stage: [立论, 总结]}
  - {key: unproven_premise, name: 未证前提, example: "这一点显然是常识，不再赘述。", pattern: "显然/众所周知/毋庸置疑", in_v2: true, aliases: [未证明前提], stage: [全环节]}
  - {key: equivocation, name: 偷换概念, example: "可执行就等于必须立刻执行。", pattern: "就是/等于/一回事 + 两个不同词", in_v2: true, stage: [质询, 驳立论]}
  - {key: circular_reasoning, name: 循环论证, example: "它合理，因为它确实合理。", pattern: "结论词在理由中复现", in_v2: true, subtypes: [同义反复], stage: [自由辩, 总结]}
  - {key: burden_shift, name: 举证责任倒置, example: "你证明不了它有害，所以它无害。", pattern: "否定举证 + 推出正面结论", in_v2: false, added_in: v3, stage: [质询·答, 自由辩]}
  - {key: correlation_causation, name: 相关当因果, example: "两件事一起变，可见一个导致了另一个。", pattern: "共变/伴随 + 因果结论", in_v2: false, added_in: v3, stage: [驳立论, 总结]}

# ─────────────────────────────────────────────────────────────
# 八、AI 评审团的角色（不产出与规则并列的总分）
# ─────────────────────────────────────────────────────────────
judgePanel:
  rule: "只输出评语、strengths/weaknesses、分歧度；主分数一律取 aggregate.total"
  aggregate: "四位等权平均，仅用于 分歧度 = max - min"
  mapping:
    structure: [matter, method]
    clash: [adapt]
    delivery: [language]
    evidence: [evidence]
  known_gap: "无独立 论证 视角（结构裁判同时承担立论与论证），故不得用评审团分数反推任一维度分"
  display: {primary_score: "aggregate.total", panel_score: hidden}

# ─────────────────────────────────────────────────────────────
# 九、消费方约定
# ─────────────────────────────────────────────────────────────
consumers:
  backend:
    - score:       "按 dimensions[].bands 判定档位，按 aggregate 计总分，先过 guardRules"
    - review:      "每条扣分附 evidenceRule 的 attach 字段；违规见 G3 不入账"
    - drill:       "按 focusRule 选 drill_type；drill_record 记 hits（flawTypes.key）"
  frontend:
    - "档位标签取 band.rank 与 name，不硬编码分数阈值"
    - "薄弱项排序按 focusRule.lost 降序，不按原始分"
    - "calibration.status == pending_reanchor 时，档位标签用 calibration.observed_anchor"

# ─────────────────────────────────────────────────────────────
# 十、变更记录
# ─────────────────────────────────────────────────────────────
changelog:
  - version: "3.0"
    changes:
      - "表达 → 语言，权重 15 → 10；仪态排除出计分（无证据源）"
      - "应变权重 20 → 25，使 交锋 权重高于 语言"
      - "编数字从 evidence 维度内扣分改为 G2 总分层 -3/条（上限 -9）"
      - "新增 focusRule（权重 × 失分）替代 最低原始分"
      - "抓漏词表统一为 7 类，未证前提 与 未证明前提 合并，同义反复 降为循环论证子类"
      - "新增 G1 可回指、G5 核心词不判罚、G6 首答计分、G7 同口径"
      - "评审团不再输出并列总分"
    breaking: true
    migration: "见 calibration.reanchor_actions；v2 历史分数不做换算"
```

---

## 字段速查

| 你要做的事 | 看哪个字段 |
|---|---|
| 判某条发言属哪一档 | `dimensions[].bands.*.observables`（`judge: rule` 的可直接算，`human` 的进人工复核队列） |
| 算总分 | `aggregate.formula`，先扣 `guardRules`，再加 `bonuses` |
| 决定"让他练什么" | `focusRule`（`lost = weight × (100 − score)`，取最大） |
| 生成复盘证据 | `dimensions[].evidenceRule.attach` + `must_quote_user_text` |
| 判断是不是编数字 | `guardRules[G2]` + `dimensions[evidence].evidenceRule.same_scope_required` |
| 抓漏选项 | `flawTypes`（7 类，key 为唯一标识） |
| 档位标签能不能直接上 | `calibration.status`，`pending_reanchor` 时用 `observed_anchor` |

## 与 v2 的差异（一句话版）

v2 把"说得好"算 15 分、把"抓漏"算 9 分加分、把"编数字"算维度内 0.8 分；v3 让**能稳定判定的进总分**（立论 / 论证 / 应变 / 语言 / 论据），让**不能稳定判定的进诊断**（协同、仪态、评分分歧），让**反规范化行为在总分层付代价**（编数字、不可回指、穷举抓漏）。
