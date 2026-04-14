import React, { useMemo, useRef, useState, useEffect } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

type StatusType = "idle" | "loading" | "success" | "error";

const SERVER_KEY = "defaultkey";
const HOST =
  process.env.REACT_APP_NAKAMA_HOST || "tic-tac-toe-nakama-1-osku.onrender.com";
const PORT = process.env.REACT_APP_NAKAMA_PORT || "443";
const USE_SSL = String(process.env.REACT_APP_NAKAMA_SSL || "true") === "true";

function App() {
  const [username, setUsername] = useState("jafer");
  const [status, setStatus] = useState<StatusType>("idle");
  const [message, setMessage] = useState(
    "Sign in with your device ID and connect to Nakama."
  );
  const [session, setSession] = useState<Session | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [userId, setUserId] = useState("");
  const [finalUsername, setFinalUsername] = useState("");
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

  const connectSocket = async (authSession: Session) => {
    disconnectSocket();

    const socket = client.createSocket(USE_SSL, false) as any;

    socket.ondisconnect = () => {
      setSocketConnected(false);
      setMessage("Socket disconnected.");
    };

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
    setSocketConnected(false);

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
      setMessage("Connected successfully. Ready to use Nakama.");
    } catch (error: any) {
      let errorMessage = "Authentication failed.";

      if (error?.status === 409) {
        errorMessage = "Username conflict detected. Try another username.";
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setStatus("error");
      setMessage(errorMessage);
    }
  };

  const handleResetDevice = () => {
    localStorage.removeItem("nakama-device-id");
    disconnectSocket();
    setSession(null);
    setUserId("");
    setFinalUsername("");
    setStatus("idle");
    setMessage("Device ID cleared. Login again to create a fresh session.");
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
          maxWidth: "980px",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
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
              React + Nakama
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "34px",
                lineHeight: 1.15,
                color: "#0f172a",
              }}
            >
              Tic Tac Toe Client
            </h1>

            <p
              style={{
                margin: "12px 0 0 0",
                color: "#475569",
                fontSize: "16px",
                lineHeight: 1.7,
                maxWidth: "620px",
              }}
            >
              A neat login screen for Nakama device authentication with a
              cleaner UI, safe TypeScript usage, and connection details.
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
                boxShadow:
                  status === "loading"
                    ? "none"
                    : "0 10px 25px rgba(37, 99, 235, 0.22)",
                minWidth: "150px",
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
                minWidth: "150px",
              }}
            >
              Reset Device ID
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
                  color: socketConnected ? "#15803d" : "#0f172a",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                {socketConnected ? "Connected" : "Disconnected"}
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
            Server Details
          </h2>

          <div style={{ display: "grid", gap: "14px", marginBottom: "20px" }}>
            <div
              style={{
                padding: "16px",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Host
              </p>
              <p style={{ margin: "8px 0 0 0", fontWeight: 700 }}>{HOST}</p>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                Port
              </p>
              <p style={{ margin: "8px 0 0 0", fontWeight: 700 }}>{PORT}</p>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                SSL
              </p>
              <p style={{ margin: "8px 0 0 0", fontWeight: 700 }}>
                {USE_SSL ? "Enabled" : "Disabled"}
              </p>
            </div>
          </div>

          {showDetails && (
            <div
              style={{
                padding: "18px",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                marginBottom: "20px",
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

          <div
            style={{
              padding: "18px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)",
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
              Notes
            </p>

            <ul
              style={{
                margin: 0,
                paddingLeft: "18px",
                color: "#e0e7ff",
                lineHeight: 1.8,
                fontSize: "14px",
              }}
            >
              <li>Uses `user_id` from your current Session typings.</li>
              <li>Uses socket `disconnect()` safely.</li>
              <li>Uses object-style account update for compatibility.</li>
              <li>Designed to avoid your current TypeScript errors.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;