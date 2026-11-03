# 举报 + 管理员后台 冒烟（方案 §7 的 16 条验收逐条落地）
# 用法：先起后端，再 pwsh -File server/scripts/smoke-admin.ps1 [baseUrl]
# 说明：#10「禁言到期后恢复正常」用「管理员解禁」模拟到期（真正的 until 到期判定由
#       MuteGuardTest / BanServiceTest 用「过去的 until」覆盖，冒烟里不可能等 7 天）。
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
    $p = @{ Uri = "$Base$path"; Method = $method; TimeoutSec = 15 }
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

# ===== 准备账号（每次唯一，保证可反复跑）=====
$stamp = (Get-Date -Format 'HHmmss')
$authorAcc = "author$stamp"
$rep1Acc   = "rep1$stamp"
$rep2Acc   = "rep2$stamp"
$rep3Acc   = "rep3$stamp"
$PWD = 'abc12345'

function NewUser([string]$acc) {
    $r = Req POST '/api/auth/register' @{ account = $acc; password = $PWD } $null
    if ($r.Status -ne 200) { throw "注册 $acc 失败：$($r.Status) $($r.Body)" }
    return $r.Json
}
$author = NewUser $authorAcc
$rep1   = NewUser $rep1Acc
$rep2   = NewUser $rep2Acc
$rep3   = NewUser $rep3Acc

$HAuthor = @{ Authorization = "Bearer $($author.token)" }
$HRep1   = @{ Authorization = "Bearer $($rep1.token)" }
$HRep2   = @{ Authorization = "Bearer $($rep2.token)" }
$HRep3   = @{ Authorization = "Bearer $($rep3.token)" }

# 管理员登录
$adminLogin = Req POST '/api/admin/auth/login' @{ account = 'admin'; password = 'admin123' } $null
if ($adminLogin.Status -ne 200) { Write-Host "FAIL: 管理员登录失败 $($adminLogin.Status) $($adminLogin.Body)" -ForegroundColor Red; exit 1 }
$HAdmin = @{ Authorization = "Bearer $($adminLogin.Json.token)" }
Write-Host "就绪：作者 $authorAcc / 举报人 $rep1Acc,$rep2Acc,$rep3Acc / 管理员 admin" -ForegroundColor DarkGray

# 作者发一篇帖子
$postResp = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '冒烟被举报帖'; body = '正文内容' } $HAuthor
$postId = $postResp.Json.postId
$reportIds = @()

Write-Host "`n=== 方案 §7 十六条验收 ===" -ForegroundColor Cyan

Check '1 登录用户举报别人的帖子 -> 200 + reportId' {
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'ABUSE' } $HRep1
    Must ($r.Status -eq 200) "HTTP $($r.Status) $($r.Body)"
    Must ($r.Json.reportId -gt 0) "没返回 reportId"
    $script:reportIds += $r.Json.reportId
    "reportId=$($r.Json.reportId)"
}

Check '2 同一人重复举报同一帖 -> 409 ALREADY_REPORTED' {
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'SPAM' } $HRep1
    Must ($r.Status -eq 409) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'ALREADY_REPORTED') "code=$($r.Json.code)"
    '409 ALREADY_REPORTED'
}

Check '3 举报自己的帖子 -> 400' {
    $mine = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '我自己的帖'; body = 'x' } $HAuthor
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $mine.Json.postId; reason = 'SPAM' } $HAuthor
    Must ($r.Status -eq 400) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'INVALID_PARAM') "code=$($r.Json.code)"
    "400 $($r.Json.message)"
}

Check '4 未登录举报 -> 401' {
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'SPAM' } $null
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    '401'
}

Check '5 补充说明含敏感词 -> 落库是 ＊＊＊' {
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'SPAM'; detail = '这是广告，加微信聊' } $HRep2
    Must ($r.Status -eq 200) "HTTP $($r.Status) $($r.Body)"
    $script:reportIds += $r.Json.reportId
    $mine = Req GET '/api/community/my-reports?page=1&size=10' $null $HRep2
    Must ($mine.Status -eq 200) "我的举报 HTTP $($mine.Status)"
    $d = @($mine.Json.items | Where-Object { $_.reportId -eq $r.Json.reportId })[0]
    Must ($null -ne $d) "我的举报里没有这条"
    Must (-not ("$($d.detail)" -like '*加微信*')) "敏感词没打码：$($d.detail)"
    Must ("$($d.detail)" -like '*＊*') "没有替换成全角＊：$($d.detail)"
    "detail=$($d.detail)"
}

