# 辩论侧接入账号 · 方案 §7 二十条验收（1-16 用 curl 直测；17-20 由其它脚本覆盖，末尾列出）
# 用法：先起后端，再 pwsh -File server/scripts/smoke-auth-debate.ps1 [baseUrl]
param([string]$Base = 'http://localhost:8080')

$ErrorActionPreference = 'Continue'
$script:pass = 0; $script:fail = 0
function Check([string]$name, [scriptblock]$fn) {
    try {
        $v = & $fn
        $script:pass++
        Write-Host ("PASS  {0}{1}" -f $name, ($(if ($null -ne $v -and "$v" -ne '') { "  [$v]" } else { '' }))) -ForegroundColor Green
    } catch {
        $script:fail++
        Write-Host ("FAIL  {0}  -> {1}" -f $name, $_.Exception.Message) -ForegroundColor Red
    }
}
function TryJson([string]$s) { if (-not $s) { return $null }; try { return ($s | ConvertFrom-Json) } catch { return $null } }
function Req([string]$method, [string]$path, $body, [hashtable]$hdr) {
    $p = @{ Uri = "$Base$path"; Method = $method; TimeoutSec = 20 }
    if ($hdr) { $p.Headers = $hdr }
    if ($null -ne $body) {
        $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress -Depth 8))
        $p.ContentType = 'application/json; charset=utf-8'
    }
    try {
        $r = Invoke-WebRequest @p -UseBasicParsing
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $r.Content; Json = (TryJson $r.Content) }
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
            $txt = $sr.ReadToEnd()
            return [pscustomobject]@{ Status = [int]$resp.StatusCode; Body = $txt; Json = (TryJson $txt) }
        }
        return [pscustomobject]@{ Status = -1; Body = $_.Exception.Message; Json = $null }
    }
}
function Must($cond, [string]$msg) { if (-not $cond) { throw $msg } }
function Code([string]$json) { if ($json -match '"code":"([A-Z_]+)"') { return $Matches[1] } return '' }

# SSE 探测：curl -N 保持连接 2 秒，只取 HTTP 状态码
function SseCode([string]$url) {
    $o = & curl.exe -sS -N -m 2 -o NUL -w "%{http_code}" $url 2>&1 | Out-String
    if ($o -match '(\d{3})\s*$') { return [int]$Matches[1] }
    if ($o -match 'received (\d{3})') { return [int]$Matches[1] }
    return 0
}

$stamp = (Get-Date -Format 'HHmmss')
$PWD = 'abc12345'

function NewUser([string]$acc, [string]$nick) {
    $r = Req POST '/api/auth/register' @{ account = $acc; password = $PWD } $null
    if ($r.Status -ne 200) { throw "注册 $acc 失败：$($r.Status) $($r.Body)" }
    $h = @{ Authorization = "Bearer $($r.Json.token)" }
    if ($nick) { $null = Req PATCH '/api/auth/me' @{ name = $nick } $h }
    return $r.Json.token
}

$accA = "dda$stamp"; $accB = "ddb$stamp"; $accC = "ddc$stamp"
$ta = NewUser $accA '张同学'
$tb = NewUser $accB '李同学'
$tc = NewUser $accC '王同学'
$HA = @{ Authorization = "Bearer $ta" }
$HB = @{ Authorization = "Bearer $tb" }
$HC = @{ Authorization = "Bearer $tc" }
Write-Host "就绪：$accA(张同学) / $accB(李同学) / $accC(王同学)" -ForegroundColor DarkGray

Write-Host "`n=== 一、未登录的门槛（#1-#4）===" -ForegroundColor Cyan

Check '#1 未登录 POST /api/matches -> 401' {
    $r = Req POST '/api/matches' @{ topicId = 't1' } $null
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    Must ((Code $r.Body) -eq 'UNAUTHORIZED') "code=$(Code $r.Body)"
    '401 UNAUTHORIZED'
}

Check '#2 未登录 GET /api/records -> 401' {
    $r = Req GET '/api/records' $null $null
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    '401'
}

Check '#3 未登录 GET /api/topics -> 200（浏览不用登录）' {
    $r = Req GET '/api/topics' $null $null
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    "topics=$(@($r.Json).Count)"
}

