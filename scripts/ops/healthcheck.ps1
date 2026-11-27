<#
.SYNOPSIS
    思弈阁上线自检（Windows / PowerShell）。

.DESCRIPTION
    从「应用自身」到「公网入口」逐层验证，外加 Redis 连通性。
    任一项 FAIL 就以非 0 退出，并打印「失败项 + 排查建议」。

    1) 应用自身        <DirectBase>/api/health        需 200 且 ok:true
    2) 反代后的健康    <PublicBase>/api/health        需 200 且 ok:true
    3) 站点根          <PublicBase>/                  需 200/3xx
    4) 前端产物        <PublicBase>/v2/index.html     需 200 且 > 500 字节
    5) Redis           PING → PONG（redis-cli → docker exec → 裸 TCP，依次尝试）

.PARAMETER DirectBase
    应用直连地址，默认 http://127.0.0.1:8080（容器映射端口）。

.PARAMETER PublicBase
    公网入口下的站点前缀，默认 http://127.0.0.1:8787/siyige。

.PARAMETER DirectOnly
    只查应用自身 + Redis，跳过反代相关的 2/3/4 项（本机调试用）。

.EXAMPLE
    pwsh -File scripts/ops/healthcheck.ps1

.EXAMPLE
    pwsh -File scripts/ops/healthcheck.ps1 -DirectBase http://127.0.0.1:8080 `
        -PublicBase https://siyige.example.com/siyige -RedisHost redis.internal -RedisPassword 'xxx'
#>
#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$DirectBase = 'http://127.0.0.1:8080',
    [string]$PublicBase = 'http://127.0.0.1:8787/siyige',
    [string]$RedisHost = '127.0.0.1',
    [int]$RedisPort = 6379,
    [string]$RedisPassword = 'siyige123456',
    [int]$TimeoutSec = 8,
    [switch]$SkipRedis,
    [switch]$DirectOnly
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$script:Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Name, [bool]$Ok, [string]$Detail, [string]$Hint)
    $script:Results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail; Hint = $Hint })
    if ($Ok) {
        Write-Host ("  [ OK ] {0}  {1}" -f $Name, $Detail) -ForegroundColor Green
    } else {
        Write-Host ("  [FAIL] {0}  {1}" -f $Name, $Detail) -ForegroundColor Red
        if ($Hint) { Write-Host ("         排查：{0}" -f $Hint) -ForegroundColor Yellow }
    }
}

function Invoke-HttpCheck {
    param(
        [string]$Name,
        [string]$Url,
        [int]$MinBytes = 0,
        [string[]]$MustContain = @(),
        [string]$Hint = ''
    )
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -MaximumRedirection 5 -ErrorAction Stop
    } catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            $code = 0
            try { $code = [int]$_.Exception.Response.StatusCode } catch { }
            Add-Result -Name $Name -Ok $false -Detail ("HTTP {0}  {1}" -f $code, $Url) -Hint $Hint
            return
        }
        Add-Result -Name $Name -Ok $false -Detail ("连不上 {0} — {1}" -f $Url, $msg) -Hint $Hint
        return
    }

    $code = [int]$resp.StatusCode
    $body = ''
    if ($null -ne $resp.Content) {
        if ($resp.Content -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($resp.Content) }
        else { $body = [string]$resp.Content }
    }
    $size = [Text.Encoding]::UTF8.GetByteCount($body)

    if ($code -ne 200) {
        Add-Result -Name $Name -Ok $false -Detail ("HTTP {0}（期望 200） {1}" -f $code, $Url) -Hint $Hint
        return
    }
    if ($MinBytes -gt 0 -and $size -lt $MinBytes) {
        Add-Result -Name $Name -Ok $false -Detail ("HTTP 200 但只有 {0}B（期望 > {1}B） {2}" -f $size, $MinBytes, $Url) -Hint $Hint
        return
    }
    foreach ($needle in $MustContain) {
        if ($body -notmatch [regex]::Escape($needle)) {
            Add-Result -Name $Name -Ok $false -Detail ("HTTP 200 但响应里没有 '{0}'  {1}" -f $needle, $Url) -Hint $Hint
            return
        }
    }
    Add-Result -Name $Name -Ok $true -Detail ("HTTP 200, {0}B  {1}" -f $size, $Url)
}

