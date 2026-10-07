@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Lab + ToolHub Unified Full Stack AI Ecosystem

echo ======================================================================
echo    Lab + ToolHub Unified AI Workbench and Skill Execution Engine
echo ======================================================================
echo.

set RUNTIME=
where bun >nul 2>nul
if not errorlevel 1 set RUNTIME=bun
if not defined RUNTIME (
    where node >nul 2>nul
    if not errorlevel 1 set RUNTIME=node
)
if not defined RUNTIME goto :no_runtime
echo [OK] Detected runtime: !RUNTIME!

set DEFAULT_PORT=3000
echo.
set /p USER_PORT=Enter port to run the server [Press ENTER for default 3000]: 
if "!USER_PORT!"=="" (set PORT=!DEFAULT_PORT!) else (set PORT=!USER_PORT!)

echo.
echo [INFO] Starting Lab + ToolHub Ecosystem on port !PORT!...
echo [INFO] URL: http://localhost:!PORT!
echo [INFO] ToolHub Admin: http://localhost:!PORT!/admin/
echo [INFO] Swagger Docs: http://localhost:!PORT!/docs
echo.

if exist "hub.db" goto :run_server

echo [INFO] Initializing SQLite database - hub.db...
if "!RUNTIME!"=="bun" goto :init_bun

call npx prisma generate
if errorlevel 1 goto :failed
call npx prisma db push
if errorlevel 1 goto :failed
call npx tsx prisma/seed.ts --lang=en --admin-pass=admin --agent-pass=123
if errorlevel 1 goto :failed
goto :run_server

:init_bun
call bun run db:generate
if errorlevel 1 goto :failed
call bun run db:push
if errorlevel 1 goto :failed
call bun run db:seed -- --lang=en --admin-pass=admin --agent-pass=123
if errorlevel 1 goto :failed

:run_server
if "!RUNTIME!"=="bun" (
    call bun run start
) else (
    call npm run start
)
if errorlevel 1 goto :failed
goto :end

:no_runtime
echo [ERROR] Neither Bun nor Node.js found in PATH.
echo Please install Bun: https://bun.sh  or Node.js: https://nodejs.org
goto :end

:failed
echo.
echo [ERROR] A command failed. See the messages above.

:end
echo.
pause
endlocal