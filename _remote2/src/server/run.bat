@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   SiYiGe backend launcher
echo ============================================

rem 1) free port 8080 if occupied
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo [1/3] port 8080 held by PID %%p - stopping it
  taskkill /f /pid %%p >nul 2>&1
)

rem 2) build if jar missing
if not exist "target\siyige-backend-0.1.0.jar" (
  echo [2/3] first run - building with maven ...
  call mvn -q -DskipTests package
  if errorlevel 1 (
    echo.
    echo [FAILED] build error. Paste the log above.
    pause
    exit /b 1
  )
) else (
  echo [2/3] jar found, skip build
)

rem 3) start
echo [3/3] starting on http://localhost:8080
echo       close this window to stop the server
start "" http://localhost:8080/api/health
java -jar target\siyige-backend-0.1.0.jar --server.port=8080 --siyige.pace.time-scale=0.02

echo.
echo server exited. If it crashed, paste the log above.
pause
