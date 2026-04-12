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

  const host = process.env.REACT_APP_NAKAMA_HOST ?? 'localhost';
  const port = process.env.REACT_APP_NAKAMA_PORT ?? '7350';
  const useSSL = (process.env.REACT_APP_NAKAMA_SSL ?? 'false') === 'true';

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

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        window.clearInterval(interval);
        return;
      }

      confetti({
        particleCount: 45,
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 9999,
        origin: {
          x: randomInRange(0.1, 0.3),
          y: Math.random() - 0.2,
        },
      });

      confetti({
        particleCount: 45,
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 9999,
        origin: {
          x: randomInRange(0.7, 0.9),
          y: Math.random() - 0.2,
        },
      });
    }, 250);
  }, []);

  const sadConfetti = useCallback(() => {
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#808080', '#404040', '#606060'],
      gravity: 2,
      scalar: 0.8,
    });
  }, []);

  const decodeMatchPayload = (data: any): any => {
    try {
      let raw = '';

      if (typeof data === 'string') {
        raw = data;
      } else if (data instanceof Uint8Array) {
        raw = new TextDecoder().decode(data);
      } else if (data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(new Uint8Array(data));
      } else if (data?.buffer instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(data);
      }

      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error('Failed to decode match payload:', err);
      return {};
    }
  };

  const connectToNakama = async () => {
    if (!client || !username.trim()) return;

    setIsConnecting(true);
    setError(null);

    try {
      const trimmedUsername = username.trim();
      const deviceId = `device-${trimmedUsername
        .toLowerCase()
        .replace(/\s+/g, '-')}`;

      const newSession = await client.authenticateDevice(
        deviceId,
        true,
        trimmedUsername
      );

      setSession(newSession);
      setMyUserId(newSession.user_id || '');

      const newSocket = client.createSocket(useSSL, false);

      newSocket.ondisconnect = () => {
        setConnectionReady(false);
        resetLocalMatchState();
        clearTransientError('Disconnected from server. Please connect again.');
      };

      await newSocket.connect(newSession, true);

      setSocket(newSocket);
      setConnectionReady(true);
    } catch (err: any) {
      console.error('Connection failed:', err);
      setError(`Connection failed: ${err?.message || 'Unable to connect'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData: any) => {
      try {
        const opCode = matchData.op_code ?? matchData.opCode;
        const data = decodeMatchPayload(matchData.data);

        if (opCode === 1) {
          setGameState((prevState) => {
            if (data.players && myUserId && data.players[myUserId]) {
              setMySymbol(data.players[myUserId]);
            }

            if (data.gameOver && (!prevState || !prevState.gameOver)) {
              if (data.winner === myUserId) {
                launchFireworks();
                playWinSound();
              } else if (data.winner) {
                sadConfetti();
                playLoseSound();
              }
            }

            return data as GameState;
          });
        }

        if (opCode === 4 && data.error) {
          clearTransientError(data.error);
        }

        if (opCode === 5) {
          clearTransientError(data.message || 'Turn timed out.');
        }
      } catch (err) {
        console.error('Failed to handle match data:', err, matchData);
      }
    };

    socket.onmatchpresence = (presenceEvent: any) => {
      console.log('Match presence event:', presenceEvent);
    };

    return () => {
      socket.onmatchdata = () => {};
      socket.onmatchpresence = () => {};
    };
  }, [
    socket,
    myUserId,
    launchFireworks,
    playWinSound,
    playLoseSound,
    sadConfetti,
    clearTransientError,
  ]);

  const findMatch = async () => {
    if (!client || !session || !socket || !connectionReady) return;

    setIsFindingMatch(true);
    setError(null);

    try {
      const rpcResult: any = await client.rpc(session, 'find_match', {});

      let payloadData: any = {};
      if (typeof rpcResult?.payload === 'string') {
        payloadData = rpcResult.payload ? JSON.parse(rpcResult.payload) : {};
      } else if (rpcResult?.payload && typeof rpcResult.payload === 'object') {
        payloadData = rpcResult.payload;
      }

      const matchId = payloadData.matchId || payloadData.match_id;

      if (!matchId) {
        throw new Error('No matchId returned from server.');
      }

      const joinedMatch: any = await socket.joinMatch(matchId);
      setMatch({ match_id: joinedMatch.match_id });
    } catch (err: any) {
      console.error('Failed to find match:', err);
      setError(`Failed to find match: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsFindingMatch(false);
    }
  };

  const makeMove = useCallback(
    async (position: number) => {
      if (!socket || !match || !gameState) return;
      if (gameState.gameOver) return;
      if (gameState.currentPlayer !== myUserId) return;
      if (gameState.board[position] !== null) return;

      try {
        await socket.sendMatchState(
          match.match_id,
          2,
          JSON.stringify({ position })
        );
      } catch (err) {
        console.error('Failed to send move:', err);
        clearTransientError('Failed to send move.');
      }
    },
    [socket, match, gameState, myUserId, clearTransientError]
  );

  const resetGame = useCallback(async () => {
    if (!socket || !match || !gameState?.gameOver) return;

    try {
      await socket.sendMatchState(match.match_id, 3, JSON.stringify({}));
    } catch (err) {
      console.error('Failed to reset game:', err);
      clearTransientError('Failed to reset game.');
    }
  }, [socket, match, gameState, clearTransientError]);

  const leaveMatch = useCallback(async () => {
    try {
      if (socket && match) {
        await socket.leaveMatch(match.match_id);
      }
    } catch (err) {
      console.warn('Leave match error:', err);
    } finally {
      resetLocalMatchState();
    }
  }, [socket, match, resetLocalMatchState]);

  const disconnectCompletely = useCallback(async () => {
    try {
      if (socket) {
        socket.disconnect(true);
      }
    } catch (err) {
      console.warn('Socket disconnect error:', err);
    } finally {
      setSocket(null);
      setSession(null);
      setMyUserId('');
      setConnectionReady(false);
      resetLocalMatchState();
    }
  }, [socket, resetLocalMatchState]);

  const playerCount = useMemo(() => {
    if (!gameState?.players) return 0;
    return Object.keys(gameState.players).length;
  }, [gameState]);

  const isMyTurn = !!gameState && gameState.currentPlayer === myUserId;
  const isWaitingForOpponent = !!match && playerCount < 2;

  const renderStatus = () => {
    if (!gameState) {
      return <p className="status waiting">Match joined. Waiting for game state...</p>;
    }

    if (isWaitingForOpponent) {
      return <p className="status waiting">Waiting for opponent...</p>;
    }

    if (gameState.gameOver) {
      if (gameState.winner === myUserId) {
        return <p className="status win">🎉 You Won!</p>;
      }

      if (gameState.winner) {
        return <p className="status lose">You Lost</p>;
      }

      return <p className="status draw">It&apos;s a Draw!</p>;
    }

    if (isMyTurn) {
      return <p className="status your-turn">Your Turn ({mySymbol || '?'})</p>;
    }

    return <p className="status opponent-turn">Opponent&apos;s Turn</p>;
  };

  const renderBoard = () => {
    if (!gameState) return null;

    return (
      <div className="board">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            type="button"
            className={`cell ${cell ? 'filled' : ''} ${
              isMyTurn && !cell && !gameState.gameOver ? 'clickable' : ''
            }`}
            onClick={() => makeMove(index)}
            disabled={!isMyTurn || !!cell || gameState.gameOver}
            aria-label={`Cell ${index + 1}${cell ? `, ${cell}` : ''}`}
          >
            {cell}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="app">
      <h1>🎮 Tic-Tac-Toe</h1>

      <div className="server-badge">
        Server: {useSSL ? 'https' : 'http'}://{host}:{port}
      </div>

      {error && <div className="error">{error}</div>}

      {!session ? (
        <div className="login-container">
          <h2>Enter Your Name</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') connectToNakama();
            }}
          />
          <button onClick={connectToNakama} disabled={isConnecting || !username.trim()}>
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      ) : !match ? (
        <div className="matchmaking-container">
          <h2>Welcome, {username}!</h2>
          <p className="subtitle">
            {connectionReady
              ? 'You are connected. Start matchmaking.'
              : 'Preparing connection...'}
          </p>

          <button
            onClick={findMatch}
            className="primary-button"
            disabled={!connectionReady || isFindingMatch}
          >
            {isFindingMatch ? 'Finding Match...' : 'Find Match'}
          </button>

          <button onClick={disconnectCompletely} className="ghost-button">
            Disconnect
          </button>
        </div>
      ) : (
        <div className="game-container">
          {renderStatus()}

          {gameState?.timedMode && typeof gameState.timeLeft === 'number' && (
            <div className="timer-box">
              Time Left: <strong>{gameState.timeLeft}s</strong>
            </div>
          )}

          {renderBoard()}

          <div className="game-controls">
            {gameState?.gameOver && (
              <button onClick={resetGame} className="secondary-button">
                Play Again
              </button>
            )}

            <button onClick={leaveMatch} className="danger-button">
              Leave Match
            </button>
          </div>

          <div className="player-info">
            <p>
              You are playing as: <strong>{mySymbol || '?'}</strong>
            </p>
            <p>
              Match status: <strong>{isWaitingForOpponent ? 'Waiting' : 'Live'}</strong>
            </p>
            <p>
              Moves played: <strong>{gameState?.moveCount ?? 0}</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;