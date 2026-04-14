import React, { useMemo, useRef, useState } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

type StatusType = "idle" | "authenticating" | "connecting" | "ready" | "joined" | "error";

const SERVER_KEY = "defaultkey";
const HOST = process.env.REACT_APP_NAKAMA_HOST || "your-render-service.onrender.com";
const PORT = process.env.REACT_APP_NAKAMA_PORT || "443";
const USE_SSL = String(process.env.REACT_APP_NAKAMA_SSL || "true") === "true";

const OpCode = {
  START: 1,
  MOVE: 2,
  STATE: 3,
  ERROR: 4,
} as const;

function App() {
  const client = useMemo(() => new Client(SERVER_KEY, HOST, PORT, USE_SSL), []);
  const socketRef = useRef<Socket | null>(null);

  const [username, setUsername] = useState("jafer");
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<StatusType>("idle");
  const [message, setMessage] = useState("Login, create a match, and share the match ID with another player.");
  const [socketConnected, setSocketConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [joinMatchId, setJoinMatchId] = useState("");
  const [board, setBoard] = useState<string[]>(["", "", "", "", "", "", "", "", ""]);
  const [currentTurn, setCurrentTurn] = useState<"X" | "O">("X");
  const [winner, setWinner] = useState<string | null>(null);
  const [myMark, setMyMark] = useState<"X" | "O" | "">("");
  const [playerX, setPlayerX] = useState("");
  const [playerO, setPlayerO] = useState("");

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

  const resetBoardState = () => {
    setBoard(["", "", "", "", "", "", "", "", ""]);
    setCurrentTurn("X");
    setWinner(null);
    setMyMark("");
    setPlayerX("");
    setPlayerO("");
  };

  const setupSocketHandlers = (socket: Socket) => {
    socket.ondisconnect = () => {
      setSocketConnected(false);
      setStatus("error");
      setMessage("Socket disconnected.");
    };

    socket.onmatchdata = (data: any) => {
      try {
        const text =
          typeof data.data === "string"
            ? data.data
            : new TextDecoder().decode(data.data);

        const payload = JSON.parse(text);

        if (data.op_code === OpCode.START) {
          setBoard(payload.board || ["", "", "", "", "", "", "", "", ""]);
          setCurrentTurn(payload.currentTurn || "X");
          setPlayerX(payload.playerX || "");
          setPlayerO(payload.playerO || "");
          setMessage("Match started.");

          if (payload.playerX === username) {
            setMyMark("X");
          } else if (payload.playerO === username) {
            setMyMark("O");
          }
        }

        if (data.op_code === OpCode.STATE) {
          setBoard(payload.board || ["", "", "", "", "", "", "", "", ""]);
          setCurrentTurn(payload.currentTurn || "X");
          setWinner(payload.winner || null);
          setPlayerX(payload.playerX || "");
          setPlayerO(payload.playerO || "");

          if (payload.playerX === username) {
            setMyMark("X");
          } else if (payload.playerO === username) {
            setMyMark("O");
          }
        }

        if (data.op_code === OpCode.ERROR) {
          setMessage(payload.message || "Match error.");
        }
      } catch {
        setMessage("Received invalid match data.");
      }
    };
  };

  const handleLogin = async () => {
    try {
      setStatus("authenticating");
      setMessage("Authenticating...");

      const deviceId = getDeviceId();
      const safeUsername = sanitizeUsername(username);

      const authSession = await client.authenticateDevice(
        deviceId,
        true,
        safeUsername
      );

      setSession(authSession);

      const resolvedUserId =
        (authSession as any).userId ||
        (authSession as any).user_id ||
        (authSession as any).sub ||
        "";

      setUserId(resolvedUserId);

      setStatus("connecting");
      setMessage("Connecting socket...");

      const socket = client.createSocket(USE_SSL, false);
      setupSocketHandlers(socket);

      await socket.connect(authSession, true);
      socketRef.current = socket;

      setSocketConnected(true);
      setStatus("ready");
      setMessage("Login successful. You can now create or join a match.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Login failed.");
    }
  };

  const handleCreateMatch = async () => {
    try {
      if (!socketRef.current) {
        setMessage("Please login first.");
        return;
      }

      resetBoardState();
      setMessage("Creating match...");

      const response = await socketRef.current.createMatch();
      setMatchId(response.match_id);
      setJoinMatchId(response.match_id);
      setStatus("joined");
      setMessage("Match created. Share this Match ID with player 2.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to create match.");
    }
  };

  const handleJoinMatch = async () => {
    try {
      if (!socketRef.current) {
        setMessage("Please login first.");
        return;
      }

      if (!joinMatchId.trim()) {
        setMessage("Enter a valid Match ID.");
        return;
      }

      resetBoardState();
      setMessage("Joining match...");

      const response = await socketRef.current.joinMatch(joinMatchId.trim());
      setMatchId(response.match_id);
      setStatus("joined");
      setMessage("Joined match successfully.");

      const usernames = response.presences.map((p: any) => p.username);
      if (usernames.length > 0) setPlayerX(usernames[0] || "");
      if (usernames.length > 1) setPlayerO(usernames[1] || "");

      if (response.self.username === usernames[0]) {
        setMyMark("X");
      } else if (response.self.username === usernames[1]) {
        setMyMark("O");
      }
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to join match.");
    }
  };

  const handleMove = async (index: number) => {
    try {
      if (!socketRef.current || !matchId) {
        setMessage("Join a match first.");
        return;
      }

      if (winner) {
        setMessage("Game already finished.");
        return;
      }

      if (board[index] !== "") {
        return;
      }

      if (!myMark) {
        setMessage("Waiting for your player mark.");
        return;
      }

      if (myMark !== currentTurn) {
        setMessage("It is not your turn.");
        return;
      }

      await socketRef.current.sendMatchState(
        matchId,
        OpCode.MOVE,
        JSON.stringify({ index })
      );
    } catch (error: any) {
      setMessage(error?.message || "Failed to send move.");
    }
  };

  const handleResetDevice = () => {
    localStorage.removeItem("nakama-device-id");
    socketRef.current = null;
    setSession(null);
    setStatus("idle");
    setMessage("Device reset. Login again.");
    setSocketConnected(false);
    setUserId("");
    setMatchId("");
    setJoinMatchId("");
    resetBoardState();
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Tic Tac Toe</h1>
        <p style={styles.subtitle}>React + Nakama Authoritative Match</p>

        <label style={styles.label}>Username</label>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
        />

        <div style={styles.actions}>
          <button style={styles.primaryBtn} onClick={handleLogin}>
            Login
          </button>
          <button style={styles.secondaryBtn} onClick={handleCreateMatch}>
            Create Match
          </button>
          <button style={styles.secondaryBtn} onClick={handleResetDevice}>
            Reset Device
          </button>
        </div>

        <label style={styles.label}>Join with Match ID</label>
        <div style={styles.joinRow}>
          <input
            style={styles.input}
            value={joinMatchId}
            onChange={(e) => setJoinMatchId(e.target.value)}
            placeholder="Paste match ID here"
          />
          <button style={styles.primaryBtn} onClick={handleJoinMatch}>
            Join Match
          </button>
        </div>

        <div style={styles.statusBox}>
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Message:</strong> {message}</p>
          <p><strong>Socket:</strong> {socketConnected ? "Connected" : "Disconnected"}</p>
          <p><strong>User ID:</strong> {userId || "-"}</p>
          <p><strong>Match ID:</strong> {matchId || "-"}</p>
          <p><strong>Your Mark:</strong> {myMark || "-"}</p>
          <p><strong>Current Turn:</strong> {currentTurn}</p>
          <p><strong>Winner:</strong> {winner || "-"}</p>
          <p><strong>Player X:</strong> {playerX || "-"}</p>
          <p><strong>Player O:</strong> {playerO || "-"}</p>
        </div>

        <div style={styles.board}>
          {board.map((cell, index) => (
            <button
              key={index}
              style={styles.cell}
              onClick={() => handleMove(index)}
            >
              {cell}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0f172a",
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "700px",
    background: "#1e293b",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  title: {
    margin: 0,
    fontSize: "32px",
  },
  subtitle: {
    marginTop: "8px",
    marginBottom: "20px",
    color: "#94a3b8",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    marginBottom: "16px",
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  joinRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  primaryBtn: {
    padding: "12px 18px",
    borderRadius: "10px",
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryBtn: {
    padding: "12px 18px",
    borderRadius: "10px",
    border: "1px solid #475569",
    background: "transparent",
    color: "#e2e8f0",
    cursor: "pointer",
    fontWeight: 700,
  },
  statusBox: {
    marginTop: "20px",
    marginBottom: "20px",
    padding: "16px",
    borderRadius: "12px",
    background: "#0f172a",
    border: "1px solid #334155",
    lineHeight: 1.8,
  },
  board: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    marginTop: "20px",
  },
  cell: {
    aspectRatio: "1 / 1",
    borderRadius: "12px",
    border: "1px solid #475569",
    background: "#111827",
    color: "#f8fafc",
    fontSize: "32px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default App;