# 思弈阁 · 实现规格书（AI 可执行版 · v4.5）

> 唯一规格来源。逐条对照编号实现，全部满足才能标完成。
> v4.3（2026-11-04）：追加第 19 节「举报与审核（治理）」，含 R-GOV-01 ~ R-GOV-25。
> v4.4（2026-11-04）：追加第 20 节「辩论侧的登录与对局归属」，含 R-DEB-01 ~ R-DEB-14。
> v4.5（2026-11-05）：追加第 21 节「通知与 @提及」，含 R-NTF-01 ~ R-NTF-22。
> 关键词：**MUST**（必须）、**MUST NOT**（禁止）、**SHOULD**（推荐）、**可调参数**。

---

## 0. 给实现者（AI）的指令

1. 第 2 节（房间）与第 3 节（流程）是骨架，写错后面全部返工。
2. 第 4 节（AI 节奏）、第 5 节（语音）是硬约束。
3. 与本文冲突的旧代码/旧文档一律以本文为准。

### 0.1 变更记录（v4.2，**不要复活以下旧设计**）

| 变更 | 说明 |
|---|---|
| ❌ 移除 1v1 / 2v2 | **只保留 4v4（每方一辩到四辩，8 席）** |
| ❌ 移除段位 / 等级 / 积分 / 排行榜 | 改为**个人辩论记录** + 与自己比的三个指标（第 6 节） |
| ✅ 新增语音转文字 | 第 5 节 |
| ✅ 保留 4v4 团队层 | 队内频道、协同分、辩位权限 |
| ✅ 拆分两种入口 | **单人辩论**（选题/自填 → 选位置 → 即开）· **多人辩论**（建房 → 拉人 → 准备 → 开局） |
| ✅ 新增辩题 AI 审核 | 单人自填题、房间换题都必须过审（§3.7） |
| ✅ 新增社区（v4.2） | 第 18 节；帖子 / 两层楼中楼 / 点赞 / 浏览去重 / 内容审核，共 40 条 |
| ✅ 社区只搜标题（v4.2） | 明确收窄为 `title LIKE`，不引入全文索引与向量检索 |

### 0.2 产品取舍（写规格的人做的判断，不是需求原文）

| 判断 | 依据 | 落地条款 |
|---|---|---|
| 全流程单场约 24 分钟，但单个席位只开口 1–2 次 | 12 步时长合计 1380s；三辩/四辩各只 1 次发言 | 三档训练模式 R-TRAIN-01、AI 发言可跳过 R-FLOW-09、座位卡预告发言次数 R-SEAT-07 |
| 评分必须可解释，否则等于装饰 | 用户无法理解 72 与 80 的差别 | R-SCORE-01~04 |
| 语音转写会拉低评分，需区分“口语差”与“论证差” | 转写文本含大量口水词 | R-VOICE-11 一键规整 + 双文本对比 |
| 无段位后动机系统为空 | 只有记录=没有进度感 | R-REC-07 个人趋势 / 连续天数 / 漏洞统计 |
| 房主踢人、转让、观战是低频功能 | 4v4 真人难凑齐，90% 场次不触发 | 降级为 P2（第 13 节） |

---

## 0.3 合并说明（本版本 = 你的规格书 + 队友计划书的工程亮点）

| 来源 | 内容 |
|---|---|
| **规格书（主体）** | 单人点题即开、多选辩位、去段位、语音转文字、AI 节奏、可解释评分、三档训练模式、跳过/加速 |
| **计划书（采纳）** | 三段式异步推送、SSE/WS 语义分工、结构化输出四级兜底、状态机复用、`@Tool` 论据检索、Redis 快照、AI 评测集四指标、点赞与评分隔离、五维画像、提示词人格分离、ChatMemory 滑窗、目标用户与边界、风险表、不选理由 |
| **计划书（不采纳）** | 语音列为范围外、`user` 段位/积分、排行榜、第 3 周才做房间 |
| **计划书（降级）** | 论点树、观战 → P2（表结构与接口先定，不做深度交互） |
| **社区（v4.2 升级）** | 原列 P2，现升级为**正式范围**：完整设计见第 18 节（R-COM-01~40） |

---

## 1. 术语

| 术语 | 定义 |
|---|---|
| 房间 Room | 一场 4v4 的容器：辩题、8 席、房主、设置 |
| 席位 Seat | `A1–A4`（正方一辩…四辩）、`B1–B4`（反方一辩…四辩） |
| 辩位 Role | 一辩 / 二辩 / 三辩 / 四辩，由席位决定 |
| 占位者 Occupant | `EMPTY` / `AI` / `USER` |
| 回合 Turn | 一个席位在某环节的一次发言 |
| 记录 Record | 一场打完后的历史条目（替代段位） |

---

## 1.5 目标用户与项目边界（采纳自计划书 §1.3 / §1.4，按本期范围修订）

| 用户群体 | 核心诉求 | 对应功能 |
|---|---|---|
| 高校辩论队队员 | 赛前陪练、找逻辑漏洞 | 单人点题即开 · 多选辩位 · 复盘 · 抓漏 |
| 通识课 / 演讲课学生 | 低成本入门，先搞懂规则 | 新手引导 · 可解释评分 |
| 想练表达的在职者 | 随时能练，不用约人 | 单人 1v7 AI · 碎片化 `DRILL` |
| 辩论爱好者 | 看别人怎么打、找队友 | 4v4 房间 · 观战（P2） |

| 范围内（本期做） | 范围外（本期不做） |
|---|---|
| 单人 4v4：点题即开、1–8 席位任选 | **模型微调训练** |
| 4v4 房间：8 席、AI 填充、房主开局 | 真人语音实时对辩（只做语音转文字输入） |
| **语音转文字 + 一键规整**（本期新增） | 真人裁判介入 |
| 逐轮三维评分 + 可解释证据 + 抓漏 | 移动端 App |
| 五维画像 + 弱项专练 | 排行榜 / 段位（明确不做） |
| 辩论记录与动机三件套 | 论点树可视化（P2，表先留） |
| **自定义辩题 + AI 审核** | – |

---

## 1.6 两种训练模式（产品只有这两条入口）

| | **单人辩论 SOLO** | **多人辩论 ROOM** |
|---|---|---|
| 入口 | 选题库辩题 **或自己填一个**（需审核） | 建房 / 凭房间号加入 |
| 席位 | 玩家占 **1–8 个**（可只坐一辩，也可正反全占），其余 AI | 真人优先，空位开局补 AI |
| 准备 | 无（点完即开） | 房主免准备；其他真人必须点准备 |
| 开局 | 直接进 10 秒准备期 | 房主点「开始辩论」 |
| 通道 | 只用 SSE | SSE + WebSocket |
| 断线恢复 | 重新 GET 对局 | 房间快照 + 事件补发 |
| 对选题的要求 | **自定义辩题必须先过 AI 审核** | 建房时若换题，同样要过审核 |

> 两条入口共用同一套 `TurnEngine` 与 `Format`，差异只在「席位怎么来的」和「谁有权开局」。

---

## 2. 房间（4v4）

### 2.1 入口

- **R-ROOM-01** 大厅 MUST 提供三个入口：**加入房间**（房间码 / 公开列表）、**自选辩题开房**、**快速开始**（默认辩题，直接建单人房）。
- **R-ROOM-02** 房间 MUST 有 8 个席位，每方 4 人；辩位固定为一辩→四辩。
- **R-ROOM-03** 房间码 MUST 为 `SY-XXXX`（4 位，排除 `O0I1`），大小写不敏感。
- **R-ROOM-04** 建房者 MUST 成为房主，并自动坐 **A1（正方一辩）**。
- **R-ROOM-05** 大厅首屏 MUST 把「**快速开始**（单人 + 7 AI，默认辩题，一键开打）」放在主位；「加入房间 / 开房」为次位。依据：4v4 真人难凑齐，日常入口是单人练习。
- **R-ROOM-06** 大厅 MUST 显示一局预计时长与「你将发言 N 次」，避免用户点进去才发现要坐 20 分钟。

### 2.2 房间设置（仅房主，`LOBBY` 内可改）

- **R-SET-01** 可改项：辩题（可选或随机）、赛制（`STD` 标准版 / `FREE` 不限时段）、可见性（`PUBLIC`/`PRIVATE`）、房间密码（4 位）、允许观战。
- **R-SET-02** 变更 MUST 通过 SSE 广播，所有人界面即时生效。
- **R-SET-03** `RUNNING` 后 MUST NOT 允许修改任何设置。

### 2.3 席位与座位卡

- **R-SEAT-01** 座位卡 MUST 显示：头像、昵称、**辩位名**、准备状态、房主徽标、AI 标识。
- **R-SEAT-02** 空位 MUST 显示「＋ 邀请」，点击给出房间码与邀请链接。
- **R-SEAT-03** 点击自己座位 MUST 弹出换座菜单（同阵营内可换辩位）；点击空位 MUST 直接换座。
- **R-SEAT-04** 房主点击他人座位 MUST 能：**移到对面**、**踢出房间**、**转让房主**。
- **R-SEAT-05** 跨阵营换位 MUST 由房主操作，玩家 MUST NOT 自行跳到对面。
- **R-SEAT-06** AI 席位 MUST 显示「AI」与一句风格标签（如「硬框架 · 弱点：未证明前提」）。
- **R-SEAT-07** 换座菜单里每个席位 MUST 标注：**该席位本场发言次数与累计时长**（一辩 1 次/180s、二辩 2 次/240s、三辩 2 次/240s、四辩 1 次/180s）。依据：选座=选投入，不能让用户盲选。

### 2.4 准备与开局

- **R-READY-01** **房主 MUST NOT 有「准备」按钮**（隐式就绪），座位卡显示房主徽标。
- **R-READY-02** 每名非房主真人 MUST 有「准备 / 取消准备」，默认未准备。
- **R-READY-03** AI 席位恒为已准备，不显示按钮。
- **R-READY-04** 加入、换座、退出 MUST 把该真人重置为未准备。
- **R-READY-05** 最少 **1 名真人**即可开局（1 人 + 7 AI 打满 4v4）。
- **R-READY-06** 房主「开始辩论」按钮状态：
  | 条件 | 状态 | 文案 |
  |---|---|---|
  | 有真人未准备 | 禁用 | 还有 N 人未准备 |
  | 全员就绪 | 可用 | 开始辩论 |
  | 房间内无真人（异常） | 禁用 | 房间里没有真人 |
- **R-READY-07** 点击开始 MUST 在 1 秒内把空位填成 AI 并广播 `room.start`。
- **R-READY-08** 房主离开 MUST 转让给下一位真人；无真人则关闭房间并广播 `room.closed`。

### 2.5 邀请 / 观战 / 房间聊天

- **R-JOIN-01** 凭房间码加入 MUST 自动坐第一个空位；满 8 人返回 `ROOM_FULL`。
- **R-JOIN-02** 私密房 MUST NOT 出现在公开列表；设密码的房间进入前 MUST 校验密码。
- **R-JOIN-03** 邀请链接 MUST 形如 `/room/SY-XXXX`，打开自动加入（已登录前提下）。
- **R-JOIN-04** 观战者 MUST NOT 占席、MUST NOT 进队内频道，只出现在观战计数。
- **R-CHAT-01** 房间频道 MUST 支持文字消息（含观战可见），落库并广播。

