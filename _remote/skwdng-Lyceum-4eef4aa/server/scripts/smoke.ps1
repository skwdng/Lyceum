[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8080'

function J($method, $path, $body) {
    if ($method -eq 'GET') { return Invoke-RestMethod "$base$path" -TimeoutSec 15 }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress -Depth 6))
    return Invoke-RestMethod "$base$path" -Method $method -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 30
}

Write-Host '=== 1. AI 审核 ===' -ForegroundColor Cyan
$bad = J POST '/api/topics/audit' @{ title = 'AI 好不好' }
Write-Host ("「AI 好不好」 → {0} · {1}" -f $bad.result, $bad.reason)
$bad.suggestions | ForEach-Object { "   建议：$_" }
$good = J POST '/api/topics/audit' @{ title = '该不该把 AI 生成内容算作学术不端' }
Write-Host ("「该不该把…学术不端」 → {0} · {1}（cached={2}）" -f $good.result, $good.reason, $good.cached)
$again = J POST '/api/topics/audit' @{ title = 'AI 好不好' }
Write-Host ("同一句再审 → cached={0}" -f $again.cached)

Write-Host ''
Write-Host '=== 2. 开局（自填题 + 占 A1,A2） ===' -ForegroundColor Cyan
$m = J POST '/api/matches' @{ userId = 'u1'; title = '该不该把 AI 生成内容算作学术不端'; seats = @('A1','A2'); mode = 'FULL' }
$mid = $m.matchId
Write-Host ("matchId={0} topicId={1} seats={2}" -f $mid, $m.topicId, $m.seats)

Write-Host ''
Write-Host '=== 3. 跑到结束（AI 自动推进 + 我轮到时提交） ===' -ForegroundColor Cyan
$myTexts = @(
  '我方立论：判断这道题要看三条——能不能被监督、执行主体是否明确、出了问题能否追责。以试点地区为例，配套成本的核算口径一直缺位。',
  '我方驳立论：对方把「技术可行」直接推成「制度应当」，这是实然到应然的跳跃，中间少了一步。',
  '我方质询：我请教对方，你方说的成本过高，具体高在哪个科目？没有可核查口径，这就只是印象。',
  '我方自由辩：对方把风险直接推成了禁止，风险存在只支持「应当规范」，支撑不到「不应推进」。',
  '我方总结：整场下来对方始终回避成本由谁承担，我方结论是值得做，但要按可监督的路径做。',
  '（补充）这一层我再补一句：执行主体在现行制度里已经存在，只是没有启用。'
)
$i = 0
$deadline = (Get-Date).AddSeconds(150)
while ((Get-Date) -lt $deadline) {
    $d = J GET "/api/matches/$mid"
    $st = $d.match.status
    if ($st -ne 'RUNNING') { break }
    if ($d.waitingForMe) {
        $txt = $myTexts[[Math]::Min($i, $myTexts.Count - 1)]
        $i++
        $r = J POST "/api/matches/$mid/turns" @{ content = $txt; inputType = 'kb' }
        Write-Host ("  我发言 #{0}（第 {1} 步）→ 下一步 {2}" -f $i, $d.currentStep.no, $r.step)
    } else {
        Start-Sleep -Milliseconds 700
    }
}
$final = J GET "/api/matches/$mid"
Write-Host ("最终状态={0} · 我发言 {1} 次 · 回合记录 {2} 条" -f $final.match.status, $i, ($final.turns | Measure-Object).Count)

Write-Host ''
Write-Host '=== 4. 复盘 ===' -ForegroundColor Cyan
$rev = J GET "/api/matches/$mid/review"
$s = $rev.score
Write-Host ("总分 {0} · 立论 {1} 论证 {2} 表达 {3} 应变 {4} 论据 {5}" -f $s.total, $s.matter, $s.method, $s.manner, $s.adapt, $s.evidence)
Write-Host ("证据：{0}" -f $s.quote)
Write-Host ("问题：{0}" -f $s.problem)
Write-Host ("改法：{0}" -f $s.improve)

Write-Host ''
Write-Host '=== 5. 热辩榜 ===' -ForegroundColor Cyan
$hot = J GET '/api/hot?n=5'
Write-Host ("key={0} · 成员 {1}" -f $hot.key, $hot.card)
$hot.list | ForEach-Object { "  #{0} {1}  {2}分  来源={3}" -f $_.rank, $_.title, $_.score, $_.source }

Write-Host ''
Write-Host '=== 6. 记录 / 画像 ===' -ForegroundColor Cyan
$rec = J GET '/api/records?userId=u1'
$rec | Select-Object -First 3 | ForEach-Object { "  记录：{0} · {1} · {2}分" -f $_.topic_title, $_.seats, $_.total }
$diag = J GET '/api/diag?userId=u1'
Write-Host ("  五维：" + (($diag.dims.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' '))
Write-Host ("  连续天数：" + $diag.streak)
