// 假 OpenAI 兼容服务：只为验证「后端 → 模型」这条链路通不通，不产生任何真实调用费用。
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404); res.end('not found'); return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch {}
    const wantsJson = !!(payload.response_format);
    const content = wantsJson
      ? JSON.stringify({
          result: 'NEED_EDIT',
          reason: '【MOCK-LLM】这句来自本地假模型，说明审核链路已经打到你',
          suggestions: ['示例改写一：把问题写成可判断的命题', '示例改写二：补一个明确的正反立场'],
        })
      : '【MOCK-LLM】这段话是通过真实 HTTP 请求返回的，说明「后端 → 模型」链路已打通。现在把 api-key 换成真的，输出就会变成真模型的发言。';

    const out = JSON.stringify({
      id: 'mock-' + Date.now(),
      object: 'chat.completion',
      model: payload.model || 'mock',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);
    console.log(`[mock-llm] ${wantsJson ? 'JSON' : 'TEXT'} <- ${(payload.messages || []).length} msgs`);
  });
});

server.listen(18080, '127.0.0.1', () => console.log('[mock-llm] listening 127.0.0.1:18080'));
