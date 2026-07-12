# Serbia Property Online — Render Deployment

This is the first online test version.

## What is included

- `server.js` — Node.js + Express + Socket.IO server
- `package.json` — dependencies and start command
- `public/index.html` — browser UI
- `public/style.css` — styling
- `public/client.js` — online browser logic
- `render.yaml` — optional Render blueprint config

## How it works

- One temporary room code per game.
- 2–6 players.
- No account system.
- No database.
- Game state is stored only in server memory.
- If the server restarts or sleeps, the active room is lost.
- When only one player remains, the game ends and the room is deleted later.
- The browser sends a small heartbeat every 25 seconds while connected.

## Render settings

Use these settings if Render asks manually:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `NODE_ENV=production`

The server uses `process.env.PORT`, which is required for Render.
