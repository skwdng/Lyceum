# 改密码 + 处理记录 + 一键恢复 冒烟（B1-B5 的验收逐条落地）
# 用法：先起后端，再 pwsh -File server/scripts/smoke-security.ps1 [baseUrl]
# 说明：
#   - 管理员改密会真的改一次再改回来（脚本末尾兜底复原 admin/admin123）
#   - #恢复不解除禁言 是重点，单独一条断言「恢复后发帖仍 403」
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

$stamp = (Get-Date -Format 'HHmmss')
$PWD = 'abc12345'
$NEWPWD = 'newpass123'

function NewUser([string]$acc) {
    $r = Req POST '/api/auth/register' @{ account = $acc; password = $PWD } $null
    if ($r.Status -ne 200) { throw "注册 $acc 失败：$($r.Status) $($r.Body)" }
    return $r.Json
}

Write-Host "`n=== 一、用户端改密码（B2）===" -ForegroundColor Cyan

$authorAcc = "pu$stamp"; $repAcc = "pr$stamp"
$author = NewUser $authorAcc
$rep = NewUser $repAcc
$HAuthor = @{ Authorization = "Bearer $($author.token)" }
$HRep = @{ Authorization = "Bearer $($rep.token)" }

Check '1 旧密码错 -> 400 INVALID_PARAM' {
    $r = Req PATCH '/api/auth/password' @{ oldPassword = 'wrong12345'; newPassword = $NEWPWD } $HAuthor
    Must ($r.Status -eq 400) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'INVALID_PARAM') "code=$($r.Json.code)"
    Must ("$($r.Json.message)" -like '*旧密码不正确*') "message=$($r.Json.message)"
    '400 旧密码不正确'
}

Check '2 新密码太弱（纯字母/太短）-> 400' {
    foreach ($bad in @('abcdefgh', 'abc1234')) {
        $r = Req PATCH '/api/auth/password' @{ oldPassword = $PWD; newPassword = $bad } $HAuthor
        Must ($r.Status -eq 400) "密码 $bad 应 400，实际 $($r.Status)"
    }
    '弱密码全部 400'
}

Check '3 新旧密码相同 -> 400' {
    $r = Req PATCH '/api/auth/password' @{ oldPassword = $PWD; newPassword = $PWD } $HAuthor
    Must ($r.Status -eq 400) "HTTP $($r.Status)"
    Must ("$($r.Json.message)" -like '*不能与旧密码相同*') "message=$($r.Json.message)"
    '400 新旧相同'
}

Check '4 正常改密 -> 204' {
    $r = Req PATCH '/api/auth/password' @{ oldPassword = $PWD; newPassword = $NEWPWD } $HAuthor
    Must ($r.Status -eq 204) "HTTP $($r.Status) $($r.Body)"
    '204'
}

Check '5 旧令牌访问社区 -> 401 TOKEN_STALE' {
    $r = Req GET '/api/community/posts?page=1&size=3' $null $HAuthor
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'TOKEN_STALE') "code=$($r.Json.code)"
    '401 TOKEN_STALE'
}

Check '6 旧令牌访问 /api/auth/me -> 也该 401 TOKEN_STALE' {
    $r = Req GET '/api/auth/me' $null $HAuthor
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'TOKEN_STALE') "code=$($r.Json.code)"
    '401 TOKEN_STALE'
}

Check '7 旧密码登录 401、新密码登录 200 且新令牌可用' {
    $old = Req POST '/api/auth/login' @{ account = $authorAcc; password = $PWD } $null
    Must ($old.Status -eq 401) "旧密码应 401，实际 $($old.Status)"
    $new = Req POST '/api/auth/login' @{ account = $authorAcc; password = $NEWPWD } $null
    Must ($new.Status -eq 200) "新密码应 200，实际 $($new.Status)"
    $H2 = @{ Authorization = "Bearer $($new.Json.token)" }
    $posts = Req GET '/api/community/posts?page=1&size=3' $null $H2
    Must ($posts.Status -eq 200) "新令牌访问社区应 200，实际 $($posts.Status)"
    '旧 401 / 新 200 / 新令牌可用'
}

Write-Host "`n=== 二、管理端改密码（B3）===" -ForegroundColor Cyan

