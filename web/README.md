# 思弈阁前端（Vue 3 + Vite 6）

旧前端（原生 JS，`server/src/main/resources/static/`）正在**分批**迁到这里。
迁移期两套并存，任何时候都能停：

| 版本 | 地址（线上） | 地址（本地） |
|---|---|---|
| 旧版 | `http://host:8787/siyige/` | `http://localhost:8080/` |
| 新版 | `http://host:8787/siyige/v2/index.html#/` | `http://localhost:8080/v2/index.html#/` |

> 新版入口带 `index.html` 是**故意的**：Spring 静态资源不做目录索引，`/siyige/v2/` 会 404，
> 且本次迁移不允许改后端，所以链接一律写完整文件名。

## 三条命令（dev / build / 本地产物验证）

```bash
# ① 开发（热更新，最快；dev server 的 base 是 /，/api 与 /ws 已代理到 8080）
cd web && npm i && npm run dev          # → http://localhost:5173/#/login

# ② 构建（产物输出到 server/.../static/v2/，资源用相对路径 ./assets/**）
npm run build

# ③ 本地产物验证（什么都不用额外起，直接把产物同步进 classpath）
cd ../server && mvn -q -o resources:resources
#   → 旧版 http://localhost:8080/
#   → 新版 http://localhost:8080/v2/index.html#/   （旧页侧栏点「试用新版」也是这条）
```

> **为什么资源用相对路径 `./` 而不是写死 `/siyige/v2/`**：
> 同一份产物要同时满足「本地直连 `localhost:8080/v2/`」和「线上 `host/siyige/v2/`」两种挂载位置。
> 写死前缀时，本地直连会因为找不到 `/siyige/v2/assets/**` 而**整页白屏**。
> 相对路径两边都对，且在线上子路径下同样成立（`./assets/x.js` 会解析到 `/siyige/v2/assets/x.js`）。
> 需要强制绝对前缀时用 `VITE_BASE=/siyige/v2/ npm run build`（本仓库默认不用）。

### 可选：本地还原线上 `/siyige/` 形态

想在本地完全模拟线上（`http://host:8787/siyige/`）时再用，不验线上就不需要：

```bash
cd web && npm run serve:prod            # 8787 → 127.0.0.1:8080，整站透传（带 /siyige 时剥前缀）
#   → 旧版 http://localhost:8787/siyige/
#   → 新版 http://localhost:8787/siyige/v2/index.html#/
```

`serve:prod` 必须**整站透传**：旧前端用的是根绝对路径 `/js/core.js`、`/css/app.css`，
只放行 `/siyige/**` 会让旧页脚本 404、白屏并报 `boot is not defined`。

## 目录

```
web/
├── index.html              入口（无任何绝对路径，资源前缀由 base 决定）
├── vite.config.js          base / outDir / proxy（改之前先看注释）
├── scripts/build-local.mjs 跨平台本地构建（把 base 临时改成 /v2/）
└── src/
    ├── main.js            挂 pinia → router → App
    ├── api.js             请求层：API_BASE / sy_jwt / 错误体（与旧 core.js 的 api() 对齐）
    ├── nav.js             侧栏导航（与旧 NAV 一一对应，k 即路由名）
    ├── router.js          hash 路由 + 未迁移页面的 LegacyRedirect
    ├── style.css          从旧 css/app.css 摘录的基础样式（数值不改）
    ├── stores/{auth,unread}.js
    ├── components/{AppShell,ToastHost}.vue
    └── views/*.vue
```

## 迁移期必须遵守的 6 条（踩过坑，别改）

1. **不写绝对资源路径**：任何 `/js/...`、`/css/...` 都不要出现在代码里；资源前缀全靠 `base`。
2. **API 前缀**：一律走 `src/api.js`，内部 `API_BASE = pathname 以 /siyige 开头 ? '/siyige' : ''`，
   接口路径写 `/api/**`，**不要**写死 `/siyige/api/**`。
