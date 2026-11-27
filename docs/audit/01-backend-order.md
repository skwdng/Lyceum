# 01 · 后端审计：发言顺序 / 状态机 / 「催一下」语义

> 审计对象：`server/src/main/java/com/siyige/service/MatchService.java`（tick/advance/submit/skip/buzz/keepalive/point）、
> `engine/TurnEngine.java`、`domain/Format.java`、`domain/Pace.java`、`service/FlawService.java`、`api/ApiController.java` 的 `/matches/**`。
> 审计方式：读代码 + 真 H2 台架复现（**不改主代码**）。
> 结论：**发言顺序本身是对的**（质询成对、结辩反方先），坏的是「每一步只能发生一次」这条不变量——它既没在写库层保证，也没在状态机层保证。

## 0. 复现方式

```powershell
# 台架在 server/src/test/java/com/siyige/audit/（AuditSupport + 3 个 Audit*Test）
# 默认全绿：@Disabled 的用例断言的是「期望语义」，现在被跳过
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\locked-build.ps1 test -Dtest=AuditOrderTest,AuditNudgeTest,AuditConcurrencyTest
# → Tests run: 19, Failures: 0, Errors: 0, Skipped: 14

# 解除 @Disabled 跑一遍，就是缺陷证据（14 条全红）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\locked-build.ps1 test `
  -Dtest=AuditOrderTest,AuditNudgeTest,AuditConcurrencyTest -Djunit.jupiter.conditions.deactivate=*
