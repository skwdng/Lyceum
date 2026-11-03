# MySQL 迁移备忘（本期不做，2026-11-02 记录）

> **结论：本期社区任务不切数据库，B 仓继续用 H2 内存库。**
> 原因：切换数据源是**全仓**改动，会波及辩论主链路，超出社区任务的边界；
> 且必须先解决下面 3 个前置问题才能安全切换。

## 1. 为什么单独排期

| 事实 | 影响 |
|---|---|
| B 仓只有一个数据源（`application.yml`），改它 = 辩论/房间/对局/评分全部换库 | 社区只是受影响模块之一，不是"社区改动" |
| 用户指令禁止改 `/api/topics`、`/api/matches`、评分/排名相关代码 | 迁移必须改辩论侧代码，与禁令冲突 |
| 现有 MySQL 库 `siyige` 是**两套系统共用**的老库（同时装着参考仓 A 的 `post`/`post_comment`/`community_like` 和 B 的 `sy_*`） | 迁移要做数据归属梳理，不是单纯建表 |

## 2. 已经准备好的东西（本次实测有效，切库时可直接用）

| 文件 | 内容 |
|---|---|
| `schema-mysql.sql` | B 仓 13 张 `sy_` 表的 MySQL 8 版（含 2026-11-01/02 全部增量列与 3 张后加的表） |
| `patch-mysql-2026-11-02.sql` | 给"旧快照库"补差额的一次性补丁（补 8 列 + 3 表 + 2 索引），纯加法不删数据 |

实测结果：在 `127.0.0.1:3307/siyige`（容器 `wdacg-mysql`，root/wdacg123456）上跑通，
启动成功、`/api/topics` `/api/hot` `/api/diag` `/api/records` `/api/rooms` 全部 200，
`sy_topic` 12 条、`sy_evidence` 48 条均来自 MySQL。

## 3. 切库前必须解决的 3 个阻塞项

### 阻塞 1（必修）：`MatchService` 两行 Timestamp 强转

```java
// server/src/main/java/com/siyige/service/MatchService.java:140
Instant deadline = ((java.sql.Timestamp) dl).toInstant();
// server/src/main/java/com/siyige/service/MatchService.java:407
long left = dl == null ? 0 : java.time.Duration.between(Instant.now(), ((java.sql.Timestamp) dl).toInstant()).getSeconds();
```

- H2 驱动：`getObject()` 对时间列返回 `java.sql.Timestamp` → 正常
- MySQL Connector/J 8.0.23+：同一调用返回 `java.time.LocalDateTime` → `ClassCastException`
- 实测现象：对局 tick 每 265ms 抛一次 `tick <id> failed: ClassCastException`，**对局无法推进**
- 修法：两处强转改为兼容分派（`instanceof Timestamp / LocalDateTime / OffsetDateTime`）

### 阻塞 2（必修）：`Store.java:177` 的 H2 专有 `merge into`

```java
jdbc.update("merge into sy_brief(topic_id, side, content) key(topic_id, side) values(?,?,?)", ...);
```

MySQL 无 `MERGE ... KEY`，需改成 `insert ... on duplicate key update`（作战卡功能）。

### 阻塞 3（需评估）：其余时间类型假设未穷尽

全仓共 3 处 `java.sql.Timestamp` 引用（`Store.java` import、`MatchService:140/407`）。
需在 MySQL 下跑完 T10 三个自检脚本才能确认无遗漏。

## 4. 切库时的操作清单

1. `pom.xml` 加 `com.mysql:mysql-connector-j`（runtime）
2. `application.yml` datasource 改 `jdbc:mysql://127.0.0.1:3307/siyige?...`
3. `schema-locations` 改 `classpath:schema-mysql.sql,classpath:schema-community.sql`
   （两个文件都搬进 `src/main/resources/`，社区 DDL 换成 MySQL 方言版）
4. 旧库先跑一次 `patch-mysql-2026-11-02.sql`
5. 解决阻塞 1 / 2
6. 重跑 `selftest_serial.mjs` / `selftest_mobile2.mjs` / `selftest_ui.mjs` 确认辩论主链路

## 5. 环境事实（本机）

| 服务 | 容器 | 地址 | 凭据 |
|---|---|---|---|
| MySQL | `wdacg-mysql` (mysql:8.0) | `127.0.0.1:3307` | `root` / `wdacg123456`，库 `siyige` |
| Redis | `wdacg-redis` (redis:7-alpine) | `127.0.0.1:6379` | `requirepass wdacg123456` |