# ---------------- Redis ----------------

function Read-RedisLine {
    param($Stream)
    $buf = New-Object System.Collections.Generic.List[byte]
    while ($true) {
        $b = $Stream.ReadByte()
        if ($b -lt 0) { break }
        if ($b -eq 13) { continue }
        if ($b -eq 10) { break }
        $buf.Add([byte]$b)
        if ($buf.Count -gt 4096) { break }
    }
    return [Text.Encoding]::UTF8.GetString($buf.ToArray())
}

function Invoke-RedisTcpPing {
    param([string]$HostName, [int]$Port, [string]$Password)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds(3))) {
            throw ("TCP 连接 {0}:{1} 超时" -f $HostName, $Port)
        }
        $client.EndConnect($iar)
        $client.ReceiveTimeout = 3000
        $stream = $client.GetStream()

        if ($Password) {
            $auth = [Text.Encoding]::UTF8.GetBytes(("AUTH {0}`r`n" -f $Password))
            $stream.Write($auth, 0, $auth.Length); $stream.Flush()
            $authReply = Read-RedisLine -Stream $stream
            if ($authReply -match '^-') { throw ("AUTH 失败：{0}" -f $authReply) }
        }
        $ping = [Text.Encoding]::UTF8.GetBytes("PING`r`n")
        $stream.Write($ping, 0, $ping.Length); $stream.Flush()
        return (Read-RedisLine -Stream $stream)
    } finally {
        $client.Close()
    }
}

function Test-Redis {
    if ($SkipRedis) {
        Add-Result -Name 'redis' -Ok $true -Detail '按 -SkipRedis 跳过'
        return
    }

    $target = ('{0}:{1}' -f $RedisHost, $RedisPort)
    $hint = ('依次检查：① docker compose ps redis 是否 healthy；② 密码是否与服务端 requirepass 一致（默认 siyige123456）；' +
             '③ 应用侧 SIYIGE_REDIS_HOST/PORT/PASSWORD 是否指对；④ 端口是否被占（netstat -ano | findstr :{0}）；' +
             '⑤ 容器网络是否同一 network（compose 内应用必须用服务名 redis，不能写 127.0.0.1）') -f $RedisPort

    # ① 本机 redis-cli
    $cli = Get-Command redis-cli -ErrorAction SilentlyContinue
    if ($cli) {
        $out = & $cli.Source -h $RedisHost -p $RedisPort -a $RedisPassword --no-auth-warning ping 2>&1
        $text = ($out | Out-String).Trim()
        if ($text -match 'PONG') {
            Add-Result -Name 'redis' -Ok $true -Detail ("PONG（redis-cli） {0}" -f $target)
            return
        }
        Add-Result -Name 'redis' -Ok $false -Detail ("redis-cli 返回：{0}  {1}" -f $text, $target) -Hint $hint
        return
    }

    # ② docker exec（本机没装 redis-cli 时最常见）
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        $out = & $docker.Source exec siyige-redis redis-cli -a $RedisPassword --no-auth-warning ping 2>&1
        $text = ($out | Out-String).Trim()
        if ($text -match 'PONG') {
            Add-Result -Name 'redis' -Ok $true -Detail 'PONG（docker exec siyige-redis）'
            return
        }
    }

    # ③ 裸 TCP：AUTH + PING
    try {
        $reply = Invoke-RedisTcpPing -HostName $RedisHost -Port $RedisPort -Password $RedisPassword
        if ($reply -match '^\+PONG') {
            Add-Result -Name 'redis' -Ok $true -Detail ("PONG（TCP AUTH+PING） {0}" -f $target)
        } else {
            Add-Result -Name 'redis' -Ok $false -Detail ("PING 返回：{0}  {1}" -f $reply, $target) -Hint $hint
        }
    } catch {
        Add-Result -Name 'redis' -Ok $false -Detail ("不可达 {0} — {1}" -f $target, $_.Exception.Message) -Hint $hint
    }
}

