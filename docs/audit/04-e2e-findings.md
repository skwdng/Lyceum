# 04 · 单/双人对局端到端不变量审计

> 审计对象：18092 端口上的 `siyige-backend-0.1.0.jar`（2026-11-27 15:19 构建，无 LLM key，AI 走模板）。
> 驱动：`scripts/audit/e2e-order.mjs`（只依赖 HTTP + SSE，不依赖浏览器/CDP）。
> 结论：**62 条断言，60 通过，2 失败**；失败项均可确定性复现，另记录 2 条契约观察。

## 一、环境与复现

```powershell
# 服务（审计专用端口；用完 kill）
cd D:\siyige\server
java -jar target\siyige-backend-0.1.0.jar --server.port=18092

# 不变量驱动（约 4 分钟：1 场快速 SOLO + 1 场双人房间 + 3 场自然 SOLO）
cd D:\siyige
node scripts/audit/e2e-order.mjs
```

日志：

| 文件 | 内容 |
|---|---|
| `target/audit-logs/e2e-order-2026-11-27T07-33-18-485Z.json` | 完整时间线、每条断言、每个 step 的 seat/turns、SSE 事件 |
| `target/audit-logs/e2e-order-run1.log` | 控制台输出（失败明细） |
| `target/audit-logs/server-18092.*.log` | 服务进程输出重定向文件（本次为空；进程/端口健康以 `GET /api/health=200`、pid 51336 为准） |

## 二、断言矩阵

### SOLO（SPRINT，B2 席位，快速模式 27.4s）

| 断言 | 结果 | 证据 |
|---|---|---|
| 结束状态 = FINISHED | ✅ | status=FINISHED |
| turns 数 == steps 数 | ✅ | 12/12 |
| 每 step 恰好 1 条发言 | ✅ | byStep 全部 =1 |
| step 1..N 连续无缺号 | ✅ | 1..12 |
| 无重复 (step,seat) | ✅ | none |
| 发言席位与赛制 steps 对齐 | ✅ | 无偏差 |
| step 单调不回退 | ✅ | 0→1→…→11 |
| SSE turn 事件数 == 发言记录数 | ✅ | 12/12 |
| SSE step 事件无重复 | ✅ | 2..12 各一次 |
| SSE match.end 只发一次 | ✅ | 1 |
| 轮到我时催一下被拒 | ✅ | `{ok:false, reason:"现在轮到你说"}` |
| **连点催一下只推进一步** | ❌ | **5 个并发请求全部 `ok:true`（见 F1）** |
| 冷却期观察 | ➖ | 未触发（并发请求都走同一快照，未进入冷却分支） |

### 房间双人（FULL，A1=房主 / B1=第二人，107.2s）

| 断言 | 结果 | 证据 |
|---|---|---|
| 第二人补对面席位 | ✅ | guestSeat=B1（不是 A2） |
| 开局席位 = A1,B1 | ✅ | seats="A1,B1"，aiFilled=6 |
| 客队不能替主队提交（A1 步） | ✅ | HTTP 409 `NOT_YOUR_TURN: 现在是 A1 的回合，你坐 B1` |
| 主队不能替客队提交（B1 步） | ✅ | HTTP 409 `NOT_YOUR_TURN: 现在是 B1 的回合，你坐 A1` |
| 多人对局不能催一下 | ✅ | `{ok:false, reason:"多人对局不能跳过"}` |
| 抢拍只有一人成功 | ✅ | host ok / guest「现在不是抢拍时间」 |
| 抢拍席位与本人座位一致 | ✅ | host 抢到 A1 |
| 双方看到同一 step/状态 | ✅ | mismatch=0 |
| 结束状态 = FINISHED | ✅ | status=FINISHED |
| turns 数 == steps 数 | ✅ | 17/17 |
| 每 step 恰好 1 条发言 | ✅ | 全部 =1 |
| step 1..N 连续 | ✅ | 1..17 |
| **发言席位与赛制 steps 对齐** | ❌ | **turn 13 的 seat=A1，但 steps[12].seat=A2（见 F2）** |
| step 单调不回退 | ✅ | 0→…→16 |
| SSE turn 事件数 == 发言记录数 | ✅ | 17/17 |
| SSE step 事件无重复 / match.end 一次 | ✅ | 各 1 |

> 注：FULL 实测步数 = 4 开场 + 8 质询 + f 自由辩 + 2 总结 = **14+f**（本场 f=3 → 17），
> 与任务描述里的「标准 18+f」口径不同；以接口返回的 `steps` 为准，未按缺陷计。

## 三、失败项

### F1 · 催一下并发不幂等：5 个请求全部返回 ok=true（P2 中）

复现：开局后对同一 AI 步并发发 5 次 `POST /api/matches/{id}/skip`。

```json
{"stepBefore":0,"stepAfter":0,"okCount":5,
 "responses":[{"status":200,"ok":true},{"status":200,"ok":true},{"status":200,"ok":true},
              {"status":200,"ok":true},{"status":200,"ok":true}]}
```

- 状态机本身只推进一次（timeline 0→1 仅一次，最终 turns=12/steps=12，无重复 step）。
- 但**接口契约不幂等**：`MatchService.skip()` 先读 `skipped_step` 再写，5 个请求读到同一快照，
  全部通过「同一轮只允许催一次」检查；日志里随后只能看到一次推进。
