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

type Mark = '' | 'X' | 'O';
type Winner = '' | 'X' | 'O' | 'Draw';

interface GameState {
  board: Mark[];
  playerX: string | null;
  playerO: string | null;
  currentTurn: Mark;
  winner: Winner;
  started: boolean;
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

  const [mySymbol, setMySymbol] = useState<Mark>('');
  const [opponentConnected, setOpponentConnected] = useState(false);

  const host =
    process.env.REACT_APP_NAKAMA_HOST || 'tic-tac-toe-nakama-1-osku.onrender.com';
  const port = process.env.REACT_APP_NAKAMA_PORT || '443';
  const useSSL =
    process.env.REACT_APP_NAKAMA_SSL
      ? process.env.REACT_APP_NAKAMA_SSL === 'true'
      : true;

  useEffect(() => {
    const nakamaClient = new Client('defaultkey', host, port, useSSL);
    setClient(nakamaClient);
    setStatus(`Server ready: ${useSSL ? 'wss' : 'ws'}://${host}:${port}`);
  }, [host, port, useSSL]);

  const getDeviceId = useCallback(() => {
    const key = 'nakama-device-id';
    let id = localStorage.getItem(key);

    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
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

      const newSession = await client.authenticateDevice(deviceId, true);

      try {
        await client.updateAccount(newSession, { username: cleanUsername });
      } catch (e) {
        console.warn('Username update failed:', e);
      }

      setSession(newSession);

      const resolvedUserId =
        (newSession as any).userId ||
        (newSession as any).user_id ||
        (newSession as any).id ||
        '';

      setMyUserId(resolvedUserId);
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

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleMatchData = (matchData: MatchData) => {
      try {
        const decoded = new TextDecoder().decode(matchData.data);
        const data = JSON.parse(decoded);

        if (matchData.op_code === 4) {
          setError(data?.error || 'Match error');
          return;
        }

        if (matchData.op_code !== 3) return;

        const nextState: GameState = {
          board: Array.isArray(data.board) ? data.board : ['', '', '', '', '', '', '', '', ''],
          playerX: data.playerX ?? null,
          playerO: data.playerO ?? null,
          currentTurn: data.currentTurn ?? 'X',
          winner: data.winner ?? '',
          started: Boolean(data.started),
        };

        setGameState(nextState);

        const mine: Mark =
          nextState.playerX === myUserId
            ? 'X'
            : nextState.playerO === myUserId
            ? 'O'
            : '';

        setMySymbol(mine);

        const hasOpponent =
          !!myUserId &&
          ((mine === 'X' && !!nextState.playerO) || (mine === 'O' && !!nextState.playerX));

        setOpponentConnected(hasOpponent);

        if (!nextState.started || !nextState.playerX || !nextState.playerO) {
          setStatus('Waiting for second player to join...');
          return;
        }

        if (nextState.winner === 'Draw') {
          setStatus('🤝 Match draw!');
          return;
        }

        if (nextState.winner === mine && mine) {
          setStatus('🎉 You won!');
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 },
          });
          return;
        }

        if (nextState.winner && nextState.winner !== mine) {
          setStatus('😢 You lost!');
          return;
        }

        if (nextState.currentTurn === mine) {
          setStatus('Your turn');
        } else {
          setStatus("Opponent's turn");
        }
      } catch (err) {
        console.error('Match data parse error:', err);
      }
    };

    const handleMatchPresence = (_presenceEvent: MatchPresenceEvent) => {
      setStatus('Player joined/left. Syncing match state...');
    };

    socket.onmatchdata = handleMatchData;
    socket.onmatchpresence = handleMatchPresence;

    return () => {
      socket.onmatchdata = (_matchData: MatchData) => {};
      socket.onmatchpresence = (_presenceEvent: MatchPresenceEvent) => {};
    };
  }, [myUserId, mySymbol]);

  const findMatch = async () => {
    if (!client || !session || !socketRef.current) {
      setError('Not connected properly');
      return;
    }

    try {
      setError(null);
      setGameState(null);
      setMatch(null);
      setMySymbol('');
      setOpponentConnected(false);
      setStatus('Searching for opponent...');

      const rpc: any = await client.rpc(session, 'find_match', {});
      console.log('Raw RPC response:', rpc);

      let parsed: any = {};

      if (typeof rpc?.payload === 'string') {
        parsed = JSON.parse(rpc.payload || '{}');
      } else if (rpc?.payload && typeof rpc.payload === 'object') {
        parsed = rpc.payload;
      } else {
        parsed = rpc || {};
      }

      console.log('Parsed RPC payload:', parsed);

      const matchId = parsed.matchId || parsed.match_id;

      if (!matchId) {
        throw new Error('No valid match ID returned from RPC');
      }

      const joined = await socketRef.current.joinMatch(String(matchId));
      setMatch({ match_id: joined.match_id });
      setStatus('Joined match. Waiting for opponent...');
    } catch (err: any) {
      console.error('Matchmaking error:', err);
      setError(`Matchmaking failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const makeMove = async (pos: number) => {
    if (!socketRef.current || !match || !gameState) return;
    if (!gameState.started) return;
    if (gameState.winner) return;
    if (!mySymbol) return;
    if (gameState.currentTurn !== mySymbol) return;
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

  const restartGame = () => {
    setStatus('Play Again is not implemented in server yet');
  };

  const leaveMatch = () => {
    setMatch(null);
    setGameState(null);
    setMySymbol('');
    setOpponentConnected(false);
    setError(null);
    setStatus('Ready to find a new match');
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect(false);
      }
    };
  }, []);

  const opponentName = opponentConnected ? 'Connected' : 'Waiting...';

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
                <span className="symbol">You ({mySymbol || '-'})</span>
                <span className="name">{username}</span>
              </div>

              <div className="player opponent">
                <span className="symbol">Opponent</span>
                <span className="name">{opponentName}</span>
              </div>
            </div>

            {!gameState || !gameState.started ? (
              <div className="waiting-box">Waiting for second player to join...</div>
            ) : (
              <div className="game-board">
                {gameState.board.map((cell, i) => {
                  const clickable =
                    !cell &&
                    !gameState.winner &&
                    mySymbol !== '' &&
                    gameState.currentTurn === mySymbol;

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
            )}

            <div className="game-controls">
              {gameState?.winner && (
                <button className="restart-btn" onClick={restartGame}>
                  Play Again
                </button>
              )}

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