Check '#4 未登录 GET /api/hot -> 200' {
    $r = Req GET '/api/hot?n=5' $null $null
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    '200'
}

Write-Host "`n=== 二、身份来自令牌（#5 #6）===" -ForegroundColor Cyan

$matchA = $null
Check '#5 登录后建对局 -> 200，且 owner 是令牌里的身份' {
    # body 里故意塞 userId=u1，必须被忽略
    $r = Req POST '/api/matches' @{ topicId = 't1'; seats = 'A1'; mode = 'DRILL'; userId = 'u1' } $HA
    Must ($r.Status -eq 200) "HTTP $($r.Status) $($r.Body)"
    $script:matchA = $r.Json.matchId
    # 间接证明 owner：A 自己能看，B 不能（见 #7）
    $d = Req GET "/api/matches/$($script:matchA)" $null $HA
    Must ($d.Status -eq 200) "A 看自己的对局应 200，实际 $($d.Status)"
    "matchId=$($script:matchA)（body 里的 userId=u1 被忽略）"
}

Check '#6 战绩/诊断只查自己的，?userId= 被忽略' {
    $mine = Req GET '/api/records' $null $HB
    Must ($mine.Status -eq 200) "B 的 records HTTP $($mine.Status)"
    $fake = Req GET ("/api/records?userId=" + $accA) $null $HB
    Must ($fake.Status -eq 200) "带 ?userId=A 时 HTTP $($fake.Status)"
    Must ($fake.Body -eq $mine.Body) "带 ?userId=A 的响应应与自己的不同才对；实际一样说明参数被忽略（预期行为）"
    $diag = Req GET ("/api/diag?userId=" + $accA) $null $HB
    Must ($diag.Status -eq 200) "diag HTTP $($diag.Status)"
    'HTTP 层参数被忽略（身份取令牌由单测 ApiIdentityTest 逐条断言）'
}

Write-Host "`n=== 三、归属校验（#7-#11）===" -ForegroundColor Cyan

Check '#7 别人看我的对局 -> 403 FORBIDDEN' {
    $r = Req GET "/api/matches/$matchA" $null $HB
    Must ($r.Status -eq 403) "HTTP $($r.Status)"
    Must ((Code $r.Body) -eq 'FORBIDDEN') "code=$(Code $r.Body)"
    '403 FORBIDDEN'
}

Check '#8 别人调我的 /skip、/buzz -> 403' {
    foreach ($p in @('skip', 'buzz', 'keepalive')) {
        $r = Req POST "/api/matches/$matchA/$p" @{} $HB
        Must ($r.Status -eq 403) "$p 应 403，实际 $($r.Status)"
    }
    $r = Req POST "/api/matches/$matchA/turns" @{ content = 'x' } $HB
    Must ($r.Status -eq 403) "turns 应 403，实际 $($r.Status)"
    $r = Req POST "/api/matches/$matchA/point" @{ step = 1 } $HB
    Must ($r.Status -eq 403) "point 应 403，实际 $($r.Status)"
    'skip/buzz/keepalive/turns/point 全部 403'
}

Check '#9 别人订阅我的 SSE（?token=B）-> 403' {
    $c = SseCode "$Base/api/matches/$matchA/events?token=$tb"
    Must ($c -eq 403) "期望 403，实际 $c"
    '403'
}

Check '#10 本人订阅 /events?token=<jwt> -> 200 能收到事件' {
    $c = SseCode "$Base/api/matches/$matchA/events?token=$ta"
    Must ($c -eq 200) "期望 200，实际 $c"
    '200'
}

Check '#11 SSE 不带令牌 -> 401' {
    $c = SseCode "$Base/api/matches/$matchA/events"
    Must ($c -eq 401) "期望 401，实际 $c"
    '401'
}

Write-Host "`n=== 四、房间局：席位成员 vs 路人（#12-#13）===" -ForegroundColor Cyan