3. **登录态共用**：token 存 `localStorage['sy_jwt']`，与旧前端同一个 key，互跳不掉登录。
4. **WebSocket 只能一条**：新聊天页（批 2）建连接后，旧 `chat-ws.js` 的连接不能再存在
   —— 迁聊天那一批时把旧页入口切走。
5. **角标轮询只能一份**：同一份数据只允许一个计时器（目前是 `stores/unread.js` 的 45 秒）。
   页面组件里不许自己 `setInterval`。
6. **换账号必须 reset**：`auth.logout/login/register` 统一调 `resetAll()`，
   新增 store 也要挂进去（否则会出现"标题是自己/红点消不掉"那类串号 bug）。

## 分批进度

- [x] 批 0：骨架（外壳/路由/请求层/stores）+ 登录 / 注册 / 我的
- [x] 批 1：通知 / 钱包 / 好友 / 热辩榜 / 记录 / 诊断
- [x] 批 2：聊天（WS）/ 复盘 / 单人 / 多人 / 对局
- [x] 批 3：社区 / 视频 / 管理台
- [x] 批 4：切换入口 + 删旧文件 + 全量回归

**迁移已收口**：旧前端（`static/js/**`、`static/css/app.css`、`admin.html`、`community.html`、
`index.backup.html`）与 `LegacyRedirect.vue` 已删除，`static/index.html` 只剩一次跳转。
现在 `static/` 下只有 `index.html` + `v2/`。

| 入口 | 地址 | 说明 |
|---|---|---|
| 站点 | `/siyige/` | 跳转页 → `/siyige/v2/index.html#/` |
| 应用 | `/siyige/v2/index.html#/<路由>` | 15 个侧栏入口全在这里（hash 路由，Spring 不需要 SPA fallback） |
| 管理台 | `/siyige/v2/index.html#/admin` | 裸布局（无侧栏）、独立令牌 `sy_admin_jwt`、前缀 `/api/admin` |

老链接仍然能用：`/?v=chat` 这类会被跳转页带到新版（`v` 参数忽略，落到首页）。

### 验证脚本（批 4 之后只剩这些，全部打新版）

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `selftest_vue_entry.mjs` | 入口切换、侧栏 10 项逐个点、老链接兜底、旧资源 404、零异常 | 7/7 |
| `selftest_vue_batch0.mjs` | 外壳 / 路由 / 登录注册 / 我的 / 角标 | 12/12 |
| `selftest_vue_batch1.mjs` | 通知 / 钱包 / 好友 / 热辩榜 / 记录 / 诊断 | 12/12 |
| `selftest_vue_batch2.mjs` | 聊天（双标签 WS、未读、换账号） | 9/9 |
| `selftest_vue_batch2b.mjs` | 单人 / 对局 / 复盘 / 多人房间 | 14/14 |
| `selftest_vue_batch3.mjs` | 社区（列表/详情/发帖/评论/楼中楼/@/举报/通知深链） | 13/13 |
| `selftest_vue_batch3b.mjs` | 视频 + 管理台 | 11/11 |

旧的 14 个脚本（`selftest_ai / auth / community / debate_auth / notify / report / social /
admin / audit / mobile / mobile2 / password / serial / typing / ui`、`test_panel_*`、`test_wallet_ui`、
`diag_*`）驱动的是已删除的旧前端，批 4 一并删除；覆盖能力已由上面 7 个脚本承接。

### 迁移期遗留

（已清空）批 1～3 登记的遗留都在批 4 关闭了：通知帖子深链改本地路由、
「返回旧版 / 试用新版」链接全部撤掉、旧静态文件与旧管理台删除、`LegacyRedirect` 删除。

已关闭（批 2）：好友「发消息」直达新版聊天并带对端、热辩榜「开辩」带题进新版单人页、
侧栏「消息」角标由 chat store 提供、聊天邀请卡片「加入房间」进新版房间页并自动加入。

已关闭（批 3）：通知里的「帖子类」点击改本地路由 `#/community/:postId?around=<commentId>`
（不再回落旧页、也不再依赖旧页的 `?postId=` 补丁）。
