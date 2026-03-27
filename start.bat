@echo off
echo ==========================================
echo   REPIT -- IP-A1 Control + TTS Paging
echo ==========================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
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

:: ── Install Node dependencies if needed ──────────────────────────────────────
if not exist node_modules (
    echo Installing Node dependencies... this may take a minute.
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

:: ── Find a working Python installation ───────────────────────────────────────
echo Checking TTS engine (Kokoro)...
echo.

set PYTHON_CMD=

:: First try 'py' (the Python Launcher for Windows — most reliable)
py --version >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=py
    goto :CHECK_KOKORO
)

:: Try 'python' but confirm it is a real install, not the Windows Store stub
:: The store stub prints nothing useful and exits non-zero
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYCHECK=%%v
echo %PYCHECK% | findstr /C:"Python 3" >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
    goto :CHECK_KOKORO
)

:: Try 'python3'
for /f "tokens=*" %%v in ('python3 --version 2^>^&1') do set PYCHECK=%%v
echo %PYCHECK% | findstr /C:"Python 3" >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=python3
    goto :CHECK_KOKORO
)

:: No working Python found
echo [TTS] Python 3 not found. Kokoro TTS will not be available.
echo [TTS] To enable real audio: install Python 3.8+ from https://python.org
echo [TTS]   - During install, check "Add Python to PATH"
echo [TTS]   - Or disable the Windows Store stub in:
echo [TTS]     Settings ^> Apps ^> Advanced app settings ^> App execution aliases
echo [TTS] REPIT will run in simulation mode without Python.
echo.
goto :BUILD

:: ── Check / install Kokoro ────────────────────────────────────────────────────
:CHECK_KOKORO
for /f "tokens=*" %%v in ('%PYTHON_CMD% --version') do set PYVER=%%v
echo Python found: %PYVER%

%PYTHON_CMD% -c "import kokoro" >nul 2>nul
if %errorlevel% equ 0 (
    echo [TTS] Kokoro TTS: already installed -- OK
    echo.
    goto :BUILD
)

echo [TTS] Installing Kokoro TTS and dependencies...
echo [TTS] This may take several minutes on first run.
echo.
%PYTHON_CMD% -m pip install kokoro soundfile
if %errorlevel% neq 0 (
    echo.
    echo [TTS] WARNING: Kokoro install failed. TTS will run in simulation mode.
    echo [TTS] Retry manually: pip install kokoro soundfile
    echo.
) else (
    echo.
    echo [TTS] Kokoro TTS installed successfully!
    echo.
)

:: ── Build REPIT ───────────────────────────────────────────────────────────────
:BUILD
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

:: ── Launch ───────────────────────────────────────────────────────────────────
echo ==========================================
echo   Default login credentials:
echo     Admin:  admin  / admin
echo     IT:     it     / it1234
echo   (Change these after first login via Admin panel)
echo ==========================================
echo.
echo Starting server...
echo.
echo Open your browser to: http://localhost:5000
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