### 2.6 状态机

```
LOBBY ──(房主开始 · 全员就绪)──▶ RUNNING ──(12 步走完)──▶ REVIEW ──▶ FINISHED ──▶ RECORDED
  │
  ├──(房主离开且无真人)──▶ CLOSED
  └──(闲置 30 分钟)─────▶ CLOSED
```

---

## 3. 辩论流程

### 3.1 标准版 4v4 步骤表（与《项目计划书》表 13 对齐，顺序 MUST NOT 改）

| 序 | 环节 | 席位 | 时长 | 该环节的核心任务 |
|---|---|---|---|---|
| 1 | 立论 | A1 | 180s | 立住判断标准，给出 2–3 个分论点 |
| 2 | 立论 | B1 | 180s | 先破题，重新定义战场 |
| 3 | 驳立论 | A2 | 120s | 打掉对方最强的那一点 |
| 4 | 驳立论 | B2 | 120s | 回应攻击并抛出对方没准备的问题 |
| 5 | 质询 | A3 | 120s | 连续追问，逼出对方未证明的前提 |
| 6 | 质询 | B3 | 120s | 每次只问一件事，逼出对方的定义 |
| 7 | 自由辩 | A2 | 120s | 每次只说一件事，打完一个点就换 |
| 8 | 自由辩 | B2 | 120s | 同上 |
| 9 | 自由辩 | A3 | 120s | 同上 |
| 10 | 自由辩 | B3 | 120s | 同上 |
| 11 | 总结 | B4 | 180s | 收拾战场，再升华价值 |
| 12 | 总结 | A4 | 180s | 指出真正分歧与获胜理由 |

> 9 个环节 + 自由辩展开为 4 个子回合 = **12 步**，与计划书 §5.1 一致。
> 各辩位本场发言：一辩 1 次/180s、二辩 2 次/240s、三辩 2 次/240s、四辩 1 次/180s。

- **R-FLOW-01** 服务端 MUST 维护 `currentStep` 与 `currentSeat`，只有 `currentSeat` 能提交。
- **R-FLOW-02** 非当前席位提交 MUST 返回 `409 NOT_YOUR_TURN` 且不落库。
- **R-FLOW-03** 倒计时归零 MUST 落一条 `TIMEOUT` 占位发言并推进。
- **R-FLOW-04** 12 步走完 MUST 进 `REVIEW` → `FINISHED` → 写辩论记录。
- **R-FLOW-05** 进入 `RUNNING` 后 MUST 先播 **10 秒准备期**，提示「请整理你的立论」。
- **R-FLOW-06** 席位权限 MUST 服务端校验：一辩不得提交结辩内容、四辩不得提交立论。
- **R-FLOW-07** `FREE` 模式 MUST 不设环节与倒计时，按席位顺序轮流，随时可点「结束并评分」。

### 3.2 队内频道

- **R-TEAM-01** 己方真人 MUST 能发队内消息，对手与观战 MUST NOT 可见。
- **R-TEAM-02** AI 队友 MUST 能读取队内频道内容并据此调整下一轮发言。
- **R-TEAM-03** AI 队友（同侧）MUST 呼应真人上一段发言（协同分来源）。

### 3.3 输入方式

- **R-FLOW-08** 每个回合 MUST 同时支持键盘输入与**语音转文字**（第 5 节），二者写入同一输入框。

### 3.4 训练模式（解决“24 分钟只说 1 次话”）

| 模式 | 步骤 | 时长 | 用途 |
|---|---|---|---|
| `FULL` 全流程 | 12 步 | ~24 分钟 | 完整赛制演练、结课/比赛前 |
| `SPRINT` 快速 | 立论 A1 → 立论 B1 → 自由辩 ×4 → 结辩 B4 → 结辩 A4（8 步） | ~13 分钟 | 日常训练默认 |
| `DRILL` 片段 | 只练单一环节（如只练质询，连续换 3 个 AI 对手） | ~5 分钟 | 专项纠错 |

- **R-TRAIN-01** 三种模式 MUST 共用同一引擎，只是 `steps` 配置不同。
- **R-TRAIN-02** 建房/开局时 MUST 显式选择模式，默认 `SPRINT`。
- **R-TRAIN-03** `DRILL` 模式 MUST 允许重复练同一环节 ≥3 轮，且不生成完整记录（只记一条练习）。

### 3.5 AI 发言的可控性

- **R-FLOW-09** AI 回合的发言 MUST 支持「**跳过**」：点击后立即结束该回合，辩论史里留一条 30 字内摘要，MUST 不影响评分与后续流程。
- **R-FLOW-10** AI 发言 MUST 支持 1.5× / 2× 加速播放；MUST NOT 影响真人自己的回合。
- **R-FLOW-11** 跳过与加速 MUST 记入 `turn.input_type`（`skipped` / `fast`），用于分析用户耐心度。

### 3.6 单人练习（`SOLO`，点题即开 · 可多选辩位）

> 依据：计划书 §1.4“AI 对辩：单人占满四个辩位”。这是产品主路径，房间是增量。

- **R-SOLO-01 一键开局**：大厅辩题卡直接「开练」，**不建房、不占席、不准备**。`POST /api/matches {topicId, seats[], mode}` → 立即进入 10 秒准备期。房间相关 UI MUST NOT 出现。
- **R-SOLO-02 可多选辩位**：`seats` MUST 支持 1–8 个席位（`A1–A4` / `B1–B4` 任意组合，可跨阵营）。**选中的席位由玩家本人发言，未选的全部自动由 AI 占满。**
- **R-SOLO-03 判定改为集合**：引擎唯一改动是 `currentSeat ∈ mySeats` → 等玩家输入；否则 AI 自动发言。`mySeats` 必须持久化到 `match` 行（`my_seats` 字段）。
- **R-SOLO-04 记住上次选择**：同一用户再次点辩题时，MUST 复用上次的 `seats` 直接开打，**不再弹选择面板**（这是"流畅"的关键）。
- **R-SOLO-05 选择面板低频出现**：仅首次、或主动点「改席位」时出现；一屏列 8 个席位勾选框 + 三个预设（「只练一辩」「己方四人」「正反全占」）。
- **R-SOLO-06 跨阵营允许但降级判定**：同时选中正反方时 MUST 标记 `drill=true`，**不判胜负**，只给个人评分并在结算页注明「自辩演练」。
- **R-SOLO-07 协同分口径调整**：多席位时协同分 MUST 按「接续**我方**上一段发言」计算，不论该发言由哪个席位完成。
- **R-SOLO-08 断线恢复**：仅通过 `GET /api/matches/{id}` 重建，MUST NOT 依赖事件补发、WebSocket、Redis 快照、分布式锁。
- **R-SOLO-09 结算页三动作**：换席位重打 / 同题重打 / 只练这一幕（转 `DRILL`）。
- **R-SOLO-10 AI 队友（未选中的同侧席位）MUST 呼应玩家上一段发言**（R-TEAM-03 同样生效）。
- **R-SOLO-11 记一条 `record`**，`opponent_type = AI`，`my_seats` 一并入库。

**发言密度（选座 = 选训练量，UI 上必须显示）**

| 你选的席位 | 本场你的发言次数 | 约占全场 | 适用场景 |
|---|---|---|---|
| 1 席（如一辩） | 1 次 | 8% | 单点打磨 |
| 2 席（一辩 + 二辩） | 3 次 | 25% | 练「接盘」：自己接自己的话 |
| 4 席（己方全占） | 6 次 | 50% | 赛前把己方整条线走一遍 |
| 8 席（正反全占） | 12 次 | 100% | 自辩对练，练预判对方立论 |

> 各席位出场次数：一辩 1、二辩 2、三辩 2、四辩 1（合计 6/方，共 12 步）。

**单人 / 房间的能力差异（实现时以此为准）**

| 能力 | 单人 SOLO | 房间 ROOM |
|---|---|---|
| 入口 | 点辩题即开 | 建房/加入 → 准备 → 开局 |
| 通道 | 只需 SSE | SSE + WebSocket |
| 状态权威 | `match` 表 | 内存 + Redis 快照 `room:{code}` |
| 并发控制 | 不需要（单用户单局） | `lock:room:{code}` + 发言令牌 |
| 准备/房主/踢人/转让 | 无 | 有 |
| 断线恢复 | 重新 GET 一次 | `lastEventId` 补发 |
| 接口数 | 6 | 16 |
| 预计工期 | ~9 天可玩 | +4 天 |

### 3.7 辩题审核（AI 审核，**两种模式都要过**）

> 自定义辩题必须能被正经辩起来。乱填、立场绑架、人身攻击、违规内容一律挡住，并给出改写建议。

- **R-TOPIC-01** **单人自定义辩题 MUST 先过审核**；多人房间若允许换题，换题同样 MUST 过审核。题库内的官方辩题默认已审核，不再重复审。
- **R-TOPIC-02** 审核 MUST 在提交后 **3 秒内**返回结论；超过 3 秒 MUST 降级为本地规则审核（长度、是否含正反立场、黑名单词），并标记 `pending`，MUST NOT 让用户干等。
- **R-TOPIC-03** 结论 MUST 是三态之一：
  | 结论 | 含义 | 前端行为 |
  |---|---|---|
  | `PASS` | 可辩 | 进入选位置 / 建房 |
  | `REJECT` | 不可辩或违规 | 阻止开局，给理由 + 2 条改写建议 |
  | `NEED_EDIT` | 太宽/太窄/立场绑架 | 允许用户改写后再审，不放行 |
- **R-TOPIC-04** 审核维度 MUST 至少覆盖五项，且每项给出判定理由：
  1. **可辩性**：是否存在正反两种合理立场（「1+1=2 是否正确」不可辩）
  2. **平衡性**：是否一方天然压倒（「人是否应当呼吸」不可辩）
  3. **边界清晰**：是否含「所有/永远/一定」等无法证伪的绝对表述
  4. **合规性**：涉政敏感、色情、暴力、人身攻击、歧视 → 直接 `REJECT`
  5. **表述完整**：≥6 字、是一个可判断的命题而非关键词堆砌
- **R-TOPIC-05** `REJECT` / `NEED_EDIT` MUST 给出**可照抄的改写示例**，例如：
  > 「AI 好不好」→ 建议：「AI 生成内容是否应当享有著作权」
