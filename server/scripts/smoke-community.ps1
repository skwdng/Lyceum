# 社区接口冒烟（方案 §8.1 十条 + §8.2 规范验收）
# 用法：先起后端，再 pwsh -File server/scripts/smoke-community.ps1 [baseUrl]
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

# ===== 登录（2026-11-03 起社区身份走 JWT；X-User-Id 已废弃）=====
# 每次用唯一账号，避免重复跑时撞 409（H2 重启也会清空，但脚本要能连跑）
$smokeAccount = 'smoke' + (Get-Date -Format 'HHmmss')
$reg = Req POST '/api/auth/register' @{ account = $smokeAccount; password = 'abc12345' } $null
if ($reg.Status -ne 200) { Write-Host "FAIL: 冒烟账号注册失败 $($reg.Status) $($reg.Body)" -ForegroundColor Red; exit 1 }
$smokeToken = $reg.Json.token
$H = @{ Authorization = "Bearer $smokeToken" }
Write-Host "登录就绪：$smokeAccount" -ForegroundColor DarkGray
$postId = $null; $rootId = $null; $replyId = $null

Write-Host "`n=== §8.1 十条必过冒烟 ===" -ForegroundColor Cyan

Check '1 GET /posts?sort=HOT&page=1&size=5 -> {items,total,page,size}' {
    $r = Req GET '/api/community/posts?sort=HOT&page=1&size=5' $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    foreach ($k in 'items', 'total', 'page', 'size') { Must ($null -ne $r.Json.PSObject.Properties[$k]) "缺字段 $k" }
    Must ($r.Json.page -eq 1) "page 不是 1：$($r.Json.page)"
    "total=$($r.Json.total) size=$($r.Json.size)"
}

Check '2 POST /posts -> {postId}' {
    $r = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '冒烟帖 加微信 测试'; body = '正文含 赌博 与 博彩，应被全角＊打码。'; userName = '冒烟哥' } $H
    Must ($r.Status -eq 200) "HTTP $($r.Status) $($r.Body)"
    Must ($r.Json.postId -gt 0) "postId 无效"
    $script:postId = $r.Json.postId
    "postId=$($r.Json.postId)"
}

Check '3 GET /posts/{id} -> 200 含 body' {
    $r = Req GET "/api/community/posts/$postId" $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($null -ne $r.Json.body) '缺 body'
    Must ($r.Json.title -match '＊') "标题未打码：$($r.Json.title)"
    Must ($r.Json.body -match '＊') "正文未打码：$($r.Json.body)"
    Must ($r.Json.authorName -eq $smokeAccount) "昵称应等于账号（社区只认 sy_user.name）：$($r.Json.authorName)"
    "title=$($r.Json.title)"
}

Check '4 PATCH /posts/{id} {title} -> 200' {
    $r = Req PATCH "/api/community/posts/$postId" @{ title = '冒烟帖-已改标题' } $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($r.Json.postId -eq $postId) 'postId 不一致'
    'ok'
}

Check '5 POST /posts/{id}/comments {body} -> {commentId}' {
    $r = Req POST "/api/community/posts/$postId/comments" @{ body = '第一层楼'; userName = '楼甲' } $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($r.Json.commentId -gt 0) 'commentId 无效'
    $script:rootId = $r.Json.commentId
    "commentId=$($r.Json.commentId)"
}

Check '6 POST comments {replyObjectType:COMMENT} -> rootId 服务端派生' {
    $r = Req POST "/api/community/posts/$postId/comments" @{ body = '第二层回复'; replyObjectType = 'COMMENT'; replyObjectCommentId = $rootId; userName = '楼乙' } $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    $script:replyId = $r.Json.commentId
    # 再回复这条楼中楼：仍应挂到同一楼（两层硬上限）
    $r2 = Req POST "/api/community/posts/$postId/comments" @{ body = '回复楼中楼'; replyObjectType = 'COMMENT'; replyObjectCommentId = $replyId; userName = '楼丙' } $H
    Must ($r2.Status -eq 200) "第三层请求 HTTP $($r2.Status)"
    "commentId=$($r.Json.commentId) 第三层请求也 200（应仍为两层层级）"
}