# ---------------- 主流程 ----------------

$DirectBase = $DirectBase.TrimEnd('/')
$PublicBase = $PublicBase.TrimEnd('/')

Write-Host ''
Write-Host ('== 思弈阁上线自检  {0:yyyy-MM-dd HH:mm:ss} ==' -f (Get-Date)) -ForegroundColor Cyan
Write-Host ("   应用直连：{0}   公网入口：{1}   Redis：{2}:{3}" -f $DirectBase, $PublicBase, $RedisHost, $RedisPort)

Write-Host ''
Write-Host '--- 应用自身（容器/进程内）---' -ForegroundColor Cyan
Invoke-HttpCheck -Name 'app-health' -Url ("{0}/api/health" -f $DirectBase) -MinBytes 2 -MustContain '"ok":true' `
    -Hint ('服务没起来或端口没通：docker compose ps / docker compose logs --tail 100 server；' +
           '进程模式看 journalctl -u siyige -n 80；确认端口未被占用（netstat -ano | findstr :8080）')

if (-not $DirectOnly) {
    Write-Host ''
    Write-Host '--- 公网入口（反向代理之后）---' -ForegroundColor Cyan
    Invoke-HttpCheck -Name 'proxy-health' -Url ("{0}/api/health" -f $PublicBase) -MinBytes 2 -MustContain '"ok":true' `
        -Hint ('反代把 /siyige 前缀弄丢了：① nginx 看 location /siyige/ 的 proxy_pass 是否带/不带末尾斜杠；' +
               '② /opt/lifekit/server.cjs 里 proxyToSiyige 代码块是否还在（grep proxyToSiyige）；' +
               '③ 命中后仍 404 再看下一项的静态产物路径')

    Invoke-HttpCheck -Name 'site-root' -Url ("{0}/" -f $PublicBase) -Hint `
        ('站点根 301/404：确认反代 location 覆盖 /siyige/ 本身（不只是 /siyige/api/）；' +
         '确认应用没有额外配 server.servlet.context-path（容器里应为空，前缀由反代负责）')

    Invoke-HttpCheck -Name 'v2-index' -Url ("{0}/v2/index.html" -f $PublicBase) -MinBytes 501 -Hint `
        ('静态产物没进包或路径不对：① 解包看 BOOT-INF/classes/static/v2/index.html 是否存在；' +
         '② 确认前端 build 的 outDir 仍是 server/src/main/resources/static/v2；' +
         '③ 确认 vite base 是相对 "./"（写死 /siyige/v2/ 本地白屏，写死 /v2/ 线上 404）')
}

Write-Host ''
Write-Host '--- Redis ---' -ForegroundColor Cyan
Test-Redis

# ---------------- 汇总 ----------------

$failed = @($script:Results | Where-Object { -not $_.Ok })
Write-Host ''
Write-Host '== 汇总 ==' -ForegroundColor Cyan
Write-Host ("   共 {0} 项，通过 {1}，失败 {2}" -f $script:Results.Count, ($script:Results.Count - $failed.Count), $failed.Count)

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host '失败项与排查建议：' -ForegroundColor Red
    $i = 1
    foreach ($f in $failed) {
        Write-Host ("  {0}) {1} — {2}" -f $i, $f.Name, $f.Detail) -ForegroundColor Red
        if ($f.Hint) { Write-Host ("     排查：{0}" -f $f.Hint) -ForegroundColor Yellow }
        $i++
    }
    Write-Host ''
    Write-Host '结论：有检查未通过，先别继续放量。' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '结论：全部通过。' -ForegroundColor Green
exit 0
