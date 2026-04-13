# Tic-Tac-Toe Multiplayer

A full-stack multiplayer Tic-Tac-Toe game built with **React + TypeScript** on the frontend and **Nakama authoritative matches** on the backend.

## Project structure

```text
.
├── client/                    # React frontend
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.tsx
│   │   └── ...
│   ├── package.json
│   └── tsconfig.json
├── server-src/                # Nakama TypeScript runtime source
│   ├── main.ts
│   ├── nakama.d.ts
│   ├── package.json
│   └── tsconfig.json
├── server-data/               # Local Nakama data, logs, modules
│   ├── logs/
│   └── modules/
├── docker-compose.yml         # Local Nakama + Postgres setup
├── Dockerfile                 # Backend image build file
├── start-nakama.sh            # Helper script to start services
├── package.json               # Root package config
└── README.md
```

## Tech stack

### Frontend
- React
- TypeScript
- CSS
- Netlify deployment

### Backend
- Nakama
- TypeScript runtime
- Docker
- Docker Compose
- PostgreSQL
- Render deployment

## URLs

### Frontend URL
Add your deployed Netlify URL here:

```text
In My Case URL="https://tic-tac-toe-usingnakama.netlify.app/"
```

### Backend URL
Add your deployed Nakama / Render backend URL here:

```text
In My Case URL="https://tic-tac-toe-nakama-1-osku.onrender.com"
```

## Environment variables

Create a `.env` file inside `client/`:

```env
REACT_APP_NAKAMA_HOST=Backend URL Exclude HTTP/HTTPS
REACT_APP_NAKAMA_PORT=443
REACT_APP_NAKAMA_SSL=true
```

## Installation

## Root setup

```bash
npm install
```

## Frontend setup

```bash
cd client
npm install
```

## Backend setup

```bash
cd server-src
npm install
```

## Run locally

## Start Nakama backend with Docker

From the project root:

```bash
docker-compose up -d
```

Or if you use the helper script:

```bash
bash start-nakama.sh
```

## Run frontend

```bash
cd client
npm start
```

Frontend usually runs on:

```text
http://localhost:3000
```

## Build commands

## Frontend build

```bash
cd client
npm run build
```

## Backend TypeScript build

```bash
cd server-src
npm run build
```

## Deployment

## Deploy frontend to Netlify

- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `client/build`

Set these environment variables in Netlify:

```env
REACT_APP_NAKAMA_HOST=your-render-service.onrender.com
REACT_APP_NAKAMA_PORT=443
REACT_APP_NAKAMA_SSL=true
```

## Deploy backend to Render

Deploy the Nakama backend service on Render and expose the server with HTTPS.

Use your Render backend domain in the frontend env variables.

## Important notes

- `client/src/App.tsx` contains the main frontend game logic.
- `server-src/main.ts` contains Nakama authoritative match logic and RPC functions.
- Use `wss` / SSL in production.
- Keep `REACT_APP_NAKAMA_PORT` as `443` for production HTTPS/WSS.
- Make sure frontend and backend are aligned for RPC response format.

## Common commands

### Install dependencies

```bash
npm install
cd client && npm install
cd ../server-src && npm install
```

### Start Docker services

```bash
docker-compose up -d
```

### Stop Docker services

```bash
docker-compose down
```

### Frontend dev server

```bash
cd client
npm start
```

### Frontend production build

```bash
cd client
npm run build
```

### Backend build

```bash
cd server-src
npm run build
```

## Suggested clean structure

For a neat project, keep this convention:

- `client/` only for React frontend
- `server-src/` only for Nakama backend source
- `server-data/` only for runtime data, compiled modules, and logs
- Root folder only for Docker, scripts, and project-level docs

## Final checklist

- Frontend env file configured
- Backend URL updated
- Netlify env variables added
- Render backend deployed
- `App.tsx` and `main.ts` aligned
- Docker setup working locally