$tmpAdmin = "tmp$stamp"
$al = Req POST '/api/admin/auth/login' @{ account = 'admin'; password = 'admin123' } $null
if ($al.Status -ne 200) { Write-Host "FAIL: 管理员登录失败 $($al.Status) $($al.Body)" -ForegroundColor Red; exit 1 }
$HAdmin = @{ Authorization = "Bearer $($al.Json.token)" }

Check '8 未带令牌改密 -> 401' {
    $r = Req PATCH '/api/admin/auth/password' @{ oldPassword = 'admin123'; newPassword = 'newadmin123' } $null
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    '401'
}

Check '9 旧密码错 -> 400；弱密码 -> 400' {
    $r = Req PATCH '/api/admin/auth/password' @{ oldPassword = 'wrong12345'; newPassword = 'newadmin123' } $HAdmin
    Must ($r.Status -eq 400) "旧密码错应 400，实际 $($r.Status)"
    $r2 = Req PATCH '/api/admin/auth/password' @{ oldPassword = 'admin123'; newPassword = 'abcdefgh' } $HAdmin
    Must ($r2.Status -eq 400) "弱密码应 400，实际 $($r2.Status)"
    '两个 400'
}

Check '10 改密 204 -> 旧管理令牌 401 TOKEN_STALE；新密码可登录；再改回' {
    $r = Req PATCH '/api/admin/auth/password' @{ oldPassword = 'admin123'; newPassword = $tmpAdmin } $HAdmin
    Must ($r.Status -eq 204) "改密 HTTP $($r.Status) $($r.Body)"

    $stale = Req GET '/api/admin/stats' $null $HAdmin
    Must ($stale.Status -eq 401) "旧令牌应 401，实际 $($stale.Status)"
    Must ($stale.Json.code -eq 'TOKEN_STALE') "code=$($stale.Json.code)"

    $loginOld = Req POST '/api/admin/auth/login' @{ account = 'admin'; password = 'admin123' } $null
    Must ($loginOld.Status -eq 401) "旧密码应 401，实际 $($loginOld.Status)"

    $relogin = Req POST '/api/admin/auth/login' @{ account = 'admin'; password = $tmpAdmin } $null
    Must ($relogin.Status -eq 200) "新密码应 200，实际 $($relogin.Status)"
    $HTmp = @{ Authorization = "Bearer $($relogin.Json.token)" }

    $back = Req PATCH '/api/admin/auth/password' @{ oldPassword = $tmpAdmin; newPassword = 'admin123' } $HTmp
    Must ($back.Status -eq 204) "改回 HTTP $($back.Status)"

    $again = Req POST '/api/admin/auth/login' @{ account = 'admin'; password = 'admin123' } $null
    Must ($again.Status -eq 200) "改回后应能登录，实际 $($again.Status)"
    $script:HAdmin = @{ Authorization = "Bearer $($again.Json.token)" }
    '改密/踢旧令牌/改回 全部符合'
}

Write-Host "`n=== 三、处理记录（B4）===" -ForegroundColor Cyan
$HAdmin = $script:HAdmin

$postA = Req POST '/api/community/posts' @{ type = 'CHAT'; title = "审计用帖$stamp"; body = '正文' } $script:HAuthor2
# author 的旧令牌已失效，用新密码换的令牌
$fresh = Req POST '/api/auth/login' @{ account = $authorAcc; password = $NEWPWD } $null
$HAuthor = @{ Authorization = "Bearer $($fresh.Json.token)" }
$script:HAuthor = $HAuthor
$postA = Req POST '/api/community/posts' @{ type = 'CHAT'; title = "审计用帖$stamp"; body = '正文' } $HAuthor
$postId = $postA.Json.postId
$repA = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $postId; reason = 'ABUSE' } $HRep
$repId = $repA.Json.reportId

Check '11 删除内容 -> 204，帖子 404' {
    $r = Req POST "/api/admin/reports/$repId/resolve" @{ action = 'DELETE'; note = "冒烟确认$stamp" } $HAdmin
    Must ($r.Status -eq 204) "HTTP $($r.Status) $($r.Body)"
    $d = Req GET "/api/community/posts/$postId" $null $HAuthor
    Must ($d.Status -eq 404) "帖子应 404，实际 $($d.Status)"
    '204 -> 404'
}