Check '7 GET /posts/{id}/comments -> 楼 + replies(<=3) + replyCount' {
    $r = Req GET "/api/community/posts/$postId/comments?page=1&size=10" $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($r.Json.items.Count -ge 1) "楼数为 0"
    $root = $r.Json.items | Where-Object { $_.id -eq $rootId } | Select-Object -First 1
    Must ($null -ne $root) "找不到楼 $rootId"
    Must ($root.replies.Count -le 3) "预览超过 3 条：$($root.replies.Count)"
    Must ($root.replyCount -ge 2) "replyCount 不对：$($root.replyCount)"
    Must ($null -eq $root.PSObject.Properties['rootId']) '楼这一层不该有 rootId 字段'
    "楼=$($r.Json.items.Count) 预览=$($root.replies.Count) replyCount=$($root.replyCount)"
}

Check '8 GET /comments/{rootId}/replies -> 200' {
    $r = Req GET "/api/community/comments/$rootId/replies?page=1&size=20" $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    Must ($r.Json.items.Count -ge 2) "楼中楼数量不对：$($r.Json.items.Count)"
    $sub = $r.Json.items | Where-Object { $_.id -eq $replyId } | Select-Object -First 1
    Must ($sub.rootId -eq $rootId) "楼中楼 rootId 未指向楼：$($sub.rootId)"
    'ok'
}

Check '9 POST like -> 204；再 POST 仍 204；DELETE -> 204' {
    $a = Req POST "/api/community/posts/$postId/like" $null $H
    $b = Req POST "/api/community/posts/$postId/like" $null $H
    $c = Req DELETE "/api/community/posts/$postId/like" $null $H
    Must ($a.Status -eq 204 -and $b.Status -eq 204 -and $c.Status -eq 204) "状态码 $($a.Status)/$($b.Status)/$($c.Status)"
    "204/204/204"
}

Check '10 DELETE /posts/{id} -> 204；再 GET -> 404 POST_NOT_FOUND' {
    $r = Req DELETE "/api/community/posts/$postId" $null $H
    Must ($r.Status -eq 204) "删除 HTTP $($r.Status)"
    $g = Req GET "/api/community/posts/$postId" $null $H
    Must ($g.Status -eq 404) "删除后 GET 不是 404：$($g.Status)"
    Must ($g.Json.code -eq 'POST_NOT_FOUND') "code 不对：$($g.Json.code)"
    "$($r.Status) -> $($g.Status) $($g.Json.code)"
}

Write-Host "`n=== §8.2 规范验收 ===" -ForegroundColor Cyan

$p2 = (Req POST '/api/community/posts' @{ type = 'GUIDE'; title = '规范验收帖'; body = ('长' * 400); userName = '验收员' } $H).Json.postId

Check 'R-COM-05 列表不返回 body，摘要 <=200 字且服务端生成' {
    $r = Req GET '/api/community/posts?page=1&size=50' $null $H
    $it = $r.Json.items | Where-Object { $_.id -eq $p2 } | Select-Object -First 1
    Must ($null -ne $it) '列表里找不到帖子'
    Must ($null -eq $it.PSObject.Properties['body']) '列表返回了 body（违反 R-COM-05）'
    Must ($it.excerpt.Length -le 200) "摘要超长：$($it.excerpt.Length)"
    "excerpt 长度=$($it.excerpt.Length)"
}

Check 'R-COM-03 出参不含段位/等级/积分/场次/贡献值' {
    $r = Req GET "/api/community/posts/$p2" $null $H
    $bad = @('tier', 'rank', 'level', 'score', 'points', 'contribution', 'matches')
    $hit = $bad | Where-Object { $null -ne $r.Json.PSObject.Properties[$_] }
    Must (-not $hit) "出现了禁用字段：$($hit -join ',')"
    'ok'
}

