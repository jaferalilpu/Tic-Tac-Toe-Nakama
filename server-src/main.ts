/// <reference path="./nakama.d.ts" />

const MODULE_NAME = "tic-tac-toe-match";

type PresenceState = {
  userId: string;
  sessionId: string;
  username: string;
  mark: "X" | "O";
};

type MatchState = {
  presences: { [sessionId: string]: PresenceState };
  joinsInProgress: number;
  board: string[];
  currentTurn: "X" | "O";
  winner: string | null;
  playerX: string | null;
  playerO: string | null;
};

const OpCode = {
  START: 1,
  MOVE: 2,
  STATE: 3,
  ERROR: 4,
};

const createStatePayload = (state: MatchState): string =>
  JSON.stringify({
    board: state.board,
    currentTurn: state.currentTurn,
    winner: state.winner,
    playerX: state.playerX,
    playerO: state.playerO,
  });

const checkWinner = (board: string[]): string | null => {
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
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every((cell) => cell !== "")) {
    return "draw";
  }

  return null;
};

const matchInit = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: any }
) {
  const state: MatchState = {
    presences: {},
    joinsInProgress: 0,
    board: ["", "", "", "", "", "", "", "", ""],
    currentTurn: "X",
    winner: null,
    playerX: null,
    playerO: null,
  };

  logger.info("Match initialized.");

  return {
    state,
    tickRate: 1,
    label: "tic-tac-toe",
  };
};

const matchJoinAttempt = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
) {
  if (Object.keys(state.presences).length + state.joinsInProgress >= 2) {
    return {
      state,
      accept: false,
      rejectMessage: "Match is full.",
    };
  }

  state.joinsInProgress++;
  return { state, accept: true };
};

const matchJoin = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
) {
  for (const presence of presences) {
    state.joinsInProgress = Math.max(0, state.joinsInProgress - 1);

    let mark: "X" | "O" = "X";

    if (!state.playerX) {
      state.playerX = presence.username;
      mark = "X";
    } else if (!state.playerO) {
      state.playerO = presence.username;
      mark = "O";
    } else {
      continue;
    }

    state.presences[presence.sessionId] = {
      userId: presence.userId,
      sessionId: presence.sessionId,
      username: presence.username,
      mark,
    };
  }

  dispatcher.broadcastMessage(OpCode.STATE, createStatePayload(state));

  if (Object.keys(state.presences).length === 2) {
    dispatcher.broadcastMessage(
      OpCode.START,
      JSON.stringify({
        message: "Match started",
        board: state.board,
        currentTurn: state.currentTurn,
        playerX: state.playerX,
        playerO: state.playerO,
      })
    );
  }

  return { state };
};

const matchLeave = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
) {
  for (const presence of presences) {
    delete state.presences[presence.sessionId];
  }

  if (Object.keys(state.presences).length === 0) {
    logger.info("Match terminated because all players left.");
    return null;
  }

  return { state };
};

const matchLoop = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  messages: nkruntime.MatchMessage[]
) {
  for (const message of messages) {
    if (message.opCode !== OpCode.MOVE) {
      continue;
    }

    if (state.winner) {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Game already finished." }),
        [message.sender]
      );
      continue;
    }

    const sender = state.presences[message.sender.sessionId];
    if (!sender) {
      continue;
    }

    if (sender.mark !== state.currentTurn) {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Not your turn." }),
        [message.sender]
      );
      continue;
    }

    const payload = JSON.parse(nk.binaryToString(message.data));
    const index = Number(payload.index);

    if (Number.isNaN(index) || index < 0 || index > 8 || state.board[index] !== "") {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Invalid move." }),
        [message.sender]
      );
      continue;
    }

    state.board[index] = sender.mark;

    const result = checkWinner(state.board);
    if (result) {
      state.winner = result;
    } else {
      state.currentTurn = state.currentTurn === "X" ? "O" : "X";
    }

    dispatcher.broadcastMessage(OpCode.STATE, createStatePayload(state));
  }

  return { state };
};

const matchTerminate = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  graceSeconds: number
) {
  dispatcher.broadcastMessage(
    OpCode.ERROR,
    JSON.stringify({ message: "Match is terminating." })
  );

  return { state };
};

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  initializer.registerMatch(MODULE_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
  });

  logger.info("TicTacToe authoritative match module loaded.");
}