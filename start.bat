@echo off
echo ==========================================
echo   REPIT — IP-A1 Control + TTS Paging
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

for /f %%v in ('node --version') do set NODEVER=%%v
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

echo Building REPIT... this takes about 30 seconds.
echo.

if exist dist rmdir /s /q dist

call npx tsx script/build.ts
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed. See above for details.
    pause
    exit /b 1
)

echo.
echo Build complete!
echo.
echo ==========================================
echo   Default login credentials:
echo     Admin:  admin  / admin
echo     IT:     it     / it1234
echo   (Change these after first login)
echo ==========================================
echo.
echo Starting server...
echo.
echo Open your browser to: http://localhost:5000
echo The Connect page shows a QR code for other devices on your network.
echo.
echo Press Ctrl+C to stop the server.
echo ==========================================
echo.

start "" /B cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:5000"

node dist\index.cjs

echo.
echo ==========================================
echo   Server stopped. Press any key to close.
echo ==========================================
echo.
pause
