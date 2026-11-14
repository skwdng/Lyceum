# 思弈阁 · 微信小程序端

Web 端的精简版：**单人辩论 / 对局 / 复盘**。社区、视频、多人房间请用 Web 端。

## 为什么是精简版

| 能力 | Web | 小程序 | 原因 |
|---|---|---|---|
| 单人辩论（全流程） | ✅ | ✅ | 核心功能 |
| 对局发言 / 催一下 / 复盘 | ✅ | ✅ | 核心功能 |
| 视频广场（竖滑自动播放） | ✅ | ❌ | 小程序 `<video>` 不能像 Web 那样多实例预加载，体验做不好 |
| 社区（Markdown + 楼层） | ✅ | ❌ | 富文本渲染要另写一套解析，收益低 |
| 多人房间（SSE 实时） | ✅ | ❌ | 小程序没有 EventSource，只能轮询，联机延迟不可接受 |
| 管理台 | ✅ | — | 运营在电脑上做 |

## 怎么跑

1. 微信开发者工具 → 导入项目 → 选这个目录（`D:\siyige\miniprogram`）
2. `project.config.json` 里 `appid` 现在是 `touristappid`（游客模式，只能本地预览）；正式用请换成自己的
3. 改 `app.js` 里的 `baseUrl`：

```js
baseUrl: 'https://your-domain.com/siyige'
```

4. 开发阶段勾上「不校验合法域名」（详情 → 本地设置）；上线前必须在**小程序后台 → 开发管理 → 服务器域名**里把域名加进 `request 合法域名`，并且必须是 **https**

## 后端要求

和 Web 端共用同一套接口，**不需要改后端**。小程序端只用这些：

```
POST /api/auth/login | /api/auth/register
GET  /api/auth/me
GET  /api/wallet
GET  /api/ai-tiers
GET  /api/topics
POST /api/matches            { topicId, seats:['B2'], mode:'SPRINT', tier }
GET  /api/matches/{id}       ← 1.5 秒轮询
POST /api/matches/{id}/turns { content, inputType:'kb' }
POST /api/matches/{id}/skip  ← 已做幂等（同一轮只生效一次）
GET  /api/matches/{id}/review
GET  /api/records
```

## 与 Web 端的实现差异

| 点 | Web | 小程序 |
|---|---|---|
| 实时 | SSE + 400ms 轮询 | 纯 1.5 秒轮询 |
| 打字机 | 有（6.5 秒逐字） | **没有**：一次性显示整段，手机上打字机又费电又卡 |
| 令牌 | localStorage | `wx.setStorageSync`，每个请求手动带 `Authorization` |
| 401 处理 | 路由守卫跳登录 | 请求封装里统一 `reLaunch` 到登录页 |
| 催一下 | 按钮 in-flight + 3 秒冷却 | 同左（本地记已催的步，后端也幂等） |

## 已知限制

- **不能离线对练**：那个模式是纯前端模板，小程序端没搬（要做的话是把 `offline.js` 的模板池搬成 utils）
- **没有 SSE**：对局推进靠轮询，最坏比 Web 慢 1.5 秒
- **座位固定 B2**：小程序端没做选座界面，默认坐第二辩位（AI 先手，体验最像"接对方话"）
- **支付没接**：`wx.requestPayment` 需要商户号；现在充值请到 Web 端