$auditId = $null
Check '12 处理记录：1 条 REPORT_RESOLVE，canRestore=true，detail 有人读文案' {
    $r = Req GET '/api/admin/audit?page=1&size=20' $null $HAdmin
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    $row = @($r.Json.items | Where-Object { $_.reportId -eq $repId })[0]
    Must ($null -ne $row) "没找到本轮的记录"
    Must ($row.action -eq 'REPORT_RESOLVE') "action=$($row.action)"
    Must ($row.verdict -eq 'DELETE') "verdict=$($row.verdict)"
    Must ($row.canRestore -eq $true) "canRestore 应为 true"
    Must ($row.undone -eq $false) "不该是已撤销"
    Must ("$($row.detail)" -like "*冒烟确认$stamp*") "detail 应带备注：$($row.detail)"
    Must ("$($row.adminName)" -eq 'admin') "adminName=$($row.adminName)"
    $script:auditId = $row.id
    "id=$($row.id) detail=$($row.detail)"
}

Check '13 处理记录里不含任何凭据' {
    $r = Req GET '/api/admin/audit?page=1&size=50' $null $HAdmin
    $all = ($r.Json.items | ForEach-Object { "$($_.detail)|$($_.adminName)" }) -join ';'
    Must (-not ($all -like '*$argon2*')) '出现密码哈希'
    Must (-not ($all -like '*eyJ*')) '出现 JWT'
    Must (-not ($all -like '*Bearer*')) '出现令牌'
    '干净'
}

Check '14 一键恢复 -> 204，帖子 200、原行已撤销、多一条 RESTORE、举报 REOPENED' {
    $r = Req POST "/api/admin/audit/$auditId/restore" $null $HAdmin
    Must ($r.Status -eq 204) "HTTP $($r.Status) $($r.Body)"

    $d = Req GET "/api/community/posts/$postId" $null $HAuthor
    Must ($d.Status -eq 200) "帖子应重新可见，实际 $($d.Status)"

    $list = Req GET '/api/admin/audit?page=1&size=20' $null $HAdmin
    $orig = @($list.Json.items | Where-Object { $_.id -eq $auditId })[0]
    Must ($orig.undone -eq $true) "原行应是已撤销"
    Must ($orig.canRestore -eq $false) "已撤销的不该再能恢复"
    $restore = @($list.Json.items | Where-Object { $_.action -eq 'RESTORE' -and $_.reportId -eq $repId })[0]
    Must ($null -ne $restore) "应多一条 RESTORE 记录"
    Must ("$($restore.detail)" -like '*重新可见*') "RESTORE detail=$($restore.detail)"

    $mine = Req GET '/api/community/my-reports?page=1&size=10' $null $HRep
    $m = @($mine.Json.items | Where-Object { $_.reportId -eq $repId })[0]
    Must ($m.status -eq 'REOPENED') "举报状态应 REOPENED，实际 $($m.status)"
    '204 / 200 / 已撤销 / REOPENED'
}

Check '15 REOPENED 不再回到默认处理队列' {
    $q = Req GET '/api/admin/reports?status=PENDING&page=1&size=50' $null $HAdmin
    $hit = @($q.Json.items | Where-Object { $_.targetId -eq $postId -and $_.targetType -eq 'POST' })
    Must ($hit.Count -eq 0) "默认队列不该有它，实际 $($hit.Count) 行"
    '默认队列 0 行'
}

Check '16 再恢复一次 -> 409 ALREADY_RESTORED' {
    $r = Req POST "/api/admin/audit/$auditId/restore" $null $HAdmin
    Must ($r.Status -eq 409) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'ALREADY_RESTORED') "code=$($r.Json.code)"
    '409 ALREADY_RESTORED'
}

Check '17 纯禁言行 canRestore=false，恢复 -> 409 NOT_RESTORABLE，帖子和禁言都不受影响' {
    $p = Req POST '/api/community/posts' @{ type = 'CHAT'; title = "只禁言$stamp"; body = 'x' } $HAuthor
    $pid2 = $p.Json.postId
    $rp = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $pid2; reason = 'SPAM' } $HRep
    $r = Req POST "/api/admin/reports/$($rp.Json.reportId)/resolve" @{ action = 'BAN'; banDays = 1 } $HAdmin
    Must ($r.Status -eq 204) "禁言处理 HTTP $($r.Status)"

    $list = Req GET '/api/admin/audit?page=1&size=20' $null $HAdmin
    $row = @($list.Json.items | Where-Object { $_.reportId -eq $rp.Json.reportId })[0]
    Must ($row.canRestore -eq $false) "纯禁言不该能恢复"
    $bad = Req POST "/api/admin/audit/$($row.id)/restore" $null $HAdmin
    Must ($bad.Status -eq 409) "HTTP $($bad.Status)"
    Must ($bad.Json.code -eq 'NOT_RESTORABLE') "code=$($bad.Json.code)"
    'canRestore=false + 409 NOT_RESTORABLE'
}

