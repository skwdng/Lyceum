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

      <div style="margin-top:16px">
        <b style="font-size:12.5px">最近流水</b>
        <div id="walletTx" style="margin-top:6px"><div class="empty" style="padding:12px 0">加载中…</div></div>
      </div>
    </div>`;
  host.appendChild(m);
  refreshWalletTx();
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
    <div class="kv"><span>服务费</span><b>¥${money(fee)}</b></div>
    <div style="font-size:11.5px;color:#A8ADB8;margin-top:4px">已从钱包扣除；余额 ¥${money(info.balanceCents)}</div>
  </div>`;
}
