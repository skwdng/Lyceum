<#
.SYNOPSIS
    思弈阁数据备份：H2 数据文件 + server/config 打成一个带时间戳的 zip，只留最近 N 份。

.DESCRIPTION
    备份内容（zip 内保持仓库相对路径，解包即可对照还原）：
      server\config\  —— server/config 整个目录（含 application.yml；**里面有 API Key，zip 不要入库/外发**）
      data\           —— 仓库内所有 H2 数据文件（*.mv.db / *.trace.db / *.lock.db）与 data/ 目录
      MANIFEST.txt    —— 备份清单 + git 版本 + 时间

    输出：<OutputDir>\yyyyMMdd-HHmmss.zip（默认 D:\siyige\backups）
    保留：最近 7 份（-Keep 可调），更早的自动删除并在输出里列出

    注意：
      · H2 默认是**内存库**（application.yml 里 jdbc:h2:mem:siyige），这时只有 config 会被备份，
        脚本会明确提示「没有找到 H2 数据文件」，不会静默成功一个空壳。
      · 要真正落盘：docker-compose.yml 里打开 SPRING_DATASOURCE_URL=jdbc:h2:file:/app/data/siyige。
      · 运行中的 H2 文件库建议先导出一份（或停服 / 用文件库自带的 BACKUP TO），
        直接在重启前打包 .mv.db 可能拿到半写状态。

.EXAMPLE
    pwsh -File scripts/ops/backup.ps1

.EXAMPLE
    pwsh -File scripts/ops/backup.ps1 -Keep 14 -OutputDir D:\backups\siyige
#>
#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$OutputDir = '',
    [int]$Keep = 7,
    [string[]]$DataDirs = @(),
    [string[]]$ConfigDirs = @(),
    [switch]$KeepForever
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

if (-not $RepoRoot) {
    # scripts/ops/backup.ps1 → 上两级
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not $OutputDir) { $OutputDir = Join-Path $RepoRoot 'backups' }
if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host ''
Write-Host ('== 思弈阁备份  {0:yyyy-MM-dd HH:mm:ss} ==' -f (Get-Date)) -ForegroundColor Cyan
Write-Host ("   仓库：{0}" -f $RepoRoot)
Write-Host ("   输出：{0}" -f $OutputDir)

# ---------------- 收集待备份文件 ----------------

$h2Patterns = @('*.mv.db', '*.trace.db', '*.lock.db')
$excludeDirs = @('node_modules', '.git', 'target', 'dist', '.vite', 'backups', 'logs')

function Test-Excluded {
    param([string]$FullPath)
    foreach ($d in $excludeDirs) {
        $pattern = '[\\/]' + [regex]::Escape($d) + '[\\/]'
        if ($FullPath -match $pattern) { return $true }
    }
    return $false
}

$dataFiles = New-Object System.Collections.Generic.List[string]

# 显式指定的数据目录
$explicitData = @($DataDirs | Where-Object { $_ })
foreach ($d in $explicitData) {
    if (Test-Path -LiteralPath $d) {
        Get-ChildItem -LiteralPath $d -Recurse -File -Force -ErrorAction SilentlyContinue |
            ForEach-Object { $dataFiles.Add($_.FullName) }
    } else {
        Write-Host ("   [WARN] 指定的数据目录不存在，跳过：{0}" -f $d) -ForegroundColor Yellow
    }
}

# 仓库内自动发现 H2 文件（排掉 node_modules/target 等）
foreach ($pat in $h2Patterns) {
    Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force -Filter $pat -ErrorAction SilentlyContinue |
        Where-Object { -not (Test-Excluded $_.FullName) -and $_.FullName -notmatch '[\\/]backups[\\/]' } |
        ForEach-Object { $dataFiles.Add($_.FullName) }
}

# 约定目录：<repo>/data、<repo>/server/data
foreach ($rel in @('data', 'server\data')) {
    $p = Join-Path $RepoRoot $rel
    if (Test-Path -LiteralPath $p) {
        Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue |
            ForEach-Object { $dataFiles.Add($_.FullName) }
    }
}

$dataFiles = @($dataFiles | Sort-Object -Unique)

