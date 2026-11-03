# 思弈阁 · 后端

AI 辩论训练系统的服务端。规格见 [../docs/SPEC.md](../docs/SPEC.md)。

## 跑起来

**最省事：双击 `run.bat`**（会自动清端口、缺 jar 就构建、起服务并打开浏览器）。

手动方式：

```bash
cd D:\siyige\server          # ← 必须在 server 目录，不是 D:\siyige
mvn spring-boot:run          # http://localhost:8080
mvn test                     # 赛制与席位判定单测
```

排障：`powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1`
（检查 JDK/Maven/目录/jar/端口/健康，五项一次看完）

## 常见错误（按出现频率排）

| 报错 | 原因 | 处理 |
|---|---|---|
| `Port 8080 was already in use` | 上一场服务没关，或有隐藏实例占着 8080 | `run.bat` 会自动 `taskkill`；手动：`netstat -ano \| findstr :8080` 找到 PID 再 `taskkill /f /pid` |
| `There is no POM in this directory` | 在 `D:\siyige` 执行了 mvn | `cd D:\siyige\server`，或直接双击 `run.bat` |
| 页面白屏 / 只有一行小字 | 用编辑器（IDE）的 HTML 预览打开，脚本被禁用 | 用浏览器打开：双击 html，或 `start msedge file:///...` |
| `Could not find or load main class` | jar 没构建成功，或路径含空格没加引号 | 重新 `mvn -DskipTests package`，确认 `target\siyige-backend-0.1.0.jar` 存在 |
| 首次构建卡很久 | Maven 要下 Spring Boot 全套依赖 | 正常，第一次 3–8 分钟；之后走本地仓库很快 |
| 日志里 `AsyncRequestTimeoutException` | SSE 长连接空闲超时 | 已有 20s 心跳，若仍出现可忽略（不影响对局） |

> 依赖：**H2 内存库**（默认，重启清空）+ **Redis**（社区的浏览计数与去重必需）。
> MySQL 本期未启用，迁移方案与阻塞清单见 [../docs/migration-mysql/README.md](../docs/migration-mysql/README.md)。

Redis 不再是可选项（2026-11-02 社区模块并入后）：

| 用途 | Key | 类型 | 生命周期 |
|---|---|---|---|
| 浏览去重 | `view:seen:{postId}:{yyyyMMdd}` | Set | `EXPIREAT` 到次日 02:00 |
| 待回写增量 | `view:pending` | Hash（field=postId） | 2 小时兜底 |

- `application.yml` 里 **已删除** `spring.autoconfigure.exclude: RedisAutoConfiguration`，去那行找东西会找不到，属正常。
- 连接参数走环境变量：`SIYIGE_REDIS_HOST` / `SIYIGE_REDIS_PORT` / `SIYIGE_REDIS_PASSWORD`（默认 `127.0.0.1:6379`，密码 `wdacg123456`）。
- 启动时做一次 PING 自检：失败只打 ERROR，**不阻塞启动**——此时浏览接口仍返回 204，但计数会静默丢失（符合 SPEC R-COM-37/R-COM-38）。
- 列表/详情的 `viewCount` = 数据库 `view_count` + `view:pending` 里尚未回写的增量（读时叠加），所以刚看完刷新就能看到 +1；Redis 不可用时退化为只显示数据库值。

本地起一个 Redis：

```bash
docker run -d --name wdacg-redis -p 6379:6379 redis:7-alpine --requirepass wdacg123456
```

热榜仍是内存实现（`HotRank.MemoryHotRank`），未使用 Redis ZSET。

## 时间压缩（演示用，必须知道）

```yaml
siyige.pace.time-scale: 0.05    # 180 秒的立论 → 9 秒；真实环境设 1.0
```

因为引擎靠 `deadline_at` 推进（规格 R-TECH-04），压缩系数只影响"等多久"，不影响赛制顺序。
生产环境 **必须改成 1.0**，否则用户 9 秒就被判超时。

## 目录

