import React, { useCallback, useEffect, useState } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import confetti from 'canvas-confetti';
import './App.css';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: Record<string, string>;
  winner: string | null;
  gameOver: boolean;
}

interface MatchInfo {
  match_id: string;
}

const App: React.FC = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [username, setUsername] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [error, setError] = useState<string | null>(null);

  // ✅ FIXED HOST CONFIG
  const host =
    process.env.REACT_APP_NAKAMA_HOST ||
    (window.location.hostname === 'localhost'
      ? '127.0.0.1'
      : 'tic-tac-toe-nakama-1-osku.onrender.com'); // ❗ NO https

  const port =
    process.env.REACT_APP_NAKAMA_PORT ||
    (window.location.hostname === 'localhost' ? '7350' : '443');

  const useSSL =
    process.env.REACT_APP_NAKAMA_SSL
      ? process.env.REACT_APP_NAKAMA_SSL === 'true'
      : window.location.hostname !== 'localhost';

  useEffect(() => {
    const nakamaClient = new Client('defaultkey', host, port, useSSL);
    setClient(nakamaClient);
  }, [host, port, useSSL]);

  const connectToNakama = async () => {
    if (!client || !username.trim()) return;

    try {
      // ✅ SAFE DEVICE ID
      const deviceId = crypto.randomUUID();

      // ✅ SAFE USERNAME
      const cleanUsername = username.trim().replace(/\s+/g, "_");

      const newSession = await client.authenticateDevice(
        deviceId,
        true,
        cleanUsername
      );

      setSession(newSession);
      setMyUserId(newSession.user_id || '');

      // ✅ CORRECT SOCKET
      const newSocket = client.createSocket(useSSL, false);

      await newSocket.connect(newSession, true);

      setSocket(newSocket);
    } catch (err: any) {
      console.error(err);
      setError("Connection failed");
    }
  };

  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (msg: any) => {
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      setGameState(data);
    };
  }, [socket]);

  const findMatch = async () => {
    if (!client || !session || !socket) return;

    try {
      const rpc: any = await client.rpc(session, 'find_match', {});
      const matchId = JSON.parse(rpc.payload).matchId;

      const joined = await socket.joinMatch(matchId);
      setMatch({ match_id: joined.match_id });
    } catch {
      setError("Matchmaking failed");
    }
  };

  const makeMove = async (pos: number) => {
    if (!socket || !match) return;

    await socket.sendMatchState(
      match.match_id,
      2,
      JSON.stringify({ position: pos })
    );
  };

  return (
    <div className="app">
      <h1>🎮 Tic-Tac-Toe</h1>

      <div>
        Server: {useSSL ? 'https' : 'http'}://{host}:{port}
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!session ? (
        <div>
          <input
            placeholder="Enter name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={connectToNakama}>Connect</button>
        </div>
      ) : !match ? (
        <button onClick={findMatch}>Find Match</button>
      ) : (
        <div>
          {gameState?.board.map((cell, i) => (
            <button key={i} onClick={() => makeMove(i)}>
              {cell}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;