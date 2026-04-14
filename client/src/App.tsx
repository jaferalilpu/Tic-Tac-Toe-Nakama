import React, { useEffect, useRef, useState } from "react";
import { Client, Session, Socket, MatchData } from "@heroiclabs/nakama-js";
import confetti from "canvas-confetti";
import "./App.css";

type Mark = "" | "X" | "O";
type Winner = "" | "X" | "O" | "Draw";

interface GameState {
  board: Mark[];
  playerX: string | null;
  playerO: string | null;
  currentTurn: Mark;
  winner: Winner;
  started: boolean;
  usernames?: Record<string, string>;
}

const App: React.FC = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [username, setUsername] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [mySymbol, setMySymbol] = useState<Mark>("");
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState("");

  const host = "tic-tac-toe-nakama-1-osku.onrender.com";
  const port = "443";
  const useSSL = true;

  useEffect(() => {
    const c = new Client("defaultkey", host, port, useSSL);
    setClient(c);
    setStatus(`Server: ${useSSL ? "wss" : "ws"}://${host}:${port}`);
  }, []);

  const getDeviceId = () => {
    const key = "nakama-device-id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  };

  const connectToNakama = async () => {
    if (!client) return;
    if (!username.trim()) {
      setError("Enter a username");
      return;
    }

    try {
      setError("");
      setStatus("Connecting...");

      const deviceId = getDeviceId();
      const cleanUsername = username.trim().replace(/\s+/g, "_");

      const newSession = await client.authenticateDevice(deviceId, true);

      try {
        await client.updateAccount(newSession, { username: cleanUsername });
      } catch {
        // ignore username update failure
      }

      setSession(newSession);
      setMyUserId((newSession as any).userId || (newSession as any).user_id || "");

      const socket = client.createSocket(useSSL, false);
      await socket.connect(newSession, true);
      socketRef.current = socket;

      socket.onmatchdata = (matchData: MatchData) => {
        if (matchData.op_code !== 3) return;

        const decoded = new TextDecoder().decode(matchData.data);
        const data = JSON.parse(decoded);

        const nextState: GameState = {
          board: Array.isArray(data.board) ? data.board : ["", "", "", "", "", "", "", "", ""],
          playerX: data.playerX ?? null,
          playerO: data.playerO ?? null,
          currentTurn: data.currentTurn ?? "X",
          winner: data.winner ?? "",
          started: !!data.started,
          usernames: data.usernames || {},
        };

        setGameState(nextState);

        const mine: Mark =
          nextState.playerX === (newSession as any).userId
            ? "X"
            : nextState.playerO === (newSession as any).userId
            ? "O"
            : "";

        setMySymbol(mine);

        if (!nextState.started) {
          setStatus("Waiting for second player to join...");
          return;
        }

        if (nextState.winner === "Draw") {
          setStatus("Match draw!");
          return;
        }

        if (nextState.winner && nextState.winner === mine) {
          setStatus("You won!");
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
          return;
        }

        if (nextState.winner && nextState.winner !== mine) {
          setStatus("You lost!");
          return;
        }

        setStatus(nextState.currentTurn === mine ? "Your turn" : "Opponent's turn");
      };

      setStatus("Connected. Click Find Match.");
    } catch (e: any) {
      setError(e?.message || "Connection failed");
      setStatus("Disconnected");
    }
  };

  const findMatch = async () => {
    if (!client || !session || !socketRef.current) {
      setError("Connect first");
      return;
    }

    try {
      setError("");
      setGameState(null);
      setMatchId("");
      setMySymbol("");
      setStatus("Searching for opponent...");

      const rpc: any = await client.rpc(session, "find_match", {});
      const parsed = typeof rpc.payload === "string" ? JSON.parse(rpc.payload) : rpc.payload;
      const id = parsed.matchId || parsed.match_id;

      if (!id) throw new Error("No matchId returned");

      const joined = await socketRef.current.joinMatch(id);
      setMatchId(joined.match_id);
      setStatus("Joined match. Waiting for opponent...");
    } catch (e: any) {
      setError(e?.message || "Matchmaking failed");
      setStatus("Disconnected");
    }
  };

  const makeMove = async (pos: number) => {
    if (!socketRef.current || !matchId || !gameState) return;
    if (!mySymbol || gameState.currentTurn !== mySymbol) return;
    if (gameState.winner || !gameState.started || gameState.board[pos]) return;

    await socketRef.current.sendMatchState(matchId, 2, JSON.stringify({ position: pos }));
  };

  const playAgain = async () => {
    if (!socketRef.current || !matchId) return;
    await socketRef.current.sendMatchState(matchId, 3, "{}");
  };

  const leaveMatch = () => {
    setMatchId("");
    setGameState(null);
    setMySymbol("");
    setStatus("Connected. Click Find Match.");
  };

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect(false);
    };
  }, []);

  return (
    <div className="app">
      <h1>Tic-Tac-Toe</h1>
      <p>{status}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!session ? (
        <div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
          />
          <button onClick={connectToNakama}>Connect</button>
        </div>
      ) : !matchId ? (
        <button onClick={findMatch}>Find Match</button>
      ) : (
        <div>
          <p>You: {mySymbol || "-"}</p>
          <p>
            Opponent:{" "}
            {gameState?.playerX && gameState?.playerO ? "Connected" : "Waiting..."}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 80px)",
              gap: "8px",
              marginTop: "20px",
            }}
          >
            {(gameState?.board || ["", "", "", "", "", "", "", "", ""]).map((cell, i) => (
              <button
                key={i}
                onClick={() => makeMove(i)}
                disabled={
                  !gameState?.started ||
                  !!cell ||
                  !!gameState?.winner ||
                  gameState.currentTurn !== mySymbol
                }
                style={{
                  width: 80,
                  height: 80,
                  fontSize: 28,
                }}
              >
                {cell}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            {gameState?.winner && <button onClick={playAgain}>Play Again</button>}
            <button onClick={leaveMatch}>Leave Match</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;