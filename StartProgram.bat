@echo off
setlocal enabledelayedexpansion
title Lab + ToolHub Unified Full Stack AI Ecosystem

echo ======================================================================
echo    Lab + ToolHub Unified AI Workbench and Skill Execution Engine
echo ======================================================================
echo.

:: Check for Bun or Node runtime
where bun >nul 2>nul
if %errorlevel% equ 0 (
    set RUNTIME=bun
    echo [OK] Detected Bun runtime.
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set RUNTIME=node
        echo [OK] Detected Node.js runtime.
    ) else (
        echo [ERROR] Neither Bun nor Node.js found in PATH.
        echo Please install Bun (https://bun.sh) or Node.js (https://nodejs.org).
        pause
        exit /b 1
    )
)

:: Prompt user for Port (Default: 3000)
set DEFAULT_PORT=3000
echo.
set /p USER_PORT="Enter port to run the server [Press ENTER for default 3000]: "
if "!USER_PORT!"=="" (
    set PORT=!DEFAULT_PORT!
) else (
    set PORT=!USER_PORT!
)

echo.
echo [INFO] Starting Lab + ToolHub Ecosystem on port %PORT%...
echo [INFO] URL: http://localhost:%PORT%
echo [INFO] ToolHub Admin: http://localhost:%PORT%/admin/
echo [INFO] Swagger Docs: http://localhost:%PORT%/docs
echo.

set PORT=%PORT%

:: Check if database needs seeding or generation
if not exist "hub.db" (
    echo [INFO] Initializing SQLite database (hub.db)...
    if "!RUNTIME!"=="bun" (
        call bun run db:generate
        call bun run db:push
        call bun run db:seed -- --lang=en --admin-pass=admin --agent-pass=123
    ) else (
        call npx prisma generate
        call npx prisma db push
        call npx tsx prisma/seed.ts --lang=en --admin-pass=admin --agent-pass=123
    )
)

:: Run Full Stack Server
if "!RUNTIME!"=="bun" (
    bun run start
) else (
    npm run start
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Program exited with an error code.
    pause
)
