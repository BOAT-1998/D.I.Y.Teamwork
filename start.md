taskkill /F /IM node.exe; Start-Sleep -Seconds 2; npm start

npx -y cloudflared tunnel --url http://localhost:3000  