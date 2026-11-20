[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
# 无论在哪个目录执行，都切到 server 根目录
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '================ 思弈阁后端 自检 ================' -ForegroundColor Cyan

Write-Host ''
Write-Host '[1] Java / Maven'
$java = (& java -version 2>&1) | Select-Object -First 1
if ($java) { Write-Host "    java: $java" -ForegroundColor Green } else { Write-Host '    java 不可用（没装或不在 PATH）' -ForegroundColor Red }
$mvnv = (& mvn -v 2>&1) | Select-Object -First 1
if ($mvnv) { Write-Host "    mvn : $mvnv" -ForegroundColor Green } else { Write-Host '    mvn 不可用（改用 run.bat，它只需要 jar）' -ForegroundColor Yellow }

Write-Host ''
Write-Host '[2] 工作目录'
Write-Host "    当前: $(Get-Location)"
if (Test-Path 'pom.xml') { Write-Host '    OK 在 server 目录下' -ForegroundColor Green }
else { Write-Host '    X 不在 server 目录，先 cd D:\siyige\server' -ForegroundColor Red }

Write-Host ''
Write-Host '[3] 构建产物'
$jar = 'target\siyige-backend-0.1.0.jar'
if (Test-Path $jar) {
    Write-Host ("    OK {0} · {1:N1} MB" -f $jar, ((Get-Item $jar).Length / 1MB)) -ForegroundColor Green
} else {
    Write-Host '    X 没有 jar，先执行 mvn -DskipTests package（或双击 run.bat）' -ForegroundColor Red
}

Write-Host ''
Write-Host '[4] 8080 端口'
$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn[0].OwningProcess
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    Write-Host ("    被 PID {0}（{1}）占用 —— 若是旧实例，先关掉再启动" -f $procId, $proc.ProcessName) -ForegroundColor Yellow
} else {
    Write-Host '    空闲 OK' -ForegroundColor Green
}

Write-Host ''
Write-Host '[5] 服务健康'
try {
    $h = Invoke-RestMethod 'http://localhost:8080/api/health' -TimeoutSec 4
    Write-Host ("    OK 已在运行 · hotKey={0} · 成员 {1}" -f $h.hotKey, $h.hotSize) -ForegroundColor Green
    Write-Host '    浏览器打开 http://localhost:8080/api/topics 看看' -ForegroundColor Green
} catch {
    Write-Host '    X 没有响应 —— 服务没起来，看启动窗口的报错' -ForegroundColor Red
}

Write-Host ''
Write-Host '================================================='
Write-Host '常见问题：'
Write-Host '  1) Port 8080 was already in use -> 关掉旧 java 进程（run.bat 会自动处理）'
Write-Host '  2) 报找不到 main class -> 在 D:\siyige\server 下执行，不在 D:\siyige'
Write-Host '  3) 页面白屏 -> 别用编辑器预览，用浏览器打开 html'
Write-Host '  4) 依赖下载慢 -> 首次构建要下 Spring Boot 全套，正常'
