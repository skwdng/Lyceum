/**
 * 本地「生产形态」代理：模拟线上 nginx 把 /siyige/ 反代到后端根路径。
 *
 * 为什么需要它：
 *   线上前端挂在 /siyige/v2/，构建产物的资源前缀是 /siyige/v2/assets/**；
 *   而本地后端在根路径（http://localhost:8080）。直接访问 http://localhost:8080/v2/index.html
 *   会因为找不到 /siyige/v2/assets/** 而白屏。
 *
 *   这个脚本在 8787 起一个零依赖反代：/siyige/**  →  127.0.0.1:8080/**（去掉前缀），
 *   于是本地就等价于线上，点「试用新版」真的能开，验的是同一套产物。
 *
 * 用法：
 *   node web/scripts/dev-proxy.mjs            # 默认 8787 → 8080
 *   node web/scripts/dev-proxy.mjs 9000 8081  # 自定义 端口 后端端口
 *
 * 然后用：
 *   旧版  http://localhost:8787/siyige/
 *   新版  http://localhost:8787/siyige/v2/index.html#/
 *
 * 注：WS 升级也做了透传（批 2 的聊天会用到）。生产环境的 nginx 配置见
 *     docs/社交接口契约.md §9。
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 8787);
const BACKEND = Number(process.argv[3] || 8080);
const PREFIX = '/siyige';

const server = http.createServer((req, res) => {
  // 与线上 nginx 的行为一致：**整站透传**，只在 URL 带 /siyige 前缀时把它剥掉。
  // 必须整站透传，不能只放行 /siyige/**：旧前端用的是根绝对路径 /js/core.js、/css/app.css，
  // 只代理 /siyige 会让旧页脚本全 404（页面白屏，控制台报 "boot is not defined"）。
  const target = req.url.startsWith(PREFIX) ? req.url.slice(PREFIX.length) || '/' : req.url;
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: BACKEND,
      method: req.method,
      path: target,
      headers: { ...req.headers, host: '127.0.0.1:' + BACKEND }
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );

  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('后端没起来？' + BACKEND + ' → ' + e.message + '\n');
  });

  req.pipe(upstream);
});

// WebSocket 透传：批 2 的 /siyige/ws/chat 走这里（与服务端升级握手一致）
server.on('upgrade', (req, socket, head) => {
  const path = req.url.startsWith(PREFIX) ? req.url.slice(PREFIX.length) : req.url;
  const upstream = http.request({
    host: '127.0.0.1',
    port: BACKEND,
    method: req.method,
    path,
    headers: { ...req.headers, host: '127.0.0.1:' + BACKEND }
  });
  upstream.end();
  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (upHead && upHead.length) socket.write(upHead);
    if (head && head.length) upSocket.write(head);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  upstream.on('error', () => socket.destroy());
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`已启动：${PREFIX}/** → http://127.0.0.1:${BACKEND}/**`);
  console.log(`  旧版  http://localhost:${PORT}${PREFIX}/`);
  console.log(`  新版  http://localhost:${PORT}${PREFIX}/v2/index.html#/`);
});
