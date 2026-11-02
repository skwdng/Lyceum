/* 辩论记录
 * 归属：见 docs/协作规范.md
 */

function viewRecords(){
  const rs = S.records || [];
  const avg = rs.length ? Math.round(rs.reduce((a,b)=>a+b.total,0)/rs.length) : '—';
  return `
  <h1 class="pg">辩论记录</h1>
  <p class="sub">没有段位、没有排名，只记录你打过什么。</p>
  <div class="grid g3" style="margin-bottom:14px">
    <div class="card"><div style="font-size:12px;color:#8A909C">总场次</div><div class="big" style="font-size:30px">${rs.length}</div></div>
    <div class="card"><div style="font-size:12px;color:#8A909C">平均分</div><div class="big" style="font-size:30px">${avg}</div></div>
    <div class="card"><div style="font-size:12px;color:#8A909C">总发言回合</div><div class="big" style="font-size:30px">${rs.reduce((a,b)=>a+b.turns,0)}</div></div>
  </div>
  <div class="card">
    ${rs.length ? `<table class="t">
      <tr><th>辩题</th><th>席位</th><th>发言</th><th>得分</th></tr>
      ${rs.map(r => `<tr><td>${esc(r.topic_title)}</td><td class="mono">${esc(r.seats)}</td>
        <td class="mono">${r.turns}</td><td><b>${r.total}</b></td></tr>`).join('')}
    </table>` : '<div class="empty">还没有记录，去单人辩论打一场</div>'}
  </div>`;
}
