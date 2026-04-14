import React, { useEffect, useMemo, useRef, useState } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

type StatusType = "idle" | "loading" | "success" | "error";
type CellValue = "" | "X" | "O";

const SERVER_KEY = "defaultkey";
const HOST =
  process.env.REACT_APP_NAKAMA_HOST || "tic-tac-toe-nakama-1-osku.onrender.com";
const PORT = process.env.REACT_APP_NAKAMA_PORT || "443";
const USE_SSL = String(process.env.REACT_APP_NAKAMA_SSL || "true") === "true";

const EMPTY_BOARD: CellValue[] = ["", "", "", "", "", "", "", "", ""];

const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function App() {
  const [username, setUsername] = useState<string>("jafer");
  const [status, setStatus] = useState<StatusType>("idle");
  const [message, setMessage] = useState<string>(
    "Login, then create or join a game."
  );

  const [session, setSession] = useState<Session | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>("");
  const [finalUsername, setFinalUsername] = useState<string>("");

  const [matchId, setMatchId] = useState<string>("");
  const [joinMatchId, setJoinMatchId] = useState<string>("");
  const [matchmakerTicket, setMatchmakerTicket] = useState<string>("");

  const [board, setBoard] = useState<CellValue[]>(EMPTY_BOARD);
  const [currentTurn, setCurrentTurn] = useState<"X" | "O">("X");
  const [winner, setWinner] = useState<string>("");
  const [started, setStarted] = useState<boolean>(false);
  const [playerSymbol, setPlayerSymbol] = useState<"X" | "O">("X");
  const [isDraw, setIsDraw] = useState<boolean>(false);
  const [winningCells, setWinningCells] = useState<number[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const client = useMemo(() => {
    return new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  }, []);

  const getDeviceId = (): string => {
    const existing = localStorage.getItem("nakama-device-id");
    if (existing) return existing;

    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    localStorage.setItem("nakama-device-id", newId);
    return newId;
  };

  const sanitizeUsername = (value: string): string => {
    const cleaned = value
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "");

    return cleaned || `player_${Math.random().toString(36).slice(2, 8)}`;
  };

  const resetBoard = (): void => {
    setBoard(EMPTY_BOARD);
    setCurrentTurn("X");
    setWinner("");
    setStarted(false);
    setIsDraw(false);
    setWinningCells([]);
  };

  const checkWinner = (newBoard: CellValue[]) => {
    for (const combo of WINNING_COMBINATIONS) {
      const [a, b, c] = combo;
      if (
        newBoard[a] &&
        newBoard[a] === newBoard[b] &&
        newBoard[a] === newBoard[c]
      ) {
        return { winner: newBoard[a], winningCells: combo };
      }
    }

    if (newBoard.every((cell) => cell !== "")) {
      return { winner: "Draw", winningCells: [] };
    }

    return null;
  };

  const disconnectSocket = async (): Promise<void> => {
    const socket = socketRef.current;

    if (socket && matchmakerTicket) {
      try {
        await (socket as any).removeMatchmaker(matchmakerTicket);
      } catch (err) {
        console.warn("Failed to remove matchmaker ticket:", err);
      }
    }

    setMatchmakerTicket("");

    if (socket) {
      const anySocket = socket as unknown as {
        disconnect?: (graceful?: boolean) => void;
        close?: () => void;
      };

      try {
        if (typeof anySocket.disconnect === "function") {
          anySocket.disconnect(false);
        } else if (typeof anySocket.close === "function") {
          anySocket.close();
        }
      } catch (err) {
        console.warn("Socket disconnect issue:", err);
      }
    }

    socketRef.current = null;
    setSocketConnected(false);
  };

  const syncAccountInfo = async (authSession: Session): Promise<void> => {
    const account = await client.getAccount(authSession);
    setFinalUsername(account?.user?.username || "");
    setUserId(account?.user?.id || authSession.user_id || "");
  };

  const updateUsernameIfNeeded = async (
    authSession: Session,
    desiredUsername: string
  ): Promise<void> => {
    const safeName = sanitizeUsername(desiredUsername);

    try {
      await client.updateAccount(authSession, {
        username: safeName,
      });
    } catch (err: unknown) {
      console.warn("updateAccount failed:", err);
    }

    await syncAccountInfo(authSession);
  };

  const attachSocketEvents = (socket: Socket): void => {
    const anySocket = socket as unknown as {
      ondisconnect?: (event?: unknown) => void;
      onmatchdata?: (matchState: any) => void;
      onmatchmakermatched?: (matched: any) => void;
    };

    anySocket.ondisconnect = () => {
      setSocketConnected(false);
      setMatchmakerTicket("");
      setMessage("Socket disconnected.");
    };

    anySocket.onmatchdata = (matchState: any) => {
      try {
        const decoded =
          typeof matchState.data === "string"
            ? matchState.data
            : new TextDecoder().decode(matchState.data);

        const payload = JSON.parse(decoded);

        if (Array.isArray(payload.board)) setBoard(payload.board);
        if (payload.currentTurn === "X" || payload.currentTurn === "O") {
          setCurrentTurn(payload.currentTurn);
        }
        if (typeof payload.winner === "string") setWinner(payload.winner);
        if (typeof payload.started === "boolean") setStarted(payload.started);
        if (typeof payload.isDraw === "boolean") setIsDraw(payload.isDraw);
        if (Array.isArray(payload.winningCells)) setWinningCells(payload.winningCells);
      } catch (err) {
        console.error("Failed to parse match data:", err);
      }
    };

    anySocket.onmatchmakermatched = async (matched: any) => {
      try {
        const joinTarget = matched?.token || matched?.match_id;

        if (!joinTarget) {
          throw new Error("No match token or match_id received from matchmaker.");
        }

        const joined = await (socket as any).joinMatch(joinTarget);
        const joinedId =
          joined?.match_id || joined?.matchId || matched?.match_id || "";

        setMatchmakerTicket("");
        setMatchId(joinedId);
        resetBoard();
        setStarted(true);
        setPlayerSymbol("X");
        setStatus("success");
        setMessage("Match found and joined successfully.");
      } catch (err: unknown) {
        console.error("Matchmaker join failed:", err);
        const e = err as { message?: string };
        setStatus("error");
        setMessage(
          e?.message || "Failed to join matched game. Check backend match setup."
        );
      }
    };
  };

  const connectSocket = async (authSession: Session): Promise<Socket> => {
    await disconnectSocket();

    const socket = client.createSocket(USE_SSL, false);
    attachSocketEvents(socket);

    await socket.connect(authSession, true);
    socketRef.current = socket;
    setSocketConnected(true);

    return socket;
  };

  const handleLogin = async (): Promise<void> => {
    setStatus("loading");
    setMessage("Authenticating with Nakama...");

    try {
      const deviceId = getDeviceId();
      const safeName = sanitizeUsername(username);

      const authSession = await client.authenticateDevice(deviceId, true);

      setSession(authSession);
      setUserId(authSession.user_id || "");

      try {
        await client.updateAccount(authSession, { username: safeName });
      } catch (err) {
        console.warn("Username update skipped/failed:", err);
      }

      await syncAccountInfo(authSession);
      await connectSocket(authSession);

      setStatus("success");
      setMessage("Connected successfully. You can now create or join a game.");
    } catch (err: unknown) {
      console.error("Login error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Authentication failed.");
    }
  };

  const handleCreateGame = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      const match = await (socket as any).createMatch();
      const createdMatchId = match?.match_id || match?.matchId || "";
      setMatchId(createdMatchId);
      setStarted(true);
      resetBoard();
      setPlayerSymbol("X");
      setStatus("success");
      setMessage(`Game created: ${createdMatchId}`);
    } catch (err: unknown) {
      console.error("Create game error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to create game.");
    }
  };

  const handleFindPlayer = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      if (matchmakerTicket) {
        setMessage("Matchmaking is already in progress.");
        return;
      }

      const response = await (socket as any).addMatchmaker("*", 2, 2);
      setMatchmakerTicket(response.ticket);
      setStatus("loading");
      setMessage("Finding a player...");
    } catch (err: unknown) {
      console.error("Matchmaker error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to start matchmaking.");
    }
  };

  const handleCancelMatchmaking = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (socket && matchmakerTicket) {
        await (socket as any).removeMatchmaker(matchmakerTicket);
      }
      setMatchmakerTicket("");
      setStatus("idle");
      setMessage("Matchmaking cancelled.");
    } catch (err: unknown) {
      console.error("Cancel matchmaking error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to cancel matchmaking.");
    }
  };

  const handleJoinGame = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      if (!joinMatchId.trim()) {
        setMessage("Enter a valid match ID.");
        return;
      }

      const joined = await (socket as any).joinMatch(joinMatchId.trim());
      setMatchId(joined?.match_id || joinMatchId.trim());
      resetBoard();
      setStarted(true);
      setPlayerSymbol("O");
      setMessage("Joined game successfully.");
      setStatus("success");
    } catch (err: unknown) {
      console.error("Join game error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to join game.");
    }
  };

  const sendMoveToServer = async (index: number, symbol: "X" | "O") => {
    const socket = socketRef.current;
    if (!socket || !matchId) return;

    const payload = JSON.stringify({
      type: "move",
      index,
      symbol,
      board,
      currentTurn,
      started: true,
    });

    try {
      await (socket as any).sendMatchState(matchId, payload);
    } catch (err) {
      console.error("Failed to send move:", err);
    }
  };

  const handleCellClick = async (index: number): Promise<void> => {
    if (!started || winner || isDraw) return;
    if (board[index] !== "") return;

    const newBoard = [...board];
    newBoard[index] = currentTurn;

    const result = checkWinner(newBoard);

    setBoard(newBoard);

    if (result?.winner === "X" || result?.winner === "O") {
      setWinner(result.winner);
      setWinningCells(result.winningCells);
      setMessage(`Winner: ${result.winner}`);
      setStatus("success");
      setStarted(false);
    } else if (result?.winner === "Draw") {
      setIsDraw(true);
      setMessage("Match drawn.");
      setStatus("success");
      setStarted(false);
    } else {
      setCurrentTurn((prev) => (prev === "X" ? "O" : "X"));
      setMessage(`Current turn: ${currentTurn === "X" ? "O" : "X"}`);
    }

    await sendMoveToServer(index, currentTurn);
  };

  useEffect(() => {
    return () => {
      void disconnectSocket();
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Assignment Submission UI</h1>

      <div style={{ marginBottom: 16 }}>
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 8, padding: 12 }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={handleLogin}>Login</button>
        <button onClick={handleCreateGame}>Create Game</button>
        <button onClick={handleFindPlayer}>Find Player</button>
        <button onClick={handleCancelMatchmaking}>Cancel Matchmaking</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Join Match ID</label>
        <input
          value={joinMatchId}
          onChange={(e) => setJoinMatchId(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 8, padding: 12 }}
        />
        <button onClick={handleJoinGame} style={{ marginTop: 12 }}>
          Join Game
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <p>Status: {status}</p>
        <p>{message}</p>
        <p>User ID: {userId}</p>
        <p>Username: {finalUsername || username}</p>
        <p>Socket: {socketConnected ? "Connected" : "Disconnected"}</p>
        <p>Match ID: {matchId || "-"}</p>
        <p>Matchmaker Ticket: {matchmakerTicket || "-"}</p>
        <p>Current Turn: {currentTurn}</p>
        <p>Winner: {winner || "-"}</p>
        <p>Draw: {isDraw ? "Yes" : "No"}</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 100px)",
          gap: 10,
          marginTop: 24,
        }}
      >
        {board.map((cell, index) => (
          <button
            key={index}
            onClick={() => void handleCellClick(index)}
            style={{
              height: 100,
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;