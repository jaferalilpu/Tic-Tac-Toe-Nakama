// server-src/main.ts
// Tic-Tac-Toe authoritative match + RPC matchmaking for Nakama

interface TicTacToeState {
  board: (string | null)[];
  currentPlayer: string;
  players: { [userId: string]: string };
  winner: string | null;
  gameOver: boolean;
  moveCount: number;
}

interface MatchLabel {
  open: number;
}

const moduleName = 'tictactoe';
const tickRate = 5;

function makeEmptyBoard(): (string | null)[] {
  return [null, null, null, null, null, null, null, null, null];
}

function checkWinner(board: (string | null)[]): boolean {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return true;
    }
  }

  return false;
}

function resetGame(state: TicTacToeState): TicTacToeState {
  state.board = makeEmptyBoard();
  state.winner = null;
  state.gameOver = false;
  state.moveCount = 0;

  const playerIds = Object.keys(state.players);
  if (playerIds.length > 0) {
    state.currentPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
  } else {
    state.currentPlayer = '';
  }

  return state;
}

function broadcastState(
  dispatcher: nkruntime.MatchDispatcher,
  state: TicTacToeState
) {
  dispatcher.broadcastMessage(1, JSON.stringify(state), null, null);
}

function broadcastError(
  dispatcher: nkruntime.MatchDispatcher,
  error: string
) {
  dispatcher.broadcastMessage(4, JSON.stringify({ error }), null, null);
}

function parseMove(
  nk: nkruntime.Nakama,
  data: Uint8Array | string | null
): { position: number } {
  let raw = '';

  if (typeof data === 'string') {
    raw = data;
  } else if (data instanceof Uint8Array) {
    raw = nk.binaryToString(data);
  }

  if (!raw) {
    throw new Error('Empty move payload');
  }

  return JSON.parse(raw);
}

// Match init
const matchInit: nkruntime.MatchInitFunction<TicTacToeState> = function (
  ctx,
  logger,
  nk,
  params
) {
  const state: TicTacToeState = {
    board: makeEmptyBoard(),
    currentPlayer: '',
    players: {},
    winner: null,
    gameOver: false,
    moveCount: 0,
  };

  const label: MatchLabel = { open: 1 };

  logger.info('Tic-Tac-Toe match initialized');

  return {
    state,
    tickRate,
    label: JSON.stringify(label),
  };
};

// Player join attempt
const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<TicTacToeState> =
  function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    if (Object.keys(state.players).length >= 2) {
      return {
        state,
        accept: false,
        rejectMessage: 'Match is full',
      };
    }

    return {
      state,
      accept: true,
    };
  };

// Player join
const matchJoin: nkruntime.MatchJoinFunction<TicTacToeState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  tick,
  state,
  presences
) {
  for (const presence of presences) {
    const playerCount = Object.keys(state.players).length;

    if (playerCount === 0) {
      state.players[presence.userId] = 'X';
      state.currentPlayer = presence.userId;
      logger.info(`Player ${presence.username} joined as X`);
    } else if (playerCount === 1) {
      state.players[presence.userId] = 'O';
      logger.info(`Player ${presence.username} joined as O`);
    }
  }

  if (Object.keys(state.players).length >= 2) {
    dispatcher.matchLabelUpdate(JSON.stringify({ open: 0 }));
  } else {
    dispatcher.matchLabelUpdate(JSON.stringify({ open: 1 }));
  }

  broadcastState(dispatcher, state);

  return { state };
};

// Player leave
const matchLeave: nkruntime.MatchLeaveFunction<TicTacToeState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  tick,
  state,
  presences
) {
  for (const presence of presences) {
    logger.info(`Player ${presence.username} left`);
    delete state.players[presence.userId];
  }

  if (Object.keys(state.players).length < 2) {
    dispatcher.matchLabelUpdate(JSON.stringify({ open: 1 }));
  }

  return { state };
};

// Match loop
const matchLoop: nkruntime.MatchLoopFunction<TicTacToeState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  tick,
  state,
  messages
) {
  for (const message of messages) {
    try {
      if (message.opCode === 2) {
        const move = parseMove(nk, message.data);
        state = processMove(
          state,
          message.sender.userId,
          move.position,
          dispatcher,
          logger
        );
      }

      if (message.opCode === 3) {
        if (state.gameOver) {
          state = resetGame(state);
          broadcastState(dispatcher, state);
        }
      }
    } catch (err: any) {
      logger.error(`Match message error: ${err?.message || err}`);
      broadcastError(dispatcher, 'Invalid message payload');
    }
  }

  return { state };
};

function processMove(
  state: TicTacToeState,
  userId: string,
  position: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): TicTacToeState {
  if (state.gameOver) {
    broadcastError(dispatcher, 'Game is over');
    return state;
  }

  if (state.currentPlayer !== userId) {
    broadcastError(dispatcher, 'Not your turn');
    return state;
  }

  if (position < 0 || position > 8 || state.board[position] !== null) {
    broadcastError(dispatcher, 'Invalid move');
    return state;
  }

  const symbol = state.players[userId];
  if (!symbol) {
    broadcastError(dispatcher, 'Player not found in match');
    return state;
  }

  state.board[position] = symbol;
  state.moveCount += 1;

  const won = checkWinner(state.board);
  if (won) {
    state.winner = userId;
    state.gameOver = true;
    logger.info(`Player ${userId} wins`);
  } else if (state.moveCount >= 9) {
    state.winner = null;
    state.gameOver = true;
    logger.info('Game is a draw');
  } else {
    const playerIds = Object.keys(state.players);
    state.currentPlayer = playerIds.find((id) => id !== userId) || '';
  }

  broadcastState(dispatcher, state);
  return state;
}

// Match terminate
const matchTerminate: nkruntime.MatchTerminateFunction<TicTacToeState> = function (
  ctx,
  logger,
  nk,
  dispatcher,
  tick,
  state,
  graceSeconds
) {
  logger.info('Match terminated');
  return { state };
};

// RPC: create match
const rpcCreateMatch: nkruntime.RpcFunction = function (
  ctx,
  logger,
  nk,
  payload
): string {
  const matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId });
};

// RPC: find match
const rpcFindMatch: nkruntime.RpcFunction = function (
  ctx,
  logger,
  nk,
  payload
): string {
  const limit = 10;
  const isAuthoritative = true;
  const label = '';
  const minSize = 1;
  const maxSize = 2;
  const query = '+label.open:>=1';

  const matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, query);

  if (matches.length > 0) {
    const first = matches[0] as any;
    const matchId = first.matchId || first.match_id;
    if (matchId) {
      return JSON.stringify({ matchId });
    }
  }

  const matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId });
};

// Init module
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  initializer.registerMatch(moduleName, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
  });

  initializer.registerRpc('create_match', rpcCreateMatch);
  initializer.registerRpc('find_match', rpcFindMatch);

  logger.info('Tic-Tac-Toe module loaded successfully!');
}

globalThis.InitModule = InitModule;