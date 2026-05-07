# Multiplayer Tic Tac Toe

A browser-based two-player Tic Tac Toe game using Node.js and Socket.io.

## Project structure

- `public/` — served client files
  - `index.html` — game UI and entry point
  - `style.css` — board and page styling
  - `script.js` — multiplayer browser logic
- `src/` — server source code
  - `server.js` — Node.js backend and Socket.io room manager
- `package.json` — dependencies and start script
- `README.md` — documentation

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open the browser at:

```text
http://localhost:3000
```

## Gameplay

- The server pairs two browser clients into a multiplayer room.
- One player is assigned `X`, the other `O`.
- Players alternate turns until someone wins or the board fills.
- After the game ends, both players can click "Restart Game" to begin a new match.

## Notes

- If an opponent disconnects, the remaining player is returned to a waiting state until a new player connects.
- The server validates every move and broadcasts updates to both players.
