@echo off
echo =======================================================
echo 🌐 Starting Online Tunnel (Custom URL) to Localhost 3000...
echo =======================================================
echo.
npx -y cloudflared tunnel --url http://localhost:3000
pause
taskkill /F /IM node.exe; Start-Sleep -Seconds 2; npm start
pause
