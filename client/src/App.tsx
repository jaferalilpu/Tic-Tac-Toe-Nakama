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
  const [board, setBoard] = useState<CellValue[]>(EMPTY_BOARD);
  const [currentTurn, setCurrentTurn] = useState<"X" | "O">("X");
  const [winner, setWinner] = useState<string>("");
  const [started, setStarted] = useState<boolean>(false);

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
  };

  const disconnectSocket = (): void => {
    const socket = socketRef.current;
    if (socket) {
      const anySocket = socket as unknown as {
        disconnect?: () => void;
        close?: () => void;
      };

      if (typeof anySocket.disconnect === "function") anySocket.disconnect();
      else if (typeof anySocket.close === "function") anySocket.close();
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
      } catch (err) {
        console.error("Failed to parse match data:", err);
      }
    };

    anySocket.onmatchmakermatched = async (matched: any) => {
      try {
        const joined = await (socket as any).joinMatch(matched);
        setMatchId(joined.match_id || joined.matchId || joined.id || "");
        resetBoard();
        setStarted(true);
        setStatus("success");
        setMessage("Match found and joined successfully.");
      } catch (err: unknown) {
        console.error("Matchmaker join failed:", err);
        setStatus("error");
        setMessage("Failed to join matched game.");
      }
    };
  };

  const connectSocket = async (authSession: Session): Promise<Socket> => {
    disconnectSocket();

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

      const authSession = await client.authenticateDevice(
        deviceId,
        true,
        safeName
      );

      setSession(authSession);
      setUserId(authSession.user_id || "");

      await updateUsernameIfNeeded(authSession, safeName);
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

  const handleCreateMatch = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      const result = await (socket as any).createMatch();
      const createdId = result.match_id || result.matchId || result.id || "";
      setMatchId(createdId);
      resetBoard();
      setStarted(true);
      setMessage("Game created successfully. Share Match ID to join.");
    } catch (err: unknown) {
      console.error("Create match error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to create match.");
    }
  };

  const handleJoinMatch = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      const id = joinMatchId.trim();
      if (!id) {
        setMessage("Enter a Match ID.");
        return;
      }

      const result = await (socket as any).joinMatch(id);
      const joinedId = result.match_id || result.matchId || result.id || id;
      setMatchId(joinedId);
      resetBoard();
      setStarted(true);
      setMessage("Joined match successfully.");
    } catch (err: unknown) {
      console.error("Join match error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to join match.");
    }
  };

  const handleFindPlayer = async (): Promise<void> => {
    try {
      const socket = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      await (socket as any).addMatchmaker("*", 2, 2);
      setStatus("loading");
      setMessage("Finding a player...");
    } catch (err: unknown) {
      console.error("Matchmaker error:", err);
      const e = err as { message?: string };
      setStatus("error");
      setMessage(e?.message || "Failed to start matchmaking.");
    }
  };

  const handleResetDevice = (): void => {
    localStorage.removeItem("nakama-device-id");
    disconnectSocket();
    setSession(null);
    setUserId("");
    setFinalUsername("");
    setMatchId("");
    setJoinMatchId("");
    setStarted(false);
    resetBoard();
    setStatus("idle");
    setMessage("Device reset complete.");
  };

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  const statusColor =
    status === "success"
      ? "#15803d"
      : status === "error"
      ? "#b91c1c"
      : status === "loading"
      ? "#b45309"
      : "#475569";

  const statusBg =
    status === "success"
      ? "#dcfce7"
      : status === "error"
      ? "#fee2e2"
      : status === "loading"
      ? "#ffedd5"
      : "#f8fafc";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #dbeafe 0%, #f8fafc 35%, #eef2ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1180px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "24px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "32px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div style={{ marginBottom: "28px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 14px",
                borderRadius: "999px",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Tic Tac Toe • Nakama
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "34px",
                lineHeight: 1.15,
                color: "#0f172a",
              }}
            >
              Assignment Submission UI
            </h1>

            <p
              style={{
                margin: "12px 0 0 0",
                color: "#475569",
                fontSize: "16px",
                lineHeight: 1.7,
              }}
            >
              Login, create a game, join by match ID, or find a player using Nakama matchmaking.
            </p>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label
              htmlFor="username"
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Username
            </label>

            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                outline: "none",
                fontSize: "15px",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "22px",
            }}
          >
            <button
              onClick={handleLogin}
              disabled={status === "loading"}
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "none",
                background: status === "loading" ? "#94a3b8" : "#2563eb",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                cursor: status === "loading" ? "not-allowed" : "pointer",
                minWidth: "140px",
              }}
            >
              {status === "loading" ? "Connecting..." : "Login"}
            </button>

            <button
              onClick={handleResetDevice}
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              Reset Device
            </button>
          </div>

          <div
            style={{
              background: statusBg,
              borderRadius: "18px",
              padding: "18px",
              border: `1px solid ${statusColor}22`,
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: statusColor,
                  display: "inline-block",
                }}
              />
              <strong style={{ color: statusColor, fontSize: "14px" }}>
                Status: {status}
              </strong>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "15px",
                lineHeight: 1.6,
                color: "#334155",
              }}
            >
              {message}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "14px",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "18px",
                padding: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                User ID
              </p>
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontSize: "14px",
                  wordBreak: "break-word",
                }}
              >
                {userId || "-"}
              </p>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "18px",
                padding: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                Username
              </p>
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontSize: "14px",
                  wordBreak: "break-word",
                }}
              >
                {finalUsername || "-"}
              </p>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "18px",
                padding: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                Socket
              </p>
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontSize: "14px",
                  wordBreak: "break-word",
                }}
              >
                {socketConnected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #e2e8f0",
              margin: "22px 0",
            }}
          />

          <h2 style={{ margin: "0 0 16px 0", fontSize: "24px", color: "#0f172a" }}>
            Game Controls
          </h2>

          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "14px",
            }}
          >
            <button
              onClick={handleCreateMatch}
              style={{
                padding: "14px 20px",
                borderRadius: "16px",
                border: "none",
                background: "#0f766e",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              Create Game
            </button>

            <button
              onClick={handleFindPlayer}
              style={{
                padding: "14px 20px",
                borderRadius: "16px",
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              Find Player
            </button>
          </div>

          <input
            type="text"
            value={joinMatchId}
            onChange={(e) => setJoinMatchId(e.target.value)}
            placeholder="Enter Match ID"
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#0f172a",
              outline: "none",
              fontSize: "15px",
              marginBottom: "14px",
            }}
          />

          <button
            onClick={handleJoinMatch}
            style={{
              padding: "14px 20px",
              borderRadius: "16px",
              border: "none",
              background: "#ea580c",
              color: "#fff",
              fontWeight: 700,
              fontSize: "15px",
              cursor: "pointer",
              minWidth: "140px",
              marginBottom: "18px",
            }}
          >
            Join Game
          </button>

          <div
            style={{
              background: "#f8fafc",
              borderRadius: "18px",
              padding: "18px",
              border: "1px solid #e2e8f0",
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
              Current Match ID
            </p>
            <p
              style={{
                margin: "8px 0 0 0",
                color: "#0f172a",
                fontWeight: 700,
                fontSize: "14px",
                wordBreak: "break-word",
              }}
            >
              {matchId || "-"}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#0f172a",
            borderRadius: "24px",
            padding: "32px",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            boxShadow: "0 18px 50px rgba(15, 23, 42, 0.2)",
          }}
        >
          <h2 style={{ margin: "0 0 20px 0", fontSize: "28px", color: "#fff" }}>
            Game Board
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "14px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                background: "#1e293b",
                borderRadius: "18px",
                padding: "16px",
                border: "1px solid #334155",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Started
              </p>
              <p style={{ margin: "8px 0 0 0", color: "#fff", fontWeight: 700 }}>
                {started ? "Yes" : "No"}
              </p>
            </div>

            <div
              style={{
                background: "#1e293b",
                borderRadius: "18px",
                padding: "16px",
                border: "1px solid #334155",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Current Turn
              </p>
              <p style={{ margin: "8px 0 0 0", color: "#fff", fontWeight: 700 }}>
                {currentTurn}
              </p>
            </div>
          </div>

          <div
            style={{
              background: "#1e293b",
              borderRadius: "18px",
              padding: "16px",
              border: "1px solid #334155",
              marginBottom: "18px",
            }}
          >
            <p style={{ margin: 0, color: "#fff", fontWeight: 700 }}>
              {winner
                ? `Winner: ${winner}`
                : started
                ? "Game in progress"
                : "Waiting to start"}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            {board.map((cell, index) => (
              <button
                key={index}
                onClick={() => setMessage(`Cell ${index + 1} clicked.`)}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: "18px",
                  border: "1px solid #334155",
                  background: "#1e293b",
                  color: "#fff",
                  fontSize: "32px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;