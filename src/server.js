const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const CHARACTERS = [
  { id: 'goku', name: 'Goku', asset: '/assets/goku.svg' },
  { id: 'vegeta', name: 'Vegeta', asset: '/assets/vegeta.svg' },
  { id: 'gohan', name: 'Gohan', asset: '/assets/gohan.svg' },
  { id: 'piccolo', name: 'Piccolo', asset: '/assets/piccolo.svg' },
  { id: 'frieza', name: 'Frieza', asset: '/assets/frieza.svg' },
  { id: 'trunks', name: 'Trunks', asset: '/assets/trunks.svg' },
];
const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const lobbies = new Map();
const games = new Map();

app.use(express.static(path.join(__dirname, '../public')));

function generateId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function calculateWinner(board) {
  return WINNING_LINES.find(([a, b, c]) => {
    return board[a] && board[a] === board[b] && board[a] === board[c];
  });
}

function getLobbyList() {
  return Array.from(lobbies.values()).map((lobby) => ({
    id: lobby.id,
    hostId: lobby.hostId,
    createdAt: lobby.createdAt,
  }));
}

function broadcastLobbyList() {
  io.emit('lobbyList', getLobbyList());
}

function getOpponentId(game, socketId) {
  return game.players.find((playerId) => playerId !== socketId);
}

function getCharacterSelectionPayload(game) {
  const markCharacters = {};
  Object.entries(game.marks).forEach(([playerId, mark]) => {
    markCharacters[mark] = game.playerCharacters[playerId] || null;
  });

  return {
    markCharacters,
    allSelected: game.players.every((playerId) => Boolean(game.playerCharacters[playerId])),
  };
}