- 影响：客户端拿到 5 个成功响应，无法判断哪次生效；若未来把 skip 接入计费/提示/埋点，会重复计数。
- 建议模块：`MatchService.skip`（`skipped_step` 用 CAS / `update ... where skipped_step<>?` 或数据库唯一约束）。

### F2 · 房间自由辩抢拍席位与轮转席位脱钩（P1 高）

复现：房间双人开局 → 到第一个自由辩 BUZZ 窗口，房主抢拍，随后复盘 turn 与 steps 对齐。

```
[FAIL] 房间: 发言席位与赛制 steps 对齐 · 13:A1≠A2
```

- 第 13 步（0-based 12）赛制席位是 **A2**（自由辩），实际落库发言席位是 **A1**（房主固定席位）。
- 根因（代码定位）：`MatchService.buzz()` 用 `TurnEngine.parseSeats(my_seats).iterator().next()` 取席位；
  房间局 `my_seats="A1,B1"`，于是永远拿集合里第一个（A1/A2 与轮转无关），再把 `buzz_seat=A1` 写库。
- 影响：
  - 自由辩轮转步被 A1/B1「顶替」，复盘/逐轮评分按错误席位归属；
  - 若抢拍者是 B1、而 `iterator().next()` 返回 A1，抢拍者随后 `submit` 会被 `NOT_YOUR_TURN` 拒绝
    （自己抢到的话自己不能说），只能等 3s 超时变成 TIMEOUT；
  - 与 F2 同源的 `buzz()` 没有 userId 参数，无法按抢拍者身份定席位。
- 建议模块：`MatchService.buzz`（按 userId→room seat 定席位，或直接使用本步 `cur.seat()`）+ `TurnEngine`。

## 四、契约观察（不计失败，但建议确认）

| # | 观察 | 级别 | 说明 / 建议模块 |
|---|---|---|---|
| O1 | 房间局两端 `waitingForMe` 同时为 true（A1 步：host=true, guest=true） | P2 | `my_seats="A1,B1"` 是「本方真人席位集合」，`detail()` 直接 `isMine(speaker)` 判断，导致两端都显示该我发言；服务端 submit 能拒，但前端会误导。建议 `detail` 按 userId 反查个人席位（`RoomStore.seatOfUser`）。 |
| O2 | 替对方提交返回 **409** `NOT_YOUR_TURN`，不是 403/400 | P3 | 拒绝语义正确，但和验收口径不一致；若前端按 403 处理需对齐。`ApiErrors` 把 `IllegalStateException` 统一映射 409。 |
| O3 | FULL 步数 = 14+f（本场 17），任务口径写「18+f」 | 说明 | 以接口 `steps` 为准；建议文档统一公式，避免回归断言写死错误期望。 |

## 五、3 场自然 SOLO 统计（不催一下，模板 AI）

| # | 总时长 | turns | 最慢一步 | >15s 空窗 | 重复 step |
|---|---|---|---|---|---|
| 1 | 52.4s | 9 | 10.0s | 0 | 0 |
| 2 | 65.7s | 11 | 9.3s | 0 | 0 |
| 3 | 55.7s | 9 | 9.8s | 0 | 0 |
| 均值 | **57.9s** | 9.7 | **9.98s** | **0** | **0** |

结论：模板 AI 下单场约 1 分钟，无 step 空窗、无重复 step；最慢一步 <10s，未触及 15s 卡死阈值。
（AI 思考基准 3.5–6.0s + 两段式分析，与实现一致。）

## 六、未验证项

6 个既有浏览器脚本（`verify_full_run / verify_nudge_once / verify_nudge_spam / verify_position /
verify_stream_settle / verify_typing_start`）按 Lead 时间盒**未执行**，状态记为「未验证」，不作为通过依据。

已就绪的运行条件（后续可直接补跑）：

```powershell
# Edge CDP 9391
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless=new `
  --remote-debugging-port=9391 --user-data-dir=C:\Windows\Temp\edge-audit-qa --no-first-run about:blank

# 现有脚本硬编码 localhost:8080 → 用反代转到 18092
node target\audit-logs\proxy-8080.mjs   # 8080 -> 18092

# 每个脚本跑 2 次，参数是 CDP 端口
node scripts/verify_typing_start.mjs 9391
node scripts/verify_nudge_once.mjs 9391
```

风险预判：这些脚本依赖 DOM 选择器与中文按钮文案，UI 改动后容易 flaky；建议后续统一改成
「HTTP 断言为主 + CDP 仅做视觉抽查」，纳入 `scripts/audit/`。

## 七、结论与优先级

1. **P1** 修 `MatchService.buzz` 的席位来源（F2）——它会污染复盘与逐轮评分。
2. **P2** 给 `skip` 加 CAS/唯一约束（F1）；`detail.waitingForMe` 按个人席位计算（O1）。
3. **P3** 统一 403/409 口径（O2）、文档化赛制步数公式（O3）。
4. 单人对局的核心不变量（每 step 1 条、顺序、SSE 单发、结束对齐）**全部通过**；3 场自然 SOLO 无卡死、
   无重复、无 >15s 空窗。

> 审计约束遵守：未改 main 代码、未 commit、未 pull；18092 服务与 9391 Edge 在审计结束后 kill。