```
com.siyige
├─ domain/Format          12 步赛制常量（9 环节 + 自由辩 4 子回合）
├─ engine/TurnEngine      纯函数：当前席位、是否我发言、席位集合解析
├─ hot/HotRank            热辩榜（Redis ZSET 语义）+ 内存实现
├─ ai/AiService           AI 席位发言（模板；可切真实模型）
├─ service/
│  ├─ AuditService        辩题 AI 审核（三态 + 缓存 + 改写建议）
│  ├─ ScoreService        评分（规则 + 证据 + 改法）
│  └─ MatchService        开局 / 提交 / AI 回合 / 超时推进 / 结算
├─ repo/Store             全部 JDBC 访问
├─ repo/DataSeeder        12 道官方辩题
└─ api/                   接口 + SSE
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（含热榜 key 与成员数） |
| POST | `/api/auth/login` | 演示登录，返回 token |
| GET | `/api/topics?cat=&kw=` | 辩题列表（带实时热度） |
| GET | `/api/topics/{id}/evidence` | **论据库**：该题的可引用论据卡（含出处/年份/是否已核实） |
| POST | `/api/topics/audit` | **AI 审核辩题** `{title}` → `PASS/REJECT/NEED_EDIT` + 理由 + 改写建议 |
| POST | `/api/matches` | 开局 `{topicId \| title, seats[], mode}`；自填题会先审 |
| GET | `/api/matches/{id}` | 对局详情（当前步、是否轮到我、发言史） |
| POST | `/api/matches/{id}/turns` | 提交发言 `{content, inputType}` |
| GET | `/api/matches/{id}/events` | SSE 进度（`?since=seq` 补发） |
| GET | `/api/matches/{id}/review` | 复盘（分数 + 证据 + 改法） |
| GET | `/api/hot?n=10` | 热辩榜（Redis ZSET） |
| POST | `/api/hot/{topicId}/boost` | 手动加/减热度（调试用） |
| GET | `/api/records?userId=` | 辩论记录（无段位、无排名） |
| GET | `/api/diag?userId=` | 五维画像 + 连续天数 |
| GET | `/api/format?mode=FULL\|SPRINT` | 赛制步骤表 |

## 热辩榜（Redis ZSET）

```redis
ZINCRBY hot:debate:2026-11-01 1 topic:t3      # 开辩 +1
ZINCRBY hot:debate:2026-11-01 2 topic:t3      # 每次发言 +2
ZINCRBY hot:debate:2026-11-01 5 topic:t3      # 打完一整场 +5
ZREVRANGE hot:debate:2026-11-01 0 9 WITHSCORES
ZREVRANK  hot:debate:2026-11-01 topic:t3
ZINCRBY   hot:debate:2026-11-01 -0.5 topic:t3 # 每 10 分钟衰减
EXPIRE    hot:debate:2026-11-01 172800        # 保留 2 天
```

内存实现 `HotRank.MemoryHotRank` 与上面命令语义一致，key 为 `hot:debate:{当天}`。

## 已实现 / 未实现

| | 状态 |
|---|---|
| 12 步赛制引擎 + 席位集合判定（可多占） | ✅ |
| 玩家提交 / AI 回合 / 超时自动跳过 | ✅ |
| SSE 事件流 + `since` 补发 + 20s 心跳 | ✅ |
| 辩题 AI 审核（三态 + 缓存 + 建议） | ✅ 规则版；接模型只需替换 `AuditService.judge` |
| 可解释评分（证据 + 问题 + 改法） | ✅ 规则版；接 LLM 后规则分占 40% |
| 记录 + 五维画像 + 连续天数 | ✅ |
| 热辩榜 ZSET + 衰减 | ✅ 内存版；Redis 版接口已留 |
| **4v4 房间**（建房 / 凭码加入 / 准备 / 房主开局 / 空位补 AI） | ✅ REST + 轮询；WebSocket 广播待换通道 |
| 抓漏判定（点选题型） | ⬜ 下一阶段 |
| 语音 ASR 兜底接口 `/api/asr` | ⬜ 下一阶段 |
| **前端接真实接口**（浏览器打开 8080 就是全栈） | ✅ |
| **接真模型**（填 `siyige.llm.api-key` 即生效） | ✅ 未配 key 自动走模板 |

## 冒烟测试

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
```

