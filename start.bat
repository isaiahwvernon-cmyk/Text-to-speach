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

for /f "tokens=*" %%v in ('node -e "process.stdout.write(process.version)"') do set NODEVER=%%v
echo Node.js version: %NODEVER%
echo.

if not exist node_modules (
    echo Installing dependencies... this may take a minute.
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: npm install failed. See above for details.
        pause
        exit /b 1
    )
    echo.
)

for /f "tokens=14 delims= " %%i in ('ipconfig ^| findstr /c:"IPv4 Address"') do set IP=%%i

echo Starting server...
echo.
echo Open your browser to:
echo   http://localhost:5000
echo   http://%IP%:5000
echo.
echo Press Ctrl+C to stop the server.
echo ==========================================
echo.

set NODE_ENV=development
npx tsx server/index.ts

echo.
echo ==========================================
echo   Server stopped.
echo ==========================================
echo.
if %errorlevel% neq 0 (
    echo ERROR: The server exited with an error (code %errorlevel%).
    echo Please copy the error message above and report it.
)
pause