function startGame(hostSocket, guestSocket) {
  const gameId = generateId('game');
  const game = {
    id: gameId,
    players: [hostSocket.id, guestSocket.id],
    marks: {
      [hostSocket.id]: 'X',
      [guestSocket.id]: 'O',
    },
    board: Array(9).fill(''),
    currentTurn: 'X',
    active: true,
    playerCharacters: {
      [hostSocket.id]: null,
      [guestSocket.id]: null,
    },
    createdAt: Date.now(),
  };

  games.set(gameId, game);
  hostSocket.join(gameId);
  guestSocket.join(gameId);

  hostSocket.data.gameId = gameId;
  hostSocket.data.lobbyId = null;
  guestSocket.data.gameId = gameId;
  guestSocket.data.lobbyId = null;

  hostSocket.emit('gameStart', {
    mark: 'X',
    board: game.board,
    currentTurn: game.currentTurn,
    characters: CHARACTERS,
    ...getCharacterSelectionPayload(game),
  });

  guestSocket.emit('gameStart', {
    mark: 'O',
    board: game.board,
    currentTurn: game.currentTurn,
    characters: CHARACTERS,
    ...getCharacterSelectionPayload(game),
  });
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.data = {
    lobbyId: null,
    gameId: null,
  };

  socket.emit('lobbyList', getLobbyList());

  socket.on('createLobby', () => {
    if (socket.data.gameId) {
      socket.emit('lobbyError', 'You are already in a game.');
      return;
    }
    if (socket.data.lobbyId) {
      socket.emit('lobbyError', 'You already have an open lobby.');
      return;
    }

    const lobbyId = generateId('lobby');
    lobbies.set(lobbyId, {
      id: lobbyId,
      hostId: socket.id,
      createdAt: Date.now(),
    });

    socket.join(lobbyId);
    socket.data.lobbyId = lobbyId;
    socket.emit('lobbyCreated', { lobbyId });
    broadcastLobbyList();
  });

  socket.on('joinLobby', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
      socket.emit('lobbyError', 'Lobby is no longer available.');
      return;
    }
    if (socket.data.gameId || socket.data.lobbyId) {
      socket.emit('lobbyError', 'You are already in another lobby or game.');
      return;
    }

    const hostSocket = io.sockets.sockets.get(lobby.hostId);
    if (!hostSocket || !hostSocket.connected) {
      lobbies.delete(lobbyId);
      broadcastLobbyList();
      socket.emit('lobbyError', 'Host disconnected. Lobby closed.');
      return;
    }

    lobbies.delete(lobbyId);
    broadcastLobbyList();
    startGame(hostSocket, socket);
  });

  socket.on('leaveLobby', () => {
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) {
      return;
    }

    lobbies.delete(lobbyId);
    socket.leave(lobbyId);
    socket.data.lobbyId = null;
    broadcastLobbyList();
  });

  socket.on('makeMove', ({ index }) => {
    const gameId = socket.data.gameId;
    if (!gameId || !games.has(gameId)) {
      socket.emit('invalidMove', 'You are not in an active game.');
      return;
    }

    const game = games.get(gameId);
    if (!game.active) {
      socket.emit('invalidMove', 'The game is no longer active.');
      return;
    }

    if (!game.players.every((playerId) => Boolean(game.playerCharacters[playerId]))) {
      socket.emit('invalidMove', 'Both players must select a character before playing.');
      return;
    }

    const mark = game.marks[socket.id];
    if (mark !== game.currentTurn) {
      socket.emit('invalidMove', 'Not your turn.');
      return;
    }

    if (index < 0 || index > 8 || game.board[index]) {
      socket.emit('invalidMove', 'Invalid move.');
      return;
    }

    game.board[index] = mark;
    const nextTurn = mark === 'X' ? 'O' : 'X';
    const winningLine = calculateWinner(game.board);

    io.to(gameId).emit('moveAccepted', {
      index,
      mark,
      board: game.board,
      currentTurn: nextTurn,
    });

    if (winningLine) {
      game.active = false;
      io.to(gameId).emit('gameOver', {
        result: 'win',
        winner: mark,
        board: game.board,
      });
      games.delete(gameId);
      return;
    }

    if (game.board.every((cell) => cell !== '')) {
      game.active = false;
      io.to(gameId).emit('gameOver', {
        result: 'draw',
        board: game.board,
      });
      games.delete(gameId);
      return;
    }

    game.currentTurn = nextTurn;
  });

  socket.on('selectCharacter', ({ characterId }) => {
    const gameId = socket.data.gameId;
    if (!gameId || !games.has(gameId)) {
      socket.emit('invalidMove', 'You are not in an active game.');
      return;
    }

    const game = games.get(gameId);
    const character = CHARACTERS.find((option) => option.id === characterId);
    if (!character) {
      socket.emit('invalidMove', 'Invalid character selection.');
      return;
    }

    const alreadyTaken = Object.entries(game.playerCharacters).find(([playerId, selectedId]) => {
      return playerId !== socket.id && selectedId === characterId;
    });
    if (alreadyTaken) {
      socket.emit('invalidMove', 'That character is already taken. Choose a different one.');
      return;
    }

    game.playerCharacters[socket.id] = characterId;
    io.to(gameId).emit('characterSelectionUpdate', getCharacterSelectionPayload(game));
  });

  socket.on('leaveGame', () => {
    const gameId = socket.data.gameId;
    if (!gameId || !games.has(gameId)) {
      socket.emit('invalidMove', 'No active game to leave.');
      return;
    }

    const game = games.get(gameId);
    const opponentId = getOpponentId(game, socket.id);
    const opponentSocket = io.sockets.sockets.get(opponentId);

    if (opponentSocket && opponentSocket.connected) {
      const winner = game.marks[opponentId];
      opponentSocket.emit('opponentDisconnected', {
        winner,
        board: game.board,
      });
    }

    socket.leave(gameId);
    socket.data.gameId = null;
    games.delete(gameId);
    socket.emit('leftGame');
  });

  socket.on('returnToLobby', () => {
    if (socket.data.gameId) {
      socket.leave(socket.data.gameId);
      socket.data.gameId = null;
    }
    if (socket.data.lobbyId) {
      socket.leave(socket.data.lobbyId);
      socket.data.lobbyId = null;
    }
    socket.emit('lobbyList', getLobbyList());
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);

    const lobbyId = socket.data.lobbyId;
    if (lobbyId) {
      lobbies.delete(lobbyId);
      broadcastLobbyList();
    }

    const gameId = socket.data.gameId;
    if (gameId && games.has(gameId)) {
      const game = games.get(gameId);
      if (game.active) {
        const opponentId = getOpponentId(game, socket.id);
        const opponentSocket = io.sockets.sockets.get(opponentId);
        if (opponentSocket && opponentSocket.connected) {
          const winner = game.marks[opponentId];
          opponentSocket.emit('opponentDisconnected', {
            winner,
            board: game.board,
          });
        }
      }
      games.delete(gameId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
