<#
  MySQL 备份 / 还原 / 演练脚本（siyige-mysql 容器）

  用法：
    .\backup_mysql.ps1                     # 备份一份（自动时间戳）
    .\backup_mysql.ps1 -Verify             # 只看当前库状态
    .\backup_mysql.ps1 -Restore <文件>     # 用某个备份还原（会先备份当前库）
    .\backup_mysql.ps1 -Keep 10            # 保留最近 10 份

  几个踩过的坑（都体现在下面的写法里）：
    1) 不要用 docker exec ... sh -c "mysql -e <sql>"：内层引号会被吞掉，mysql 报语法错。
       直接给 docker exec 传参数（不走 shell），就没有引号问题。
    2) 备份不要用 Set-Content 落盘：PS 会转编码，SQL 就坏了。用 WriteAllText + 无 BOM UTF8。
    3) mysqldump 的 stderr 不能并进 stdout，否则报错信息会被当成 SQL 写进备份文件。
    4) 还原要重定向 stdin，PS 里用 cmd /c 让 cmd 做重定向，字节才不会被转。

  2026-11-27 实测：备份 874KB / 42 表；drop 掉 sy_alert_mute 后还原，表与数据都回来了。
#>
[CmdletBinding()]
param(
  [string]$Container = 'siyige-mysql',
  [string]$Database  = 'siyige',
  [string]$User      = 'root',
  [string]$Password  = $(if ($env:SIYIGE_DB_PASSWORD) { $env:SIYIGE_DB_PASSWORD } else { 'siyige123456' }),
  [string]$Dir       = 'D:\siyige-v2\_backup',
  [int]$Keep         = 7,
  [string]$Restore   = '',
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'

function Invoke-Sql {
  param([string]$Sql)
  $uArg = "-u" + $User
  $out = docker exec -e "MYSQL_PWD=$Password" $Container mysql $uArg -N -e $Sql $Database 2>&1
  if ($LASTEXITCODE -ne 0) { throw ("SQL 失败: " + ($out -join ' ')) }
  return $out
}

function Show-State {
  Write-Host '=== 当前库状态 ==='
  $tables = Invoke-Sql "select count(*) from information_schema.tables where table_schema='$Database'"
  Write-Host ("  表数: " + ($tables -join '').Trim())
  foreach ($t in @('sy_user','sy_post','sy_match','sy_tag','sy_sensitive_word','sy_config','sy_alert')) {
    $n = Invoke-Sql "select count(*) from $t"
    Write-Host ("  " + $t.PadRight(20) + ($n -join '').Trim() + " 行")
  }
}

function New-Backup {
  param([string]$Tag = 'auto')
  if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $file  = Join-Path $Dir ("siyige-" + $Tag + "-" + $stamp + ".sql")
  Write-Host ("备份 -> " + $file)

  $uArg = "-u" + $User
  $dump = docker exec -e "MYSQL_PWD=$Password" $Container mysqldump $uArg --single-transaction --routines --databases $Database 2>$null
  if ($LASTEXITCODE -ne 0) { throw "mysqldump 失败（退出码 $LASTEXITCODE）" }
  [System.IO.File]::WriteAllText($file, ($dump -join "`n"), (New-Object System.Text.UTF8Encoding($false)))

  $kb = [Math]::Round((Get-Item $file).Length / 1KB, 1)
  $tables = (Select-String -Path $file -Pattern 'CREATE TABLE').Count
  if ($tables -eq 0) { throw ("备份文件里没有任何 CREATE TABLE，导出可能失败: " + $file) }
  Write-Host ("  完成: " + $kb + " KB, " + $tables + " 张表")

  $old = Get-ChildItem (Join-Path $Dir 'siyige-*.sql') | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
  if ($old) { $old | ForEach-Object { Write-Host ("  清理旧备份: " + $_.Name); Remove-Item $_.FullName -Force } }
  return $file
}

Write-Host ("容器 " + $Container + " | 库 " + $Database + " | 目录 " + $Dir)

if ($Verify) { Show-State; return }

if ($Restore) {
  if (-not (Test-Path $Restore)) { throw ("找不到备份文件: " + $Restore) }
  Write-Host ("还原 <- " + $Restore)
  New-Backup -Tag 'before-restore' | Out-Null
  $full = (Resolve-Path $Restore).Path
  $cmd  = 'docker exec -i -e MYSQL_PWD=' + $Password + ' ' + $Container + ' mysql -u' + $User + ' < "' + $full + '"'
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { throw ("还原失败（退出码 " + $LASTEXITCODE + "）") }
  Write-Host '  还原完成'
  Show-State
  return
}

New-Backup | Out-Null
Show-State