跑完会打印：审核三态、开局、12 步推进（含我的 3 次发言）、复盘分数、热辩榜前 5、记录与画像。

## 房间接口（多人辩论）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/rooms` | 建房 `{topicId, visibility, userId, userName}` → `{code}` |
| GET | `/api/rooms` | 公开房间列表 |
| GET | `/api/rooms/{code}?userId=` | 房间详情（席位 / 准备 / 我坐哪 / isHost / canStart） |
| POST | `/api/rooms/{code}/join` | 加入 `{userId, userName}`，自动坐第一个空位 |
| POST | `/api/rooms/{code}/ready` | 准备 `{userId, ready}` |
| POST | `/api/rooms/{code}/start` | 房主开局；有人未准备返回 409 `NOT_READY` |
| POST | `/api/rooms/{code}/leave` | 退出 |

规则：房主免准备（R-READY-01）；开局空位自动补 AI（R-READY-07）；非房主开局返回 `NOT_HOST`；
错误统一走 `ApiErrors` → `{code, message}`。

## 接真模型

`application.yml` 填上 key 即可，不改一行代码：

```yaml
siyige:
  llm:
    base-url: https://api.deepseek.com/v1
    api-key: sk-xxxx        # 服务器上放在 /opt/siyige/siyige.env（600），不要写进 ExecStart
    model: deepseek-chat    # flash / v4-pro 实测返回空内容，别用
```

| 场景 | 入口 | 降级 |
|---|---|---|
| AI 席位发言 | `AiService.speak()`：带最近 4 条历史 + 辩位人设 + 环节约束 | 超时/报错 → 本地模板 |
| 辩题审核 | `AuditService.judge()`：要求 JSON 三态（PASS/REJECT/NEED_EDIT） | 解析失败 → 规则审核 |

两条都兜底：**模型挂了，对局和审核都不中断**（规格 R-TOPIC-08、计划书四级兜底）。


## 评分 v2（2026-11-01）

v1 是「字数 + 关键词计数」，写得长就高分。v2 改成**按论证结构**打分，长度只作门槛：

| 维度 | 权重 | 看什么 |
|---|---|---|
| 立论 | 25% | 有没有明确判断 + 判断标准 |
| 论证 | 30% | 因果链（因为/所以）、让步转折（虽然/但是）、前提到结论（如果/那么） |
| 表达 | 15% | 句子长度是否合理、口癖多不多（**太长不加分**，一口气 60 字以上扣分） |
| 应变 | 20% | 有没有点对方、有没有用问句施压、与对方发言有无实质重合 |
| 论据 | 10% | 引用论据库条数；编造数字倒扣 |
| 协同 | 加分 | 接住队友（复用 3 分 / 只接话 2 分） |

**瑕疵检出**（写进画像，不再写死）：未证明前提 / 以偏概全 / 诉诸权威 / 未回应对方 / 同义反复。

**画像**改为滑动平均：第 n+1 场 = (旧均值 × n + 本场) / (n+1)，同时返回 last（本场）、
delta（本场 vs 均值）、samples（样本场次）。场次少时曲线波动大，别急着下结论。

## 每步时长

`yaml
siyige.pace.turn-seconds: 300   # 默认 5 分钟；接口可传 turnSeconds 覆盖（180/300/480）
`

前端在选座面板里选「3 / 5 / 8 分钟」，会覆盖赛制默认的 180/120 秒。
到点没提交 → 自动过，记录里标「超时」，不判负。
## AI 节奏与打字效果（2026-11-02）

### 修掉的一个真 bug

原来 AI 的 deadline 和玩家共用 	urn_sec——把玩家时长设成 5 分钟后，
**AI 也要等 5 分钟才开口**。现在拆成两套：