- **R-TOPIC-06** 审核结果 MUST 落库：`topic.moderation_status`、`moderation_reason`、`moderation_at`；相同文本（按 sha256）MUST 命中缓存，不重复调模型。
- **R-TOPIC-07** 审核 MUST NOT 阻断主流程以外的动作：题库浏览、历史记录、能力诊断都不受审核影响。
- **R-TOPIC-08** 审核失败（模型超时/报错）MUST 走规则兜底放行并标 `pending`，MUST NOT 把用户卡死在「审核中」。
- **R-TOPIC-09** `pending` 的辩题 MUST 在对局结束前异步补审；补审 `REJECT` 时 MUST 保留已产生记录，但该题不进热辩榜。
- **R-TOPIC-10** 用户 MUST 能对 `REJECT` 结果提人工复核（P2 实现，本期仅提供入口与提示）。
- **R-TOPIC-11** 审核通过的自定义辩题 MUST 参与热辩榜计分；官方题库与自定义题在榜上 MUST 区分标记（避免刷榜刷出一堆垃圾题）。

---

## 4. AI 节奏（硬约束）

- **R-PACE-01** AI 回合前 MUST 有随机思考停顿 `1.8–3.2s`，显示「对方辩友正在思考…」。
- **R-PACE-02** AI 输出 MUST 流式逐字，`8–12 字/秒`，MUST NOT 一次性推完整段。
- **R-PACE-03** 句号/问号处 MUST 插 `300–500ms` 停顿。
- **R-PACE-04** 每个 AI 回合结束 MUST 留 `2.5s` 缓冲，期间 MUST NOT 有新消息。
- **R-PACE-05** 轮到玩家时 MUST 给「轮到你发言」+ 倒计时；输入框聚焦或录音中 MUST NOT 推 AI 消息。
- **R-PACE-06** 质询环节 AI MUST 只出 1–2 句提问。
- **R-PACE-07** AI 发言 MUST NOT 超过该回合剩余时长，超时 MUST 截断。
- **R-PACE-08** 所有停顿参数 MUST 集中在 §9 配置。

---

## 5. 语音转文字

- **R-VOICE-01** 回合内 MUST 有「按住说话 / 点击录音」入口，单次最长 **90 秒**，且 MUST NOT 超过当前回合剩余时间。
- **R-VOICE-02** 录音 MUST 实时转写，首字延迟 SHOULD ≤ 1.5s，结果 MUST 落到输入框且可编辑。
- **R-VOICE-03** MUST NOT 自动发送，必须用户点「发送」才提交回合。
- **R-VOICE-04** 录音中 MUST 显示时长与音量反馈；到上限 MUST 自动停止并保留文本。
- **R-VOICE-05** 识别失败 / 无权限 / 浏览器不支持 MUST 回退键盘输入并提示，MUST NOT 卡死回合。
- **R-VOICE-06** 音频 MUST NOT 默认持久化，只存文本；如保存音频须用户显式勾选。
- **R-VOICE-07** 语言 MUST 为中文，MUST 自动补标点。
- **R-VOICE-08** 录音期间倒计时 MUST 继续；剩余 ≤15s MUST 提示「时间不多了」。
- **R-VOICE-09** 转写文本 MUST NOT 因识别错误直接进评分，用户可改、可撤销。
- **R-VOICE-10** 技术路线：优先浏览器 `SpeechRecognition`（`zh-CN`），不可用时回退后端 ASR（`/api/asr`）。
- **R-VOICE-11** 转写完成后 MUST 提供「**一键规整**」：把口语转写整理成论辩结构（前提→主张→论据），规整结果 MUST 可编辑、可撤销，且 MUST 经用户确认后才可发送。
- **R-VOICE-12** MUST 同时保存两份文本：`raw_text`（原始转写）与 `polished_text`（规整后），复盘页 MUST 并排展示差异并给出「口语 → 论辩」的差距提示。依据：语音会拉低评分，必须让用户看清“是表达问题还是论证问题”。

---

## 6. 记录、评分与动机

### 6.1 辩论记录（替代段位）

- **R-REC-01** 每场 `FINISHED` MUST 自动写一条记录：辩题、我的立场与辩位、对手类型（真人/AI）、时长、回合数、总分、胜负、日期。
- **R-REC-02** 记录页 MUST 按时间倒序，支持按辩题与类型筛选。
- **R-REC-03** MUST NOT 出现段位、等级、积分、排行榜、胜率排名等攀比项。
- **R-REC-04** 单条记录 MUST 可点开看该场复盘。
- **R-REC-05** 统计区 MUST 只展示：总场次、总时长、平均分、最常练的题型。
- **R-REC-06** 记录 MUST 支持删除单条。

### 6.2 评分必须可解释（R-SCORE）

> 层级关系：**每轮出三维分**（立论/论证/表达）→ **赛后聚合为五维能力画像**（立论/论证/表达/应变/论据），与《项目计划书》创新点三一致。

- **R-SCORE-01** 每个维度分（立论/论证/表达）MUST 附带 **1–2 条证据**：引用用户原句 + 指出问题类型。
- **R-SCORE-02** 每条扣分 MUST 给出**可照抄的改进句式**（不是“建议加强论证”这种空话）。
- **R-SCORE-03** 分数 MUST NOT 出现无法归因的加减项；无法解释的扣分 MUST 不入账。
- **R-SCORE-04** 复盘页 MUST 支持「按扣分权重排序」的薄弱项列表，并给出对应练习建议（指向 `DRILL` 模式）。

示例（MUST 按此格式输出）：
```
论证 68 ↓   证据：第 3 轮「大家都知道这样不行」是态度陈述，不可检验
            改进：该政策有三处硬伤——成本、执行主体、收益周期
```

### 6.3 复盘

- **R-REC-07** 复盘 MUST 包含：三维雷达、薄弱项（按权重）、发言时间线、被抓住的逻辑漏洞清单、**口语 vs 规整文本对比**（R-VOICE-12）。
- **R-REC-08** 复盘 MUST 能一键跳到对应 `DRILL` 练习（例如反复练“质询”环节）。

### 6.4 动机：只和自己比

- **R-MOT-01** MUST 提供**能力雷达趋势**（同一维度 30 天前 vs 现在），MUST NOT 展示任何人际排名。
- **R-MOT-02** MUST 提供**连续练习天数**（个人 streak），中断即归零，MUST NOT 与他人比较。
- **R-MOT-03** MUST 提供**漏洞统计**（按类型计数，如“未证明前提 12 次 / 滑坡谬误 5 次”），作为个人错题本。

---

## 7. 接口契约

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| POST | `/api/auth/login` | `{account,password}` | `{token,user}` |
| GET | `/api/topics?cat=&diff=&q=` | – | `[{id,title,cat,diff}]` |
| POST | `/api/topics/audit` | `{title}` | `{result:PASS\|REJECT\|NEED_EDIT, reason, suggestions[]}` |
| **POST** | **`/api/matches`** | **`{topicId\|title, seats[], mode}`** | **`{matchId}` 单人点题即开（自定义题先审）** |
| POST | `/api/rooms` | `{topicId\|random, mode, visibility, password?}` | `{code}` |
| GET | `/api/rooms` | – | 公开房间列表 |
| GET | `/api/rooms/{code}` | – | 房间详情（设置/8 席/准备/房主） |
| POST | `/api/rooms/{code}/join` | `{password?}` | `{seatKey}` |
| POST | `/api/rooms/{code}/leave` | – | `204` |
| POST | `/api/rooms/{code}/seat` | `{seatKey}` | `{seatKey}` |
| POST | `/api/rooms/{code}/ready` | `{ready}` | `{ready}` |
| POST | `/api/rooms/{code}/settings` | `{topicId?,mode?,visibility?,password?,allowSpectate?}` | `{settings}` |
| POST | `/api/rooms/{code}/start` | – | `{matchId}` |
| POST | `/api/rooms/{code}/kick` | `{userId}` | `204` |
| POST | `/api/rooms/{code}/transfer` | `{userId}` | `204` |
| POST | `/api/rooms/{code}/move` | `{userId,seatKey}` | `{seatKey}` |
| POST | `/api/rooms/{code}/chat` | `{text}` | `{messageId}` |
| GET | `/api/rooms/{code}/events` | – | SSE（房间阶段） |
| GET | `/api/matches/{id}` | – | 对局详情 |
| POST | `/api/matches/{id}/turns` | `{content,inputType:kb\|voice}` | `{turnId,nextSeat}` |
| GET | `/api/matches/{id}/events` | – | SSE（对局阶段） |
| POST | `/api/matches/{id}/catch` | `{turnId,type}` | `{ok,delta}` |
| POST | `/api/matches/{id}/finish` | – | `FREE` 模式结束并评分 |
| GET | `/api/matches/{id}/review` | – | 复盘 |
| GET | `/api/matches/{id}/arguments` | – | 论点树结构（P2 只返回数据，前端暂不渲染，R-ARG-04） |
| POST | `/api/asr` | `multipart 音频` | `{text}` |
| GET | `/api/records?q=&type=` | – | 记录列表 |
| GET | `/api/records/{id}` | – | 单条记录 |
| DELETE | `/api/records/{id}` | – | 删除记录 |
| GET | `/api/community/posts?type=&title=&topicId=&range=&sort=&page=&size=` | – | 社区帖子列表（筛选 + 排序 + 分页） |
| GET | `/api/community/posts/{id}` | – | 帖子详情 |
| POST | `/api/community/posts` | `{type,title,body,topicId?}` | `{postId}` |
| PATCH | `/api/community/posts/{id}` | `{type?,title?,body?,topicId?}` | `{postId}` |
| DELETE | `/api/community/posts/{id}` | – | `204`（软删除） |
| POST | `/api/community/posts/{id}/view` | – | `204` 浏览计数（服务端去重） |
| GET | `/api/community/posts/{id}/comments?page=&size=` | – | 楼列表，每楼附前 3 条楼中楼 + 子回复总数 |
| GET | `/api/community/comments/{rootId}/replies?page=&size=` | – | 某一楼的全部楼中楼 |
| POST | `/api/community/posts/{id}/comments` | `{body,replyObjectType,replyObjectCommentId?}` | `{commentId}` |
| DELETE | `/api/community/comments/{id}` | – | `204`（软删除） |
| POST | `/api/community/posts/{id}/like` | – | `204` 幂等点赞 |
| DELETE | `/api/community/posts/{id}/like` | – | `204` 取消点赞 |
| POST | `/api/community/comments/{id}/like` | – | `204` 幂等点赞 |
| DELETE | `/api/community/comments/{id}/like` | – | `204` 取消点赞 |

错误码：`ROOM_FULL` `WRONG_PASSWORD` `NOT_YOUR_TURN` `NOT_HOST` `NOT_READY` `ROOM_STARTED` `ROOM_NOT_FOUND` `SEAT_TAKEN` `ASR_FAILED` `CONTENT_BLOCKED` `POST_NOT_FOUND` `COMMENT_NOT_FOUND` `NOT_AUTHOR`。

---

## 8. 数据表

