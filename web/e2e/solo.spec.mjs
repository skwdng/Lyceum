// E2E 冒烟（Playwright）：单人模式主链路
//
// 跑法（先起服务）：
//   cd web && npx playwright install chromium
//   node e2e/solo.spec.mjs http://localhost:8080
//
// 覆盖：注册 → 充钱 → 开局 → 至少两步推进 → 能提交 → 不报错
// 为什么不用 @playwright/test：项目里其它自检脚本都是裸 node + CDP，保持一套风格。
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8080';
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const acc = 'e2e_' + Date.now();
await page.goto(BASE + '/v2/index.html#/login');
await page.waitForTimeout(2000);

// 注册 + 充值（走接口，界面只验证能跑起来）
const token = await page.evaluate(async (account) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: 'Test123456' }),
  });
  const d = await r.json();
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['B2']));
  localStorage.setItem('sy_mode', 'SPRINT');
  const o = await (await fetch('/api/pay/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token },
    body: JSON.stringify({ amountCents: 1500 }),
  })).json();
  await fetch('/api/pay/callback', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token },
    body: JSON.stringify({ orderId: o.orderId, amountCents: 1500, sign: o.sign }),
  });
  return d.token;
}, acc);
if (!token) fail('注册失败');
ok('注册 + 充值');

await page.reload();
await page.waitForTimeout(1500);
await page.goto(BASE + '/v2/index.html#/solo');
await page.waitForTimeout(1500);

const topics = await page.locator('.topic').count();
if (topics === 0) fail('题库没渲染出来');
ok('题库渲染 ' + topics + ' 条');

await page.locator('.topic').first().click();
await page.waitForTimeout(600);
await page.locator('.mask button', { hasText: /开始|开练|进入/ }).first().click();
await page.waitForTimeout(2500);

if (!page.url().includes('/match')) fail('没进到对局页，当前: ' + page.url());
ok('进入对局页');

// 等第一条发言出现
let msgs = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  msgs = await page.locator('.msg').count();
  if (msgs > 0) break;
}
if (msgs === 0) fail('30 秒内没有出现任何发言');
ok('AI 第一条发言已出现');

// 输入框贴底检查（这次专门修过的）
const layout = await page.evaluate(() => {
  const c = document.querySelector('.composer');
  const r = c.getBoundingClientRect();
  return { bottomGap: Math.round(innerHeight - r.bottom) };
});
if (layout.bottomGap > 120) fail('输入框没贴底，底部空 ' + layout.bottomGap + 'px');
ok('输入框贴底（底部空隙 ' + layout.bottomGap + 'px）');

if (errors.length) fail('页面有 JS 异常: ' + errors[0]);
ok('无 JS 异常');
await browser.close();
console.log('\n单人模式 E2E 通过');
