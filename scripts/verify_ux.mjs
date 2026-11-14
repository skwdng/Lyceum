const PORT = process.argv[2] || 9690;
const OUT = 'D:\\siyige\\demo\\shots-ux\\';

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
  let id = 0; const pend = new Map(); const errs = []; let dialogs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
    if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push(((d.exception && d.exception.description) || d.text || "").split("\n")[0]); }
    if (m.method === "Page.javascriptDialogOpening") { dialogs.push(m.params.message); send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {}); }
  };
  const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0];
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("  shot ->", n); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.setInterceptFileChooserDialog", { enabled: false }).catch(() => {});
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  // ---------- ① 视频页搜索框默认收起 ----------
  console.log("[①] 视频页");
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" }); await sleep(2500);
  const acc = 'ux_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await send('Page.reload'); await sleep(2200);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/video" }); await sleep(2500);
  console.log("  默认有搜索输入框:", await ev(`!!document.querySelector('.vsearch-input')`));
  console.log("  右上角有搜索按钮:", await ev(`[...document.querySelectorAll('.vtop button')].some(b=>b.textContent.includes('搜索'))`));
  await shot("video-collapsed.png");
  await ev(`(()=>{const b=[...document.querySelectorAll('.vtop button')].find(x=>x.textContent.includes('搜索')); if(b) b.click();})()`);
  await sleep(600);
  console.log("  点开后出现输入框:", await ev(`!!document.querySelector('.vsearch-input')`));
  console.log("  输入框自动聚焦:", await ev(`document.activeElement && document.activeElement.className.includes('vsearch-input')`));
  await shot("video-expanded.png");
  await ev(`(()=>{const b=[...document.querySelectorAll('.vsearch button')].find(x=>x.textContent.includes('收起')); if(b) b.click();})()`);
  await sleep(600);
  console.log("  收起后输入框消失:", await ev(`!document.querySelector('.vsearch-input')`));

  // ---------- ② 登录失败就地提示 ----------
  console.log("\n[②] 登录失败提示");
  await ev(`localStorage.removeItem('sy_jwt')`);
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/login" });
  await send('Page.reload'); await sleep(2200);
  await ev(`(()=>{
    const inputs=[...document.querySelectorAll('input')];
    inputs[0].value='no_such_user_xyz'; inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
    inputs[1].value='wrongpass123'; inputs[1].dispatchEvent(new Event('input',{bubbles:true}));
    const b=[...document.querySelectorAll('button')].find(x=>/登录/.test(x.textContent));
    if(b) b.click();
  })()`);
  await sleep(2000);
  console.log("  页面内错误提示:", await ev(`(document.querySelector('.auth-err')||{}).textContent || '无'`));
  await shot("login-error.png");

  // ---------- ③ 放弃对局 / 退出登录 的二次确认 ----------
  console.log("\n[③] 危险动作二次确认");
  await ev(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${acc}',password:'Test123456'})});const d=await r.json();localStorage.setItem('sy_jwt',d.token);})()`);
  await send('Page.reload'); await sleep(2200);
  dialogs = [];
  await ev(`(async()=>{ const r=await api('/api/matches',{method:'POST',body:{topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'}}); S_PLACEHOLDER=1; return r.matchId; })()`).catch(() => {});
  // 直接触发页面里的放弃按钮：先造一个进行中的对局（走 store 不方便，这里只验证确认弹窗是否挂上）
  const hasConfirm = await ev(`(()=>{
    const src = document.documentElement.innerHTML;
    return { abandon: /确认放弃|不可恢复/.test(window.__srcCache || ''), note: '内核层面无法读源码，改由点击验证' };
  })()`);
  // 点击「我的」→ 退出登录，看是否弹确认
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/me" }); await sleep(2200);
  dialogs = [];
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('退出登录')); if(b) b.click();})()`);
  await sleep(1200);
  console.log("  退出登录弹确认:", dialogs.length > 0, dialogs.length ? dialogs[0].replace(/\n/g, ' ').slice(0, 40) : '');

  // ---------- ④ 复盘分数颜色 ----------
  console.log("\n[④] 复盘分数颜色");
  const mid = await ev(`(async()=>{
    const tk=localStorage.getItem('sy_jwt');
    const r=await fetch('/api/matches',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},body:JSON.stringify({topicId:'t4',seats:['B2'],mode:'SPRINT',tier:'PRO'})});
    return (await r.json()).matchId;
  })()`);
  // 打两三轮就够渲染复盘（这里直接看 CSS 类是否生效）
  await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#/review?match=" + mid }); await sleep(2500);
  console.log("  有 .score-color 元素:", await ev(`!!document.querySelector('.score-color')`));
  console.log("  颜色:", await ev(`(()=>{const e=document.querySelector('.score-color'); return e?getComputedStyle(e).color:'无';})()`));

  console.log("\n异常:", JSON.stringify(errs.slice(0, 3)));
  ws.close(); process.exit(0);
});
