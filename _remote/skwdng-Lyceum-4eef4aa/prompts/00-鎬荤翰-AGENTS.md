# 思弈阁 · AI 辩论训练系统 —— 项目总纲（AI 编码约束文件）

> 用法：把本文件放到项目根目录，命名为 `AGENTS.md`（Codex / 通义灵码）
> 或 `CLAUDE.md`（Claude Code）或 `.cursor/rules/project.md`（Cursor）。
> 每次开启新会话时，要求 AI 先读本文件，再执行具体阶段任务。

---

## 0. 项目一句话

一个 AI 辩论训练平台：用户选辩题 → 与 AI 辩手多轮对辩 → 每轮获得五维结构化评分 → 结束后生成复盘报告与能力画像。
**核心体验是"边生成边显示"的流式对辩**，产品定位是降低辩论训练门槛。

## 1. 技术栈（锁死，不得替换）

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| JDK | OpenJDK | **21 LTS**（如遇虚拟线程 pinning 问题可升 25） | 必须开启虚拟线程 |
| 后端框架 | Spring Boot | **3.5.x** | 不要用 4.x |
| AI 框架 | Spring AI | **1.1.8** | 不要用 2.x（2.x 只支持 Boot 4） |
| 模型 | DeepSeek | `deepseek-chat` | 通过 `spring-ai-starter-model-deepseek` |
| ORM | MyBatis-Plus | 3.5.9 | Boot 3 专用 starter |
| 数据库 | MySQL | 8.0 | utf8mb4 |
| 缓存 | Redis 7 + Caffeine | — | Caffeine 做 L1，Redis 做 L2 |
| 实时通道 | **SSE（Spring AI `Flux` 产出）** | — | 不要用 SseEmitter |
| 前端 | Vue 3 + Vite + **Arco Design Vue** | — | 原型见 `siyige-prototype.html` |
| 构建 | Maven | 3.9+ | 单模块起步，不要拆微服务 |
| 部署 | Docker Compose | — | MySQL + Redis + app + nginx |

### 依赖红线

- 必须引 `spring-boot-starter-webflux`，**即使这是 Servlet 应用**——Spring AI 的流式只走 Reactive 栈，漏了直接抛异常。
- 不要引入：Kafka、Elasticsearch、Redisson、Spring Cloud、Nacos、ShardingSphere、任何未在总纲列出的中间件。
- 不要用 Lombok 的 `@Data` 打在有业务逻辑的实体上；DTO/VO 用 `record`。
- 时间类型统一 `java.time`，禁止 `java.util.Date`。

## 2. 目录结构（严格遵守）

```
siyige/
├── pom.xml
├── docker-compose.yml
├── init.sql                       # 建库建表 + 12 道辩题初始化数据
├── nginx.conf                     # SSE 必须关缓冲
├── prototype/                     # 现有高保真原型（设计参考，不参与构建）
│   └── siyige-prototype.html
├── docs/                          # 接口文档、压测报告
└── src/main/java/com/siyige/
    ├── SiyigeApplication.java
    ├── common/
    │   ├── result/               # R<T> 统一响应、PageResult
    │   ├── exception/            # BizException、全局异常处理器
    │   ├── constant/             # 常量、Redis key 前缀
    │   └── util/                 # JwtUtil、SnowflakeIdUtil
    ├── config/                   # AiConfig、RedisConfig、WebConfig、AsyncConfig
    ├── interceptor/              # JwtInterceptor
    ├── pojo/
    │   ├── entity/               # 与表一一对应
    │   ├── dto/                  # 入参，带 @Valid 注解
    │   └── vo/                   # 出参
    ├── mapper/                   # MyBatis-Plus Mapper
    ├── service/                  # 接口 + impl
    ├── controller/               # 只做参数校验与响应封装，禁止写业务
    ├── ai/                       # 所有大模型相关代码集中在此
    │   ├── DebateAiService.java      # 辩手
    │   ├── JudgeAiService.java       # 评委
    │   ├── prompt/                   # 提示词模板（独立文件，便于迭代）
    │   └── model/                    # 结构化输出的 record
    └── ws/                       # WebSocket（真人对战用，后期）
```

**铁律**：所有 `chatClient` 调用只出现在 `ai/` 包内，`controller` 和 `service` 不得直接调用模型。这条是为了让"换模型"只改一个包。

## 3. 编码规范

