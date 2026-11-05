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
    <div class="card" style="margin-top:14px;border-color:#DCE3F5;background:#FBFCFE">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <b style="font-size:13.5px">AI 评审团</b>
          <span style="font-size:11.5px;color:#8A909C;margin-left:8px">4 位裁判独立打分 · 取平均</span>
        </div>
        <div id="panelBtnBox">
          <button class="btn sm ghost" onclick="runPanel()">让裁判点评</button>
        </div>
      </div>
      <div style="font-size:11.5px;color:#A8ADB8;margin-top:6px">
        结构 / 交锋 / 表达 / 论据 四个视角各评一次，找出「多位裁判都提到」的问题——那才是真问题。约 5–8 秒，一次约 0.02 元。
      </div>
      <div id="panelBody"></div>
    </div>

    <div class="row" style="margin-top:16px">
      <button class="btn primary" onclick="go('solo')">再来一场</button>
      <button class="btn ghost" onclick="go('diag')">看能力画像</button>
      <button class="btn ghost" onclick="go('records')">辩论记录</button>
    </div>
  </div>`;
}


// ---------- AI 评审团（4 位裁判并行打分，取平均） ----------
const PANEL_COLORS = { 结构裁判:'#3A63FF', 交锋裁判:'#C0392B', 表达裁判:'#0E9F6E', 论据裁判:'#C2671E' };

async function runPanel(){
  const box = document.querySelector('#panelBody');
  const btnBox = document.querySelector('#panelBtnBox');
  if (!S.matchId || !box) return;
  box.innerHTML = '<div class="empty" style="padding:16px 0">四位裁判正在看你的发言…</div>';
  if (btnBox) btnBox.innerHTML = '<span style="font-size:12px;color:#A8ADB8">评审中…</span>';
  try {
    const d = await api('/api/matches/' + S.matchId + '/panel');
    if (!d || !d.ok) {
      box.innerHTML = '<div class="empty" style="padding:14px 0">' + esc((d && d.reason) || '评审团暂时不可用') + '</div>';
      if (btnBox) btnBox.innerHTML = '<button class="btn sm ghost" onclick="runPanel()">重试</button>';
      return;
    }
    renderPanel(d.panel, box);
    if (btnBox) btnBox.innerHTML = '<button class="btn sm ghost" onclick="runPanel(true)">重新评一次</button>';
  } catch (e) {
    box.innerHTML = '<div class="empty" style="padding:14px 0">评审失败：' + esc(e.message) + '</div>';
    if (btnBox) btnBox.innerHTML = '<button class="btn sm ghost" onclick="runPanel()">重试</button>';
  }
}

function renderPanel(p, box){
  const judges = (p.judges || []).filter(j => !j.failed);
  const avg = p.average, lo = p.min, hi = p.max;
  const spread = hi - lo;
  box.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-top:14px">
      <div>
        <div class="big" style="font-size:38px">${avg}<small>分</small></div>
        <div style="font-size:11.5px;color:#8A909C">裁判平均 · 区间 ${lo}–${hi}</div>
      </div>
      <div style="flex:1;min-width:220px">
        ${judges.map(j => `
          <div class="dim">
            <span class="lb" title="${esc(j.lens || '')}">${esc(j.name)}</span>
            <div class="dbar"><i style="width:${j.score}%;background:${PANEL_COLORS[j.name] || '#3A63FF'}"></i></div>
            <b>${j.score}</b>
          </div>`).join('')}
      </div>
    </div>
    <div style="font-size:12.5px;color:#4A5568;margin-top:8px">${esc(p.summary || '')}${spread >= 20 ? ' <b style="color:#C2671E">（分歧大 = 有争议点，见下）</b>' : ''}</div>

    ${(p.consensus || []).length ? `
      <div style="margin-top:14px">
        <b style="font-size:12.5px;color:#C0392B">多位裁判都提到的问题</b>
        ${p.consensus.map(c => `
          <div style="background:#fff;border:1px solid #EDEFF5;border-radius:10px;padding:10px 12px;margin-top:8px">
            <div style="font-size:11.5px;color:#8A909C">${esc(c.category || '')} · ${esc(c.agreed || '')}</div>
            ${c.quote ? `<div style="font-size:12.5px;color:#4A5568;margin:3px 0">你写的「${esc(c.quote)}」</div>` : ''}
            <div style="font-size:12.5px;color:#C0392B">${esc(c.why || '')}</div>
            <div style="font-size:12.5px;color:#0E9F6E;margin-top:4px">改成：${esc(c.fix || '')}</div>
          </div>`).join('')}
      </div>` : ''}

    <div style="margin-top:14px">
      <b style="font-size:12.5px">各裁判的加/扣分点</b>
      ${judges.map(j => `
        <div style="background:#fff;border:1px solid #EDEFF5;border-radius:10px;padding:10px 12px;margin-top:8px">
          <div class="row" style="justify-content:space-between">
            <b style="font-size:12.5px;color:${PANEL_COLORS[j.name] || '#3A63FF'}">${esc(j.name)}</b>
            <span style="font-size:12px;color:#8A909C">${j.score} 分 · ${esc(j.lens || '')}</span>
          </div>
          ${(j.scoringPoints||[]).length ? `<div style="margin-top:6px">${j.scoringPoints.map(s => `<div style="font-size:12px;color:#0E9F6E">＋ ${esc(s)}</div>`).join('')}</div>` : ''}
          ${(j.weaknesses||[]).slice(0,2).map(w => `<div style="margin-top:6px;font-size:12px;color:#4A5568">－ ${esc(w.why || '')} <span style="color:#0E9F6E">（${esc((w.fix||'').slice(0,40))}）</span></div>`).join('')}
          ${j.comment ? `<div style="font-size:11.5px;color:#A8ADB8;margin-top:6px">${esc(j.comment)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}