Check '§4.5 type 非法 -> 400 INVALID_PARAM' {
    $r = Req GET '/api/community/posts?type=BAD' $null $H
    Must ($r.Status -eq 400) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'INVALID_PARAM') "code 不对：$($r.Json.code)"
    "$($r.Status) $($r.Json.code)"
}

Check '§4.5 sort 非法 -> 静默降级 NEW（200）' {
    $r = Req GET '/api/community/posts?sort=NOT_A_SORT' $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    'ok'
}

Check '§4.5 range 非法 -> 静默降级 ALL（200）' {
    $r = Req GET '/api/community/posts?range=99Y' $null $H
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    'ok'
}

Check '§4.1 size 夹到 1..50（传 100 回读 50）' {
    $r = Req GET '/api/community/posts?page=1&size=100' $null $H
    Must ($r.Json.size -eq 50) "size 未夹到 50：$($r.Json.size)"
    'size=50'
}

Check '§4.1 page 夹到 >=1（传 0 回读 1）' {
    $r = Req GET '/api/community/posts?page=0&size=5' $null $H
    Must ($r.Json.page -eq 1) "page 未夹到 1：$($r.Json.page)"
    'page=1'
}

Check 'R-COM-39 敏感词逐码点替换为全角＊且不拒稿' {
    $r = Req POST '/api/community/posts' @{ type = 'HELP'; title = '再测 加微信'; body = '博彩 与 赌博' } $H
    Must ($r.Status -eq 200) "命中敏感词应成功发布，实际 HTTP $($r.Status)"
    $d = Req GET "/api/community/posts/$($r.Json.postId)" $null $H
    Must ($d.Json.title -notmatch '加微信') '标题仍有原文'
    Must ($d.Json.body -notmatch '博彩|赌博') '正文仍有原文'
    Must ($d.Json.title -match '＊') '标题未出现全角＊'
    "title=$($d.Json.title)"
}

Check 'R-COM-15 楼中楼两层硬上限（第三层请求仍挂在楼）' {
    $np = (Req POST '/api/community/posts' @{ type = 'CHAT'; title = '两层测试'; body = 'x' } $H).Json.postId
    $r1 = (Req POST "/api/community/posts/$np/comments" @{ body = 'L1' } $H).Json.commentId
    $r2 = (Req POST "/api/community/posts/$np/comments" @{ body = 'L2'; replyObjectType = 'COMMENT'; replyObjectCommentId = $r1 } $H).Json.commentId
    $r3 = (Req POST "/api/community/posts/$np/comments" @{ body = 'L3'; replyObjectType = 'COMMENT'; replyObjectCommentId = $r2 } $H).Json.commentId
    $all = (Req GET "/api/community/comments/$r1/replies?page=1&size=50" $null $H).Json.items
    $ids = $all | ForEach-Object { $_.id }
    Must ($ids -contains $r2 -and $ids -contains $r3) 'L3 没有挂回同一楼'
    $roots = $all | ForEach-Object { $_.rootId } | Sort-Object -Unique
    Must ($roots.Count -eq 1 -and $roots[0] -eq $r1) "存在多层：$($roots -join ',')"
    "L2/L3 rootId 均为 $r1"
}

Check 'R-COM-07 软删除后其下评论一并不可见' {
    $np = (Req POST '/api/community/posts' @{ type = 'CHAT'; title = '删除测试'; body = 'x' } $H).Json.postId
    $cid = (Req POST "/api/community/posts/$np/comments" @{ body = '会被连带隐藏' } $H).Json.commentId
    Req DELETE "/api/community/posts/$np" $null $H | Out-Null
    $c = Req GET "/api/community/posts/$np/comments" $null $H
    Must ($c.Status -eq 404) "已删帖的评论列表应 404，实际 $($c.Status)"
    "$($c.Status) $($c.Json.code)"
}

