const fs = require('fs');
const p = 'D:\\siyige\\README.md';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ① 解决冲突：两边都留
const conflict = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/;
const m = t.match(conflict);
if (m) {
  // HEAD 侧（他的治理/改密） + 我的修复项，合并成一组
  const mine = m[2].trimEnd();
  const theirs = m[1].trimEnd();
  t = t.replace(conflict, theirs + '\n' + mine + '\n');
  console.log('README 冲突已合并');
} else {
  console.log('README 无冲突');
}

// ② 在 11-04 段落里补上视频模块 + 模板扩容（新的仍放最上面，同一天往下追加）
const anchor = `### 2026-11-04
- 辩论侧接入账号：未登录不能玩；对局只有本人或同房间席位能看能操作；SSE 令牌走 \`?token=\`
- 房间席位显示账号昵称，「房主 / 玩家」改成小标签；登录后回到来路页面`;

const added = `### 2026-11-04
- 辩论侧接入账号：未登录不能玩；对局只有本人或同房间席位能看能操作；SSE 令牌走 \`?token=\`
- 房间席位显示账号昵称，「房主 / 玩家」改成小标签；登录后回到来路页面
- **新增「视频」模块**：辩论短视频广场，竖屏全屏滑动、按环节（立论/驳立论/质询/自由辩/总结/名场面）筛选、点赞评论，导航里与社区平级独立成组
- **视频电子审核**：机器初审三级判定（结构校验 → 违禁词驳回 → 风险词转人工），未过审不进广场；每次判定写入 \`sy_video_audit\`，人工复核台留到管理端接入后再开
- **AI 发言模板扩容**：兜底句式 2→10 条/环节、承接对方的话术 1→8 种、环节结构 3 套变体随机，并记忆本场用过的开头`;

if (!t.includes(anchor)) {
  console.log('未找到 11-04 锚点，需人工确认');
} else {
  t = t.replace(anchor, added);
  console.log('11-04 更新记录已补 3 条');
}

fs.writeFileSync(p, t, 'utf8');
