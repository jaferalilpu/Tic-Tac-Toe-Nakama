import React, { useMemo, useRef, useState, useEffect } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

type StatusType = "idle" | "loading" | "success" | "error";
type CellValue = "" | "X" | "O";

const SERVER_KEY = "defaultkey";
const HOST =
  process.env.REACT_APP_NAKAMA_HOST || "tic-tac-toe-nakama-1-osku.onrender.com";
const PORT = process.env.REACT_APP_NAKAMA_PORT || "443";
const USE_SSL = String(process.env.REACT_APP_NAKAMA_SSL || "true") === "true";

const MOVE_OPCODE = 1;

function App() {
  const [username, setUsername] = useState("jafer");
  const [status, setStatus] = useState<StatusType>("idle");
  const [message, setMessage] = useState(
    "Login, then create or join a game."
  );

  const [session, setSession] = useState<Session | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [finalUsername, setFinalUsername] = useState("");

  const [matchId, setMatchId] = useState("");
  const [joinMatchId, setJoinMatchId] = useState("");
  const [board, setBoard] = useState<CellValue[]>([
    "", "", "",
    "", "", "",
    "", "", "",
  ]);
  const [currentTurn, setCurrentTurn] = useState<"X" | "O">("X");
  const [winner, setWinner] = useState("");
  const [started, setStarted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const client = useMemo(() => {
    return new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  }, []);

  const getDeviceId = () => {
    const existing = localStorage.getItem("nakama-device-id");
    if (existing) return existing;

    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    localStorage.setItem("nakama-device-id", newId);
    return newId;
  };

  const sanitizeUsername = (value: string) => {
    const cleaned = value
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "");

    return cleaned || `player_${Math.random().toString(36).slice(2, 8)}`;
  };

  const disconnectSocket = () => {
    const socketAny = socketRef.current as any;
    if (socketAny && typeof socketAny.disconnect === "function") {
      socketAny.disconnect();
    }
    socketRef.current = null;
    setSocketConnected(false);
  };

  const attachSocketEvents = (socket: any) => {
    socket.ondisconnect = () => {
      setSocketConnected(false);
      setMessage("Socket disconnected.");
    };

    socket.onmatchdata = (matchState: any) => {
      try {
        const decoded =
          typeof matchState.data === "string"
            ? matchState.data
            : new TextDecoder().decode(matchState.data);
        const payload = JSON.parse(decoded);

        if (payload.board) setBoard(payload.board);
        if (payload.currentTurn) setCurrentTurn(payload.currentTurn);
        if (typeof payload.winner === "string") setWinner(payload.winner);
        if (typeof payload.started === "boolean") setStarted(payload.started);
      } catch (e) {
        console.error("Failed to parse match data", e);
      }
    };

    socket.onmatchmakermatched = async (matched: any) => {
      try {
        const matchedResult = await socket.joinMatch(matched);
        setMatchId(matchedResult.match_id || matchedResult.matchId || "");
        setMessage("Player found and joined match successfully.");
      } catch (err: any) {
        setStatus("error");
        setMessage(err?.message || "Failed to join matched game.");
      }
    };
  };

  const connectSocket = async (authSession: Session) => {
    disconnectSocket();

    const socket = client.createSocket(USE_SSL, false) as any;
    attachSocketEvents(socket);

    await socket.connect(authSession, true);
    socketRef.current = socket as Socket;
    return socket;
  };

  const updateUsernameIfNeeded = async (
    authSession: Session,
    desiredUsername: string
  ) => {
    const safeName = sanitizeUsername(desiredUsername);

    try {
      await (client as any).updateAccount(authSession, {
        username: safeName,
      });
      setFinalUsername(safeName);
      return safeName;
    } catch (err) {
      return (authSession as any).username || safeName;
    }
  };

  const handleLogin = async () => {
    setStatus("loading");
    setMessage("Authenticating with Nakama...");

    try {
      const deviceId = getDeviceId();
      const authSession = await client.authenticateDevice(deviceId, true);

      setSession(authSession);
      setUserId((authSession as any).user_id || "");
      setFinalUsername((authSession as any).username || "");

      const resolvedUsername = await updateUsernameIfNeeded(
        authSession,
        username
      );

      await connectSocket(authSession);

      setSocketConnected(true);
      setFinalUsername(resolvedUsername || (authSession as any).username || "");
      setStatus("success");
      setMessage("Connected successfully. You can now create or join a game.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Authentication failed.");
    }
  };

  const handleResetDevice = () => {
    localStorage.removeItem("nakama-device-id");
    disconnectSocket();
    setSession(null);
    setUserId("");
    setFinalUsername("");
    setMatchId("");
    setJoinMatchId("");
    setBoard(["", "", "", "", "", "", "", "", ""]);
    setWinner("");
    setStarted(false);
    setStatus("idle");
    setMessage("Device ID cleared. Login again.");
  };

  const handleCreateMatch = async () => {
    try {
      const socket: any = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      const result = await socket.createMatch();
      const createdMatchId = result.match_id || result.matchId || "";
      setMatchId(createdMatchId);
      setStarted(true);
      setWinner("");
      setBoard(["", "", "", "", "", "", "", "", ""]);
      setMessage("Game created successfully. Share Match ID to join.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to create match.");
    }
  };

  const handleJoinMatch = async () => {
    try {
      const socket: any = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      const result = await socket.joinMatch(joinMatchId);
      const joinedMatchId = result.match_id || result.matchId || joinMatchId;
      setMatchId(joinedMatchId);
      setStarted(true);
      setWinner("");
      setMessage("Joined match successfully.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to join match.");
    }
  };

  const handleFindPlayer = async () => {
    try {
      const socket: any = socketRef.current;
      if (!socket) {
        setMessage("Please login first.");
        return;
      }

      await socket.addMatchmaker("*", 2, 2);
      setMessage("Finding a player...");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to start matchmaking.");
    }
  };

  const handleCellClick = async (index: number) => {
    try {
      if (!matchId) {
        setMessage("Create or join a match first.");
        return;
      }

      if (winner) return;

      const socket: any = socketRef.current;
      if (!socket) {
        setMessage("Socket not connected.");
        return;
      }

      await socket.sendMatchState(
        matchId,
        MOVE_OPCODE,
        JSON.stringify({ position: index })
      );
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to send move.");
    }
  };

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

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

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
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: "24px",
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
              Login, create a game, join by match ID, or find a player using
              Nakama matchmaking.
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

            <button
              onClick={() => setShowDetails((prev) => !prev)}
              style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                color: "#334155",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              {showDetails ? "Hide Details" : "Show Details"}
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
                  color: socketConnected ? "#15803d" : "#0f172a",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                {socketConnected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              paddingTop: "24px",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "16px",
                color: "#0f172a",
                fontSize: "22px",
              }}
            >
              Game Controls
            </h2>

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <button
                onClick={handleCreateMatch}
                style={{
                  padding: "14px 20px",
                  borderRadius: "14px",
                  border: "none",
                  background: "#0f766e",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Create Game
              </button>

              <button
                onClick={handleFindPlayer}
                style={{
                  padding: "14px 20px",
                  borderRadius: "14px",
                  border: "none",
                  background: "#7c3aed",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Find Player
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <input
                type="text"
                value={joinMatchId}
                onChange={(e) => setJoinMatchId(e.target.value)}
                placeholder="Enter Match ID"
                style={{
                  flex: 1,
                  minWidth: "240px",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  fontSize: "15px",
                }}
              />

              <button
                onClick={handleJoinMatch}
                style={{
                  padding: "14px 20px",
                  borderRadius: "14px",
                  border: "none",
                  background: "#ea580c",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Join Game
              </button>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                padding: "16px",
              }}
            >
              <p style={{ margin: "0 0 8px 0", color: "#64748b", fontSize: "13px" }}>
                Current Match ID
              </p>
              <p
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontWeight: 700,
                  wordBreak: "break-word",
                }}
              >
                {matchId || "-"}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#0f172a",
            borderRadius: "24px",
            padding: "28px",
            color: "#e2e8f0",
            boxShadow: "0 18px 50px rgba(15, 23, 42, 0.12)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: "18px",
              fontSize: "22px",
              color: "#ffffff",
            }}
          >
            Game Board
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                padding: "14px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Started
              </p>
              <p style={{ margin: "8px 0 0 0", fontWeight: 700 }}>
                {started ? "Yes" : "No"}
              </p>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Current Turn
              </p>
              <p style={{ margin: "8px 0 0 0", fontWeight: 700 }}>
                {currentTurn}
              </p>
            </div>
          </div>

          <div
            style={{
              marginBottom: "18px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: winner
                ? "rgba(34,197,94,0.15)"
                : "rgba(255,255,255,0.06)",
              border: winner
                ? "1px solid rgba(34,197,94,0.35)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <strong>
              {winner
                ? winner === "Draw"
                  ? "Game Result: Draw"
                  : `Winner: ${winner}`
                : "Game in progress"}
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {board.map((cell, index) => (
              <button
                key={index}
                onClick={() => handleCellClick(index)}
                style={{
                  height: "100px",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#ffffff",
                  fontSize: "34px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {cell}
              </button>
            ))}
          </div>

          {showDetails && (
            <div
              style={{
                padding: "18px",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "10px",
                  fontWeight: 800,
                  color: "#ffffff",
                }}
              >
                Session Snapshot
              </p>

              <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#cbd5e1" }}>
                <div>
                  <strong>Logged In:</strong> {session ? "Yes" : "No"}
                </div>
                <div>
                  <strong>Session Username:</strong>{" "}
                  {(session as any)?.username || "-"}
                </div>
                <div>
                  <strong>Session User ID:</strong>{" "}
                  {(session as any)?.user_id || "-"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;