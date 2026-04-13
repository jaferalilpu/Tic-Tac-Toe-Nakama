# Tic-Tac-Toe Multiplayer (Nakama + React)

**Live Game:**
[https://tic-tac-toe-multiplayer-nakama.vercel.app/](https://tic-tac-toe-multiplayer-nakama.vercel.app/)

**Backend (Nakama):**
[https://nakama-tic-tac-toe.onrender.com](https://nakama-tic-tac-toe.onrender.com)

**Source Code:**
[https://github.com/UnfazedHope/tic-tac-toe-multiplayer](https://github.com/UnfazedHope/tic-tac-toe-multiplayer)

---

## 1. Setup & Installation Instructions

```bash
git clone https://github.com/UnfazedHope/tic-tac-toe-multiplayer.git
cd tic-tac-toe-multiplayer

# Start Nakama + Postgres locally (requires Docker)
docker-compose up --build

# Frontend
cd client
npm install

# Local environment vars:
# REACT_APP_NAKAMA_HOST=localhost
# REACT_APP_NAKAMA_PORT=7350
# REACT_APP_NAKAMA_SSL=false

npm start
```

Project Structure Setup

Create the following directory structure:

<pre>
tictactoe-nakama/
├── docker-compose.yml
├── server-data/
│   ├── modules/
│   └── logs/
├── server-src/
│   ├── main.ts
│   ├── package.json
│   └── tsconfig.json
└── client/
    └── (React app lives here)
</pre>

---

## 2. Architecture & Design Decisions

* **Server-authoritative gameplay:** All logic (move validation, turn order, win/draw checks, timers) executes inside the Nakama authoritative match handler.
* **Matchmaking via custom RPC (`find_match`):** Backend pairs players and creates matches dynamically.
* **Real-time WebSocket messaging:** Clients communicate with Nakama using secure WebSockets (`wss://`). Backend sends authoritative `GameState` updates.
* **Two modes supported:** Classic and Timed (server-enforced 30s per turn).
* **Client is thin:** Only sends actions; server decides the outcome.

---

## 3. Deployment Process Documentation

### Backend (Nakama on Render)

1. Create a **Web Service** from the GitHub repo.
2. Add environment variables:

   ```
   DATABASE_URL=<Render Postgres URL>
   ENCRYPTION_KEY=<openssl rand -hex 32>
   PORT=7350
   ```
3. Custom Start Command:

**Advanced Settings:**
- **Docker Command**: `/nakama/start-nakama.sh` (already in Dockerfile)
- **Health Check Path**: `/` (leave default)

4. Deploy and check logs for:
   **"Tic-Tac-Toe module loaded successfully!"**

Backend endpoint: [https://nakama-tic-tac-toe.onrender.com](https://nakama-tic-tac-toe.onrender.com)

---

### Frontend (React on Vercel)

Add environment variables:

```
REACT_APP_NAKAMA_HOST=nakama-tic-tac-toe.onrender.com
REACT_APP_NAKAMA_PORT=443
REACT_APP_NAKAMA_SSL=true
```

Vercel automatically builds & deploys the game.

---

## 4. API / Server Configuration Details

### Custom RPCs

| RPC            | Description                                         |
| -------------- | --------------------------------------------------- |
| `find_match`   | Returns or creates a match and provides a `matchId` |
| `create_match` | Internal helper used during matchmaking             |

### Match Opcodes

| Opcode | Direction       | Description                              |
| ------ | --------------- | ---------------------------------------- |
| `1`    | Server → Client | Full authoritative `GameState` broadcast |
| `2`    | Client → Server | Player move `{ position }`               |
| `3`    | Client → Server | Reset match                              |
| `4`    | Server → Client | Error message                            |
| `5`    | Server → Client | Turn timeout event                       |

### Example `GameState`

```json
{
  "board": ["X", null, "O", ...],
  "currentPlayer": "userId",
  "players": { "uidA": "X", "uidB": "O" },
  "winner": null,
  "gameOver": false,
  "moveCount": 4,
  "timedMode": true,
  "timeLeft": 29
}
```

---

## 5. How to Test Multiplayer Functionality

1. Open **two browsers**, **browser + incognito**, **two devices** or **share the link with a friend**.
2. Go to: [https://tic-tac-toe-multiplayer-nakama.vercel.app/](https://tic-tac-toe-multiplayer-nakama.vercel.app/)
3. Enter two different usernames → click **Connect**.
4. Press **Find Match** on both.
5. Confirm:
   * Both players join the same match.
   * Moves sync instantly across clients.
   * Out-of-turn moves are rejected (server opcode `4`).
   * Timeouts trigger auto-loss in timed mode.
   * Win/Loss UI updates correctly.
6. Click **Play Again** to reset the match and start a new round.

---