Check 'R-COM-26 评论点赞 POST/DELETE 幂等 204' {
    $np = (Req POST '/api/community/posts' @{ type = 'CHAT'; title = '评论点赞'; body = 'x' } $H).Json.postId
    $cid = (Req POST "/api/community/posts/$np/comments" @{ body = '赞我' } $H).Json.commentId
    $a = Req POST "/api/community/comments/$cid/like" $null $H
    $b = Req POST "/api/community/comments/$cid/like" $null $H
    $c = Req DELETE "/api/community/comments/$cid/like" $null $H
    Must ($a.Status -eq 204 -and $b.Status -eq 204 -and $c.Status -eq 204) "状态码 $($a.Status)/$($b.Status)/$($c.Status)"
    '204/204/204'
}

Check 'R-COM-37 浏览接口对不存在帖子 404、对存在帖子 204' {
    $np = (Req POST '/api/community/posts' @{ type = 'CHAT'; title = '浏览测试'; body = 'x' } $H).Json.postId
    $ok = Req POST "/api/community/posts/$np/view" $null $H
    $bad = Req POST '/api/community/posts/99999999/view' $null $H
    Must ($ok.Status -eq 204) "存在帖应 204，实际 $($ok.Status)"
    Must ($bad.Status -eq 404) "不存在帖应 404，实际 $($bad.Status)"
    "$($ok.Status)/$($bad.Status)"
}

Write-Host "`n=== 登录态（2026-11-03 新增） ===" -ForegroundColor Cyan

Check '匿名发帖 -> 401 UNAUTHORIZED' {
    $r = Req POST '/api/community/posts' @{ type = 'CHAT'; title = '匿名不该成功'; body = 'x' } $null
    Must ($r.Status -eq 401) "HTTP $($r.Status)"
    Must ($r.Json.code -eq 'UNAUTHORIZED') "code 不对：$($r.Json.code)"
    "$($r.Status) $($r.Json.code)"
}

Check '匿名点赞/发评论/删帖 一律 401' {
    $codes = @()
    $codes += (Req POST '/api/community/posts/1/like' $null $null).Status
    $codes += (Req POST '/api/community/posts/1/comments' @{ body = 'x' } $null).Status
    $codes += (Req DELETE '/api/community/posts/1' $null $null).Status
    Must (($codes | Where-Object { $_ -ne 401 }).Count -eq 0) "状态码：$($codes -join ',')"
    '401/401/401'
}

Check '匿名浏览 /view -> 204 但不计数' {
    $pid2 = (Req POST '/api/community/posts' @{ type = 'CHAT'; title = '匿名浏览不计数'; body = 'x' } $H).Json.postId
    $d0 = Req GET "/api/community/posts/$pid2" $null $H
    Must ($d0.Status -eq 200) "建帖后取详情失败：HTTP $($d0.Status) $($d0.Body)"
    $before = [int]$d0.Json.viewCount
    $anon = Req POST "/api/community/posts/$pid2/view" $null $null
    Must ($anon.Status -eq 204) "匿名 view 应 204，实际 $($anon.Status)"
    $after = [int](Req GET "/api/community/posts/$pid2" $null $H).Json.viewCount
    Must ($after -eq $before) "匿名浏览竟然计数了：$before -> $after"
    "204，viewCount $before -> $after"
}

Check '匿名列表 200 且 liked 全为 false' {
    $r = Req GET '/api/community/posts?page=1&size=50' $null $null
    Must ($r.Status -eq 200) "HTTP $($r.Status)"
    $liked = @($r.Json.items | Where-Object { $_.liked -eq $true })
    Must ($liked.Count -eq 0) "匿名下竟然有 liked=true 的帖子：$($liked.Count) 条"
    "items=$($r.Json.items.Count)，liked 全 false"
}

Check '无 token 访问 /api/auth/me -> 401' {
    $r = Req GET '/api/auth/me' $null $null
    Must ($r.Status -eq 401 -and $r.Json.code -eq 'UNAUTHORIZED') "HTTP $($r.Status) code=$($r.Json.code)"
    '401 UNAUTHORIZED'
}
Write-Host ("`n汇总：{0} 通过 / {1} 失败" -f $script:pass, $script:fail) -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
exit $(if ($script:fail) { 1 } else { 0 })