1. **命名**：类 PascalCase，方法 camelCase，常量 UPPER_SNAKE；数据库表 `t_` 前缀，字段 snake_case。
2. **接口路径**：`/api/{模块}/{动作}`，REST 风格；SSE 接口用 `/api/debate/{sessionId}/speak`。
3. **统一响应**：`R<T>{ code, msg, data, traceId }`；业务异常抛 `BizException(code, msg)`，由 `GlobalExceptionHandler` 兜底。
4. **异常**：禁止 `catch (Exception e) {}` 空吞；必须 log + 转换为业务语义。
5. **日志**：`log.info("对辩轮次完成 sessionId={} round={} ttft={}ms", ...)`，用占位符，禁止字符串拼接。
6. **注释**：只在"为什么这么做"处写注释，不写"这是什么"的废话注释。
7. **SQL**：禁止 `SELECT *`；列表查询必须分页；敏感字段（密码）不得出现在 VO。
8. **每个 public 方法都要有明确的失败路径**（超时、空值、越权三类至少覆盖）。

## 4. AI 编码工作流（每次任务必须遵守）

执行任何任务时，按以下顺序进行，**不得跳步**：

1. **先读总纲**：确认技术栈与目录规范。
2. **先出计划**：用编号列表写出你打算做什么、涉及哪些文件（新建/修改）、为什么。等我确认或我明确说"继续"后，再写代码。
3. **小步提交**：一次只完成一个可验证的目标，不要顺手重构无关代码。
4. **写完后自检**，输出三块内容：
   - **改动清单**：文件路径 + 一句话说明
   - **自检结果**：编译是否通过 / 启动是否成功 / 接口是否验证
   - **遗留问题**：你做了什么假设、哪里需要我确认

## 5. 禁止事项（违反即重做）

- ❌ 禁止编造 Spring AI / Spring Boot 的 API。**不确定的 API，先说明"我不确定"，然后用最保守的写法并标注 TODO。**
- ❌ 禁止在没跑通编译的情况下声称"已完成"。
- ❌ 禁止引入总纲以外的依赖。需要新依赖必须先说明理由。
- ❌ 禁止把 mock 数据、`System.out.println`、测试用 `@CrossOrigin("*")` 留在生产代码里。
- ❌ 禁止一次性重写多个已有文件。改动超过 3 个文件时先停下来确认。
- ❌ 禁止把 API Key 硬编码，一律走环境变量，并提供 `.env.example`。
- ❌ 禁止用 `SseEmitter` 实现对辩流式（必须用 `Flux`）。
- ❌ 禁止给会话上下文做"全量历史塞进 prompt"，必须走窗口 + 摘要。

## 6. 关键业务规则（写代码前必须理解）

### 6.1 辩手与评委必须分离

- 辩手（`DebateAiService`）：加载"对抗性人格 + 辩论规则"系统提示词，带 Redis ChatMemory，多轮连续。
- 评委（`JudgeAiService`）：加载"中立评判标准"，**不共享 ChatMemory**，只接收单轮文本，输出强类型 `RoundScore`。
- 两者用不同的 `ChatClient` Bean（`debateChatClient` / `judgeChatClient`），名字必须区分。

理由：同一模型同时"当运动员当裁判"会导致评分被辩论立场污染。

### 6.2 五维评分模型

```java
public record RoundScore(
    int logic,        // 逻辑 0-100
    int evidence,     // 论证 0-100
    int rebuttal,     // 应变 0-100
    int expression,   // 表达 0-100
    int decorum,      // 礼仪 0-100
    List<String> flaws,     // 被指出的逻辑漏洞，如"未证明前提""以偏概全"
    String rebuttalHint,    // 一句话反打建议
    String summary          // 一句话点评
) {}
```

### 6.3 一轮对辩的时序

```
用户发言 → 落库(USER消息) → 【并行】①辩手流式生成 ②评委打分
                              ↓                    ↓
                       SSE 逐 token 推给前端    落库(AI_SCORE)
                              ↓
                       前端气泡流式渲染 + 评分卡淡入
```

**打分必须和生成并行**，不允许串行等生成完再打分。

## 7. 性能硬约束（架构级，不可妥协）

| 约束 | 实现方式 | 验收指标 |
|---|---|---|
| 长连接承载力 | `spring.threads.virtual.enabled=true` | 单实例 500 路并发 SSE 不报错 |
| 首字延迟 | `Flux` 直推 + 上游连接池预热 | TTFT < 1.5s（P95） |
| 模型配额保护 | `Semaphore` 闸门（可配）+ token 预算令牌桶 | 超限返回排队提示，不雪崩 |
| 上下文成本 | 最近 3 轮原文 + 更早摘要 | 8 轮对辩 token < 12000 |
| 缓存 | 只缓存辩题元数据与素材，**不缓存辩词** | 辩题列表命中率 > 90% |

## 8. 交付标准（每个阶段结束都要满足）

- `mvn -q clean package -DskipTests` 通过
- 应用能启动，`/actuator/health` 返回 `UP`
- 该阶段的接口能用 `curl` 或 `.http` 文件复现
- 有对应的 `docs/` 说明（一句话即可）
