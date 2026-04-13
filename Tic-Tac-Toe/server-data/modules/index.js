// Nakama Tic-Tac-Toe Match Handler
var moduleName = "tictactoe";
var tickRate = 5;

var matchInit = function(ctx, logger, nk, params) {
  logger.info("Match initializing...");
  
  var state = {
    board: [null, null, null, null, null, null, null, null, null],
    currentPlayer: '',
    players: {},
    winner: null,
    gameOver: false,
    moveCount: 0
  };

  var label = {
    open: 1
  };

  return {
    state: state,
    tickRate: tickRate,
    label: JSON.stringify(label)
  };
};

var matchJoinAttempt = function(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  var playerCount = Object.keys(state.players).length;
  
  if (playerCount >= 2) {
    return {
      state: state,
      accept: false,
      rejectMessage: "Match is full"
    };
  }

  return {
    state: state,
    accept: true
  };
};

var matchJoin = function(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    var playerCount = Object.keys(state.players).length;
    
    if (playerCount === 0) {
      state.players[presence.userId] = 'X';
      state.currentPlayer = presence.userId;
      logger.info("Player " + presence.username + " joined as X");
    } else if (playerCount === 1) {
      state.players[presence.userId] = 'O';
      logger.info("Player " + presence.username + " joined as O");
    }
  }

  if (Object.keys(state.players).length >= 2) {
    var label = { open: 0 };
    dispatcher.matchLabelUpdate(JSON.stringify(label));
  }

  var stateJson = JSON.stringify(state);
  dispatcher.broadcastMessage(1, stateJson);

  return { state: state };
};

var matchLeave = function(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    logger.info("Player " + presence.username + " left");
    delete state.players[presence.userId];
  }

  return { state: state };
};

var matchLoop = function(ctx, logger, nk, dispatcher, tick, state, messages) {
  for (var i = 0; i < messages.length; i++) {
    var message = messages[i];
    var opCode = message.opCode;
    var decoded = nk.binaryToString(message.data);
    
    switch (opCode) {
      case 2:
        var move = JSON.parse(decoded);
        state = processMove(state, message.sender.userId, move.position, dispatcher, logger, nk);
        break;
      
      case 3:
        if (state.gameOver) {
          state = resetGame(state);
          var stateJson = JSON.stringify(state);
          dispatcher.broadcastMessage(1, stateJson);
        }
        break;
    }
  }

  return { state: state };
};

var matchSignal = function(ctx, logger, nk, dispatcher, tick, state, data) {
  logger.debug("Received match signal");
  return { state: state };
};

function processMove(state, userId, position, dispatcher, logger, nk) {
  if (state.gameOver) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Game is over" }));
    return state;
  }

  if (state.currentPlayer !== userId) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Not your turn" }));
    return state;
  }

  if (position < 0 || position > 8 || state.board[position] !== null) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Invalid move" }));
    return state;
  }

  state.board[position] = state.players[userId];
  state.moveCount++;

  var winner = checkWinner(state.board);
  if (winner) {
    state.winner = userId;
    state.gameOver = true;
    logger.info("Player " + userId + " wins!");
  } else if (state.moveCount >= 9) {
    state.gameOver = true;
    state.winner = null;
    logger.info("Game is a draw");
  } else {
    var playerIds = Object.keys(state.players);
    for (var i = 0; i < playerIds.length; i++) {
      if (playerIds[i] !== userId) {
        state.currentPlayer = playerIds[i];
        break;
      }
    }
  }

  var stateJson = JSON.stringify(state);
  dispatcher.broadcastMessage(1, stateJson);

  return state;
}

function checkWinner(board) {
  var lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var a = line[0], b = line[1], c = line[2];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return true;
    }
  }

  return false;
}

function resetGame(state) {
  state.board = [null, null, null, null, null, null, null, null, null];
  state.winner = null;
  state.gameOver = false;
  state.moveCount = 0;
  
  var playerIds = Object.keys(state.players);
  var randomIndex = Math.floor(Math.random() * playerIds.length);
  state.currentPlayer = playerIds[randomIndex];
  
  return state;
}

var matchTerminate = function(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  logger.info("Match terminated");
  return { state: state };
};

var rpcCreateMatch = function(ctx, logger, nk, payload) {
  var matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId: matchId });
};

var rpcFindMatch = function(ctx, logger, nk, payload) {
  var limit = 10;
  var isAuthoritative = true;
  var label = "";
  var minSize = 1;
  var maxSize = 2;
  var query = "+label.open:>=1";

  var matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, query);
  
  if (matches.length > 0) {
    return JSON.stringify({ matchId: matches[0].matchId });
  }

  var matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId: matchId });
};

var InitModule = function(ctx, logger, nk, initializer) {
  initializer.registerMatch(moduleName, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchSignal: matchSignal,
    matchTerminate: matchTerminate
  });

  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_match", rpcFindMatch);

  logger.info("Tic-Tac-Toe module loaded successfully!");
};
