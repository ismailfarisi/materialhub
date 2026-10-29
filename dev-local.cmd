@echo off
rem Starts the whole MaterialHub app locally. See scripts/dev-local.ts for flags
rem (--no-web, --reindex, --stop). Works from cmd, PowerShell or a double-click.
set "PATH=%APPDATA%\npm;%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>nul || (echo Bun not found. Install it with: npm install -g bun& exit /b 1)
cd /d "%~dp0"
bun scripts\dev-local.ts %*