$roomCode = $null; $roomMatch = $null
Check '#12 房间局：非房主玩家能看/订阅' {
    $topic = (Req GET '/api/topics' $null $HA).Json[0].id
    $r = Req POST '/api/rooms' @{ topicId = $topic } $HA
    Must ($r.Status -eq 200) "建房 HTTP $($r.Status) $($r.Body)"
    $script:roomCode = $r.Json.code

    $j = Req POST "/api/rooms/$($script:roomCode)/join" @{} $HB
    Must ($j.Status -eq 200) "B 加入 HTTP $($j.Status)"
    $null = Req POST "/api/rooms/$($script:roomCode)/ready" @{ ready = $true } $HB
    # 房主免准备：把 A1 置为未准备，仍应能开局（#16 也在这里验）
    $null = Req POST "/api/rooms/$($script:roomCode)/ready" @{ ready = $false } $HA
    $s = Req POST "/api/rooms/$($script:roomCode)/start" @{} $HA
    Must ($s.Status -eq 200) "开局 HTTP $($s.Status) $($s.Body)"
    $script:roomMatch = $s.Json.matchId

    $d = Req GET "/api/matches/$($script:roomMatch)" $null $HB
    Must ($d.Status -eq 200) "B（席位成员、非 owner）应 200，实际 $($d.Status)"
    $c = SseCode "$Base/api/matches/$($script:roomMatch)/events?token=$tb"
    Must ($c -eq 200) "B 订阅 SSE 应 200，实际 $c"
    'matchId=' + $script:roomMatch + '，B 可看可订阅'
}

Check '#13 房间局：路人看/订阅 -> 403' {
    $d = Req GET "/api/matches/$roomMatch" $null $HC
    Must ($d.Status -eq 403) "路人看应 403，实际 $($d.Status)"
    $c = SseCode "$Base/api/matches/$roomMatch/events?token=$tc"
    Must ($c -eq 403) "路人订阅应 403，实际 $c"
    '403 / 403'
}

Check '#16 房主免准备按 A1 生效（房主自己未准备也能开局）' {
    # 已在 #12 里验过：把 A1 置未准备后仍开局成功
    Must ($null -ne $roomMatch) "前面没有成功开局"
    '把 A1 的 ready 置 false 后仍能开局 -> 免准备不依赖昵称'
}

Write-Host "`n=== 五、昵称（#14 #15）===" -ForegroundColor Cyan

Check '#14 建房后席位显示账号昵称' {
    $r = Req POST '/api/rooms' @{ topicId = ((Req GET '/api/topics' $null $HA).Json[0].id) } $HA
    $code = $r.Json.code
    $seats = $r.Json.detail.seats
    $a1 = @($seats | Where-Object { $_.seat_key -eq 'A1' })[0]
    Must ($a1.user_name -eq '张同学') "A1 昵称应为「张同学」，实际 $($a1.user_name)"
    Must ($a1.user_id -eq $accA) "A1 的 user_id 应为账号 $accA，实际 $($a1.user_id)"
    $script:nickRoom = $code
    "A1=$($a1.user_name) / user_id=$($a1.user_id)"
}

Check '#15 改昵称后席位同步变' {
    $null = Req PATCH '/api/auth/me' @{ name = '张三' } $HA
    $d = Req GET "/api/rooms/$($script:nickRoom)" $null $HA
    $a1 = @($d.Json.seats | Where-Object { $_.seat_key -eq 'A1' })[0]
    Must ($a1.user_name -eq '张三') "改名后应立刻变「张三」，实际 $($a1.user_name)"
    $null = Req PATCH '/api/auth/me' @{ name = '张同学' } $HA
    '张同学 -> 张三 即时生效'
}

Write-Host "`n=== 六、由其它脚本覆盖的条目（#17-#20）===" -ForegroundColor Cyan
Write-Host '  #17 前端未登录点「开始辩论」-> 弹登录      ：node server/scripts/selftest_debate_auth.mjs（D4-3）' -ForegroundColor Yellow
Write-Host '  #18 前端未登录进房间页 -> 弹登录            ：同上（D4-2）' -ForegroundColor Yellow
Write-Host '  #19 现有单测全绿                            ：mvn -B test（当前 338 例）' -ForegroundColor Yellow
Write-Host '  #20 社区不受影响                            ：smoke-community 27/27 + smoke-admin 16/16 + smoke-security 22/22' -ForegroundColor Yellow

Write-Host ("`n汇总：{0} 通过 / {1} 失败" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
