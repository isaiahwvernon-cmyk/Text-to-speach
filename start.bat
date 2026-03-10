@echo off
echo ==========================================
echo   TOA IP-A1 Speaker Control
echo ==========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please download and install it from https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies... this may take a minute.
    echo.
    call npm install
    echo.
)

echo Starting server...
echo.
echo Open your browser to:  http://localhost:5000
echo.
echo Press Ctrl+C to stop the server.
echo ==========================================
echo.

set NODE_ENV=development
npx tsx server/index.ts