```
user(id,name,created_at)                       -- 无 tier/段位
topic(id,title,cat,diff,heat,source,moderation_status,moderation_reason,moderation_at,title_hash)
      -- source: official|custom；moderation_status: PASS|REJECT|NEED_EDIT|pending
room(id,code,topic_id,mode,visibility,password,allow_spectate,host_id,status,created_at)
seat(room_id,seat_key,side,role,occupant_type,user_id,ai_profile_id,ready)
room_chat(id,room_id,user_id,text,created_at)
match(id,room_id,topic_id,mode,status,current_step,current_seat,deadline_at,started_at,finished_at,
      my_seats,drill)      -- my_seats: 玩家占的席位集合（如 "A1,A2"）；drill: 跨阵营自辩标记
turn(id,match_id,step,seat_key,seg,seq,content,input_type,status,flaw_type,created_at)
team_msg(id,match_id,side,user_id,text,created_at)
score(id,match_id,user_id,matter,method,manner,collab,catch,role_hit,created_at)
catch(id,turn_id,user_id,claimed,truth,ok)
review(id,match_id,user_id,radar_json,weak_json,chain_json)
record(id,user_id,match_id,topic_title,seat_key,side,opponent_type,duration_sec,turns,total_score,result,created_at)
ai_profile(id,name,style,weakness,flaw_type,tone)
evidence(id,keyword,domain,dimension,content,source,created_at)   -- 论据库（≥500 条，必须带出处）
drill_record(id,user_id,drill_type,topic_id,score,weak_tags,created_at)
argument(id,match_id,side,parent_id,claim,evidence_ids,created_at) -- 论点树（P2，表先留）
post(id,author_id,type,title,body,excerpt,topic_id,comment_count,like_count,view_count,
     hot_score,last_comment_at,status,created_at,updated_at)   -- 社区帖子
post_comment(id,post_id,user_id,root_id,reply_object_type,reply_object_comment_id,
             reply_object_user_id,body,like_count,status,created_at)   -- 两层：楼 + 楼中楼
community_like(user_id,target_type,target_id,created_at)   -- 主键 (user_id,target_type,target_id)
```

- **R-DATA-01** `turn` 只追加不改写（超时落 `TIMEOUT`）。
- **R-DATA-02** `seat.ready` MUST 与席位同表。
- **R-DATA-03** 删除 `record` MUST NOT 删除 `match` / `review`。
- **R-DATA-04** 社区三表 MUST 建以下索引（缺一不可，四种排序各靠一个索引）：
  ```
  post: (status, created_at DESC)          -- NEW
        (status, comment_count DESC)       -- COMMENTS
        (status, like_count DESC)          -- LIKES
        (status, hot_score DESC)           -- HOT
        (status, type, created_at DESC)    -- 类型筛选
        (topic_id, status, created_at DESC) -- 辩题筛选
        (author_id, created_at DESC)
  post_comment: (post_id, status, root_id, created_at)
                (root_id, status, created_at)
                (user_id, created_at DESC)
  community_like: (target_type, target_id)
  ```
- **R-DATA-05** `post_comment.root_id` MUST 由服务端派生后落库，MUST NOT 依赖运行时递归查询父级。

---

## 9. 参数

```yaml
siyige:
  room:
    maxSeats: 8
    minRealPlayers: 1
    hostReadyImplicit: true
    idleCloseMinutes: 30
    codeAlphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  flow:
    prepareSeconds: 10
    steps:
      - {seg: 立论,   seat: A1, sec: 180}
      - {seg: 立论,   seat: B1, sec: 180}
      - {seg: 驳立论, seat: A2, sec: 120}
      - {seg: 驳立论, seat: B2, sec: 120}
      - {seg: 质询,   seat: A3, sec: 120}
      - {seg: 质询,   seat: B3, sec: 120}
      - {seg: 自由辩, seat: A2, sec: 120}
      - {seg: 自由辩, seat: B2, sec: 120}
      - {seg: 自由辩, seat: A3, sec: 120}
      - {seg: 自由辩, seat: B3, sec: 120}
      - {seg: 总结,   seat: B4, sec: 180}
      - {seg: 总结,   seat: A4, sec: 180}
  pace:
    aiThinkMs: [1800, 3200]
    aiTypingCps: [8, 12]
    sentencePauseMs: [300, 500]
    postAiTurnMs: 2500
    freeDebateGrabWindowMs: 5000
    maxConsecutiveAiTurns: 2
  voice:
    maxSeconds: 90
    firstTextLatencyMs: 1500
    requiresConfirm: true
    persistAudio: false
    language: zh-CN
  score: {matter: 0.4, method: 0.35, manner: 0.25}   # 立论 / 论证 / 表达
  community:
    pageSize: 20
    excerptLength: 200
    commentMaxLength: 1000
    commentPreviewCount: 3
    hotScore: {comment: 4, like: 2, view: 0.05, decay: 1.5}
    hotRecalcMinutes: 10
    hotRecalcWindowDays: 7
    view:
      dedupDays: 1
      dedupExpireAt: "02:00"       # 次日凌晨 2 点，必须是 EXPIREAT 不是固定 24h
      pendingTtlHours: 2           # 定时任务挂掉时的兜底
      flushMinutes: 5
      redisTimeoutMs: 50           # 超时即放弃计数，不阻塞详情页
```

---

## 10. 验收

| ID | 动作 | 通过标准 |
|---|---|---|
| AC-01 | 建房 | 8 席、房间号、房主徽标、设置入口齐备 |
| AC-02 | 私密房 + 密码 | 不进公开列表，凭码 + 密码才进 |
| AC-03 | 真人未准备 | 开始按钮禁用，提示「还有 N 人未准备」 |
| AC-04 | **单人建房直接开始** | 7 席 1 秒内补 AI，走完 12 步出复盘 |
| AC-05 | 房主点他人座位 | 出现「移到对面 / 踢出 / 转让房主」 |
| AC-06 | 开局 | 先播 10 秒准备期，再进入立论 A1 |
| AC-07 | AI 回合 | 先「正在思考」1.8–3.2s，再逐字流；说完静止 2.5s |
| AC-08 | 非当前席位提交 | 409 `NOT_YOUR_TURN`，库无记录 |
| AC-09 | 玩家超时 | 落 `TIMEOUT`，自动进下一环节 |
| AC-10 | 自由辩连打 3 轮 | AI 不连说 3 次，第 3 次前出现抢话窗口 |
| AC-11 | 点录音说一句话 | 边说边出字，可编辑；点发送才提交 |
| AC-12 | 拒绝麦克风权限 | 回退键盘输入，提示清晰，回合不卡 |
| AC-13 | 打完 12 步 | 进 REVIEW → 出复盘 → 生成一条辩论记录 |
| AC-14 | 记录页 | 只有场次/时长/平均分，**无段位无排名** |
| AC-15 | 断网 10 秒 | 重连补齐事件，状态一致 |
| AC-16 | 刷新页面 | 回到同一房间/同一对局同一位置 |
| AC-17 | 大厅首屏 | 「快速开始」（单人 1v7AI）为主按钮，并显示预计时长与发言次数 |
| AC-18 | 换座菜单 | 每个席位标出「发言 N 次 / 累计 X 秒」 |
| AC-19 | 选 `SPRINT` 模式开局 | 只有 8 步，约 13 分钟打完 |
| AC-20 | 点「跳过」AI 发言 | 该回合立即结束，史册留 30 字摘要，后续流程正常 |
| AC-21 | 点 1.5× 播放 AI 发言 | 速度加快，自身回合不受影响 |
| AC-22 | 看任意一条评分 | 每个维度都有原句引用 + 改进句式，无无法归因的扣分 |
| AC-23 | 语音说完点「一键规整」 | 文本被整理成论辩结构，可编辑、可撤销，确认后才发送 |
| AC-24 | 打开复盘 | 能看到「口语 vs 规整」并排对比 |
| AC-25 | 打开记录页 | 有雷达趋势、连续天数、漏洞统计，**仍无任何排名** |
| AC-26 | **单人练习入口** | 点辩题卡直接开打：不建房、不占席、不准备，10 秒准备期 |
| AC-27 | 单人**同时选一辩+二辩** | 这两席轮到你就等你输入，其余 6 席 AI 自动发言；本场你发言 3 次 |
| AC-28 | 第二次点同一辩题 | **不再弹选择面板**，复用上次席位直接开局（手感是"点一下就开始"） |
| AC-29 | 单人中途刷新 | 重新 GET 一次即恢复进度与当前席位，无需事件补发 |
| AC-30 | 结算页 | 有「换席位重打」「同题重打」「只练这一幕」三个按钮 |
| AC-31 | 同时选中正反方 | 标记为自辩演练，**不判胜负**，只出个人评分 |
| AC-32 | 自己填一个正常辩题 | 3 秒内审核通过，直接进选位置 |
| AC-33 | 填「1+1=2 是否正确」 | 返回 REJECT 或 NEED_EDIT，说明不可辩，并给改写示例 |
| AC-34 | 填含人身攻击/违规词 | REJECT，阻止开局，理由明确 |
| AC-35 | 故意让审核接口超时 | 3 秒内降级为规则审核放行，标 pending，不卡住用户 |
| AC-36 | 同一个自定义题再审一次 | 命中缓存，不再调用模型（日志可见） |
| AC-37 | 发帖 | 类型 / 标题 / 正文齐备后可发布，列表首位出现，**作者处只显示昵称** |
| AC-38 | 按标题搜 | 只返回标题命中的帖子；正文含该词但标题不含的**不出现** |
| AC-39 | 组合筛选 | 类型 + 标题 + 关联辩题 + 日期同时生效，结果数随筛选变化 |
| AC-40 | 四种排序 | NEW / COMMENTS / LIKES / HOT 结果各不相同；HOT 下新帖有机会压过旧帖 |
| AC-41 | 回复帖子 | 显示为楼，**不显示**「回复了谁」 |
| AC-42 | 回复楼 | 显示「回复了 xxx」，仍挂在同一楼内 |
| AC-43 | 回复楼中楼 | 仍挂在同一楼内，显示「回复了 被回复者」，**不出现第三层缩进** |
| AC-44 | 点赞 | 重复点赞不重复计数；刷新后 `liked` 状态保持 |
| AC-45 | 浏览去重 | 同一人同一天多次刷新，浏览数只 +1；**次日再看可再 +1**（自然日口径） |
| AC-46 | 敏感词 | 发布成功；命中词以全角＊逐码点落库，数据库中无原文；摘要同为替换后文本 |
| AC-47 | 删除帖子 | 列表与详情不可见，其下评论一并不可见 |
| AC-48 | 浏览回写 | 5 分钟后库中 `view_count` 与实际唯一浏览数一致；Redis 中 `view:pending` 已清空 |

---

## 11. 禁止事项

1. MUST NOT 出现段位、等级、积分、排行榜。
2. MUST NOT 在玩家发言/录音期间推 AI 消息。
3. MUST NOT 一次性返回 AI 整段发言。
4. MUST NOT 把准备状态做成前端假状态。
5. MUST NOT 允许非房主开局。
6. MUST NOT 在 `RUNNING` 后改顺序、席位或设置。
7. MUST NOT 因空位卡住开局（必须自动补 AI）。
8. MUST NOT 语音识别结果自动提交。
9. MUST NOT 默认保存用户音频。
10. MUST NOT 做 1v1 / 2v2 模式（只做 4v4）。
11. MUST NOT 输出无法归因的分数（见 R-SCORE-03）。
12. MUST NOT 在「跳过 AI 发言」时丢失辩论史（必须留摘要）。
13. MUST NOT 在社区展示作者的任何身份标识（段位 / 等级 / 积分 / 场次 / 贡献值）。
14. MUST NOT 让点赞数影响任何评分、段位或排名。
15. MUST NOT 让楼中楼长出第三层。