# → 实测 2026-11-27：Tests run: 19, Failures: 14, Errors: 0, Skipped: 0
```

`@Disabled` 的用例都标了「待修复后启用：…」，修完去掉注解即成为回归测试。

## 1. 必答①：发言顺序对不对

- **步骤序列**（`Format.stepsOf`，`Format.java:72-104`）：立论 A1 → 立论 B1 → 驳立论 A2 → 驳立论 B2 → 质询 → 自由辩 → 总结 B4 → 总结 A4。
- **质询问答 seat 一致** ✅：`QUERY_PAIRS = {{A3,B3},{B3,A3}}`（`Format.java:37-40`），每轮固定「问方 → 答方」两步、正反交替，`duty` 分别是 `质询·问 / 质询·答`（`:83-84`）。已在 `AuditOrderTest.质询问答即成对_已正确` 锁定。
- **结辩顺序** ✅：反方四辩（B4）先、正方四辩（A4）后收尾（`:94-95`）。已锁定。
- **自由辩轮转** ⚠️：`FREE_SEATS = {A2,B2,A3,B3}`（`:34`）按 `i % 4` 取（`:91`）——
  ① 轮数为奇数（3 或 5）时**正方永远多一轮**（3 轮 → A2,B2,A3）；② 四辩（A4/B4）全场只在结辩说一句。
- **"18 步"只在 `freeRounds=4` 时成立**：4 + 8(质询) + f + 2，f∈[3,6] → 实际 **17–20 步**；而质询轮数被 `QUERY_MIN=QUERY_MAX=2`（`Format.java:22`）夹死，注释与规格里的「2–4 轮」早就不成立。

## 2. 必答②：并发与幂等

核心缺陷：**没有「这一步已经发生过」的强约束**。写库层 `sy_turn` 没有 `(match_id, step)` 唯一键，状态机层 `updateStep` 是 `update ... where id=?`（不带 `and step=?` 的 CAS，`Store.java:128-139`），`submit()` 也不查 `hasTurn`。

因此三类现象全部可复现：

| # | 现象 | 触发 | 位置 | 预期 vs 实际 | 级别 | 建议 | 复现 |
|---|---|---|---|---|---|---|---|
| 1 | 同一轮写出两条发言，advance 被跑两次 | 双击发送 / 网络重试 / 两个请求读到同一份 `step` 快照 | `MatchService.java:209`（insert 前无 `hasTurn`）+ `:489`（updateStep 无 CAS） | 每步只能一条；实际 2 条 | **P0** | `submit` 先 `if (store.hasTurn(id, step+1)) return 幂等返回`，并把 `updateStep` 改成 `where id=? and step=?`，受影响行数为 0 就放弃推进 | `AuditConcurrencyTest.同一步双发会写出两条发言` |
| 2 | 超时推进与玩家已提交的同一轮重复（玩家发言 + TIMEOUT 两条） | deadline 到期的 250ms 内玩家刚好提交 | `MatchService.java:335`（超时分支直接 insert，无 `hasTurn`；AI 分支 `:382` 反而有） | 一条；实际两条 → 复盘/计分"说了两次" | **P0** | 超时分支同样先查 `hasTurn` | `AuditConcurrencyTest.超时推进与已提交发言重复` |
| 3 | 全真人一侧的自由辩窗口过期后**永久卡住** | 抢拍窗口到期且 `cur.seat()` 在 `my_seats` 里、同侧无 AI 顶位 | `MatchService.java:326`（`if (aiSeat == null) return;`）+ `:551-561`（`pickAiSeat` 找不到返回 null） | 应推进（记为超时/换人）；实际 tick 每 250ms 空转，直到 15 分钟 `reapAbandoned` 判 ABANDONED | **P0** | `aiSeat == null` 时按"无人抢答"落一条 TIMEOUT 并 `advance` | `AuditConcurrencyTest.自由辩全真人时超时卡死` |
| 4 | 房间局抢拍后**本人提交必被拒** | 房间局自由辩，非"集合第一个席位"的玩家点抢 | `MatchService.java:510`（`mine.iterator().next()`，且 `buzz()` 没有 userId 入参 `:505`） | 应把发言权给抢拍者；实际给了 `my_seats` 里第一个元素，`submit` 的 `mySeat.equals(speaker)` 立刻 `NOT_YOUR_TURN` | **P0** | `buzz(String matchId, String userId)`，用 `seatOfUser` 定席；抢到的席位必须写回 `buzz_seat` 并与 `submit` 用同一口径 | `AuditConcurrencyTest.抢拍席位与轮转席位脱钩`（实测 `seat=A1`，本步轮转是 B2） |
| 5 | 已 `ABANDONED` 的对局仍能写发言并继续推进 | 僵尸回收后客户端还在重发 | `MatchService.java:185-217`（`submit` 只判 `cur == null`，不判 `status`） | 直接拒绝；实际 insert + emit `step` | **P1** | `submit/keepalive/buzz/skip` 统一加 `status != RUNNING → 拒绝` | `AuditConcurrencyTest.废弃对局仍接受发言` |
| 6 | 结算/画像可能做两遍 | 两条推进路径（提交 & tick 超时）同时到末尾 | `MatchService.java:749-808`（`finish` 无 `if status != RUNNING return`，`finishMatch` 直接覆盖 `:755`） | 只结算一次；实际双 `settleBilling` + `sy_diag.samples/streak` +2 + `sy_record` 两条 | **P1** | `finish` 开头 `if (!"RUNNING".equals(status)) return;`，或 `update ... where id=? and status='RUNNING'` 用受影响行数当闸门 | 单实例安全（`AuditConcurrencyTest.单实例结算幂等_已正确` 已锁）；双路径并发是读代码结论 |
| 7 | `generating` / `attempts` 是进程内状态，多实例即失效 | 部署 >1 实例，或同实例重试 | `MatchService.java:236`（`Set` 在内存）、`:239`、`:249-255`（tick 无分布式锁）、`:357` | 同一 `(match, step)` 全局只生成一次；实际每实例各生成一次 → 重复发言 + `seq` 冲突 | **P1** | 用 DB 行锁/`sy_turn` 唯一键兜底，tick 加 `scheduled_lock`（ShedLock 或 `select for update`） | 读代码（注入 mock AI 时无法稳定复现跨进程） |
| 8 | 僵尸回收与正常结算双结算 | 对局最后一步刚结算，同一次 tick 里的 `reapAbandoned` 用旧快照 | `MatchService.java:266-293`（`settleBilling` 无幂等键）、`:281`（anchor 取 `max(deadline_at, started_at)`） | 一次；实际可能两次扣/退 | **P1** | `settleBilling` 以 `sy_wallet_tx(match_id, kind=SETTLE)` 去重 | 读代码 |
| 9 | `attempts` 永不清理 | 对局结束/成功推进 | `MatchService.java:239`、`:357-365` | 应随对局释放；实际 `Map` 只增不减（长跑内存泄漏） | P2 | `finish`/`remove` 时清 `id#*` 键，或换成有 TTL 的缓存 | 读代码 |

## 3. 必答③：时间口径