Check '6 3 个不同用户举报同一帖 -> 队列显示多人举报且排最前' {
    $r = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'ILLEGAL' } $HRep3
    Must ($r.Status -eq 200) "第三个举报失败：HTTP $($r.Status) $($r.Body)"
    $script:reportIds += $r.Json.reportId
    $q = Req GET '/api/admin/reports?status=PENDING&page=1&size=20' $null $HAdmin
    Must ($q.Status -eq 200) "队列 HTTP $($q.Status)"
    $first = @($q.Json.items)[0]
    Must ($first.targetType -eq 'POST' -and $first.targetId -eq $postId) "多人举报的目标没排最前：$($first.targetType)#$($first.targetId)"
    Must ($first.reporterCount -eq 3) "举报人数应为 3，实际 $($first.reporterCount)"
    Must ($first.multiReport -eq $true) "没打多人举报标"
    "reporterCount=3 multiReport=$($first.multiReport)"
}

Check '7 管理员登录 -> 队列 200 且能看到聚合条目' {
    $q = Req GET '/api/admin/reports?status=PENDING&page=1&size=5' $null $HAdmin
    Must ($q.Status -eq 200) "HTTP $($q.Status)"
    foreach ($k in 'items', 'total', 'page', 'size') { Must ($null -ne $q.Json.PSObject.Properties[$k]) "缺字段 $k" }
    Must (@($q.Json.items).Count -ge 1) "队列是空的"
    "total=$($q.Json.total)"
}

Check '9 管理员禁言 7 天 -> 该用户发帖 403 MUTED、浏览正常' {
    $rep = Req POST "/api/admin/reports/$($reportIds[0])/resolve" @{ action = 'BAN'; banDays = 7; note = '冒烟：人身攻击' } $HAdmin
    Must ($rep.Status -eq 204) "处理 HTTP $($rep.Status) $($rep.Body)"
    $p = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '禁言后不该成功'; body = 'x' } $HAuthor
    Must ($p.Status -eq 403) "发帖应 403，实际 $($p.Status)"
    Must ($p.Json.code -eq 'MUTED') "code=$($p.Json.code)"
    Must ("$($p.Json.message)" -like '*禁言至*') "message 里没带到期时间：$($p.Json.message)"
    $list = Req GET '/api/community/posts?page=1&size=3' $null $HAuthor
    Must ($list.Status -eq 200) "被禁言的人应该还能浏览，实际 $($list.Status)"
    $ban = Req GET '/api/community/me/ban' $null $HAuthor
    Must ($ban.Json.banned -eq $true) "me/ban 应返回 banned=true"
    Must ($null -ne $ban.Json.until) "me/ban 应带 until"
    "403 MUTED；浏览 200；banned=$($ban.Json.banned)"
}

Check '10 禁言解除后恢复正常发帖（用解禁模拟到期）' {
    $u = Req POST "/api/admin/users/$authorAcc/unban" $null $HAdmin
    Must ($u.Status -eq 204) "解禁 HTTP $($u.Status)"
    $p = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '解禁后可以发帖'; body = 'x' } $HAuthor
    Must ($p.Status -eq 200) "解禁后发帖应 200，实际 $($p.Status) $($p.Body)"
    $ban = Req GET '/api/community/me/ban' $null $HAuthor
    Must ($ban.Json.banned -eq $false) "解禁后 banned 应为 false"
    '解禁后发帖 200'
}

Check '11 举报人打开「我的举报」-> 状态已变成已处理' {
    $mine = Req GET '/api/community/my-reports?page=1&size=10' $null $HRep1
    Must ($mine.Status -eq 200) "HTTP $($mine.Status)"
    $d = @($mine.Json.items | Where-Object { $_.reportId -eq $reportIds[0] })[0]
    Must ($null -ne $d) "我的举报里没有第一条"
    Must ($d.status -eq 'ACCEPTED') "状态应 ACCEPTED，实际 $($d.status)"
    Must ($d.action -eq 'BAN') "action 应 BAN，实际 $($d.action)"
    Must ($null -ne $d.handledAt) "应有处理时间"
    "status=$($d.status) action=$($d.action)"
}

Check '12 普通用户访问 /api/admin/reports -> 403 NOT_ADMIN' {
    $r = Req GET '/api/admin/reports' $null $HRep1
    Must ($r.Status -eq 403) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'NOT_ADMIN') "code=$($r.Json.code)"
    '403 NOT_ADMIN'
}