| 角色 | 等待时长 | 配置 |
|---|---|---|
| 玩家 | 	urn_sec（默认 300s，可选 180/300/480） | siyige.pace.turn-seconds |
| AI | 700ms + 0–420ms 抖动 | siyige.pace.ai-think-ms |

实测（本机，压缩节奏 0.03）：**我提交后 2.3 秒 AI 就接上**（其中模型调用约 2 秒）。

### 打字机效果

前端收到 AI 发言后逐字吐出，标点处停顿更像人在边想边说：

`js
const pause = ch === '。' ? 150 : ch === '，' ? 70 : 15;   // 毫秒
`

实现要点：chatHTML() 对最后一条 AI 发言只输出空壳 + data-full，
nimateTyping() 逐字填充；已打完的写进 S.typed，重渲染不会重播。

### 推送通道

- SSE /api/matches/{id}/events：AI 一说完立刻推，不等轮询
- 轮询兜底：400ms 一次（SSE 断开也能用）
- 后端 tick：250ms 扫一次到期对局

### 还能更快（下一步）

现在是「整段生成 → 客户端逐字播放」。真正的流式（LLM stream:true → SSE 逐 token）
能把首字时间从 ~2s 压到 ~0.8s，代价是 LlmClient 要改成带回调的流式解析。
## 弹性节奏 v3（2026-11-02）

### 设计依据：玩家在打字，不是在说话

- 说话 4–5 字/秒，一段 250 字只要 1 分钟
- **打字 30–50 字/分钟，一段 250 字要 5–8 分钟**

所以按赛制分钟数（立论 3 分钟）给时间，必然写到一半被掐。改为按「环节字数预算 ÷ 打字速度 + 思考留白」定基准，再叠三层弹性。

### 三档 × 各环节（秒）

| 环节 | 紧凑 0.6× | 标准 1.0× | 宽松 1.4× |
|---|---|---|---|
| 立论 | 180 | 300 | 420 |
| 驳立论 | 126 | 210 | 294 |
| 质询 | 90 | 150 | 210 |
| 自由辩 | 54 | 90 | 126 |
| 总结 | 144 | 240 | 336 |

节奏由 pace 传参（tight/normal/loose），存在 sy_match.pace。

### 三层弹性

| 机制 | 行为 | 参数 |
|---|---|---|
| ① 提前结束 | 点「发送」立刻进下一步，不等倒计时 | —— |
| ② 打字续命 | 剩余 <120s 且正在输入时自动 +30s | 每步最多 3 次（共 +90s） |
| ③ 预警 | 剩余 30s 推 warn 事件，倒计时变红 | Pace.WARN_SEC |

超时只记 TIMEOUT，不判负，只影响表达分。

### AI 侧节奏（和玩家分开）

| 项 | 值 |
|---|---|
| 思考停顿 | 700ms + 0–420ms 抖动 |
| 打字速度 | 45ms/字 ≈ 22 字/秒，标点停顿 160–320ms |
| 一段 200 字 | 约 9–11 秒说完 |

### 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | /api/matches | 新增 pace 参数 |
| POST | /api/matches/{id}/keepalive | 打字续命，返回 {extended, addSec, used, max} |
| GET | /api/matches/{id} | 新增 emainingSec / extendUsed / pace |
| SSE | warn 事件 | 剩余 30 秒提醒一次 |
## 深度功能（2026-11-02）

### 1. 陪练强度（novice / pro / contest）

POST /api/matches 增加 difficulty，存在 sy_match.difficulty：

| 强度 | 提示词策略 | 埋雷概率 |
|---|---|---|
| 新手 novice | 语气友好，先接住再给台阶，不主动抓漏洞 | 0 |
| 进阶 pro | 正常对抗，遇到明显错误当场反驳 | 45% |
| 竞赛 contest | 严厉、节奏快、主动抓你的前提与定义 | 75% |

