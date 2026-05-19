@echo off
REM ===========================================================
REM  hmm-imagegen — one-shot Windows installer
REM
REM  What this does:
REM   1. Installs Bun (via winget if available, else PowerShell installer)
REM   2. Runs `bun install` to grab dependencies
REM   3. Prompts for your Gemini API key (optional) and writes it to .env
REM   4. Tells you how to launch
REM
REM  Idempotent — safe to re-run. Skips steps that are already done.
REM ===========================================================
setlocal enabledelayedexpansion

echo.
echo === hmm-imagegen setup ===
echo.

REM -----------------------------------------------------------
REM  1. Bun
REM -----------------------------------------------------------
where bun >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [1/4] Bun already installed:
    bun --version
) else (
    echo [1/4] Installing Bun...
    where winget >nul 2>&1
    if !ERRORLEVEL!==0 (
        winget install --silent --accept-source-agreements --accept-package-agreements Oven-sh.Bun
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    )
    REM Bun installs to %USERPROFILE%\.bun\bin — add to PATH for this session.
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    where bun >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo ERROR: Bun installation finished but `bun` is still not on PATH.
        echo Try opening a new terminal and re-running this installer.
        exit /b 1
    )
)

REM -----------------------------------------------------------
REM  2. Dependencies
REM -----------------------------------------------------------
echo.
echo [2/4] Installing project dependencies (bun install)...
call bun install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: `bun install` failed.
    exit /b 1
)

REM -----------------------------------------------------------
REM  3. Gemini API key
REM -----------------------------------------------------------
echo.
echo [3/4] Gemini API key (used for AI scene generation).
if exist .env (
    findstr /B /C:"GEMINI_API_KEY=" .env >nul
    if !ERRORLEVEL!==0 (
        echo       .env already contains a GEMINI_API_KEY — leaving it as-is.
        goto :launch
    )
)
echo       The wizard works without this — only image generation needs it.
echo       Get one free at https://aistudio.google.com/app/apikey
set /p "APIKEY=      Paste your key here (or press Enter to skip): "
if not "!APIKEY!"=="" (
    >>.env echo GEMINI_API_KEY=!APIKEY!
    echo       Saved to .env
) else (
    echo       Skipped. You can add it later by editing .env in the repo root.
)

:launch
REM -----------------------------------------------------------
REM  4. Launch instructions
REM -----------------------------------------------------------
echo.
echo [4/4] Setup complete!
echo.
echo To launch the app:
echo     bun run dev
echo.
echo Then open http://localhost:5173 in your browser.
echo (Make sure Anki desktop is running with the AnkiConnect add-on installed —
echo  Tools - Add-ons - Get Add-ons - code 2055492159.)
echo.
echo Launch now? [Y/n]
set /p "GO="
if /I "!GO!"=="" set "GO=Y"
if /I "!GO!"=="Y" (
    start "" http://localhost:5173
    call bun run dev
)

endlocal