---

## 12. 里程碑（**先单人，后房间**）

| # | 范围 | 需求 | 天 | 依赖 |
|---|---|---|---|---|
| M1 | 骨架 + 登录 + 辩题库 + 大厅（单人入口为主） | R-ROOM-01、R-SOLO-01 | 2 | – |
| M3 | 赛制引擎：12 步 + 三档模式 + 发言权 + 计时 + SSE | R-FLOW-01~08、R-TRAIN-01~03 | 3.5 | M1 |
| M4 | AI 席位 + 流式 + 节奏 + **跳过/加速** | R-PACE-01~08、R-FLOW-09~11 | 2 | M3 |
| M6 | **可解释评分** + 抓漏 + 复盘 | R-SCORE-01~04、R-REC-07~08 | 2.5 | M4 |
| **★ 单人 MVP 达成（约 10 天）** | 一个人能对 7 个 AI 打完一场并拿到复盘 | R-SOLO-01~08 | – | – |
| M2 | 房间：8 席 / 座位卡 / 准备 / 房主操作 / 设置 / 邀请 / 聊天 | R-ROOM-04、R-SET-01~03、R-SEAT-01~07、R-READY-01~08、R-JOIN-01~04、R-CHAT-01 | 3.5 | 单人 MVP |
| M5 | **语音转文字 + 一键规整** | R-VOICE-01~12 | 2.5 | M1（可与 M2 并行） |
| M7 | **记录与动机** + 队内频道 + 联调 + 答辩材料 | R-REC-01~06、R-MOT-01~03、R-TEAM-01~03、AC-01~36 | 2.5 | 全部 |
| M8 | **社区**：帖子 / 两层楼中楼 / 点赞 / 浏览去重 / 内容审核 | R-COM-01~40、AC-37~48 | 2.5 | M1 |

**顺序说明**：
1. **单人先于房间**。单人只需 DB + SSE，房间要额外引入 WebSocket、Redis 快照、分布式锁，且房间的准备/踢人/转让在单人里根本不触发——先做房间等于先写一批跑不到的分支。
2. **M5 语音可与 M2 并行**，因为单人模式下语音只在本地调浏览器 API，不依赖房间。
3. M2 的房间层 MUST 复用 M3 的 `TurnEngine`，不得另写一套推进逻辑。
4. **M8 社区可与 M2/M5 并行**：社区只依赖 `user` 与 `topic`，不碰赛制引擎，是工期风险最低的一块，适合塞在等联调的碎片时间里。

---

## 13. P2（有工时再做，别提前做）

| 项 | 为什么后置 |
|---|---|
| 房主踢人 | 4v4 真人难凑齐，90% 场次不触发 |
| 转让房主 | 同上，房间多为一两人 + AI |
| 观战 | 同上；且需要额外做延迟推送防作弊 |
| 跨阵营换边 | 只有在真人对局里才有意义，且可用“解散重开”替代 |
| 房间聊天 | 单人练习用不到；多人房是低频场景 |

> 判断标准：**能提升留存/训练效果的功能优先，能提升“管理感”的功能后置。**

---

## 14. 技术实现

> 本章与《思弈阁·项目计划书（技术方案分册）》一致；技术栈按作者已交付项目校准（GitHub `skwdng`：`xiaoc-kuaisong` = Spring Boot + MyBatis + MySQL + Redis + 小程序/Web；`123c` = Java Feed 系统）。

### 14.1 技术选型

> **不选理由**（答辩必被问，采纳自计划书 §2.7）：
> - **不引向量库**（Milvus/pgvector）：论据语料万级，ngram 精确命中足够，省一套运维。
> - **不用 JPA**：周榜、画像聚合这类统计用 JPA 会写成一堆 Criteria，不如直接 SQL。
> - **不用 React**：JSON/JSX 对 Java 后端出身的团队认知负担更大。
> - **不全程 WebSocket**：LLM 流式是单向，SSE 天然适配且浏览器自带重连；房间双向才用 WS。

| 层 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 运行环境 | Java（LTS） | 17 | 虚拟线程、record 可用 |
| 应用框架 | Spring Boot | 3.2.x | 自动装配、起步依赖 |
| 常规接口 | Spring Web MVC | 6.1.x | 同步 CRUD（辩题/记录/房间） |
| 流式输出 | Spring WebFlux | 6.1.x | AI 发言 SSE（`Flux<ServerSentEvent>`） |
| 房间事件 | Spring WebSocket + STOMP | 6.1.x | 入座、开局、轮转、发言广播 |
| 鉴权 | Spring Security + JWT | 6.2.x | 无状态鉴权 |
| ORM | MyBatis-Plus | 3.5.x | 复杂统计直接写 SQL |
| 数据库 | MySQL | 8.0 | InnoDB + utf8mb4 + ngram 全文索引 |
| 缓存/状态 | Redis | 7.x | 房间快照、发言令牌、限流、榜单 |
| AI 框架 | Spring AI | 1.x | `ChatClient.stream()` / `.entity()` / `@Tool` |
| 模型 | DeepSeek API（OpenAI 兼容） | – | deepseek-chat |
| 前端 | Vue 3.4 + Vite 5 + Arco Design Vue + Pinia + ECharts | – | 页面/图表 |
| SSE 客户端 | `@microsoft/fetch-event-source` | 2.x | 原生 EventSource 不能带 header |
| 部署 | Docker Compose + Nginx | – | 一键起 MySQL/Redis/App/Nginx |

### 14.2 工程结构

```
com.siyige
├─ api/            Controller、DTO、统一响应、异常处理
├─ auth/           JWT 过滤器、UserDetails
├─ room/           RoomService、SeatService、RoomSnapshot（Redis）
├─ debate/         Format（赛制常量）、TurnEngine（纯函数）、TurnService、TimerService
├─ ai/             DebaterAgent、JudgeAgent、PromptTemplates、SafeJson（兜底解析）
├─ voice/          AsrController、AsrClient（浏览器不支持的兜底）
├─ score/          ScorePipeline、DiagnosisService（五维聚合）
├─ record/         RecordService
├─ domain/         entity + mapper（MyBatis-Plus）
└─ common/         RedisLock、RateLimiter、Result
```

### 14.3 关键实现条款

