#!/usr/bin/env node
/**
 * 归属守卫：检查这次改动有没有越界动了队友的文件。
 *
 * 用法：
 *   node scripts/ownership-guard.mjs              # 检查工作区未提交改动
 *   node scripts/ownership-guard.mjs --staged     # 只检查暂存区（pre-commit 用）
 *   node scripts/ownership-guard.mjs --range A..B # 检查某个提交区间
 *
 * 退出码：0 = 没问题（或只有「提示级」越界）；1 = 动了他的逻辑文件（阻断）
 *
 * 边界依据 docs/协作规范.md：社区 / 社交 / 通知 / 管理台 / 账号体系归他，
 * 辩论引擎 / AI / 评分 / 计费 / 视频 / 小程序归我。
 */
import { execSync } from 'node:child_process';

const git = (cmd) => execSync(`git -C ${root()} ${cmd}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const root = () => process.env.SIYIGE_ROOT || process.cwd();

const args = process.argv.slice(2);
let files;
if (args.includes('--staged')) {
  files = git('diff --cached --name-only').split('\n').filter(Boolean);
} else if (args.includes('--range')) {
  const range = args[args.indexOf('--range') + 1];
  files = git(`diff --name-only ${range}`).split('\n').filter(Boolean);
} else {
  files = git('status --porcelain').split('\n').filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean);
}

/** 他的后端包 */
const HIS_BACKEND_DIRS = [
  'com/siyige/community',
  'com/siyige/social',
  'com/siyige/notify',
  'com/siyige/admin',
  'com/siyige/analytics',
];

/** 他的前端页面 / store（按 tabs 模块划） */
const HIS_FRONTEND = [
  'web/src/views/CommunityView.vue',
  'web/src/views/PostDetailView.vue',
  'web/src/views/ChatView.vue',
  'web/src/views/FriendsView.vue',
  'web/src/views/NotifyView.vue',
  'web/src/views/LoginView.vue',
  'web/src/views/MeView.vue',
  'web/src/views/admin/',
  'web/src/components/AppShell.vue',
  'web/src/stores/auth.js',
  'web/src/stores/chat.js',
  'web/src/stores/unread.js',
];

/** 他的 schema 与资源 */
const HIS_RESOURCES = [
  'schema-community.sql',
  'schema-social.sql',
  'schema-notify.sql',
  'schema-analytics.sql',
  'schema-admin.sql',
  'schema-auth.sql',
  'schema-security.sql',
  'community-sensitive-words.txt',
];

/** 两个人的共享基建：允许改，但要在 PR 里说明 */
const SHARED = [
  'web/src/api.js',
  'web/src/router.js',
  'web/src/nav.js',
  'web/src/style.css',
  'server/src/main/resources/application.yml',
  'server/src/main/resources/schema.sql',
];

const IGNORE = [/^server\/src\/main\/resources\/static\/v2\//, /^scripts\//, /^docs\//, /^README\.md$/];

const classify = (f) => {
  if (IGNORE.some((re) => re.test(f))) return 'ignore';
  if (HIS_BACKEND_DIRS.some((d) => f.includes(d))) return 'his';
  if (HIS_RESOURCES.some((x) => f.endsWith(x))) return 'his';
  if (HIS_FRONTEND.some((x) => f.includes(x))) return 'his';
  if (SHARED.includes(f)) return 'shared';
  return 'mine';
};

const buckets = { his: [], shared: [], mine: [] };
for (const f of files) {
  const k = classify(f);
  if (k === 'ignore') continue;
  buckets[k].push(f);
}

const log = (title, list, icon) => {
  if (!list.length) return;
  console.log(`\n${icon} ${title}（${list.length}）`);
  list.forEach((f) => console.log('   ' + f));
};

log('动了队友的模块', buckets.his, '⛔');
log('共享基建（改完要在 PR 里说明）', buckets.shared, '⚠');
log('你自己的模块', buckets.mine, '✓');

if (buckets.his.length) {
  console.log(`
⛔ 越界了：上面 ${buckets.his.length} 个文件属于队友（社区 / 社交 / 通知 / 管理台 / 账号）。
   要么撤掉，要么改成「发消息 + 提 patch」让他自己改。
   常用替代做法见 docs/协作规范.md §11「不改对方代码的三种办法」。`);
  process.exit(1);
}

console.log('\n✓ 没有越界');