### 2. 抓漏判定（训练"听得出对方错在哪"）

AI 发言末尾按概率埋一处逻辑漏洞，玩家从五种类型里指出：

| 类型 | 埋雷句示例 |
|---|---|
| 以偏概全 | 我身边遇到的同学都这么想，可见所有人都反对 |
| 诉诸权威 | 很多专家都说过，早就不需要再讨论 |
| 未证前提 | 这一点显然是常识，我方不再赘述 |
| 偷换概念 | 对方说「可执行」，那就等于「必须立刻执行」 |
| 循环论证 | 这个方案合理，因为它确实很合理 |

- SSE 推 law 事件，前端弹出四选一
- POST /api/matches/{id}/point {step, type} 判定，抓对 +3（单场上限 +9）
- sy_flaw.hit 三态：NULL 未作答 / true 对 / false 错；**统计只算作答过的**

实测：抓漏统计：3/3（只算作答过的）· 总分 66

### 3. 逐回合点评

复盘返回 perTurn：[{step, seg, chars, verdict, note}]
判定三档：有交锋（点对方/提问）、脱靶（自说自话）、太短（<40 字）。
前端复盘页表格展示，定位到具体第几步。

### 接口新增

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/matches/{id}/point | 抓漏判定 |
| GET | /api/matches/{id}/flaws | 本场埋雷记录（含是否答对） |
| POST | /api/matches | 新增 difficulty 参数 |
## 多智能体 + 抢拍 + 作战卡（2026-11-02 第二批）

### 1. 八个席位八种推理路线（不是换名字）

| 席位 | 流派 | 推理方式 | 温度 | 思考 |
|---|---|---|---|---|
| A1 沈亦舟 | 框架派 | 自上而下：先立判准，再用判准筛对方 | 0.55 | 1.3s |
| A2 苏晚 | 快攻派 | 反驳优先：抓最脆弱一句连问三遍 | 0.85 | 0.9s |
| A3 梁未 | 例证派 | 自下而上：先场景后归纳 | 0.80 | 1.5s |
| A4 许晏清 | 归谬派 | 接受前提推到底 + 归档分歧 | 0.60 | 1.6s |
| B1 何书言 | 定义派 | 定义先行，抓偷换概念 | 0.50 | 1.4s |
| B2 路知远 | 反例派 | 找反例破普遍性 | 0.90 | 1.0s |
| B3 陆见微 | 归因派 | 拆因果链，问相关还是因果 | 0.65 | 1.2s |
| B4 周砚 | 价值派 | 价值重排，不纠缠细节 | 0.70 | 1.7s |

strategy 直接进提示词，	emperature 与 	hinkMs 各自独立——同一段对方发言，八个人给出八种回应结构。

### 2. 自由辩抢拍

自由辩不再按固定顺序轮转，改为**抢话**：

- 进入自由辩 → 开 6 秒抢拍窗口（phase=BUZZ）
- 玩家点「抢！」→ 拿到发言权，时长按节奏表（如宽松 126 秒）
- 窗口过半后 AI 才开始抢（避免一上来就被抢光）
- 抢到的人说完 → 开下一个窗口
- POST /api/matches/{id}/buzz

抢到后 AI 出场的席位是**同侧任意一个**（所以自由辩里可能看到 B1、A1 说话，而不是固定 A2/B2）。

### 3. 赛前作战卡 + 对局浮窗

GET /api/topics/{id}/brief?side=A|B → LLM 生成，按 题×立场 缓存（sy_brief）：

| 段 | 内容 |
|---|---|
| 定义 | 关键词的可操作定义（先把词定清楚） |
| 立论骨架 | 判准 + 论点一 + 论点二（照这个顺序说） |
| 对方怎么打 | 对方最可能说 X → 你该怎么接 Y |
| 回应句式 | 如果对方说……你可以回…… |
| 论据卡 | 可点一下插入发言框 |

对局页右下角「📋 材料」按钮常驻，随时可查，不打断对局。
未接模型时走模板兜底，结构不变。