| # | 现象 | 触发 | 位置 | 预期 vs 实际 | 级别 | 建议 | 复现 |
|---|---|---|---|---|---|---|---|
| 10 | 同一环节三套秒数 | 任一环节 | `Format.java:27-30,83-95`（`Step.sec` 180/120/60/45/25）、`Pace.java:19-25`（300/210/150/90/240）、`MatchService.java:494`（非我回合写死 `2`）、`:167`（`match.start` 推 `steps[0].sec()`） | 一处权威；实际：`advance` 用 Pace、开场事件推 Format、AI 回合倒计时写死 2 秒 | **P1** | 删掉 `Step.sec`，或在 `stepsOf` 里就用 `Pace.secondsFor` 填；事件里统一发真实剩余秒 | `AuditOrderTest.时间口径三处不一致`（实测 180 vs 300） |
| 11 | 开局传入的 `turnSeconds` **只在第 1 步生效** | 用户自定义每轮时长 | `MatchService.java:128`（create 用它算首步）+ `:481`（advance 恒传 `overrideSec=0`）+ `:880-884` | 每步都用 90s；实际第 2 步起被 `Pace.secondsFor(立论)=300s` 覆盖 | **P1** | `advance` 传入 `num(m.get("turn_sec"))`，`stepSeconds` 里区分「用户显式指定」与「默认 300」 | `AuditOrderTest.自定义每轮时长只对第一步生效`（实测剩 299s） |
| 12 | 单人 unlimited 语义正确，但 `detail.turnSec` 会回落成 300 | 单人局 | `MatchService.java:829`（`turn_sec=0` → `defaultTurnSeconds`）、`:833`（`unlimited=true`） | 前端同时看到 `turnSec:300` 与 `unlimited:true` | P2 | `unlimited` 时 `turnSec` 返回 0/null | 读代码 |
| 13 | 压缩时基下"30 秒预警"每步必触发 | `siyige.pace.time-scale=0.05`（演示环境） | `MatchService.java:303`（`WARN_SEC=30` vs `deadlineFor` 最小 3000ms `:876`） | 只在临近结束发一次；实际每步开局就 `warn` | P2 | 预警阈值改成 `min(WARN_SEC, deadlineFor 的 40%)` | 读代码 |
| 14 | `num()` 读 bigint 会截断 | 任何 bigint 列 | `MatchService.java:886`（`((Number)o).intValue()`） | 应无损；实际 int 溢出 | **P1** | 见 §5 根因 C | 见 #15 |
| 15 | 「催一下」3 秒冷却失真（要么恒失效要么恒生效） | 任意两次 skip | `MatchService.java:592`（`long lastAt = num(m.get("last_skip_at"))`，列是 bigint `schema.sql`） | 冷却应挡住 3 秒内的第二次；实测 `{ok:true}` 直接放行 → 可以按 250ms 节奏连催 | **P1** | 用 `numLong()`（同文件 `:895` 已存在，就是为这种列写的） | `AuditNudgeTest.冷却被int截断失效`、`可以连续催下一步骤` |
| 16 | `bill_tokens` / `token_base` 同样被截断 | 复盘看用量、结算兜底 | `MatchService.java:855`（`num(m.get("bill_tokens"))`）、`:717`（`num(m.get("token_base"))`） | 精确 token 数；实际可能为负/错值 | P2 | 同 #15 | 读代码 |

## 4. 必答④：「催一下」（`POST /matches/{id}/skip`，代码里没有 `nudge` 这个路由）

| # | 现象 | 触发 | 位置 | 预期 vs 实际 | 级别 | 建议 | 复现 |
|---|---|---|---|---|---|---|---|
| 17 | **谁能催**：只放行 `kind=solo`；房间局 AI 回合完全没法催 | 房间局 | `MatchService.java:575-576` | 房间局 AI 回合也能催（那是等得最久的场景）；实际直接 `多人对局不能跳过` | P2 | 放开到"当前是 AI 回合"即可，不必区分 solo/room | `AuditNudgeTest.房间局无法催` |
| 18 | **幂等**：`skipped_step`（int）同轮只认一次 ✅ | 连点 | `MatchService.java:588-589` | 已正确 | — | 保持 | `AuditNudgeTest.同轮只认一次_已正确` |
| 19 | **冷却**：`SKIP_COOLDOWN_MS=3000` 但被判据截断 → 形同虚设 | 见 #15 | `:564`、`:591-597` | 3 秒内不许再催 | **P1** | 同 #15 | `AuditNudgeTest.冷却被int截断失效` |
| 20 | 想催的时候 AI 可能正在生成：skip 仍返回 `ok:true`（假成功） | AI 生成 3.5–6s 期间连点催 | `MatchService.java:600-603` | 应告知"正在生成"；实际只把 deadline 改成 `now-1`，由 tick 兜，前端以为生效 | P2 | 返回里带 `generating` 状态，或 `if (generating.contains(id)) return {ok:false, reason:"generating"}` | `AuditNudgeTest.生成中的假成功` |
| 21 | 与 4 路生成线程的关系：**零交互** | — | `:228-233`（池）、`:236`（`generating`）、`:353`（add） | 催只改 deadline + emit `skip` 事件，不取消/不等待在飞的生成 | P2 | 文档化；或在 skip 里把该 `(match, step)` 标成"优先" | 读代码 |
| 22 | 催之后 AI 生成连续失败会把对局**判 ABANDONED** | 模型超时/异常 | `MatchService.java:357-365`（3 次后 `finishMatch ABANDONED`） | 用户主动"催"反而加速被判弃；应退回模板句并推进 | **P1** | 第 3 次失败改用 `AiService` 的模板降级（已有 `degraded` 通道），别判 ABANDONED | 读代码（异步线程，注入 mock 时不可稳定复现） |

