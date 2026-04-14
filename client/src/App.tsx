import React, { useMemo, useRef, useState } from "react";
import "./App.css";
import {
  Client,
  Session,
  Socket,
  type MatchData,
} from "@heroiclabs/nakama-js";
import confetti from "canvas-confetti";

type Mark = "" | "X" | "O";
type Winner = "" | "X" | "O" | "Draw";

interface GameState {
  board: Mark[];
  playerX: string | null;
  playerO: string | null;
  currentTurn: Mark;
  winner: Winner;
  started: boolean;
  usernames: Record<string, string>;
}

const SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY || "defaultkey";
const HOST = import.meta.env.VITE_NAKAMA_HOST || "127.0.0.1";
const PORT = import.meta.env.VITE_NAKAMA_PORT || "7350";
const SCHEME = (import.meta.env.VITE_NAKAMA_SCHEME || "http").toLowerCase();

const useSSL = SCHEME === "https";
const client = new Client(SERVER_KEY, HOST, PORT, useSSL);

const EMPTY_BOARD: Mark[] = ["", "", "", "", "", "", "", "", ""];

function App() {
  const [username, setUsername] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [matchId, setMatchId] = useState("");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [mySymbol, setMySymbol] = useState<Mark>("");
  const [status, setStatus] = useState("Enter username and connect");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [finding, setFinding] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const opponentName = useMemo(() => {
    if (!gameState) return "";
    if (gameState.playerX && gameState.playerX !== myUserId) {
      return gameState.usernames?.[gameState.playerX] || "Opponent";
    }
    if (gameState.playerO && gameState.playerO !== myUserId) {
      return gameState.usernames?.[gameState.playerO] || "Opponent";
    }
    return "";
  }, [gameState, myUserId]);

  const myName = useMemo(() => {
    if (!gameState || !myUserId) return username || "You";
    return gameState.usernames?.[myUserId] || username || "You";
  }, [gameState, myUserId, username]);

  const canPlay = useMemo(() => {
    if (!gameState) return false;
    if (!gameState.started) return false;
    if (gameState.winner) return false;
    if (!mySymbol) return false;
    return gameState.currentTurn === mySymbol;
  }, [gameState, mySymbol]);

  const getDeviceId = () => {
    const key = "nakama-device-id";
    let id = sessionStorage.getItem(key);

    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      sessionStorage.setItem(key, id);
    }

    return id;
  };

  const safeParseState = (raw: any): GameState => {
    return {
      board: Array.isArray(raw?.board) && raw.board.length === 9 ? raw.board : EMPTY_BOARD,
      playerX: raw?.playerX ?? null,
      playerO: raw?.playerO ?? null,
      currentTurn: raw?.currentTurn ?? "X",
      winner: raw?.winner ?? "",
      started: Boolean(raw?.started),
      usernames: raw?.usernames || {},
    };
  };

  const deriveMySymbol = (state: GameState, userId: string): Mark => {
    if (!userId) return "";
    if (state.playerX === userId) return "X";
    if (state.playerO === userId) return "O";
    return "";
  };

  const connectToNakama = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    try {
      setConnecting(true);
      setError("");
      setStatus("Authenticating...");

      const deviceId = getDeviceId();
      const cleanUsername = username.trim().replace(/\s+/g, "_");

      const newSession = await client.authenticateDevice(deviceId, true);
      const resolvedUserId =
        (newSession as any).user_id ||
        (newSession as any).userId ||
        "";

      try {
        await client.updateAccount(newSession, { username: cleanUsername } as any);
      } catch (e) {
        console.warn("Username update failed:", e);
      }

      if (socketRef.current) {
        try {
          socketRef.current.disconnect(false);
        } catch (e) {
          console.warn("Previous socket disconnect failed:", e);
        }
      }

      const socket = client.createSocket(useSSL, false);
      await socket.connect(newSession, true);

      socket.onmatchdata = (matchData: MatchData) => {
        try {
          if (matchData.op_code !== 3) return;

          const decoded = new TextDecoder().decode(matchData.data);
          const parsed = JSON.parse(decoded);
          const nextState = safeParseState(parsed);

          setGameState(nextState);

          const mine = deriveMySymbol(nextState, resolvedUserId);
          setMySymbol(mine);

          if (!nextState.started) {
            setStatus("Joined match. Waiting for opponent...");
            return;
          }

          if (nextState.winner === "Draw") {
            setStatus("It's a draw!");
            return;
          }

          if (nextState.winner && mine && nextState.winner === mine) {
            setStatus("You won!");
            confetti({
              particleCount: 120,
              spread: 70,
              origin: { y: 0.65 },
            });
            return;
          }

          if (nextState.winner && mine && nextState.winner !== mine) {
            setStatus("You lost!");
            return;
          }

          if (nextState.currentTurn === mine) {
            setStatus("Your turn");
          } else {
            setStatus("Opponent's turn");
          }
        } catch (e) {
          console.error("Failed to parse match data:", e);
        }
      };

      socket.ondisconnect = (evt: any) => {
        console.warn("Socket disconnected:", evt);
        setStatus("Disconnected from server");
      };

      socket.onerror = (evt: any) => {
        console.error("Socket error:", evt);
      };

      socketRef.current = socket;
      setSession(newSession);
      setMyUserId(resolvedUserId);
      setStatus("Connected successfully");
    } catch (err: any) {
      console.error("Connection failed:", err);
      setError(err?.message || "Failed to connect");
      setStatus("Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const findMatch = async () => {
    if (!session || !socketRef.current) {
      setError("Please connect first");
      return;
    }

    try {
      setFinding(true);
      setError("");
      setGameState(null);
      setMatchId("");
      setMySymbol("");
      setStatus("Searching for opponent...");

      const rpc: any = await client.rpc(session, "find_match", {} as any);
      const parsed =
        typeof rpc?.payload === "string"
          ? JSON.parse(rpc.payload || "{}")
          : rpc?.payload || {};

      const id = parsed.matchId || parsed.match_id;
      if (!id) {
        throw new Error("No match ID returned from server");
      }

      const joined: any = await socketRef.current.joinMatch(String(id));
      const joinedId = joined?.match_id || joined?.matchId || String(id);

      setMatchId(joinedId);
      setStatus("Joined match. Waiting for opponent...");
    } catch (err: any) {
      console.error("Matchmaking failed:", err);
      setError(err?.message || "Failed to find/join match");
      setStatus("Matchmaking failed");
    } finally {
      setFinding(false);
    }
  };

  const leaveMatch = async () => {
    if (!socketRef.current || !matchId) {
      setMatchId("");
      setGameState(null);
      setMySymbol("");
      setStatus("Left match");
      return;
    }

    try {
      await socketRef.current.leaveMatch(matchId);
    } catch (e) {
      console.warn("leaveMatch failed:", e);
    } finally {
      setMatchId("");
      setGameState(null);
      setMySymbol("");
      setStatus("Left match");
    }
  };

  const makeMove = async (index: number) => {
    if (!socketRef.current || !matchId || !gameState) return;
    if (!gameState.started) return;
    if (gameState.winner) return;
    if (!mySymbol) return;
    if (gameState.currentTurn !== mySymbol) return;
    if (gameState.board[index]) return;

    try {
      await socketRef.current.sendMatchState(
        matchId,
        2,
        JSON.stringify({ position: index })
      );
    } catch (err: any) {
      console.error("Move failed:", err);
      setError(err?.message || "Failed to send move");
    }
  };

  const playAgain = async () => {
    if (!socketRef.current || !matchId) return;

    try {
      await socketRef.current.sendMatchState(matchId, 3, JSON.stringify({}));
      setStatus("Restarting match...");
    } catch (err: any) {
      console.error("Play again failed:", err);
      setError(err?.message || "Failed to restart match");
    }
  };

  return (
    <div className="app-shell">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />

      <main className="game-container">
        <header className="hero">
          <div className="badge">Realtime Multiplayer</div>
          <h1>Tic-Tac-Toe</h1>
          <p className="subtitle">
            Connect two players, join the same match, and play live turns.
          </p>
        </header>

        {!session ? (
          <section className="panel auth-panel">
            <h2>Connect</h2>
            <div className="form-row">
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="text-input"
              />
              <button
                className="primary-btn"
                onClick={connectToNakama}
                disabled={connecting}
              >
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
            <p className="hint">
              For testing, use one normal tab and one incognito tab if needed.
            </p>
          </section>
        ) : (
          <section className="panel lobby-panel">
            <div className="lobby-top">
              <div>
                <h2>Welcome, {username || "Player"}</h2>
                <p className="status-text">{status}</p>
              </div>
              <div className="actions">
                {!matchId ? (
                  <button
                    className="primary-btn"
                    onClick={findMatch}
                    disabled={finding}
                  >
                    {finding ? "Finding..." : "Find Match"}
                  </button>
                ) : (
                  <button className="danger-btn" onClick={leaveMatch}>
                    Leave Match
                  </button>
                )}
              </div>
            </div>

            {error ? <div className="error-box">{error}</div> : null}

            <div className="players-panel">
              <div className={`player-card ${mySymbol === "X" || mySymbol === "O" ? "active" : ""}`}>
                <span className="player-label">You</span>
                <strong>{myName}</strong>
                <span className="player-meta">
                  {mySymbol ? `Playing as ${mySymbol}` : "Waiting for symbol..."}
                </span>
              </div>

              <div className="versus">VS</div>

              <div className={`player-card ${opponentName ? "active" : ""}`}>
                <span className="player-label">Opponent</span>
                <strong>{opponentName || "Waiting..."}</strong>
                <span className="player-meta">
                  {opponentName ? "Connected" : "Not joined yet"}
                </span>
              </div>
            </div>

            <div className="board-wrap">
              <div className="turn-banner">
                {gameState?.winner
                  ? gameState.winner === "Draw"
                    ? "Draw game"
                    : `Winner: ${gameState.winner}`
                  : gameState?.started
                  ? canPlay
                    ? "Your turn"
                    : "Opponent's turn"
                  : "Waiting for opponent to join"}
              </div>

              <div className="board">
                {(gameState?.board || EMPTY_BOARD).map((cell, index) => (
                  <button
                    key={index}
                    className={`cell ${cell ? "filled" : ""} ${
                      canPlay && !cell ? "playable" : ""
                    }`}
                    onClick={() => makeMove(index)}
                    disabled={!canPlay || Boolean(cell)}
                  >
                    <span className={`mark mark-${cell || "empty"}`}>{cell}</span>
                  </button>
                ))}
              </div>

              {gameState?.winner ? (
                <div className="bottom-actions">
                  <button className="primary-btn" onClick={playAgain}>
                    Play Again
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;