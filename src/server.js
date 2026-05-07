const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
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

let waitingSocket = null;
const rooms = new Map();

app.use(express.static(path.join(__dirname, '../public')));

function calculateWinner(board) {
  return WINNING_LINES.find(([a, b, c]) => {
    return board[a] && board[a] === board[b] && board[a] === board[c];
  });
}

function createRoom(firstSocket, secondSocket) {
  const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const board = Array(9).fill('');
  const room = {
    id: roomId,
    players: [firstSocket.id, secondSocket.id],
    marks: {
      [firstSocket.id]: 'X',
      [secondSocket.id]: 'O',
    },
    board,
    currentTurn: 'X',
    active: true,
    restartRequests: new Set(),
  };

  rooms.set(roomId, room);
  firstSocket.join(roomId);
  secondSocket.join(roomId);
  firstSocket.data.roomId = roomId;
  secondSocket.data.roomId = roomId;

  firstSocket.emit('gameStart', {
    mark: room.marks[firstSocket.id],
    room: roomId,
    board: room.board,
    currentTurn: room.currentTurn,
  });

  secondSocket.emit('gameStart', {
    mark: room.marks[secondSocket.id],
    room: roomId,
    board: room.board,
    currentTurn: room.currentTurn,
  });
}

function resetRoom(room) {
  room.board = Array(9).fill('');
  room.currentTurn = 'X';
  room.active = true;
  room.restartRequests.clear();
  io.to(room.id).emit('gameRestarted', {
    board: room.board,
    currentTurn: room.currentTurn,
  });
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  if (waitingSocket && waitingSocket.connected && waitingSocket.id !== socket.id) {
    createRoom(waitingSocket, socket);
    waitingSocket = null;
  } else {
    waitingSocket = socket;
    socket.emit('waitingForOpponent');
  }

  socket.on('makeMove', ({ index }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      socket.emit('invalidMove', 'No active game room.');
      return;
    }

    const room = rooms.get(roomId);
    if (!room.active) {
      socket.emit('invalidMove', 'The game has ended. Restart to play again.');
      return;
    }

    const mark = room.marks[socket.id];
    if (mark !== room.currentTurn) {
      socket.emit('invalidMove', 'Not your turn.');
      return;
    }

    if (index < 0 || index > 8 || room.board[index]) {
      socket.emit('invalidMove', 'Invalid move.');
      return;
    }

    room.board[index] = mark;
    const winningLine = calculateWinner(room.board);
    const nextTurn = mark === 'X' ? 'O' : 'X';

    io.to(roomId).emit('moveAccepted', {
      index,
      mark,
      board: room.board,
      currentTurn: nextTurn,
    });

    if (winningLine) {
      room.active = false;
      io.to(roomId).emit('gameOver', {
        result: 'win',
        winner: mark,
        board: room.board,
      });
      return;
    }

    if (room.board.every((cell) => cell !== '')) {
      room.active = false;
      io.to(roomId).emit('gameOver', {
        result: 'draw',
        board: room.board,
      });
      return;
    }

    room.currentTurn = nextTurn;
  });

  socket.on('restartGame', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      socket.emit('invalidRestart', 'No room available to restart.');
      return;
    }

    const room = rooms.get(roomId);
    if (room.active) {
      socket.emit('invalidRestart', 'Cannot restart while the game is active.');
      return;
    }

    room.restartRequests.add(socket.id);
    if (room.restartRequests.size === 2) {
      resetRoom(room);
      return;
    }

    socket.emit('restartPending');
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);

    if (waitingSocket && waitingSocket.id === socket.id) {
      waitingSocket = null;
    }

    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    room.active = false;
    io.to(room.id).emit('opponentLeft');

    room.players.forEach((playerId) => {
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket && playerSocket.id !== socket.id && playerSocket.connected) {
        waitingSocket = playerSocket;
      }
    });

    rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
