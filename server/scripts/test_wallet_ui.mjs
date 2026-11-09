const PORT = process.argv[2] || 9526;
const ACC = "wallet_ui_" + Math.floor(Math.random() * 900 + 100);

import("node:fs").then(async fs => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getWs() {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
        const l = await r.json();
        const p = l.find(t => t.type === "page" && t.webSocketDebuggerUrl);
        if (p) return p.webSocketDebuggerUrl;
      } catch {}
      await sleep(250);
    }
    throw new Error("no target");
  }
  const ws = new WebSocket(await getWs());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0]; return r.result?.value; };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync("D:\\siyige\\demo\\shots-wallet\\", { recursive: true }); fs.writeFileSync("D:\\siyige\\demo\\shots-wallet\\" + n, Buffer.from(s.data, "base64")); console.log("shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8080/" }); await sleep(3000);

  // 注册（新库重启后账号是空的）
  const reg = `(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${ACC}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);return d.token?'ok':'fail';})()`;
  console.log("注册:", await ev(reg));
  await ev(`authRestore()`); await sleep(1500);

  console.log("登录态:", await ev(`S.user ? S.user.account : 'null'`));
  console.log("余额胶囊:", await ev(`document.querySelector('.wchip')?.textContent || '无'`));

  await ev(`openWallet()`); await sleep(1200);
  console.log("钱包弹窗:", await ev(`!!document.querySelector('#walletMask')`));
  console.log("余额:", await ev(`(document.querySelector('#walletMask .big')||{}).textContent || '-'`));
  console.log("充值按钮数:", await ev(`document.querySelectorAll('#walletMask button').length`));
  await shot("wallet.png");

  // 充 5 元
  console.log("充值:", await ev(`doRecharge(500)`));
  await sleep(1500);
  console.log("充值后胶囊:", await ev(`document.querySelector('.wchip')?.textContent || '无'`));
  await shot("wallet-after.png");

  console.log("异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
