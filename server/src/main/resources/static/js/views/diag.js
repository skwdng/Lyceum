/* 能力诊断：五维雷达、漏洞统计
 * 归属：见 docs/协作规范.md
 */

function radar(dims){
  const keys = Object.keys(dims), n = keys.length, R = 84, cx = 120, cy = 120;
  const pt = (k, i, f) => {
    const a = -Math.PI/2 + i*2*Math.PI/n, r = R*f;
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  };
  const outer = keys.map((k,i) => pt(k,i,1));
  const pts = keys.map((k,i) => pt(k,i, (dims[k]||0)/100));
  return `<svg viewBox="0 0 240 240" style="width:100%;max-width:320px">
    ${[0.25,0.5,0.75,1].map(f => `<polygon points="${outer.map(([x,y])=>[cx+(x-cx)*f, cy+(y-cy)*f].join(',')).join(' ')}"
       fill="none" stroke="#EDEAE3"/>`).join('')}
    ${outer.map(([x,y]) => `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#EDEAE3"/>`).join('')}
    <polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="rgba(47,91,234,.18)" stroke="#2F5BEA" stroke-width="2"/>
    ${keys.map((k,i) => { const [x,y] = pt(k,i,1.18);
      return `<text x="${x}" y="${y}" font-size="10" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">${k}</text>`; }).join('')}
  </svg>`;
}

function viewDiag(){
  const d = S.diag || {dims:{}, flaws:{}, streak:0, delta:{}, samples:0};
  const dims = d.dims || {};
  const delta = d.delta || {};
  const arrow = v => v > 0 ? `<span style="color:#0E9F6E;font-size:11.5px">↑${v}</span>`
                  : v < 0 ? `<span style="color:#C0392B;font-size:11.5px">↓${-v}</span>`
                  : `<span style="color:#A8ADB8;font-size:11.5px">—</span>`;
  return `
  <h1 class="pg">能力诊断</h1>
  <p class="sub">滑动平均（最近 ${d.samples || 0} 场）· 只和你自己比，没有段位也没有排名。</p>
  <div class="grid g2">
    <div class="card">
      <b style="font-size:13px">五维画像</b>
      <div class="row" style="align-items:center;margin-top:6px">
        <div style="flex:1;min-width:240px">${radar(dims)}</div>
        <div style="flex:1;min-width:200px">
          ${Object.entries(dims).map(([k,v]) => `<div class="dim"><span class="lb">${k}</span>
            <div class="dbar"><i style="width:${v}%"></i></div><b>${v}</b>${arrow(delta[k] || 0)}</div>`).join('')
            || '<div class="empty">还没有数据，打一场就有了</div>'}
        </div>
      </div>
      <div style="font-size:11.5px;color:#8A909C;margin-top:8px">
        箭头 = 本场 vs 累计均值。样本少于 3 场时曲线波动大，别急着下结论。
      </div>
    </div>
    <div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><b style="font-size:13px">练习连续性</b>
          <span class="tag g">连续 ${d.streak || 0} 天</span></div>
        <div style="font-size:12px;color:#8A909C;margin-top:8px">中断即归零，不和别人比。</div>
      </div>
      <div class="card" style="margin-top:12px">
        <b style="font-size:13px">漏洞统计（错题本）</b>
        <div style="font-size:11.5px;color:#8A909C;margin:4px 0 6px">命中即记一次，不是写死的示例数据。</div>
        <table class="t" style="margin-top:6px">
          ${Object.entries(d.flaws || {}).map(([k,v]) => `<tr><td>${esc(k)}</td>
            <td class="mono" style="text-align:right">${v} 次</td></tr>`).join('') || '<tr><td class="empty">暂无</td></tr>'}
        </table>
      </div>
    </div>
  </div>`;
}
