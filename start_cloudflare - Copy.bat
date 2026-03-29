@echo off
cd /d "%~dp0"

echo =======================================================
echo Starting Server (npm start) and Cloudflare Tunnel...
echo =======================================================
echo.

start "DIY Teamwork Server" cmd /k "npm start"
timeout /t 5 /nobreak >nul

echo Waiting for Cloudflare URL, browser will open automatically...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$opened=$false; npx -y cloudflared tunnel --url http://localhost:3000 2>&1 | ForEach-Object { $line = $_.ToString(); Write-Host $line; if(-not $opened -and $line -match 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com'){ $url = $matches[0]; Start-Process $url; Write-Host ('Opened browser: ' + $url); $opened = $true } }"

pause
