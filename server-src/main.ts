const MODULE_NAME = "tic_tac_toe";
const TICK_RATE = 1;

type Mark = "" | "X" | "O";
type Winner = "" | "X" | "O" | "Draw";

interface MatchState {
  presences: { [userId: string]: nkruntime.Presence };
  joinsInProgress: number;
  board: Mark[];
  playerX: string | null;
  playerO: string | null;
  currentTurn: Mark;
  winner: Winner;
  started: boolean;
}

function createBoard(): Mark[] {
  return ["", "", "", "", "", "", "", "", ""];
}

function checkWinner(board: Mark[]): Winner {
  const lines: number[][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i] === "") {
      return "";
    }
  }

  return "Draw";
}

function getMark(state: MatchState, userId: string): Mark {
  if (state.playerX === userId) {
    return "X";
  }

  if (state.playerO === userId) {
    return "O";
  }

  return "";
}

function buildStatePayload(state: MatchState): string {
  return JSON.stringify({
    board: state.board,
    playerX: state.playerX,
    playerO: state.playerO,
    currentTurn: state.currentTurn,
    winner: state.winner,
    started: state.started,
  });
}

function broadcastGameState(
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState
): void {
  dispatcher.broadcastMessage(3, buildStatePayload(state), null, null);
}

let matchInit = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
): { state: MatchState; tickRate: number; label: string } {
  const state: MatchState = {
    presences: {},
    joinsInProgress: 0,
    board: createBoard(),
    playerX: null,
    playerO: null,
    currentTurn: "X",
    winner: "",
    started: false,
  };

  logger.info("Tic-tac-toe match created.");

  return {
    state: state,
    tickRate: TICK_RATE,
    label: "tic-tac-toe",
  };
};

let matchJoinAttempt = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: MatchState; accept: boolean; rejectMessage?: string } {
  const currentSize = Object.keys(state.presences).length + state.joinsInProgress;

  if (currentSize >= 2) {
    return {
      state: state,
      accept: false,
      rejectMessage: "Match is full.",
    };
  }

  state.joinsInProgress += 1;

  return {
    state: state,
    accept: true,
  };
};

let matchJoin = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } {
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    state.presences[presence.userId] = presence;
    state.joinsInProgress = Math.max(0, state.joinsInProgress - 1);

    if (state.playerX === null) {
      state.playerX = presence.userId;
    } else if (state.playerO === null && presence.userId !== state.playerX) {
      state.playerO = presence.userId;
    }
  }

  if (state.playerX !== null && state.playerO !== null) {
    state.started = true;
    state.currentTurn = "X";
    state.winner = "";
    state.board = createBoard();
    logger.info("Game started.");
  }

  broadcastGameState(dispatcher, state);

  return {
    state: state,
  };
};

let matchLeave = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } {
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    delete state.presences[presence.userId];

    if (state.playerX === presence.userId) {
      state.playerX = null;
    }

    if (state.playerO === presence.userId) {
      state.playerO = null;
    }
  }

  if (state.playerX === null || state.playerO === null) {
    state.started = false;
    state.board = createBoard();
    state.currentTurn = "X";
    state.winner = "";
  }

  broadcastGameState(dispatcher, state);

  return {
    state: state,
  };
};

let matchLoop = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  messages: nkruntime.MatchMessage[]
): { state: MatchState } {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const userId = message.sender.userId;
    const mark = getMark(state, userId);

    if (state.started === false) {
      continue;
    }

    if (state.winner !== "") {
      continue;
    }

    if (mark === "") {
      continue;
    }

    if (mark !== state.currentTurn) {
      continue;
    }

    let parsed: { position?: number } = {};

    try {
      parsed = JSON.parse(nk.binaryToString(message.data));
    } catch (e) {
      logger.warn("Invalid JSON payload.");
      continue;
    }

    const position = parsed.position;

    if (typeof position !== "number") {
      continue;
    }

    if (position < 0 || position > 8) {
      continue;
    }

    if (state.board[position] !== "") {
      continue;
    }

    state.board[position] = mark;
    state.winner = checkWinner(state.board);

    if (state.winner === "") {
      state.currentTurn = state.currentTurn === "X" ? "O" : "X";
    }

    broadcastGameState(dispatcher, state);
  }

  return {
    state: state,
  };
};

let matchTerminate = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  graceSeconds: number
): { state: MatchState } {
  logger.info("Match terminated.");

  return {
    state: state,
  };
};

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
): void {
  initializer.registerMatch(MODULE_NAME, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
  });

  logger.info("Tic-tac-toe match handler registered.");
}