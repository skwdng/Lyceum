# 统一构建入口：所有 agent / 人都从这里跑 mvn / npm，避免并发写 target 与 static 互相踩。
# 用法（Windows PowerShell 5.1 与 pwsh 7 都可用）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\locked-build.ps1 compile
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\locked-build.ps1 test -Dtest=ScoreRubricTest
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\locked-build.ps1 web
#
# 说明：Maven / npm 的 stderr（如 JVM 的 CDS warning）在 PowerShell 里会被包装成
# NativeCommandError，直接管道会污染退出码。这里统一走 cmd /c 重定向，只看真实退出码。
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Goal,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$lock = Join-Path $repo '.build.lock'
$logDir = Join-Path $repo 'target\build-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Acquire-Lock([int]$timeoutSec = 900) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $lock) {
            # 文件在但抢不到独占句柄 = 有人在构建；抢得到 = 上次异常退出的残留锁，清掉
            try {
                $probe = [System.IO.File]::Open($lock, 'Open', 'ReadWrite', 'None')
                $probe.Dispose()
                Remove-Item $lock -Force -ErrorAction SilentlyContinue
                continue
            } catch {
                Start-Sleep -Milliseconds 1500
                continue
            }
        }
        try {
            return [System.IO.File]::Open($lock, 'CreateNew', 'Write', 'None')
        } catch {
            Start-Sleep -Milliseconds 1500
        }
    }
    throw "等待构建锁超时（$lock 被占用超过 $timeoutSec 秒）"
}

$handle = Acquire-Lock
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
try {
    if ($Goal -eq 'web') {
        $out = Join-Path $logDir "web-$stamp.log"
        $line = "npm run build > `"$out`" 2>&1"
        $work = Join-Path $repo 'web'
    } else {
        $out = Join-Path $logDir "mvn-$Goal-$stamp.log"
        $extra = if ($Rest) { ' ' + ($Rest -join ' ') } else { '' }
        $line = "mvn -q $Goal$extra > `"$out`" 2>&1"
        $work = Join-Path $repo 'server'
    }
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $line) `
        -WorkingDirectory $work -NoNewWindow -Wait -PassThru
    $code = $p.ExitCode
    Get-Content $out -Tail 15 -ErrorAction SilentlyContinue
    Write-Output "build log: $out"
    exit $code
} finally {
    $handle.Dispose()
    Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
