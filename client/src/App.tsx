import React, { useMemo, useState } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

type StatusType = "idle" | "loading" | "success" | "error";

const SERVER_KEY = "defaultkey";
const HOST = "tic-tac-toe-nakama-1-osku.onrender.com";
const PORT = "443";
const USE_SSL = true;

function App() {
  const [username, setUsername] = useState("jafer");
  const [status, setStatus] = useState<StatusType>("idle");
  const [message, setMessage] = useState("Click login to authenticate with Nakama.");
  const [session, setSession] = useState<Session | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [finalUsername, setFinalUsername] = useState("");

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
    const cleaned = value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    return cleaned || `player_${Math.random().toString(36).slice(2, 8)}`;
  };

  const connectSocket = async (authSession: Session) => {
    const socket: Socket = client.createSocket(USE_SSL, false);

    socket.ondisconnect = (event) => {
      console.warn("Socket disconnected:", event);
      setSocketConnected(false);
      setMessage("Socket disconnected.");
    };

    socket.onnotification = (notification) => {
      console.log("Notification received:", notification);
    };

    socket.onmatchdata = (matchData) => {
      console.log("Match data:", matchData);
    };

    socket.onmatchpresence = (presenceEvent) => {
      console.log("Match presence:", presenceEvent);
    };

    await socket.connect(authSession, true);
    return socket;
  };

  const updateUsernameIfNeeded = async (authSession: Session, desiredUsername: string) => {
    try {
      const safeName = sanitizeUsername(desiredUsername);

      await client.updateAccount(authSession, {
        username: safeName,
      });

      setFinalUsername(safeName);
      return safeName;
    } catch (err: any) {
      console.warn("Username update skipped/failed:", err);
      return authSession.username || "";
    }
  };

  const handleLogin = async () => {
    setStatus("loading");
    setMessage("Authenticating...");
    setSocketConnected(false);

    try {
      const deviceId = getDeviceId();

      const authSession = await client.authenticateDevice(
        deviceId,
        true
      );

      setSession(authSession);
      setUserId(authSession.user_id);

      const resolvedUsername = await updateUsernameIfNeeded(authSession, username);

      await connectSocket(authSession);
      setSocketConnected(true);

      setStatus("success");
      setFinalUsername(resolvedUsername || authSession.username || "");
      setMessage("Authentication successful and WebSocket connected over WSS.");
    } catch (error: any) {
      console.error("Auth error:", error);

      let errorMessage = "Something went wrong during authentication.";

      if (error?.status === 409) {
        errorMessage =
          "Username conflict or account conflict detected. Try a different username or clear the saved device ID for testing.";
      } else if (
        String(error?.message || "").toLowerCase().includes("websocket") ||
        String(error?.message || "").toLowerCase().includes("securityerror")
      ) {
        errorMessage =
          "WebSocket connection failed. Make sure the client uses SSL so the browser connects with WSS.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setStatus("error");
      setMessage(errorMessage);
    }
  };

  const handleResetDevice = () => {
    localStorage.removeItem("nakama-device-id");
    setSession(null);
    setSocketConnected(false);
    setUserId("");
    setFinalUsername("");
    setStatus("idle");
    setMessage("Saved device ID cleared. Next login will create/use a new device identity.");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#1e293b",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: 0, marginBottom: "8px", fontSize: "28px" }}>
          Tic Tac Toe Login
        </h1>

        <p style={{ marginTop: 0, marginBottom: "20px", color: "#94a3b8" }}>
          React + Nakama + Render + Netlify
        </p>

        <label
          htmlFor="username"
          style={{
            display: "block",
            marginBottom: "8px",
            fontWeight: 600,
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
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1px solid #334155",
            outline: "none",
            background: "#0f172a",
            color: "#e2e8f0",
            marginBottom: "16px",
          }}
        />

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={handleLogin}
            disabled={status === "loading"}
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              border: "none",
              background: status === "loading" ? "#475569" : "#2563eb",
              color: "white",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {status === "loading" ? "Logging in..." : "Login"}
          </button>

          <button
            onClick={handleResetDevice}
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              border: "1px solid #475569",
              background: "transparent",
              color: "#e2e8f0",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reset Device ID
          </button>
        </div>

        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            borderRadius: "12px",
            background:
              status === "success"
                ? "rgba(34,197,94,0.12)"
                : status === "error"
                ? "rgba(239,68,68,0.12)"
                : "rgba(148,163,184,0.12)",
            border:
              status === "success"
                ? "1px solid rgba(34,197,94,0.35)"
                : status === "error"
                ? "1px solid rgba(239,68,68,0.35)"
                : "1px solid rgba(148,163,184,0.25)",
          }}
        >
          <p style={{ margin: 0, marginBottom: "8px", fontWeight: 700 }}>
            Status: {status}
          </p>
          <p style={{ margin: 0 }}>{message}</p>
        </div>

        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            borderRadius: "12px",
            background: "#0f172a",
            border: "1px solid #334155",
          }}
        >
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Host:</strong> {HOST}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Port:</strong> {PORT}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>SSL:</strong> {USE_SSL ? "true" : "false"}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>User ID:</strong> {userId || "-"}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Username:</strong> {finalUsername || "-"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Socket Connected:</strong> {socketConnected ? "Yes" : "No"}
          </p>
        </div>

        <div
          style={{
            marginTop: "20px",
            fontSize: "14px",
            color: "#94a3b8",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 6px 0" }}>
            - This version uses a stable device ID from localStorage.
          </p>
          <p style={{ margin: "0 0 6px 0" }}>
            - It authenticates first, then connects the socket with SSL enabled.
          </p>
          <p style={{ margin: 0 }}>
            - If username update conflicts, login can still succeed with the existing account username.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;