# config
$configRoots = @()
$explicitCfg = @($ConfigDirs | Where-Object { $_ })
if ($explicitCfg.Count -gt 0) {
    foreach ($c in $explicitCfg) { if (Test-Path -LiteralPath $c) { $configRoots += (Resolve-Path -LiteralPath $c).Path } }
} else {
    foreach ($rel in @('server\config', 'config')) {
        $p = Join-Path $RepoRoot $rel
        if (Test-Path -LiteralPath $p) { $configRoots += $p }
    }
}
$configFiles = @()
foreach ($root in ($configRoots | Sort-Object -Unique)) {
    $configFiles += (Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
}
$configFiles = @($configFiles | Sort-Object -Unique)

if ($dataFiles.Count -eq 0 -and $configFiles.Count -eq 0) {
    Write-Host '   [FAIL] 没找到任何可备份内容（既没有 H2 数据文件，也没有 server/config）。' -ForegroundColor Red
    Write-Host '          排查：确认在仓库根执行；确认 server/config/application.yml 存在；' -ForegroundColor Yellow
    Write-Host '          若是容器部署，用 -DataDirs <宿主挂载的 data 目录> 显式指定。' -ForegroundColor Yellow
    exit 1
}
if ($dataFiles.Count -eq 0) {
    Write-Host '   [WARN] 没有找到 H2 数据文件 —— 当前是内存库（jdbc:h2:mem），本次只备份配置。' -ForegroundColor Yellow
    Write-Host '          要持久化：docker-compose.yml 打开 SPRING_DATASOURCE_URL=jdbc:h2:file:/app/data/siyige' -ForegroundColor Yellow
}

Write-Host ("   待备份：H2 数据 {0} 个文件，配置 {1} 个文件" -f $dataFiles.Count, $configFiles.Count)

# ---------------- 组装临时目录（保持相对路径）----------------

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path $OutputDir ("{0}.zip" -f $stamp)
$stage = Join-Path ([IO.Path]::GetTempPath()) ("siyige-backup-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# zip 内保持仓库相对路径：server\config\application.yml、data\siyige.mv.db，解包即可对照还原
function Get-RelToRepo {
    param([string]$Full)
    $rootFull = $RepoRoot.TrimEnd('\', '/')
    if ($Full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
        return $Full.Substring($rootFull.Length).TrimStart('\', '/')
    }
    # 仓库外的路径（-DataDirs/-ConfigDirs 指到别处）挂到 external\ 下
    return ('external\' + ($Full.TrimStart('\', '/') -replace ':', ''))
}

function Copy-IntoStage {
    param([string]$Source)
    $full = (Resolve-Path -LiteralPath $Source).Path
    $rel = Get-RelToRepo -Full $full
    $target = Join-Path $stage $rel
    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $full -Destination $target -Force
    return $rel
}

$manifest = New-Object System.Collections.Generic.List[string]
$manifest.Add(("# siyige backup {0}" -f (Get-Date).ToString('s')))
$gitRev = ''
try { $gitRev = (& git -C $RepoRoot rev-parse --short HEAD 2>$null) } catch { $gitRev = '' }
if ($gitRev) { $manifest.Add(("git: {0}" -f $gitRev)) }
$manifest.Add(("repo: {0}" -f $RepoRoot))
$manifest.Add('')

foreach ($f in $dataFiles) {
    $rel = Copy-IntoStage -Source $f
    $manifest.Add(("data   {0}" -f $rel))
}
foreach ($f in $configFiles) {
    $rel = Copy-IntoStage -Source $f
    $manifest.Add(("config {0}" -f $rel))
}
Set-Content -LiteralPath (Join-Path $stage 'MANIFEST.txt') -Value $manifest -Encoding UTF8

# ---------------- 压缩 ----------------

try {
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
} catch {
    Write-Host ("   [FAIL] 打包失败：{0}" -f $_.Exception.Message) -ForegroundColor Red
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeKb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1KB, 1)
Write-Host ("   [ OK ] 已生成 {0}（{1} KB）" -f $zipPath, $sizeKb) -ForegroundColor Green

# ---------------- 保留策略 ----------------

if ($KeepForever) {
    Write-Host '   [INFO] -KeepForever：不清理历史备份' -ForegroundColor Cyan
} else {
    $all = @(Get-ChildItem -LiteralPath $OutputDir -File -Filter '*.zip' | Sort-Object LastWriteTime -Descending)
    $doomed = @($all | Select-Object -Skip $Keep)
    if ($doomed.Count -gt 0) {
        foreach ($old in $doomed) {
            try {
                Remove-Item -LiteralPath $old.FullName -Force
                Write-Host ("   [CLEAN] 删除旧备份 {0}" -f $old.Name) -ForegroundColor DarkGray
            } catch {
                Write-Host ("   [WARN] 删不掉 {0}：{1}" -f $old.Name, $_.Exception.Message) -ForegroundColor Yellow
            }
        }
    }
    $kept = @(Get-ChildItem -LiteralPath $OutputDir -File -Filter '*.zip').Count
    Write-Host ("   [INFO] 当前保留 {0} 份（上限 {1}）" -f $kept, $Keep) -ForegroundColor Cyan
}

Write-Host ''
Write-Host '提示：zip 里含 server/config/application.yml（API Key），别提交、别外发。' -ForegroundColor Yellow
exit 0
