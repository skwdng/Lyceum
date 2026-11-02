/* 复盘：分数、证据、逐回合点评
 * 归属：见 docs/协作规范.md
 */

function viewReview(){
  const r = S.review?.score;
  if (!r) return `<div class="empty">没有复盘数据</div>`;
  return `
  <h1 class="pg">本场复盘</h1>
  <p class="sub">${esc(S.match?.topic_title || '')} · 你占 ${esc(S.match?.my_seats || '')} · 发言 ${r.turns} 次${r.timeout?' · 超时 '+r.timeout+' 次':''}</p>
  <div class="card">
    <div class="row" style="align-items:flex-end;gap:30px;flex-wrap:wrap">
      <div><div class="big">${r.total}<small>分</small></div>
        <div style="font-size:12px;color:#8A909C;margin-top:4px">三维加权 · 已写入记录</div></div>
      <div style="flex:1;min-width:240px">
        ${[['立论','matter','25%'],['论证','method','30%'],['表达','manner','15%'],['应变','adapt','20%'],['论据','evidence','10%']].map(([k,f,w]) => {
          const v = r[f];
          return `<div class="dim"><span class="lb" title="权重 ${w}">${k}</span><div class="dbar"><i style="width:${v}%"></i></div><b>${v}</b></div>`;
        }).join('')}
        ${r.collab ? `<div class="dim"><span class="lb">协同</span><div class="dbar"><i style="width:${r.collab*8}%;background:#0E9F6E"></i></div><b>+${r.collab}</b></div>` : ''}
      </div>
    </div>
    ${Object.keys(r.flaws || {}).length ? `<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:#6B7280">本场检出：</span>
      ${Object.entries(r.flaws).map(([k,v]) => `<span class="tag o">${k} × ${v}</span>`).join('')}
    </div>` : ""}
      ${r.flawTries ? `<div class="row" style="gap:8px;margin-top:10px">
        <span style="font-size:12.5px;color:#6B7280">抓漏：</span>
        <b style="color:${r.flawHits > 0 ? '#0E9F6E' : '#C0392B'}">${r.flawHits}/${r.flawTries}</b>
        <span style="font-size:11.5px;color:#8A909C">对方故意埋的逻辑漏洞，你抓对了几处</span>
      </div>` : ''}
      ${(r.perTurn||[]).length ? `<div style="margin-top:14px">
        <b style="font-size:12.5px">逐回合点评</b>
        <table class="t" style="margin-top:6px">
          <tr><th style="width:46px">步</th><th style="width:64px">环节</th><th style="width:56px">字数</th><th style="width:64px">判定</th><th>说明</th></tr>
          ${(r.perTurn||[]).map(p => `<tr>
            <td class="mono">${p.step}</td><td>${p.seg}</td><td class="mono">${p.chars}</td>
            <td><span class="tag ${p.verdict === '有交锋' ? 'g' : p.verdict === '脱靶' ? 'o' : 'r'}">${p.verdict}</span></td>
            <td style="font-size:12px;color:#4A5568">${p.note}</td></tr>`).join('')}
        </table>
      </div>` : ''}
    <div class="ev">
      <div class="k">证据（你的原句）</div><div>${esc(r.quote || '（本轮未发言）')}</div>
      <div class="row" style="gap:20px;margin-top:10px;font-size:12.5px">
        <div>引用论据：<b style="color:${r.cited > 0 ? '#0E9F6E' : '#C0392B'}">${r.cited} 条</b></div>
        <div>编造数字：<b style="color:${(r.fabricated||[]).length ? '#C0392B' : '#0E9F6E'}">${(r.fabricated||[]).length} 处</b>
          ${(r.fabricated||[]).length ? `<span style="color:#C0392B">（${(r.fabricated||[]).join('、')}）</span>` : ''}</div>
      </div>
      <div class="k" style="margin-top:10px">问题</div><div style="color:#C0392B">${esc(r.problem)}</div>
      <div class="k" style="margin-top:10px">改成这样</div><div style="color:#0E9F6E">${esc(r.improve)}</div>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn primary" onclick="go('solo')">再来一场</button>
      <button class="btn ghost" onclick="go('diag')">看能力画像</button>
      <button class="btn ghost" onclick="go('records')">辩论记录</button>
    </div>
  </div>`;
}