Check '13 管理员 token 访问 /api/community/posts -> 401 NOT_ADMIN' {
    $r = Req GET '/api/community/posts?page=1&size=3' $null $HAdmin
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'NOT_ADMIN') "code=$($r.Json.code)"
    '401 NOT_ADMIN'
}

Check '14 浏览器打开 /admin -> 独立登录页' {
    $r = Invoke-WebRequest -Uri "$Base/admin" -UseBasicParsing -TimeoutSec 10
    Must ($r.StatusCode -eq 200) "HTTP $($r.StatusCode)"
    Must ("$($r.Content)" -like '*loginView*') "/admin 没返回登录页"
    Must ("$($r.Content)" -like '*admin.js*') "/admin 没加载 admin.js"
    '200 且含登录表单'
}

Check '15 全站封禁 -> 该用户立刻无法登录、旧 token 立刻 401 ACCOUNT_DISABLED' {
    $s = Req POST "/api/admin/users/$rep2Acc/status" @{ status = 0; reason = '冒烟：全站封禁' } $HAdmin
    Must ($s.Status -eq 204) "封禁 HTTP $($s.Status)"
    $login = Req POST '/api/auth/login' @{ account = $rep2Acc; password = $PWD } $null
    Must ($login.Status -eq 401) "被封禁用户登录应 401，实际 $($login.Status)"
    Must ($login.Json.code -eq 'ACCOUNT_DISABLED') "code=$($login.Json.code)"
    $old = Req GET '/api/community/posts?page=1&size=3' $null $HRep2
    Must ($old.Status -eq 401) "旧 token 应立即失效，实际 $($old.Status)"
    Must ($old.Json.code -eq 'ACCOUNT_DISABLED') "code=$($old.Json.code)"
    '登录 401 + 旧 token 401，均为 ACCOUNT_DISABLED'
}

Check '16 解除全站封禁 -> 能正常登录，社区禁言状态不受影响' {
    $s = Req POST "/api/admin/users/$rep2Acc/status" @{ status = 1 } $HAdmin
    Must ($s.Status -eq 204) "解封 HTTP $($s.Status)"
    $login = Req POST '/api/auth/login' @{ account = $rep2Acc; password = $PWD } $null
    Must ($login.Status -eq 200) "解封后应能登录，实际 $($login.Status)"
    # 两种处罚互不干扰：作者此刻既没禁言也没封禁
    $ban = Req GET '/api/community/me/ban' $null $HAuthor
    Must ($ban.Json.banned -eq $false) "作者的禁言状态不该被这次解封影响"
    $list = Req GET ('/api/admin/users?q=' + $rep2Acc) $null $HAdmin
    Must ($list.Status -eq 200) "用户列表 HTTP $($list.Status)"
    $u = @($list.Json.items)[0]
    Must ($u.disabled -eq $false) "解封后 disabled 应为 false"
    '登录 200；禁言状态独立'
}

Check '8 管理员点「删除内容」-> 帖子 404、该目标全部 PENDING 变 ACCEPTED' {
    # 用第二个目标单独验删除，避免与前面禁言那条互相干扰
    $p2 = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '待删除的帖'; body = 'x' } $HAuthor
    $pid2 = $p2.Json.postId
    $rp = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $pid2; reason = 'SPAM' } $HRep1
    $rp2 = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $pid2; reason = 'ABUSE' } $HRep3
    $rid = $rp.Json.reportId
    $del = Req POST "/api/admin/reports/$rid/resolve" @{ action = 'DELETE' } $HAdmin
    Must ($del.Status -eq 204) "处理 HTTP $($del.Status) $($del.Body)"
    $detail = Req GET "/api/community/posts/$pid2" $null $HAuthor
    Must ($detail.Status -eq 404) "帖子应 404，实际 $($detail.Status)"
    $accepted = Req GET '/api/admin/reports?status=ACCEPTED&page=1&size=50' $null $HAdmin
    Must ($accepted.Status -eq 200) "已处理队列 HTTP $($accepted.Status)"
    $hit = @($accepted.Json.items | Where-Object { $_.targetId -eq $pid2 -and $_.targetType -eq 'POST' })
    Must ($hit.Count -eq 1) "该目标应聚合成 1 行，实际 $($hit.Count)"
    Must ($hit[0].reportCount -eq 2) "同目标的 2 条举报应一起结案，实际 $($hit[0].reportCount)"
    "帖子 404；2 条举报一起 ACCEPTED"
}

Write-Host ("`n汇总：{0} 通过 / {1} 失败" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
