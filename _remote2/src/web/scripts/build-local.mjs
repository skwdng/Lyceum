/**
 * 跨平台本地构建：把 base 临时改成 /v2/ 再构建。
 *
 * 为什么需要它：线上产物必须是 /siyige/v2/ 前缀（服务器挂子路径），
 * 但本地后端是根路径，用 /siyige/v2/ 的产物在本地会全 404。
 * 所以本地验证时用这个脚本构建一次，提交前再 `npm run build` 恢复默认。
 *
 * Windows PowerShell 里 `VITE_BASE=/v2/ npm run build` 这种写法不生效（那是 bash 语法），
 * 用 node 脚本设环境变量才能两边都跑得动。
 */
process.env.VITE_BASE = '/v2/';
const { build } = await import('vite');
await build();