## 5. 其它接口层问题（`/matches/**` 参数口径）

| # | 现象 | 触发 | 位置 | 预期 vs 实际 | 级别 | 建议 | 复现 |
|---|---|---|---|---|---|---|---|
| 23 | JSON `null` 被 `String.valueOf` 变成字符串 `"null"` | 客户端发 `kind:null` / `pace:null` / `content:null` | `ApiController.java:146,148,206`（`String.valueOf(body.getOrDefault(...))`） | 落回默认值 `solo/normal/""`；实际得到字面量 `"null"` → `kind="null"` 让单人局变成"非 solo"（不限时失效、自由辩开抢拍、催不了） | P1 | 统一 `opt(body,"kind").orElse("solo")`，判 null 再取默认 | 读代码 |
| 24 | 事件序号 `seq` 用 `max+1` 非原子 | 并发 emit（tick + 提交 + 生成线程） | `SseHub.java:58`（`store.nextSeq` 在同文件 `Store.java:258-261`） | 单调唯一；实际可能重号 → `since` 补发丢/重复事件 | P2 | 用 `sy_event.seq` 自增列，或 `select ... for update` | 读代码 |
| 25 | `point`（抓漏）步号未校验 | 客户端乱传 step | `ApiController.java:184-186` → `MatchService.java:421-433` | 只接受"本场已埋雷的步"；实际任意 step 都查库（有 `flawType` 就判），历史 step 可被判 | P2 | 校验 `step` 落在 `1..当前 step` | 读代码（本轮已修「重复作答」漏洞，见 task-2） |
| 26 | 老库 `query_rounds=4` 被夹到 2 → 步数从 26 变 18 | 升级后继续打老对局 | `Format.java:73`（`Math.min(QUERY_MAX, ...)`） | 老对局按原步数继续；实际 `step` 越界 → 直接 `finish` | P2 | 迁移脚本把老 `query_rounds` 夹到 2，或 `stepsOf` 不做上夹 | 读代码 |

## 6. 同一根因归并（修一处、消一片）

| 根因 | 涉及条目 | 一句话修法 |
|---|---|---|
| **A. 缺「每步只一次」的唯一约束**（无 `hasTurn` / 无 CAS / 无 status 守卫） | #1 #2 #5 #6 #8 | 给 `sy_turn` 加 `unique(match_id, step, seat)`；`updateStep` 带 `and step=?` 当 CAS；`finish` 用 `and status='RUNNING'` 当闸门；`submit/超时` 先 `hasTurn` |
| **B. 席位归属只有"我坐哪儿"，没有"谁在抢"** | #4 #20 #(submit 事件 seat) | `buzz(matchId, userId)` + 抢到的席位写回 `buzz_seat`；所有 emit 用实际发言席位而不是 `cur.seat()` |
| **C. `num()` 把 bigint 截成 int**（`last_skip_at` / `bill_tokens` / `token_base`） | #14 #15 #16 | 所有 bigint 列改用已有的 `numLong()`；或把 `num()` 改成 `longValue()` 返回 long |
| **D. 时间口径多源**（`Step.sec` / `Pace` / 硬编码 2 / `turnSeconds`） | #10 #11 #12 #13 | 只留 `Pace.secondsFor` 一个入口（含用户 override），事件统一发真实剩余秒 |
| **E. 进程内状态当分布式锁**（`generating` / `attempts` / tick 无锁） | #7 #9 #22 | 幂等下沉到 DB（唯一键 + 状态 CAS），tick 加调度锁；`attempts` 落库或带 TTL |
| **F. `String.valueOf(getOrDefault())` 不认 JSON null** | #23 | 统一 `body.get(k) instanceof String s ? s : default` |

## 7. 已确认「不用改」的部分（防止修复时改坏）

- 质询「问 → 答」成对、正反交替（`AuditOrderTest.质询问答即成对_已正确`）。
- 结辩「反方 B4 先、正方 A4 收尾」（`AuditOrderTest.结辩由反方先讲_已正确`）。
- 单实例下 `runningMatches()` 只在 `status='RUNNING'` 里扫，`tick` 不会重复结算（`AuditConcurrencyTest.单实例结算幂等_已正确`）。
- 「催一下」同轮幂等键 `skipped_step`（`AuditNudgeTest.同轮只认一次_已正确`）。
- 自己回合不能催、单人 `deadline_at=null` 时 keepalive 返回 `unlimited`（`MatchService.java:460-463`，历史 bug 已修，勿回退）。
- `reapAbandoned` 用 `last_active_at` 而不是 `started_at` 作 anchor（`MatchService.java:280-282`，否则会误杀正常单人局）。
- 抓漏「每轮只答一次」已在本轮修复（`MatchService.java:425-432`）。
