/* 热辩榜
 * 归属：见 docs/协作规范.md
 */

function viewHot(){
  const list = S.hot?.list || [];
  const max = list.length ? list[0].score : 1;
  return `
  <h1 class="pg">热辩榜</h1>
  <p class="sub">按热度实时排序，数据存在 Redis ZSET；热度随时间衰减，避免旧题霸榜。</p>
  <div class="grid g2">
    <div class="card">
      <table class="t">
        <tr><th style="width:44px">排名</th><th>辩题</th><th style="width:110px">热度</th><th style="width:64px">分数</th><th style="width:56px"></th></tr>
        ${list.map(x => `<tr>
          <td><b style="color:${x.rank<=3?'#B7791F':'#6B7280'}">${x.rank}</b></td>
          <td><div style="font-size:13px">${esc(x.title)}</div>
              <div style="font-size:11px;color:#8A909C">${x.source==='custom'?'自定义':'官方'} · ${esc(x.topicId)}</div></td>
          <td><div class="heatbar"><i style="width:${Math.round(x.score/max*100)}%"></i></div></td>
          <td class="mono" style="color:#2F5BEA;font-weight:600">${x.score}</td>
          <td><button class="btn sm ghost" onclick="openSeatPanel('${x.topicId}')">开辩</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">暂无数据</td></tr>'}
      </table>
    </div>
    <div class="card">
      <b style="font-size:13px">Redis 里的真实写法</b>
      <div class="codebox" style="margin-top:8px">
<span class="c"># 开辩 / 发言 / 打完，写入当日榜单</span>
<span class="k">ZINCRBY</span> ${esc(S.hot?.key || 'hot:debate:today')} 2 topic:t3
<span class="c"># 取前 10 名（带分数）</span>
<span class="k">ZREVRANGE</span> ${esc(S.hot?.key || 'hot:debate:today')} 0 9 <span class="k">WITHSCORES</span>
<span class="c"># 查名次 / 衰减 / 过期</span>
<span class="k">ZREVRANK</span> ${esc(S.hot?.key || 'hot:debate:today')} topic:t3
<span class="k">ZINCRBY</span>  ${esc(S.hot?.key || 'hot:debate:today')} -0.5 topic:t3
<span class="k">EXPIRE</span>   ${esc(S.hot?.key || 'hot:debate:today')} 172800
      </div>
      <div style="font-size:11.5px;color:#8A909C;margin-top:10px">
        当前榜单成员 ${S.hot?.card ?? 0} 个。后端默认用内存实现，接真 Redis 只需换 HotRank 实现类。
      </div>
    </div>
  </div>`;
}
