/* 钱包：余额、充值、账单一目了然
 * 归属：这个文件独占；接口 /api/wallet/**（都要登录）
 */

const W = { info: null, loading: false };

/** 金额一律用「分」传，展示时转成元。 */
function money(cents) {
  const c = Number(cents || 0);
  return (c / 100).toFixed(2);
}

async function walletRefresh() {
  if (!S.user) { W.info = null; return null; }
  try {
    W.info = await api('/api/wallet');
    return W.info;
  } catch (e) { return null; }
}

/** 侧栏那个余额胶囊（登录后在用户名下面）。 */
function walletChipHTML() {
  if (!S.user) return '';
  const bal = W.info ? money(W.info.balanceCents) : '—';
  return `<span class="wchip" onclick="event.stopPropagation();openWallet()" title="点击充值">¥${bal}</span>`;
}

function openWallet() {
  if (!S.user) { toast('先登录'); go('me'); return; }
  const host = document.getElementById('modalHost');
  const info = W.info || {};
  const m = document.createElement('div');
  m.id = 'walletMask';
  m.className = 'mask';
  m.innerHTML = `
    <div class="panel" style="width:min(480px,100%)">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">钱包</h2>
        <button class="btn sm ghost" onclick="document.getElementById('walletMask').remove()">关闭</button>
      </div>

      <div style="margin:16px 0 6px">
        <div class="big" style="font-size:34px">¥${money(info.balanceCents)}</div>
        <div style="font-size:12px;color:#8A909C">当前余额</div>
      </div>

      <div class="card" style="margin-top:10px;padding:12px">
        <div class="kv"><span>一场费用</span><b>约 ¥${money(info.estimateCents)}</b></div>
        <div class="kv"><span>模型成本</span><b>${info.centsPer1kTokens || 0} 分 / 千 token（按实际用量）</b></div>
        <div class="kv"><span>服务费</span><b>${info.serviceFeeCents || 0} 分 / 场</b></div>
        <div style="font-size:11.5px;color:#A8ADB8;margin-top:6px">
          开局预扣预估费用，打完按实际 token 用量多退少补。
        </div>
      </div>

      <div style="margin-top:14px">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${[100, 500, 1000, 2000].map(c => `<button class="btn sm ghost" onclick="doRecharge(${c})">充 ¥${money(c)}</button>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:14px;padding:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b style="font-size:12.5px">用自己的 API</b>
          <span id="vLlmState" style="font-size:11.5px;color:#8A909C">读取中…</span>
        </div>
        <div style="font-size:11.5px;color:#A8ADB8;margin:4px 0 8px">
          填自己的 key 或本地模型地址跑对局：完全免费，平台一分不收。
        </div>
        <div id="vLlmBlock">
          <div class="field" style="margin-bottom:8px">
            <label>Base URL</label>
            <input id="vLlmBase" class="vinput" placeholder="https://api.deepseek.com/v1" style="width:100%;background:#FCFBF8;border:1px solid #E6E3DC;border-radius:9px;padding:8px 10px;color:#1A1D24;font-size:13px">
          </div>
          <div class="field" style="margin-bottom:8px">
            <label>模型</label>
            <input id="vLlmModel" class="vinput" placeholder="deepseek-chat" style="width:100%;background:#FCFBF8;border:1px solid #E6E3DC;border-radius:9px;padding:8px 10px;color:#1A1D24;font-size:13px">
          </div>
          <div class="field" style="margin-bottom:10px">
            <label>API Key（留空表示不改）</label>
            <input id="vLlmKey" type="password" class="vinput" placeholder="sk-…" style="width:100%;background:#FCFBF8;border:1px solid #E6E3DC;border-radius:9px;padding:8px 10px;color:#1A1D24;font-size:13px">
          </div>
          <div class="row" style="gap:8px">
            <button class="btn sm ghost" onclick="saveLlmProfile(true)">保存并启用</button>
            <button class="btn sm ghost" onclick="saveLlmProfile(false)">停用</button>
            <button class="btn sm ghost" onclick="testLlm()">测试连通</button>
          </div>
          <div id="vLlmMsg" style="font-size:11.5px;margin-top:8px;color:#8A909C"></div>
        </div>
      </div>

      <div style="margin-top:16px">
        <b style="font-size:12.5px">最近流水</b>
        <div id="walletTx" style="margin-top:6px"><div class="empty" style="padding:12px 0">加载中…</div></div>
      </div>
    </div>`;
  host.appendChild(m);
  refreshWalletTx();
  if (typeof loadLlmProfile === 'function') loadLlmProfile();
}

async function refreshWalletTx() {
  const box = document.getElementById('walletTx');
  if (!box) return;
  try {
    const d = await api('/api/wallet/history?limit=10');
    const list = d.list || [];
    box.innerHTML = list.length ? list.map(x => `
      <div class="kv" style="font-size:12px">
        <span>${esc(x.note || x.kind)}</span>
        <b style="color:${x.amount_cents >= 0 ? '#0E9F6E' : '#C0392B'}">${x.amount_cents >= 0 ? '+' : ''}${money(x.amount_cents)} 元</b>
      </div>`).join('') : '<div class="empty" style="padding:12px 0">还没有流水</div>';
  } catch (e) {
    box.innerHTML = '<div class="empty" style="padding:12px 0">加载失败</div>';
  }
}

async function doRecharge(cents) {
  try {
    // 1) 下单（此时不入账）
    const o = await api('/api/pay/orders', { method: 'POST', body: { amountCents: cents } });

    // 2) 模拟收银台：真实场景这里跳转微信/支付宝
    const ok = confirm('模拟收银台\n\n应付 ¥' + money(cents) + '\n订单 ' + o.orderId +
      '\n\n点击「确定」= 已付款（不会真实扣款）');
    if (!ok) { toast('已取消支付'); return; }

    // 3) 支付回调（带签名，服务端验签 + 幂等入账）
    const r = await api('/api/pay/callback', {
      method: 'POST',
      body: { orderId: o.orderId, amountCents: cents, sign: o.sign, tradeNo: 'MOCK-' + Date.now() }
    });
    W.info = await walletRefresh();
    toast(r.already ? '这笔订单已入账过' : '支付成功，余额 ¥' + money(r.balanceCents));
    const mask = document.getElementById('walletMask');
    if (mask) mask.remove();
    openWallet();
    render();
  } catch (e) { toast('支付失败：' + e.message); }
}

/** 打完一场后的账单条（复盘页用） */
function billHTML(billTokens) {
  if (!S.user || !billTokens) return '';
  const info = W.info || {};
  const per1k = info.centsPer1kTokens || 3;
  const fee = info.serviceFeeCents || 30;
  const model = Math.ceil(billTokens / 1000 * per1k);
  const total = model + fee;
  return `<div class="card" style="margin-top:12px;padding:12px 14px;background:#FBFCFE;border-color:#DCE3F5">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:12.5px">本场费用</b>
      <b style="font-size:14px">¥${money(total)}</b>
    </div>
    <div class="kv"><span>模型成本</span><b>${billTokens} token → ¥${money(model)}</b></div>
    <div class="kv"><span>服务费</span><b>${S.match && S.match.tier === 'BYOK' ? '免费' : '¥' + money(fee)}</b></div>
    <div style="font-size:11.5px;color:#A8ADB8;margin-top:4px">已从钱包扣除；余额 ¥${money(info.balanceCents)}</div>
  </div>`;
}


// ---------- 用自己的 API（BYOK） ----------
async function loadLlmProfile() {
  const st = document.getElementById('vLlmState');
  try {
    const d = await api('/api/llm/profile');
    if (st) st.textContent = d.enabled ? '已启用 · ' + (d.keyMask || '') : (d.configured ? '已保存（未启用）' : '未配置');
    const b = document.getElementById('vLlmBase'); if (b && d.baseUrl) b.value = d.baseUrl;
    const m = document.getElementById('vLlmModel'); if (m && d.model) m.value = d.model;
  } catch (e) { if (st) st.textContent = '读取失败'; }
}

async function saveLlmProfile(enabled) {
  const msg = document.getElementById('vLlmMsg');
  try {
    const d = await api('/api/llm/profile', {
      method: 'POST',
      body: {
        baseUrl: (document.getElementById('vLlmBase') || {}).value || '',
        model: (document.getElementById('vLlmModel') || {}).value || '',
        apiKey: (document.getElementById('vLlmKey') || {}).value || '',
        enabled: !!enabled
      }
    });
    if (msg) msg.textContent = enabled ? ('已启用 · ' + (d.keyMask || '')) : '已停用（改用平台额度）';
    const k = document.getElementById('vLlmKey'); if (k) k.value = '';
    loadLlmProfile();
  } catch (e) { if (msg) msg.textContent = '保存失败：' + e.message; }
}

async function testLlm() {
  const msg = document.getElementById('vLlmMsg');
  if (msg) msg.textContent = '测试中…';
  try {
    const d = await api('/api/llm/test', { method: 'POST' });
    if (msg) msg.textContent = d.ok
      ? ('连通正常 · ' + d.latencyMs + 'ms · 模型回「' + (d.reply || '') + '」')
      : ('失败：' + (d.reason || '未知原因'));
  } catch (e) { if (msg) msg.textContent = '测试失败：' + e.message; }
}
