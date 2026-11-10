/* 能力分析：六维雷达（动画）、维度条（0→目标值动画）、漏洞统计
 * 归属：见 docs/协作规范.md
 */

/** 六维雷达。多边形用 scale(0)→scale(1) 从中心长出来，条形图由 0 涨到目标值。 */
function radar(dims){
  const keys = Object.keys(dims), n = keys.length || 6, R = 84, cx = 120, cy = 120;
  const pt = (i, f) => {
    const a = -Math.PI/2 + i*2*Math.PI/n, r = R*f;
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  };
  const ring = f => Array.from({length:n}, (_,i) => pt(i,f).join(',')).join(' ');
  const values = keys.map(k => Math.max(0, Math.min(100, Number(dims[k]) || 0)));
  const shape = values.map((v,i) => pt(i, v/100).join(',')).join(' ');

  return `<svg viewBox="0 0 240 240" style="width:100%;max-width:340px;overflow:visible">
    <!-- 底网：4 圈 + 6 条轴 -->
    ${[0.25,0.5,0.75,1].map(f => `<polygon points="${ring(f)}" fill="none" stroke="#EDEAE3"/>`).join('')}
    ${Array.from({length:n},(_,i) => {
      const [x,y] = pt(i,1);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#EDEAE3"/>`;
    }).join('')}

    <!-- 数据多边形：整体从中心放大（CSS 过渡），视觉上就是"从中心向六方长出来" -->
    <g class="radar-grow" style="transform-origin:${cx}px ${cy}px">
      <polygon points="${shape}" fill="rgba(47,91,234,.18)" stroke="#2F5BEA" stroke-width="2"
               stroke-linejoin="round"/>
      ${values.map((v,i) => {
        const [x,y] = pt(i, v/100);
        return `<circle cx="${x}" cy="${y}" r="2.6" fill="#2F5BEA"/>`;
      }).join('')}
    </g>

    <!-- 轴名 + 数值 -->
    ${keys.map((k,i) => {
      const [x,y] = pt(i, 1.2);
      return `<text x="${x}" y="${y}" font-size="10.5" fill="#6B7280" text-anchor="middle"
                    dominant-baseline="middle">${k}</text>
              <text x="${x}" y="${y + 12}" font-size="9.5" fill="#A8ADB8" text-anchor="middle"
                    dominant-baseline="middle">${values[i]}</text>`;
    }).join('')}
  </svg>`;
}

/** 条形图：先渲染成 0 宽，下一帧再设目标宽度，靠 CSS 过渡涨上去。 */
function bars(dims, delta){
  const keys = Object.keys(dims);
  if (!keys.length) return '<div class="empty">还没有数据，打一场就有了</div>';
  const arrow = v => v > 0 ? `<span style="color:#0E9F6E;font-size:11.5px">↑${v}</span>`
                  : v < 0 ? `<span style="color:#C0392B;font-size:11.5px">↓${-v}</span>`
                  : `<span style="color:#A8ADB8;font-size:11.5px">—</span>`;
  return keys.map((k,i) => {
    const v = Math.max(0, Math.min(100, Number(dims[k]) || 0));
    return `<div class="dim">
      <span class="lb">${k}</span>
      <div class="dbar"><i class="dim-fill" data-v="${v}" style="width:0%;transition:width .9s cubic-bezier(.22,.9,.3,1) ${i*90}ms"></i></div>
      <b class="dim-num" data-v="${v}">0</b>${arrow(delta[k] || 0)}
    </div>`;
  }).join('');
}

/** 动画启动：条形图涨宽 + 数字滚动 + 雷达放大。渲染后调用一次。 */
function diagAnimate(){
  // 雷达
  document.querySelectorAll('.radar-grow').forEach(g => {
    g.style.transform = 'scale(.02)';
    g.style.opacity = '0';
    g.style.transition = 'transform .9s cubic-bezier(.22,.9,.3,1), opacity .5s ease';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      g.style.transform = 'scale(1)';
      g.style.opacity = '1';
    }));
  });

  // 条形图：宽度 + 数字一起涨
  document.querySelectorAll('.dim-fill').forEach(el => {
    const target = Number(el.dataset.v) || 0;
    requestAnimationFrame(() => { el.style.width = target + '%'; });
  });
  document.querySelectorAll('.dim-num').forEach(el => {
    const target = Number(el.dataset.v) || 0;
    const t0 = performance.now(), dur = 900;
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function viewDiag(){
  const d = S.diag || {dims:{}, flaws:{}, streak:0, delta:{}, samples:0};
  const dims = d.dims || {};
  const delta = d.delta || {};
  const n = Object.keys(dims).length;
  const win = d.window || 0;
  const total = d.total || d.samples || 0;
  const opt = (v, label) => `<button class="btn sm ${(win === v ? "" : "ghost")}" onclick="diagWindow(${v})">${label}</button>`;
  return `
  <h1 class="pg">能力分析</h1>
  <p class="sub">${win > 0 ? "最近 " + win + " 场" : "全部 " + (total || 0) + " 场"}的平均 · 只和你自己比，没有段位也没有排名。</p>
  <div class="grid g2">
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <b style="font-size:13px">${n || 6} 维画像</b>
        <div class="row" style="gap:6px">
          ${opt(3, "最近 3 场")}${opt(5, "最近 5 场")}${opt(10, "最近 10 场")}${opt(0, "全部 " + (total || ""))}
        </div>
      </div>
      <div class="row" style="align-items:center;margin-top:6px">
        <div style="flex:1;min-width:250px">${radar(dims)}</div>
        <div style="flex:1;min-width:220px">${bars(dims, delta)}</div>
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

/** 切换统计窗口：只影响展示，不改数据库里的累计平均 */
async function diagWindow(n){
  S.diagWindow = n;
  try {
    S.diag = await api('/api/diag' + (n > 0 ? '?n=' + n : ''));
    render();            // render 里会调 diagAnimate()，动画自动重放
  } catch (e) { toast('加载失败：' + e.message); }
}