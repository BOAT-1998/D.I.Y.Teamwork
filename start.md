# Local run (Windows PowerShell)
taskkill /F /IM node.exe; Start-Sleep -Seconds 2; npm start

# Temporary public URL for local machine
npx -y cloudflared tunnel --url http://localhost:3000

# Deploy public cloud server on Vercel
npm i -g vercel
vercel
vercel --prod
