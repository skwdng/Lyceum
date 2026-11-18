const PORT = process.argv[2] || 9720;
const OUT = 'D:\\siyige\\demo\\shots-fix3\\';

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
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || "").split("\n")[0];
    return r.result?.value;
  };
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + n, Buffer.from(s.data, "base64")); console.log("     shot -> " + n); };
  const go = async (hash, wait = 2300) => { await send("Page.navigate", { url: "http://localhost:8080/v2/index.html#" + hash }); await sleep(wait); };

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  await go("/login", 2400);
  const acc = 'fx3_' + Math.floor(Math.random() * 90000 + 10000);
  await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({account:'${acc}', password:'Test123456'})});
    const d = await r.json(); localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2'])); localStorage.setItem('sy_mode','STANDARD');
    const o = await (await fetch('/api/pay/orders', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({amountCents:900})})).json();
    await fetch('/api/pay/callback', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.token}, body: JSON.stringify({orderId:o.orderId, amountCents:900, sign:o.sign})});
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(2300);
  console.log("账号:", acc, "· 模式 STANDARD（24 步）");

  // 开局
  await go("/solo", 2000);
  await ev(`(()=>{ const c=document.querySelector('.topic'); if(c) c.click(); })()`);
  await sleep(900);
  await ev(`(()=>{ const b=[...document.querySelectorAll('.mask button')].find(x=>/开始|开练|进入/.test(x.textContent)); if(b) b.click(); })()`);

  // 全程采样：每条消息的长度变化（看打字速度）+ 消息数量（看有没有吞消息）+ 重复
  console.log("\n[采样] 每条气泡的长度变化");
  const t0 = Date.now();
  let tracks = [], lastSig = '';
  for (let i = 0; i < 120; i++) {
    await sleep(400);
    const st = await ev(`(()=>{
      const msgs=[...document.querySelectorAll('.msg')].map(m=>{
        const b=m.querySelector('.bub');
        const t=(m.textContent||'');
        return { seg: (t.match(/(立论|驳立论|质询|自由辩|总结)/)||[])[1] || '',
                 piece: t.slice(0,3),
                 len: b?(b.textContent||'').length:0,
                 streaming: t.includes('生成中') };
      });
      return { n: msgs.length, msgs, body:(document.body.innerText||'') };
    })()`);
    const sig = st.msgs.map(m => m.len).join(',');
    if (sig !== lastSig) {
      tracks.push({ t: ((Date.now()-t0)/1000).toFixed(1), sig, n: st.n, streaming: st.msgs.some(m=>m.streaming) });
      lastSig = sig;
    }
    if (/复盘|本场得分/.test(st.body)) { console.log("     对局结束（跳复盘）"); break; }
    if (i === 40) await shot("mid.png");
  }
  console.log("  长度变化轨迹（节选，前 18 条）:");
  tracks.slice(0, 18).forEach(x => console.log(`     ${x.t}s  条数=${x.n}  长度=${x.sig}  流式中=${x.streaming}`));
  console.log(`  共 ${tracks.length} 次变化`);

  // 关键校验
  const check = await ev(`(()=>{
    const msgs=[...document.querySelectorAll('.msg')];
    const segs=msgs.map(m=>{ const t=m.textContent||''; return (t.match(/(立论|驳立论|质询|自由辩|总结)/)||[])[1]||'?'; });
    const lens=msgs.map(m=>{const b=m.querySelector('.bub'); return b?(b.textContent||'').length:0;});
    const texts=msgs.map(m=>{const b=m.querySelector('.bub'); return (b?b.textContent:'').slice(0,20);});
    const dup = texts.filter((x,i)=>x && texts.indexOf(x)!==i).length;
    return { n: msgs.length, segs, lens, dup, streaming: msgs.filter(m=>(m.textContent||'').includes('生成中')).length };
  })()`);
  console.log("\n[结果]");
  console.log("  气泡数:", check.n, "· 环节序列:", check.segs.join(' → '));
  console.log("  各条长度:", check.lens.join(', '));
  console.log("  重复气泡:", check.dup, "· 仍在生成中:", check.streaming);
  await shot("final.png");
  console.log("  页面异常:", errs.length ? JSON.stringify(errs.slice(0,3)) : "无");
  ws.close(); process.exit(0);
});
