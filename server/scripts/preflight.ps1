# 部署前自检：确认 jar 里的关键资源没丢
# 用法：powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$jar = 'target\siyige-backend-0.1.0.jar'
if (-not (Test-Path $jar)) { Write-Host "FAIL: 没有 $jar，先 mvn package" -ForegroundColor Red; exit 1 }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $jar))
$need = @(
    'BOOT-INF/classes/application.yml',
    'BOOT-INF/classes/schema.sql',
    'BOOT-INF/classes/static/index.html'
)
$ok = $true
foreach ($n in $need) {
    $hit = $zip.Entries | Where-Object { $_.FullName -eq $n }
    if ($hit) {
        Write-Host ("OK   {0} ({1} B)" -f $n, $hit.Length) -ForegroundColor Green
    } else {
        Write-Host ("MISS {0}  ← 缺了会在启动时报 Table not found" -f $n) -ForegroundColor Red
        $ok = $false
    }
}
$cls = ($zip.Entries | Where-Object { $_.FullName -like 'BOOT-INF/classes/com/siyige/*.class' -or $_.FullName -like 'BOOT-INF/classes/com/siyige/**/*.class' } | Measure-Object).Count
Write-Host ("类是 {0} 个" -f $cls)
$zip.Dispose()

if (-not $ok) {
    Write-Host "`n修复：删掉 target 重新打包（jar 被占用会导致 repackage 静默失败）" -ForegroundColor Yellow
    Write-Host "  Get-Process java | Stop-Process -Force" -ForegroundColor Yellow
    Write-Host "  Remove-Item target -Recurse -Force; mvn package -DskipTests" -ForegroundColor Yellow
    exit 1
}
Write-Host "`n通过，可以 scp 到服务器" -ForegroundColor Green
