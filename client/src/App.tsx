import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import confetti from 'canvas-confetti';
import './App.css';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: Record<string, string>;
  winner: string | null;
  gameOver: boolean;
  moveCount: number;
  timedMode?: boolean;
  timeLeft?: number;
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
  const [mySymbol, setMySymbol] = useState('');

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isFindingMatch, setIsFindingMatch] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ AUTO SWITCH: LOCAL + PRODUCTION
  const host =
    process.env.REACT_APP_NAKAMA_HOST ||
    (window.location.hostname === 'localhost'
      ? '127.0.0.1'
      : 'https://tic-tac-toe-nakama-1-osku.onrender.com'); 

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

  const clearTransientError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => {
      setError((current) => (current === message ? null : current));
    }, 3000);
  }, []);

  const resetLocalMatchState = useCallback(() => {
    setMatch(null);
    setGameState(null);
    setMySymbol('');
  }, []);

  const playWinSound = useCallback(() => {
    const audio = new Audio('/sounds/youWin.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }, []);

  const playLoseSound = useCallback(() => {
    const audio = new Audio('/sounds/youLost.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }, []);

  const launchFireworks = useCallback(() => {
    const duration = 2200;
    const animationEnd = Date.now() + duration;

    const interval = window.setInterval(() => {
      if (Date.now() > animationEnd) {
        window.clearInterval(interval);
        return;
      }

      confetti({ particleCount: 45, spread: 360 });
    }, 250);
  }, []);

  const sadConfetti = useCallback(() => {
    confetti({ particleCount: 90, spread: 70 });
  }, []);

  const decodeMatchPayload = (data: any): any => {
    try {
      let raw = '';

      if (typeof data === 'string') raw = data;
      else if (data instanceof Uint8Array)
        raw = new TextDecoder().decode(data);

      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const connectToNakama = async () => {
    if (!client || !username.trim()) return;

    setIsConnecting(true);
    setError(null);

    try {
      const deviceId = `device-${username}`;

      const newSession = await client.authenticateDevice(
        deviceId,
        true,
        username
      );

      setSession(newSession);
      setMyUserId(newSession.user_id || '');

      // ✅ FIXED SOCKET
      const newSocket = client.createSocket(true, true);

      newSocket.ondisconnect = () => {
        setConnectionReady(false);
        resetLocalMatchState();
        clearTransientError('Disconnected');
      };

      await newSocket.connect(newSession, true);

      setSocket(newSocket);
      setConnectionReady(true);
    } catch (err: any) {
      setError(`Connection failed`);
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData: any) => {
      const opCode = matchData.op_code ?? matchData.opCode;
      const data = decodeMatchPayload(matchData.data);

      if (opCode === 1) {
        setGameState(data);

        if (data.players && data.players[myUserId]) {
          setMySymbol(data.players[myUserId]);
        }
      }
    };
  }, [socket, myUserId]);

  const findMatch = async () => {
    if (!client || !session || !socket) return;

    const rpc: any = await client.rpc(session, 'find_match', {});
    const matchId = JSON.parse(rpc.payload).matchId;

    const joined = await socket.joinMatch(matchId);
    setMatch({ match_id: joined.match_id });
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

      <div className="server-badge">
        Server: {useSSL ? 'https' : 'http'}://{host}:{port}
      </div>

      {!session ? (
        <div>
          <input
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