Check '18 恢复不解除禁言：DELETE_AND_BAN 恢复后发帖仍 403 MUTED' {
    $u2 = NewUser "pv$stamp"
    $H2 = @{ Authorization = "Bearer $($u2.token)" }
    $p = Req POST '/api/community/posts' @{ type = 'CHAT'; title = "删禁$stamp"; body = 'x' } $H2
    $pid3 = $p.Json.postId
    $rp = Req POST '/api/community/reports' @{ targetType = 'POST'; targetId = $pid3; reason = 'ILLEGAL' } $HRep
    $r = Req POST "/api/admin/reports/$($rp.Json.reportId)/resolve" @{ action = 'DELETE_AND_BAN'; banDays = 3 } $HAdmin
    Must ($r.Status -eq 204) "处理 HTTP $($r.Status)"

    $muted = Req POST '/api/community/posts' @{ type = 'CHAT'; title = 'x'; body = 'x' } $H2
    Must ($muted.Status -eq 403) "处理后被禁言者发帖应 403，实际 $($muted.Status)"

    $list = Req GET '/api/admin/audit?page=1&size=20' $null $HAdmin
    $row = @($list.Json.items | Where-Object { $_.reportId -eq $rp.Json.reportId })[0]
    $ok = Req POST "/api/admin/audit/$($row.id)/restore" $null $HAdmin
    Must ($ok.Status -eq 204) "恢复 HTTP $($ok.Status)"

    $visible = Req GET "/api/community/posts/$pid3" $null $H2
    Must ($visible.Status -eq 200) "内容应恢复可见，实际 $($visible.Status)"
    $ban = Req GET '/api/community/me/ban' $null $H2
    Must ($ban.Json.banned -eq $true) "禁言必须还在（恢复不解除禁言）"
    $still = Req POST '/api/community/posts' @{ type = 'CHAT'; title = 'y'; body = 'y' } $H2
    Must ($still.Status -eq 403) "恢复后仍应被禁言，实际 $($still.Status)"
    '内容 200 / 禁言仍在 / 发帖 403'
}

Write-Host "`n=== 四、审计接口的鉴权与不可篡改 ===" -ForegroundColor Cyan

Check '19 无令牌访问审计 -> 401；用户令牌 -> 403' {
    $a = Req GET '/api/admin/audit' $null $null
    Must ($a.Status -eq 401) "无令牌应 401，实际 $($a.Status)"
    $b = Req GET '/api/admin/audit' $null $HAuthor
    Must ($b.Status -eq 403) "用户令牌应 403，实际 $($b.Status)"
    Must ($b.Json.code -eq 'NOT_ADMIN') "code=$($b.Json.code)"
    $c = Req POST '/api/admin/audit/1/restore' $null $HAuthor
    Must ($c.Status -eq 403) "用户令牌恢复应 403，实际 $($c.Status)"
    '401 / 403'
}

Check '20 不存在的记录 -> 404 AUDIT_NOT_FOUND' {
    $r = Req POST '/api/admin/audit/99999999/restore' $null $HAdmin
    Must ($r.Status -eq 404) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'AUDIT_NOT_FOUND') "code=$($r.Json.code)"
    '404'
}

Check '21 审计只读：没有删除/修改接口（DELETE 方法不开放）' {
    $r = Req DELETE '/api/admin/audit/1' $null $HAdmin
    Must ($r.Status -ge 400) "DELETE 不该成功，实际 $($r.Status)"
    "DELETE -> $($r.Status)（不允许）"
}

Check '22 分页夹紧：page=0 -> 1，size=1000 -> 100' {
    $r = Req GET '/api/admin/audit?page=0&size=1000' $null $HAdmin
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($r.Json.page -eq 1) "page=$($r.Json.page)"
    Must ($r.Json.size -eq 100) "size=$($r.Json.size)"
    'page=1 size=100'
}

Write-Host ("`n汇总：{0} 通过 / {1} 失败" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
