# 一条命令做完：清干净 → 构建 → 查资源 → 真启动一次 → 关掉
# 用法：powershell -ExecutionPolicy Bypass -File .\scripts\build-and-verify.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '[1/4] 停掉占用 jar 的 java 进程' -ForegroundColor Cyan
Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host '[2/4] 清空 target 并重新打包' -ForegroundColor Cyan
Remove-Item target -Recurse -Force -ErrorAction SilentlyContinue
$log = 'target\build.txt'
New-Item -ItemType Directory -Force -Path target | Out-Null
& mvn package -DskipTests -B 2>&1 | Tee-Object -FilePath $log | Out-Null
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Host '构建失败，真正的错误行：' -ForegroundColor Red
    Select-String -Path $log -Pattern '\[ERROR\].*\.java' | Select-Object -First 12 | ForEach-Object { Write-Host "  $($_.Line)" -ForegroundColor Red }
    exit 1
}
Write-Host '  构建成功' -ForegroundColor Green

Write-Host '[3/4] 检查 jar 里的关键资源' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'preflight.ps1') | Out-Null
if ($LASTEXITCODE -ne 0) {
    # 已知怪现象：target 刚清空时首次打包，资源可能没进 jar（classes 里有、jar 里没有）
    # 复跑一次 package 就能带上。这里自动重试一次，不让人记这个坑。
    Write-Host '  资源没进 jar，自动二次打包...' -ForegroundColor Yellow
    & mvn package -DskipTests -B 2>&1 | Out-Null
    & (Join-Path $PSScriptRoot 'preflight.ps1')
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host '  资源齐全' -ForegroundColor Green
}

Write-Host '[4/4] 真启动一次（8099 端口，不碰 8080）' -ForegroundColor Cyan
$p = Start-Process -FilePath 'java' -ArgumentList @(
    '-jar', 'target\siyige-backend-0.1.0.jar',
    '--server.port=8099',
    '--spring.datasource.url=jdbc:h2:mem:verify'
) -PassThru -RedirectStandardOutput 'target\verify.log' -RedirectStandardError 'target\verify.err'
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    try {
        $h = Invoke-RestMethod 'http://127.0.0.1:8099/api/health' -TimeoutSec 2
        if ($h.ok) { $ok = $true; break }
    } catch { }
    if ($p.HasExited) { break }
}
if ($ok) {
    $ev = Invoke-RestMethod 'http://127.0.0.1:8099/api/topics/t4/evidence' -TimeoutSec 5
    Write-Host ("  启动正常 · 论据库 {0} 张卡" -f $ev.count) -ForegroundColor Green
} else {
    Write-Host '  启动失败，看日志：' -ForegroundColor Red
    Select-String -Path 'target\verify.log' -Pattern 'Caused by|Unresolved|APPLICATION FAILED' | Select-Object -First 6 | ForEach-Object { Write-Host "  $($_.Line)" -ForegroundColor Red }
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
if ($ok) { Write-Host "`n可以部署：scp target\siyige-backend-0.1.0.jar root@<host>:/opt/siyige/siyige.jar" -ForegroundColor Green; exit 0 }
exit 1
