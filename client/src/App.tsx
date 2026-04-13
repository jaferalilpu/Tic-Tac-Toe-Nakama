import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Client,
  Session,
  Socket,
  MatchData,
  MatchPresenceEvent,
} from '@heroiclabs/nakama-js';
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
  const socketRef = useRef<Socket | null>(null);

  const [username, setUsername] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const host =
    process.env.REACT_APP_NAKAMA_HOST || 'tic-tac-toe-nakama-1-osku.onrender.com';

  const port =
    process.env.REACT_APP_NAKAMA_PORT || '443';

  const useSSL =
    process.env.REACT_APP_NAKAMA_SSL
      ? process.env.REACT_APP_NAKAMA_SSL === 'true'
      : true;

  useEffect(() => {
    const nakamaClient = new Client('defaultkey', host, port, useSSL);
    setClient(nakamaClient);
    setStatus(`Server ready: ${useSSL ? 'wss' : 'ws'}://${host}:${port}`);
  }, [host, port, useSSL]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleMatchData = (matchData: MatchData) => {
      try {
        const decoded = new TextDecoder().decode(matchData.data);
        const data: GameState = JSON.parse(decoded);
        setGameState(data);

        if (data.gameOver) {
          if (data.winner) {
            if (data.winner === myUserId) {
              setStatus('🎉 You won!');
              confetti({
                particleCount: 120,
                spread: 70,
                origin: { y: 0.6 },
              });
            } else {
              setStatus('😢 You lost!');
            }
          } else {
            setStatus('🤝 Match draw!');
          }
        } else if (data.currentPlayer === myUserId) {
          setStatus('Your turn');
        } else {
          setStatus("Opponent's turn");
        }
      } catch (err) {
        console.error('Match data parse error:', err);
      }
    };

    const handleMatchPresence = (_presenceEvent: MatchPresenceEvent) => {
      setStatus('Opponent joined!');
    };

    socket.onmatchdata = handleMatchData;
    socket.onmatchpresence = handleMatchPresence;

    return () => {
      socket.onmatchdata = (_matchData: MatchData) => {};
      socket.onmatchpresence = (_presenceEvent: MatchPresenceEvent) => {};
    };
  }, [myUserId]);

  const getDeviceId = useCallback(() => {
    const key = 'nakama-device-id';
    let id = localStorage.getItem(key);

    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, id);
    }

    return id;
  }, []);

  const connectToNakama = async () => {
    if (!client || !username.trim()) {
      setError('Please enter a username');
      return;
    }

    try {
      setError(null);
      setStatus('Authenticating...');

      const deviceId = getDeviceId();
      const cleanUsername = username.trim().replace(/\s+/g, '_');

      const newSession = await client.authenticateDevice(
        deviceId,
        true,
        cleanUsername
      );

      setSession(newSession);
      setMyUserId(newSession.user_id || '');
      setStatus('Connected successfully');

      if (socketRef.current) {
        socketRef.current.disconnect(false);
      }

      const newSocket = client.createSocket(useSSL, false);
      await newSocket.connect(newSession, true);
      socketRef.current = newSocket;
    } catch (err: any) {
      console.error('Auth error:', err);
      const message = err?.message || 'Connection failed';
      setError(`Connection failed: ${message}`);
      setStatus('');
    }
  };

  const findMatch = async () => {
    if (!client || !session || !socketRef.current) {
      setError('Not connected properly');
      return;
    }

    try {
      setError(null);
      setStatus('Searching for opponent...');

      const rpc: any = await client.rpc(session, 'find_match', {});
      const payload = typeof rpc?.payload === 'string' ? rpc.payload : '{}';
      const parsed = JSON.parse(payload);
      const matchId = parsed.matchId;

      if (!matchId) {
        throw new Error('No matchId returned from RPC');
      }

      const joined = await socketRef.current.joinMatch(matchId);
      setMatch({ match_id: joined.match_id });
      setStatus('Match found! Game starts soon...');
    } catch (err: any) {
      console.error('Matchmaking error:', err);
      setError(`Matchmaking failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const makeMove = async (pos: number) => {
    if (!socketRef.current || !match || !gameState) return;
    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== myUserId) return;
    if (gameState.board[pos]) return;

    try {
      await socketRef.current.sendMatchState(
        match.match_id,
        2,
        JSON.stringify({ position: pos })
      );
    } catch (err: any) {
      console.error('Move failed:', err);
      setError(`Move failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const leaveMatch = () => {
    setMatch(null);
    setGameState(null);
    setStatus('Ready to find a new match');
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect(false);
      }
    };
  }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>🎮 Tic-Tac-Toe</h1>
        <div className="connection-info">
          <span className="server-badge">
            Server: {useSSL ? 'wss' : 'ws'}://{host}:{port}
          </span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="main-content">
        {status && <div className="status">{status}</div>}

        {!session ? (
          <div className="login-screen">
            <h2>Join the Game</h2>
            <p className="subtitle">Enter your name to connect</p>
            <input
              className="username-input"
              placeholder="Enter name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button className="connect-btn" onClick={connectToNakama}>
              Connect
            </button>
          </div>
        ) : !match ? (
          <div className="matchmaking-screen">
            <h2>Welcome, {username}</h2>
            <p className="subtitle">You are connected. Find a player to start.</p>
            <button className="find-match-btn" onClick={findMatch}>
              Find Match
            </button>
          </div>
        ) : (
          <div className="game-screen">
            <h2>Match in Progress</h2>

            <div className="players">
              <div className="player me">
                <span className="symbol">You</span>
                <span className="name">{username}</span>
              </div>
            </div>

            <div className="game-board">
              {gameState?.board.map((cell, i) => {
                const clickable =
                  !cell &&
                  !gameState.gameOver &&
                  gameState.currentPlayer === myUserId;

                return (
                  <button
                    key={i}
                    className={`cell ${cell ? 'filled' : ''} ${clickable ? 'active' : ''}`}
                    onClick={() => makeMove(i)}
                    disabled={!clickable}
                  >
                    {cell}
                  </button>
                );
              })}
            </div>

            <div className="game-controls">
              <button className="leave-match-btn" onClick={leaveMatch}>
                Leave Match
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <p>Multiplayer Tic-Tac-Toe with Nakama</p>
      </div>
    </div>
  );
};

export default App;