- **R-TECH-01 状态机纯函数化**：`Format.STEPS` 为不可变列表，`TurnEngine.next(state)` 无副作用、无 IO，可直接单测；单人练习与房间共用同一个推进器（对齐计划书亮点四）。
- **R-TECH-02 房间权威 + 快照**：房间状态以服务端内存为权威，每次变更写 `room:{id}` 快照（TTL 2h，结束即删）；客户端重连带 `lastEventId`，服务端比对补发缺失事件（计划书亮点六）。
- **R-TECH-03 发言权仲裁**：提交前对 `turn:{matchId}:{step}` 做 `SETNX`（TTL = 该回合时长），成功者获得写入权；同时校验 `seatKey == currentSeat`，双保险。
- **R-TECH-04 计时器**：以 `match.deadline_at` 为唯一权威，不用内存 Timer 作真相；后台每 5s 扫描 `status=RUNNING AND deadline_at < now()` 推进超时回合。服务重启不丢计时。
- **R-TECH-05 双通道分工**：SSE 只承载单向流（AI 发言增量、点评卡片分片）；WS/STOMP 承载双向房间事件。两条链路鉴权/限流/日志独立，互不牵连。
- **R-TECH-06 三段式异步推送**：① 主回复 `ChatClient.stream()` 逐字（首字 ≤1.5s）→ ② 点评异步结构化抽取 → ③ 论点抽取最低优先级。任一失败不回滚其它链路。
- **R-TECH-07 结构化输出四级兜底**：Schema 强约束 → 本地修复（剥 ```json 围栏/补括号/去尾逗号）→ 把解析错误回灌模型重试 → 返回 `degraded=true` 的默认对象。**评分卡片永远渲染得出来**。
- **R-TECH-08 论据检索**：`@Tool searchEvidence(keyword, dimension, topK)` + MySQL ngram 全文索引；返回必须带出处，前端可点开核对，防止模型编数字。
- **R-TECH-09 语音双路**：主路浏览器 `SpeechRecognition(zh-CN)`；不支持/失败时前端上传音频到 `/api/asr`，服务端转第三方 ASR 返回文本。**音频默认不落盘**（R-VOICE-06）。
- **R-TECH-10 评分管线**：规则分（长度、结构连接词、论据词命中）占 40%，LLM 占 60%；LLM 输出缺 `evidence` 或 `improve` 字段时，该维度回落规则分并标 `degraded`（对应 R-SCORE-03）。
- **R-TECH-11 五维画像聚合**：逐轮三维分 + 漏洞标签 → 赛后按维度加权聚合为五维（立论/论证/表达/应变/论据），写入 `diagnosis`；「应变」由质询/自由辩环节表现单独计算。
- **R-TECH-12 记录与删除语义**：`match` 结束事务内写 `record`；删除 `record` 只删记录行，不删 `match`/`review`（R-DATA-03）。
- **R-TECH-15 单人模式的技术裁剪**：`SOLO` 只走「MVC 提交 + WebFlux SSE 流 + DB 状态」三件套，MUST NOT 引入 WebSocket、`room:{code}` 快照、分布式锁。玩家席位是**集合**（`match.my_seats`，如 `"A1,A2"`），推进判断为 `currentSeat ∈ mySeats`；`TurnEngine` 与 `Format` 由单人先写、房间后复用，**房间层 MUST NOT 复制粘贴出第二套推进逻辑**。
- **R-TECH-16 论据检索（采纳自计划书亮点五）**：`@Tool searchEvidence(keyword, dimension, topK)` + `getCounterExample(claim)`，底层 MySQL ngram 全文索引；返回 MUST 带 `source` 出处，AI 发言中引用的数字 MUST 能点开核对；论据库 MUST ≥500 条并按领域/维度打标。
- **R-TECH-17 点赞与评分隔离（采纳自计划书创新点四）**：点赞/热度 MUST NOT 进入评分计算链路，接口层、聚合层、测试用例三处同时约束；即使观战功能上线，评分也必须只由模型依据发言内容产出。
- **R-TECH-18 提示词人格分离（采纳自计划书 §2.3）**：辩手 / 评委 / 教练三套提示词模板 MUST 分文件维护，各自独立版本号；改一个 MUST NOT 影响另外两个。辩手按 `ai_profile`（风格+弱点+语气）注入，评委只读全场不参与辩论。
- **R-TECH-19 上下文滑窗（采纳自计划书风险表）**：`ChatMemory` MUST 只保留最近 6 轮全文，更早轮次压成摘要（≤120 字/轮）；MUST NOT 把全场 12 步原文塞进每次调用（单场成本会翻倍）。
- **R-TECH-20 流式取消传播（采纳自计划书亮点一技术要点）**：前端关闭页面或点「跳过」时，下游 LLM 请求 MUST 被取消（WebFlux `Flux` 取消信号向上传播），MUST NOT 出现“用户已离开、服务端还在烧 token”。

### 14.4 通道分工（采纳自计划书亮点二）

| 维度 | SSE | WebSocket + STOMP |
|---|---|---|
| 承载 | AI 发言流式、点评分片 | 入座、开局、轮转、发言广播 |
| 方向 | 服务端 → 客户端 | 双向 |
| 生命周期 | 一次发言一次连接 | 房间存续期间长连接 |
| 断线 | 浏览器自动重连 + `Last-Event-ID` | 客户端重连 + 服务端快照 |
| 端点 | `/api/matches/{id}/events` | `/ws/room/{code}` |
| 何时需要 | **单人模式只用这个** | 只有房间模式才升级 |

> 两条链路的鉴权、限流、日志 MUST 独立，故障不得互相牵连。

### 14.5 Redis 键设计

| Key | 类型 | TTL | 用途 |
|---|---|---|---|
| `room:{code}` | Hash | 2h | 房间快照：席位、当前 step、host |
| `turn:{matchId}:{step}` | String(SETNX) | 回合时长 | 发言权令牌 |
| `lock:room:{code}` | String | 3s | 房间写操作串行化 |
| `rl:llm:{userId}` | String(INCR) | 60s | LLM 调用限流 |
| `topic:hot` | ZSet | 10min | 辩题热度榜（只做曝光，不做排名） |
| `view:seen:{postId}:{yyyyMMdd}` | Set | 次日 02:00 | 社区浏览去重，成员为 `userId`（R-COM-31） |
| `view:pending` | Hash | 2h 兜底 | 待回写的浏览增量，`field=postId`（R-COM-31） |

> **内存与淘汰**：`view:seen:*` 是本系统唯一随浏览量线性增长的数据（估算：单帖 1 万浏览 ≈ 800KB，百帖/天 ≈ 2MB）。
> Redis 的 `maxmemory` / `maxmemory-policy` 是**实例级**配置，**分 db 不能隔离淘汰**。
> 因此 MUST 二选一：① 给足内存（建议 ≥512MB）并加水位告警；② 把浏览计数放到独立 Redis 实例。
> 目标是**房间快照 `room:{code}` 不被逐出**。

### 14.6 部署

```yaml
# docker-compose 关键服务
mysql:   { image: mysql:8.0,  volumes: [./data/mysql:/var/lib/mysql] }
redis:   { image: redis:7 }
app:     { build: ., depends_on: [mysql, redis], ports: ["8080:8080"] }
nginx:   { image: nginx:alpine, ports: ["80:80"] }
```

```nginx
# SSE 必须关缓冲，否则一定粘包/延迟
location /api/ {
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_buffering off;
  proxy_cache off;
  chunked_transfer_encoding off;
  add_header X-Accel-Buffering no;
}
```

- **R-TECH-13** 服务器 MUST ≥ 2C4G（8 席 × 多房间 + LLM 转发）。
- **R-TECH-14** `Actuator /actuator/health` MUST 暴露给 Nginx 探活。

### 14.7 测试与评测

| 类型 | 范围 | 目标 |
|---|---|---|
| 单元测试 | `TurnEngine`（12 步推进）、席位映射、超时推进、`my_seats` 集合判定 | 业务层覆盖率 ≥60% |
| 接口测试 | MockMvc：点题即开/提交/超时/抓漏/结算 | 200 与 409 分支全覆盖 |
| AI 评测集 | 20 题 × 4 段人工发言（优秀/中等/较差三档），两名辩手给基准分 | **合法率 ≥99%、完整率 ≥98%、分数漂移 σ ≤5、与人排序一致性 ≥0.75、样本 ≥80 条** |
| 压测 | 8 席 × 10 房间并发 | 席位广播延迟 ≤300ms、首字延迟 ≤1.5s |

> 评测集 MUST 在每次提示词改动后跑一次，作为“这次改动变好还是变坏”的判据（采纳自计划书亮点七）。

### 14.8 里程碑与计划书四周的映射

| 计划书 | 本规格 | 说明 |
|---|---|---|
| 第 1 周 地基 | M1 | 骨架/登录/辩题库/大厅 |
| 第 2 周 AI 对辩 | M2 + M3 + M4 | 房间与赛制引擎先于 AI（否则 AI 无处接入） |
| 第 3 周 4v4 与观战 | M5 + M6 | 语音与评分；观战降 P2 |
| 第 4 周 画像与收尾 | M7 | 记录、动机、联调、答辩材料 |

---

## 15. 与《项目计划书》的冲突（**先改计划书，否则两份材料自相矛盾**）

| # | 计划书写的 | 本规格（以本文为准） | 处理建议 |
|---|---|---|---|
| 1 | §1.4 范围外：**语音输入与语音识别** | **范围内**（R-VOICE-01~12） | 计划书该行改为“范围内”，并把语音列为创新点之一 |
| 2 | 数据模型 `user` 含**段位、积分** | 已删除，改 `record` 辩论记录 | 删除该两字段；`diagnosis` 保留 |
| 3 | 赛制表 9 环节 12 步（立论/驳立论/质询/自由辩/总结） | 已按计划书对齐（§3.1） | 上一版 SPEC 的“应答”环节作废，勿实现 |
| 4 | 逐轮三维分 + 五维画像 | 一致（§6.2 已补五维） | 保留 |
| 5 | P2 含“排行榜” | **排行榜删除**（R-REC-03 禁止排名） | 计划书 P2 行删掉排行榜，只留观战/社区 |
| 6 | 观战在范围内 | 降为 P2 | 计划书可在结题材料中说明“延后” |
| 7 | 前端 `@microsoft/fetch-event-source` | 一致 | – |
| 8 | §1.4 范围外：**社区板块（不在本期规格内）** | **范围内**（第 18 节 R-COM-01~40） | 计划书该行改为「范围内」，并把社区列入功能清单 |
| 9 | 社区搜索为「标题 + 摘要 + 正文 + 作者 + 标签」 | 收窄为**仅标题模糊匹配**（R-COM-10） | 计划书若提社区检索，按标题写 |
| 10 | 社区帖子带标签（16 个）与作者段位徽章 | **标签整体删除**；**作者不显示任何身份**（R-COM-03） | 计划书不写标签；原型需去掉 tier 徽章 |

> 判断：**计划书是给评审看的，本规格是给实现看的。两者冲突时，先改计划书那一行，再写代码。**

---

## 16. 风险与应对（采纳自计划书 §7）

| 风险 | 可能性 | 影响 | 应对 |
|---|---|---|---|
| 前端不熟导致滞后 | 高 | 高 | 第 1 周先用 Arco 模板跑通一个完整页面（列表+表单+弹窗），套路固化后再批量复制；组件从简 |
| 模型输出格式不稳 | 中 | 高 | 结构化输出 + 四级兜底（R-TECH-07）；每版提示词跑一次评测集，用数字判好坏 |
| 4v4 并发状态错乱 | 中 | 中 | **单人先行**消掉大部分并发面；房间层服务端权威 + 状态机纯函数推进，单机内存 + Redis 快照，不做分布式一致性 |
| SSE 被代理缓冲 | 中 | 中 | Nginx 显式 `proxy_buffering off` + `X-Accel-Buffering: no`（§14.5） |
| 上下文超长推高成本 | 中 | 中 | `ChatMemory` 按轮次滑窗：最近 6 轮全文 + 更早轮次摘要 |
| 语音识别在非 Chrome 不可用 | 高 | 中 | 浏览器 `SpeechRecognition` 为主路，`/api/asr` 兜底（R-VOICE-10），失败回退键盘 |
| 语音识别错字影响评分 | 中 | 中 | 双文本 + 一键规整（R-VOICE-11/12），提交前可改可撤销 |
| 工期不足 | 高 | 高 | 按 §13 的 P2 顺序削减；P2 保留界面与数据不做深度交互 |

### 16.1 削减优先级（合并计划书 P0/P1/P2）

| 级别 | 功能 | 可削减程度 |
|---|---|---|
| **P0 不可削** | 赛制引擎 + 发言权 + AI 流式 + 可解释评分 | 削了项目不成立 |
| **P0 不可削** | 单人点题即开 + 多选辩位 | 这是主路径，房间是增量 |
| P1 应做 | 语音转文字、辩论记录、动机三件套 | 语音可缩为“仅 Chrome”，记录可缩为列表 |
| P1 应做 | AI 评测集 | 可缩为 10 题 |
| P2 可选 | 观战、论点树可视化、专练题库 | 保留界面与表结构，不做深度交互 |

---

## 17. 论点树与弱项专练（P2 实现，**表与接口现在就要定死**）

> 这两块是计划书“创新点三”闭环的落点：点评 → 画像 → 专练。本期不做交互，但**数据结构和接口必须先定**，否则后期加要动主表。

### 17.1 论点树（argument）

- **R-ARG-01** 每个 `match` MUST 维护一棵论点树：节点为 `{side, parent_id, claim, evidence_ids}`，根节点是双方的一辩立论。
- **R-ARG-02** 每次发言后 MUST 异步抽取 0–3 个论点节点（失败不影响主流程，R-TECH-06 第三条链路）。
- **R-ARG-03** 节点之间 MUST 能表达「攻击」关系（A 方节点被 B 方节点反驳），前端据此画交锋虚线。
- **R-ARG-04** 本期 MUST NOT 做树的可视化渲染；只要求 `GET /api/matches/{id}/arguments` 返回可绘制的结构。

### 17.2 弱项专练（drill）

- **R-DRILL-01** 复盘里的**每一条薄弱项 MUST 挂一个专练入口**（`drill_type` + 对应 `topic_id`），点击即创建一场 `DRILL` 模式对局，只练该环节。
- **R-DRILL-02** 专练 MUST 连续 ≥3 轮同一环节（如连续质询 3 个不同 AI 对手），每轮独立评分，取最好一次进 `drill_record`。
- **R-DRILL-03** `drill_record` MUST 记录：类型、题、分数、命中的薄弱标签，用于画像趋势（R-MOT-01）。
- **R-DRILL-04** 专练结果 MUST NOT 生成完整 `record`（避免刷场次），只记一条 `drill_record`。

> **与 §3.4 的关系**：§3.4 的 `DRILL` 是「只练单一环节」的**对局模式**（一场 `match`）；本节说的是**从复盘薄弱项一键进入专练**的入口。两者共用同一个 `mode=DRILL`，区别只在「谁发起」：前者用户主动选，后者由复盘点进来。
> **接口复用**：专练对局 MUST 复用 `POST /api/matches`（`mode=DRILL` + `seats[]`），MUST NOT 另开一套建局接口。

### 17.3 五维画像聚合（衔接 §6.2）

| 维度 | 来源 |
|---|---|
| 立论 | 立论环节的三维分 + 框架完整度 |
| 论证 | 全环节的论证分 + 论据引用次数（`evidence` 命中） |
| 表达 | 表达分 + 口语规整差距（R-VOICE-12） |
| 应变 | 质询 / 自由辩环节的表现 + 被质询后的回应质量 |
| 论据 | 引用数 × 出处可核查率 |

---

## 18. 社区

> 定位：辩论者的经验交换区。与主产品共享 `user` 与 `topic`，但**不参与任何评分、段位或排名体系**（见第 11 节禁止事项 1）。
> 本节为 v4.2 追加。为避免打乱既有跨节引用，编号排在文末；正文引用本节统一写「第 18 节」。

### 18.1 帖子

- **R-COM-01** 帖子 MUST 有三个必填内容：**类型、标题、正文**。类型枚举 `CHAT`（闲聊）/ `GUIDE`（教程）/ `HELP`（求助）。
- **R-COM-02** 帖子 MAY 关联一个辩题（`topic_id` 可空）；有关联时列表与详情 MUST 显示辩题标题。
- **R-COM-03** 帖子 MUST NOT 展示作者的任何身份标识——段位、等级、积分、练习场次、贡献值一律不显示，列表与详情**只显示昵称**。
- **R-COM-04** 列表 MUST 展示：类型、标题、摘要、作者昵称、评论数、浏览数、点赞数、创建时间、最后回复时间。
- **R-COM-05** 摘要 MUST 由服务端在写入时截取（≤200 字）；列表查询 MUST NOT 读取正文列。
- **R-COM-06** 正文为 Markdown。MUST NOT 提供图片上传，仅允许外链图片。
- **R-COM-07** 只有作者本人可编辑/删除自己的帖子；删除为软删除（`status=2`），其下评论一并不可见。
- **R-COM-08** 帖子 MUST NOT 出现在任何用户排行榜、贡献榜、积分体系中。

### 18.2 筛选与排序

- **R-COM-09** 列表 MUST 支持四个筛选条件，可任意组合：**类型、标题模糊匹配、关联辩题、日期范围**。
- **R-COM-10** 标题匹配 MUST 使用 `title LIKE '%关键词%'`。MUST NOT 引入全文索引、ngram 或向量检索——**本版明确收窄为标题**，不搜正文。
- **R-COM-11** 日期范围枚举 MUST 为 `ALL` / `3D` / `7D` / `OLDER`（`OLDER` = 早于 7 天）。
- **R-COM-12** 排序 MUST 支持四种：`NEW`（创建时间倒序）、`COMMENTS`（评论数倒序）、`LIKES`（点赞数倒序）、`HOT`（`hot_score` 倒序）。
- **R-COM-13** `hot_score` MUST 按下式计算，写入时更新，并由定时任务每 10 分钟批量重算最近 7 天的帖子：

  ```
  hot_score = (comment_count * 4 + like_count * 2 + view_count * 0.05)
              / POW(hours_since_created + 2, 1.5)
  ```

- **R-COM-14** 四种排序 MUST 各自有可走索引（见第 8 节 R-DATA-04）。MUST NOT 在 SQL 里实时计算热度后排序。

### 18.3 评论与楼中楼

- **R-COM-15** 评论 MUST 只有两层：**楼**（直接回复帖子）与**楼中楼**（回复某条评论）。MUST NOT 出现第三层。
- **R-COM-16** 回复对象 MUST 用三个字段表达：`reply_object_type`（`POST`/`COMMENT`）、`reply_object_comment_id`（被回复评论 id）、`reply_object_user_id`（被回复者 id）。
- **R-COM-17** `reply_object_type=POST` 时，该评论为**楼**：`root_id` 为 `NULL`，`reply_object_comment_id` 与 `reply_object_user_id` 均为 `NULL`。
- **R-COM-18** `reply_object_type=COMMENT` 时，该评论为**楼中楼**：`root_id` MUST 指向被回复评论**所属的那一楼**的 id（若被回复的就是楼本身，则 `root_id` = 该楼 id）。
- **R-COM-19** `root_id` MUST 由服务端派生并落库。客户端 MUST NOT 提交 `root_id`。
- **R-COM-20** 楼中楼渲染 MUST 只显示「{作者昵称} **回复了** {reply_object_user 昵称}」。MUST NOT 出现三级缩进或多级引用链。
- **R-COM-21** 评论列表 MUST 按**楼**分页；每楼 MUST 附带前 3 条楼中楼预览与该楼楼中楼总数；展开时按 `root_id` 单独分页拉取。
- **R-COM-22** `post.comment_count` MUST 含楼中楼；`last_comment_at` 仅用于列表展示，MUST NOT 作为排序键。
- **R-COM-23** 只有评论作者本人可删除自己的评论；删除为软删除，不删物理行。
- **R-COM-24** 评论正文 MUST ≤ 1000 字。

### 18.4 点赞

- **R-COM-25** 帖子与评论 MUST 都支持点赞，二者共用一张点赞表，用 `target_type` 区分。
- **R-COM-26** 点赞 MUST 为幂等的 `POST` / `DELETE` 两个接口。MUST NOT 做成单一 toggle 接口。
- **R-COM-27** 同一用户对同一对象 MUST NOT 重复点赞（主键约束保证）。
- **R-COM-28** 点赞 MUST NOT 影响任何评分、段位或排名。
- **R-COM-29** 列表页 MUST 返回每个对象对当前用户的 `liked` 状态，且 MUST 用一次批量 `IN` 查询完成，不得逐条查询。

### 18.5 浏览数

浏览数**允许误差**，MUST NOT 用于任何结算、排名或评分（见第 11 节禁止事项 14）。

- **R-COM-30** 去重口径 MUST 为**自然日**，以 `Asia/Shanghai` 为准：同一用户对同一帖子每天最多计 1 次。
- **R-COM-31** 去重与计数 MUST 使用**两个生命周期不同的 Redis 结构**：

  | 用途 | Key | 类型 | TTL | 内容 |
  |---|---|---|---|---|
  | 浏览去重 | `view:seen:{postId}:{yyyyMMdd}` | Set | **次日 02:00** | 当天看过此帖的 `userId` |
  | 待回写增量 | `view:pending` | Hash | 2 小时（兜底） | `field=postId`，`value=待加次数` |

- **R-COM-32** 去重集的过期 MUST 用 `EXPIREAT` 指定到**次日 02:00**。MUST NOT 简单设成固定 24 小时——固定 24h 是滚动窗口，会导致「隔天第一次浏览不计」。
- **R-COM-33** 计数侧 MUST 用 Hash（`field=postId`）。MUST NOT 再用一个 Set 存 `userId`：去重已在第一步完成，重复存只是把内存翻倍，且回写时必须 `SCAN` 遍历键空间。
- **R-COM-34** `SADD` 去重与 `HINCRBY` 计数 MUST 放在**同一个 Lua 脚本**里原子执行。MUST NOT 分两次调用（否则会出现「标记已看但没计数」，该用户当天再也不会被计数）。
- **R-COM-35** 回写 MUST 用 Lua 原子地「读取并清空」（`HGETALL` + `DEL`）。MUST NOT 先 `HGETALL` 再单独 `DEL`——两步之间进来的新增量会被一起吞掉。
- **R-COM-36** 回写执行在定时任务（每 5 分钟）中，顺序 MUST 为：原子取出 → 批量 `UPDATE post SET view_count = view_count + ?` → 若 UPDATE 失败则把取出的增量 `HINCRBY` 补回并告警。
- **R-COM-37** 浏览计数 MUST NOT 阻塞详情页渲染：Redis 调用 MUST 设 50ms 超时，超时或异常 MUST 直接返回 `204`。
- **R-COM-38** 因 Redis 重启导致的去重集丢失（多计）或 `view:pending` 丢失（少计）MUST 视为可接受，MUST NOT 为此引入持久化保证。

### 18.6 内容审核

- **R-COM-39** 发帖与评论 MUST 在落库前过敏感词校验；命中 MUST 用全角＊（U+FF0A）逐码点替换后落库，MUST NOT 保存原文（不新增 raw 字段），摘要 MUST 基于替换后的正文生成；命中 MUST NOT 拒绝发布，MUST NOT 返回 `CONTENT_BLOCKED`；审核 MUST 在服务端执行，MUST NOT 只靠前端过滤。
- **R-COM-40** 审核 MUST 在服务端完成。MUST NOT 只依赖前端过滤。

---

## 19. 举报与审核（治理）

> 本节为 v4.3 追加（2026-11-04 实现并验收）。第 18.6 节是**自动**打码，本节是**人工**治理，两套机制互不联动。
> 正文引用本节统一写「第 19 节」。

### 19.1 举报

- **R-GOV-01** 可举报对象 MUST 只有两种：`POST`（帖子）与 `COMMENT`（评论）。MUST NOT 提供「举报用户」。
- **R-GOV-02** 举报原因 MUST 为枚举：`SPAM`（垃圾广告）/ `ABUSE`（人身攻击）/ `ILLEGAL`（违法违规）/ `OTHER`（其他）；补充说明 MAY 填写，长度 MUST ≤ 500。
- **R-GOV-03** 举报 MUST 要求登录。MUST NOT 举报自己发布的内容（返回 `400`）。
- **R-GOV-04** 同一用户对同一目标 MUST 只能举报一次；重复举报 MUST 返回 `409 ALREADY_REPORTED`。唯一性 MUST 由数据库唯一索引 `(target_type, target_id, reporter_id)` 兜底，MUST NOT 只靠应用层先查后插。
- **R-GOV-05** 补充说明 MUST 在落库前过敏感词打码（同 R-COM-39 规则），MUST NOT 存原文。
- **R-GOV-06** 举报 MUST NOT 自动隐藏或自动删除内容。MUST NOT 因举报数量自动改变内容可见性。

### 19.2 管理员与处置

- **R-GOV-07** 管理员 MUST 为**独立账号体系**（`sy_admin` 表），与普通用户表无关；登录 MUST 走独立接口并签发带 `typ=ADMIN`、`role=ADMIN` 的令牌。
- **R-GOV-08** 管理员令牌与用户令牌 MUST 互不承认：管理端过滤器 MUST 拒绝用户令牌（`403 NOT_ADMIN`），社区过滤器 MUST 拒绝管理员令牌（`401 NOT_ADMIN`）。
- **R-GOV-09** 处置动作 MUST 为四种之一：`IGNORE`（驳回）/ `DELETE`（软删内容）/ `BAN`（社区禁言）/ `DELETE_AND_BAN`。
- **R-GOV-10** 处理一条举报时，该**目标下全部 `PENDING` 举报 MUST 一次性结案**，MUST NOT 只处理当前一条。
- **R-GOV-11** 社区禁言 MUST 为有期限（1 / 3 / 7 天），到期 MUST 自动解除；禁言期间 MUST 只能浏览，MUST NOT 发帖、评论、编辑帖子、点赞；MUST NOT 拦截删除自己的内容与取消点赞。
- **R-GOV-12** 全站封禁 MUST 复用 `sy_user.status`（`0` = 封禁），MUST 立即生效：登录 MUST 被拒（`401 ACCOUNT_DISABLED`），已登录者的下一次请求 MUST 被拒。
- **R-GOV-13** 两种处罚 MUST 互不干扰：解除封禁 MUST NOT 顺带解除禁言，反之亦然。
- **R-GOV-14** 举报队列 MUST 按被举报**目标**聚合（一行 = 一个目标），MUST 按举报人数降序；同一目标 ≥ 3 名不同举报人时 MUST 标记为「多人举报」；MUST NOT 因多人举报自动处置。

### 19.3 处理记录与恢复

- **R-GOV-15** 管理员每次处置 MUST 落一条处理记录（`sy_audit_log`），字段 MUST 含：举报 id、操作人、动作、处置结论、目标、人读说明、IP、时间。
- **R-GOV-16** 处理记录 MUST NOT 记录密码、令牌或任何凭据。
- **R-GOV-17** 写处理记录失败 MUST NOT 影响主流程：失败 MUST 只告警，MUST NOT 抛给调用方。
- **R-GOV-18** 一键恢复 MUST 只恢复被删除的**内容**（`status` 由 2 改回 1）；MUST NOT 顺带解除禁言。
- **R-GOV-19** 恢复后：原记录 MUST 标记为「已撤销」（`undo_at`），MUST 追加一条 `RESTORE` 记录留痕，关联举报状态 MUST 变为 `REOPENED`。
- **R-GOV-20** 恢复 MUST 幂等：已撤销的记录再次恢复 MUST 返回 `409 ALREADY_RESTORED`；无内容可恢复的处置（纯禁言、驳回）MUST 返回 `409 NOT_RESTORABLE` 且界面 MUST NOT 显示恢复入口。
- **R-GOV-21** 恢复 MUST 二次确认后才执行。

### 19.4 修改密码

- **R-GOV-22** 用户与管理端 MUST 各自提供修改密码接口；MUST 校验旧密码，新密码 MUST 8–64 位且同时含数字与字母，MUST NOT 与旧密码相同。
- **R-GOV-23** 改密成功后，该账号此前签发的**所有令牌 MUST 立即失效**（`401 TOKEN_STALE`）；实现 MUST 以「令牌签发时间早于密码变更时间」判定，MUST NOT 依赖逐个拉黑。
- **R-GOV-24** 前端在改密成功后 MUST 清除本地令牌并回到登录态，MUST NOT 让用户停在一个必然 401 的页面。
- **R-GOV-25** 鉴权判别 MUST 用**一次查询**同时取全站封禁状态与密码变更时间；MUST NOT 为此增加每请求的额外查询或缓存层（本期决策）。

---

## 20. 辩论侧的登录与对局归属

> 本节为 v4.4 追加（2026-11-04 实现并验收）。第 18 / 19 节管社区，本节管辩论侧的身份与访问控制。
> 正文引用本节统一写「第 20 节」。

### 20.1 门槛

- **R-DEB-01** 建对局、查对局、对局内所有操作、战绩、诊断、多人房间 MUST 要求登录；未登录 MUST 返回 `401`。
- **R-DEB-02** 辩题、辩题可辩性、论据卡、热榜、健康检查 MUST 保持匿名可访问；MUST NOT 因为「统一登录」把它们一并拦掉。
- **R-DEB-03** 匿名可访问 MUST 通过「不注册鉴权过滤器」实现，MUST NOT 用「注册了再逐个放行」——后者漏一个就是漏洞。

### 20.2 身份

- **R-DEB-04** 辩论侧接口 MUST NOT 接受客户端传入的 `userId` / `userName`；身份 MUST 一律取自令牌（`sub`）。请求里残留的这两个字段 MUST 被忽略，MUST NOT 报错、MUST NOT 采信。
- **R-DEB-05** 战绩与诊断 MUST 只按当前登录用户查询；`?userId=` 传别人的 id MUST 无效。

### 20.3 对局归属

- **R-DEB-06** 访问一场对局的判据 MUST 为下列任一成立：① 我是这条对局的 `user_id`；② 这条对局属于某个房间，且我在该房间的席位上。MUST NOT 只看 ①——房间局只有一条对局且记在房主名下，只看 ① 会把同房间其他玩家全部挡掉。
- **R-DEB-07** 归属校验 MUST 覆盖**所有** `/api/matches/{id}/**`：查看、复盘、抓漏列表、跳过、抢拍、提交回合、指点、续命、事件流。MUST NOT 只保护事件流。
- **R-DEB-08** 未登录 MUST 为 `401`；已登录但越权 MUST 为 `403`。两者 MUST NOT 混用。

### 20.4 事件流（SSE）

- **R-DEB-09** 事件流 MUST 与其它接口同等鉴权。实现 MUST 允许在**该端点**用查询参数 `?token=` 传令牌——浏览器 `EventSource` 无法设置请求头。
- **R-DEB-10** 查询参数令牌 MUST **只**对 `/events` 路径生效；其它任何接口 MUST 只认 `Authorization` 头（实测 `?token=` 对 `/records`、`/diag` 无效）。

### 20.5 房间

- **R-DEB-11** 席位展示 MUST 用账号昵称（`sy_user.name`），改名 MUST 即时生效。MUST NOT 再把「房主」「玩家」写成名字。
- **R-DEB-12** 「房主 / 玩家」MUST 作为**标签**与昵称并列展示，MUST NOT 当作名字参与任何业务判断。
- **R-DEB-13** 房主免准备 MUST 按**席位**判定（房主固定坐 `A1`）。MUST NOT 比较名字字面量——昵称一改就会失效。

### 20.6 历史数据

- **R-DEB-14** 账号接入之前产生的对局（`user_id` 为 `u1` 或随机 `gXXXXXX`）MUST NOT 被任何账号认领，MUST NOT 做数据迁移。这些对局对所有人都是 `403`。

## 21. 通知与 @提及

> 本节为 v4.5 追加（2026-11-05 实现并验收）。第 18 节是社区内容本身，本节是社区内的提醒机制。
> 正文引用本节统一写「第 21 节」。

### 21.1 类型与触发

- **R-NTF-01** 通知类型 MUST 为下列 11 种之一：`COMMENT_POST`（帖子被评论）/ `REPLY_COMMENT`（评论被回复）/ `LIKE_POST`（帖子被赞）/ `LIKE_COMMENT`（评论被赞）/ `MENTION`（被 @）/ `POST_DELETED`（帖子被管理员删）/ `COMMENT_DELETED`（评论被管理员删）/ `MUTED`（被社区禁言）/ `BANNED`（被全站封禁）/ `UNMUTED`（禁言解除）/ `UNBANNED`（封禁解除）。
- **R-NTF-02** **自己的操作 MUST NOT 产生通知**：评论自己的帖子、回复自己的评论、赞自己的内容、@ 自己，全部不发。
- **R-NTF-03** 作者自己删除自己的内容 MUST NOT 通知自己；**管理员**删除内容 MUST 通知作者，且文案 MUST 带处置理由。
- **R-NTF-04** 禁言 MUST 通知到期时间与理由；封禁 MUST 通知理由。解除禁言 / 解封 MUST 各发一条。
- **R-NTF-05** 写通知失败 MUST NOT 影响主流程：评论、点赞、删帖、处罚 MUST 照常成功，只记日志。

### 21.2 点赞聚合

- **R-NTF-06** 点赞通知 MUST 按「收件人 + 被赞对象」聚合为**一行**，唯一性 MUST 由唯一索引 `(user_id, agg_key)` 兜底；`agg_key` 形如 `LIKE_POST:123`。
- **R-NTF-07** 聚合人数 MUST 每次从点赞表现算（`count(*)`），MUST NOT 用 `+1/-1` 增量累加——反复点赞取消会对不上。
- **R-NTF-08** 文案 MUST 为：1 人时「X 赞了你的帖子《标题》」；≥2 人时「X 等 N 人赞了你的帖子《标题》」，其中 N MUST 含 X，X MUST 是**最近**一个点赞的人。
- **R-NTF-09** 已读的聚合行再次被点赞 MUST 重新变为未读并让未读数 +1；本来就未读的聚合行 MUST NOT 重复计数。新点赞 MUST 刷新该行时间使其排到最前。
- **R-NTF-10** 取消点赞 MUST 只重算人数：MUST NOT 改时间、MUST NOT 改已读状态、MUST NOT 动未读数；人数归零时 MUST 删除该行（不允许出现「等 0 人」）。

### 21.3 未读数

- **R-NTF-11** 未读数 MUST 存 Redis Hash `notify:unread`（field = userId）；MUST NOT 每次轮询都查库。
- **R-NTF-12** 未读数 MUST NOT 做「未命中就回源查库」的兜底（本期决策）：Redis 重启后计数从 0 重新起算，这是已接受的代价。
- **R-NTF-13** 拉列表 MUST **只把本页**未读行标为已读，并按**本页实际标记条数**递减未读数；递减到 ≤ 0 时 MUST 删除该 field。递减 MUST 用 Lua 原子执行（`HGET` 与 `HSET` 分两步在并发下会算错）。
- **R-NTF-14** 列表 MUST 返回**标记之前**的已读状态，前端据此给未读行加深底色。
- **R-NTF-15** 角标 MUST 遵守：未读 0 时不渲染；> 99 显示 `99+`。
- **R-NTF-16** 列表 MUST 只返回本人的通知；标记已读 MUST 以 `user_id` 过滤，MUST NOT 允许操作他人通知。
- **R-NTF-17** 通知 MUST 存内容快照（`excerpt` / `note`），内容被删除后仍能展示「你的帖子《X》已被删除」。

### 21.4 @ 提及

- **R-NTF-18** @ MUST 只认 **userId**（前端提交 `mentions: [id...]`），MUST NOT 由后端按昵称文本猜人——昵称不唯一，猜就会发错。
- **R-NTF-19** @ MUST 反向校验：① id 必须是真实账号；② 该账号昵称必须真的以 `@昵称` 形式出现在正文里；③ 不是作者自己。任一不满足 MUST **静默丢弃**，MUST NOT 报错、MUST NOT 阻断发布。
- **R-NTF-20** 一次 @ MUST ≤ 10 人，超出部分 MUST 丢弃；去重后处理。
- **R-NTF-21** 正文里的 `@昵称` MUST 渲染为浅蓝色（`#4C9AFF`），MUST NOT 做成链接（重名会跳错人）。
- **R-NTF-22** @ 候选接口 MUST 要求登录，MUST 只返回 `{id, name}`（MUST NOT 返回账号），最多 10 条，按昵称前缀匹配。

### 21.5 与封禁的关系

- **R-NTF-23** 被封禁用户的通知 MUST 照常写入，解封后可见；封禁期间社区接口对其一律 `401`。
- **R-NTF-24** 全站封禁 MUST 同样作用于 `/api/auth/**`：封禁后 `/me`、改名、退出 MUST 返回 `401 ACCOUNT_DISABLED`（与 R-GOV-12 一致，MUST NOT 只在社区过滤器里判）。
- **R-NTF-25** 查询参数类型不合法（如 `?page=abc`）MUST 返回 `400 INVALID_PARAM`，MUST NOT 落成 `500`。

---