### 4. 时长修正

	urn_sec 之前被当成"每步覆盖值"，导致立论选了 7 分钟后，自由辩也变成 7 分钟。
现在只有**显式传 	urnSeconds** 才覆盖，否则一律按 Pace 表（环节 × 节奏）。
实测：宽松节奏下自由辩 = 126 秒 ✓
## 节奏 v4（2026-11-02 按反馈重做）

| 模式 | 每步时限 | 说明 |
|---|---|---|
| 单人 solo | **不限时** | deadline_at 为空，一直等你说完，永不计超时 |
| 多人 room | **上限 10 分钟（600s）** | 按环季节奏取小值，绝不超 600 秒 |

依据 sy_match.kind（solo / room），房间开局自动写 room。

AI 回应间隔：**10–15 秒**（10_000 + random*5_000，再乘压缩系数）。

打字速度：整段约 15 秒打完；句号最多停 900ms，逗号 420ms，引号 ×1.5。

单人「催一下」：POST /api/matches/{id}/skip 跳过 AI 等待；多人返回 not-allowed。

### 本轮修掉的严重 bug

**AI 在同一环节重复发言 15 次**：dvance() 里 Long deadline = isBuzz ? 基本类型 : Long
发生拆箱，单人不限时返回 null 时抛 NPE → tick 250ms 重试一次 → 同一步插入多条。
修法：用 Long.valueOf(...) 包住基本类型分支。修复后 12 条发言、无重复。
## 手机端 + 串行打字（2026-11-02）

### 手机适配（≤860px）

- 侧边栏变成**底部导航条**（横向滚动），隐藏 logo 和用户信息
- 双栏/三栏全部塌成单列
- 聊天区高度 56vh，输入框 **sticky 固定在导航条上方**，发送键始终可见
- 席位条横向滚动，不换行
- 弹窗改成底部抽屉式（lign-items:flex-end）
- 单人模式倒计时显示「不限时」（绿色），不再是 00:00

截图：demo/shots-mobile/v1-lobby.png、4-chat.png

### 串行打字（修「上一个人没说完，下一个人就开口」）

原来打字循环会**同时推进所有气泡**，所以 A1 还在打，B1 已经开始出字。

现在：
- 循环每次只推进**最靠前的那一条**未打完气泡
- 排队中的气泡显示「…」，不会看起来是空的
- 打完一条才开始下一条

自测：111 次采样里，只有 1 次出现两条同时增长（那是上一条刚结束、下一条开始的交界），其余都是单条推进。

### 打字节奏

按字数反算，整段约 11 秒；句号最多停 800ms，逗号 380ms。
## 串行修复 v2 + 开场不等（2026-11-02 晚）

### 1. 排队消息不再提前出现

即使打字是串行的，新一条消息的**气泡**仍会立刻出现在屏幕上（内容是「…」），
看起来还是"下一个人抢先开口"。

现在 chatHTML() 只渲染到**第一条没打完的 AI 发言**为止，后面的先不生成 DOM：

`js
const list = S.turns.filter((t, idx) =>
  S.mySeats.includes(t.seat) || t.status === 'TIMEOUT' || firstUntyped === -1 || idx <= firstUntyped);
`

自测（720 次采样）：同时"打到一半"的气泡峰值 = **1**，出现 ≥2 条的采样 = **0**。

### 2. 开场第一句不用等

只有"回应"才等 10–15 秒；**开局第一句 AI 直接说**：

`java
private long openingDelay() { return Math.max(300, (long)(1200 * aiDelayScale)); }
`

实测本机 2.7 秒、线上 2.6 秒（1.2 秒延迟 + 模型生成）。

### 3. 节奏总表

| 场景 | 等待 |
|---|---|
| 开局第一句（AI 立论） | **1.2 秒** |
| 你发言后 AI 回应 | **10–15 秒** |
| AI 抢拍后接话 | 1.2 秒窗口 |
| 单人模式等你发言 | **不限时** |