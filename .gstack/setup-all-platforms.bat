@echo off
REM BugProof multi-platform gstack setup for Windows
REM Installs gstack for all AI coding platforms you have installed
REM Requires: Git, Node.js, Bun

setlocal enabledelayedexpansion

echo.
echo 🚀 BugProof gstack setup
echo.

REM Detect which platforms are installed
set platforms=
set claude_path=
set opencode_path=
set cursor_path=
set antigravity_path=
set openclaw_path=

if exist "%USERPROFILE%\.claude\skills" (
  set "platforms=!platforms! claude"
  set "claude_path=%USERPROFILE%\.claude\skills"
)

if exist "%USERPROFILE%\.config\opencode\skills" (
  set "platforms=!platforms! opencode"
  set "opencode_path=%USERPROFILE%\.config\opencode\skills"
)

if exist "%USERPROFILE%\.cursor\skills" (
  set "platforms=!platforms! cursor"
  set "cursor_path=%USERPROFILE%\.cursor\skills"
)

if exist "%USERPROFILE%\.antigravity\skills" (
  set "platforms=!platforms! antigravity"
  set "antigravity_path=%USERPROFILE%\.antigravity\skills"
)

if exist "%USERPROFILE%\.openclaw\skills" (
  set "platforms=!platforms! openclaw"
  set "openclaw_path=%USERPROFILE%\.openclaw\skills"
)

if "!platforms!"=="" (
  echo ❌ No AI coding platforms detected!
  echo.
  echo Make sure you have at least one installed:
  echo   • Claude Code
  echo   • OpenCode
  echo   • Cursor
  echo   • Antigravity
  echo   • OpenClaw
  pause
  exit /b 1
)

echo ✅ Detected platforms:!platforms!
echo.

REM Clone or update gstack
set "GSTACK_REPO=%USERPROFILE%\.claude\skills\gstack"
if not exist "!GSTACK_REPO!" (
  echo 📥 Cloning gstack...
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "!GSTACK_REPO!"
  echo ✅ gstack cloned
) else (
  echo ℹ️  gstack already installed
)

echo.
echo ⚙️  Setting up gstack for each platform...
echo.

REM Setup for each platform
for %%P in (!platforms!) do (
  echo 📦 Setting up %%P...
  cd /d "!GSTACK_REPO!"
  call setup --host %%P
  echo ✅ %%P configured
  echo.
)

echo 🎉 Setup complete!
echo.
echo Next steps:
echo   1. Start using gstack: try /office-hours
echo   2. Optional: run /setup-gbrain for persistent memory
echo   3. Optional: switch platforms anytime, gstack auto-detects
echo.
echo For help: see ..\CLAUDE.md in this project
echo.
pause
