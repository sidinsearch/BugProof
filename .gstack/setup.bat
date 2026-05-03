@echo off
REM BugProof quick-start setup for Windows
REM Run this first to get everything configured

setlocal enabledelayedexpansion

echo.
echo ^>^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.                  BugProof ^+ gstack Setup
echo.     Executable bugs, not bug reports. AI-assisted dev.
echo ^>^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.

REM Step 1: Check prerequisites
echo 1^) Checking prerequisites...
echo.

set missing=
where /q git || set "missing=!missing! Git"
where /q node || set "missing=!missing! Node.js"
where /q bun || set "missing=!missing! Bun"

if not "!missing!"=="" (
  echo ^✗ Missing:!missing!
  echo.
  echo Install from:
  echo   * Git: https://git-scm.com/
  echo   * Node.js: https://nodejs.org/
  echo   * Bun: https://bun.sh/ (v1.0^+)
  pause
  exit /b 1
)

echo ^✓ Git, Node.js, Bun installed
echo.

REM Step 2: Detect AI platforms
echo 2^) Detecting AI platforms...
echo.

set "platforms="
if exist "%USERPROFILE%\.claude\skills" set "platforms=!platforms!claude "
if exist "%USERPROFILE%\.config\opencode\skills" set "platforms=!platforms!opencode "
if exist "%USERPROFILE%\.cursor\skills" set "platforms=!platforms!cursor "
if exist "%USERPROFILE%\.antigravity\skills" set "platforms=!platforms!antigravity "
if exist "%USERPROFILE%\.openclaw\skills" set "platforms=!platforms!openclaw "

if "!platforms!"=="" (
  echo ^✗ No AI platforms detected!
  echo.
  echo Install one of:
  echo   * Claude Code: https://docs.anthropic.com/en/docs/claude-code
  echo   * OpenCode, Cursor, Antigravity, or OpenClaw
  pause
  exit /b 1
)

echo ^✓ Found:!platforms!
echo.

REM Step 3: Install gstack
echo 3^) Installing gstack...
echo.

set "GSTACK_REPO=%USERPROFILE%\.claude\skills\gstack"
if not exist "!GSTACK_REPO!" (
  echo 📥 Cloning gstack...
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "!GSTACK_REPO!"
  echo ^✓ gstack cloned
) else (
  echo i gstack already installed
)

echo.

REM Step 4: Setup for each platform
echo 4^) Setting up gstack for all platforms...
echo.

cd /d "!GSTACK_REPO!"
call setup --host auto

echo.
echo ^✓ gstack configured for all platforms
echo.

REM Step 5: Environment config
echo 5^) Copying environment configuration...
echo.

if not exist ".env" (
  copy .env.example .env 2>nul
  echo ^✓ .env created from .env.example
  echo    Review and edit .env with your settings
) else (
  echo i .env already exists
)

echo.

REM Step 6: Done!
echo.
echo ^>^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.                       ^✓ Setup Complete!
echo ^>^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.

echo Next steps:
echo.
echo 1. Open your AI platform ^(Claude Code, OpenCode, etc.^)
echo 2. Load gstack ^(usually automatic^)
echo 3. Start planning:
echo.
echo    /office-hours
echo.
echo    ^(Answer 6 forcing questions about what you want to build^)
echo.
echo 4. Lock architecture:
echo.
echo    /plan-eng-review
echo.
echo 5. Start implementing!
echo.

echo Learn more:
echo    * Project: see README.md
echo    * Development: see CONTRIBUTING.md
echo    * Context switching: see docs\CONTEXT_MEMORY.md
echo    * gstack skills: see CLAUDE.md
echo.

echo Tips:
echo    * Run /office-hours even for small tasks
echo    * Use /review before /ship
echo    * Use /qa on staging to catch real bugs
echo    * Use GBrain to preserve context across sessions
echo.

echo Questions? See CLAUDE.md or https://github.com/garrytan/gstack
echo.

pause
