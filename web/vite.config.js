import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 构建配置（迁移期固定写法，改动请同步 web/README.md）
 *
 * ① base 用**相对路径 './'**（不是写死的前缀）。
 *
 *    原因：同一份产物要被两种访问方式共用——
 *      · 本地直连后端：  http://localhost:8080/v2/index.html#/
 *      · 线上/代理子路径：http://host:8787/siyige/v2/index.html#/
 *    写死 '/siyige/v2/' 时，本地直连会因为找不到 /siyige/v2/assets/** 而**整页白屏**；
 *    写死 '/v2/' 时，线上又会 404。相对路径两边都对，且**不需要**为了看一眼新页面去起反代进程。
 *
 *    若将来确实要强制绝对前缀，用环境变量覆盖：VITE_BASE=/siyige/v2/ npm run build
 *
 * ② outDir：产物直接落到 Spring 的静态资源目录（服务器上不装 node，
 *    构建产物要跟着代码一起提交，由后端 static 提供）。
 *
 * 本地怎么验：
 *   · 开发：npm run dev（dev server 的 base 是 /，走 proxy，最快）
 *   · 产物：npm run build → 重启/同步资源后直接开 http://localhost:8080/v2/index.html#/
 */
export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE || './',
  build: {
    outDir: '../server/src/main/resources/static/v2',
    emptyOutDir: true,
    // 产物可读性优先：迁移期要能对着 devtools 直接看出是哪个组件
    minify: false,
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true }
    }
  }
});
