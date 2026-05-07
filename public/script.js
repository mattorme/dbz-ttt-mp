const statusText = document.getElementById('statusText');
const restartButton = document.getElementById('restartButton');
const cells = Array.from(document.querySelectorAll('.cell'));

const socket = io();
let playerMark = '';
let boardState = Array(9).fill('');
let gameActive = false;
let myTurn = false;

function updateStatus(message) {
  statusText.textContent = message;
}

function renderBoard() {
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    cell.textContent = boardState[index] || '';
    if (boardState[index]) {
      cell.classList.add('disabled');
    } else {
      cell.classList.toggle('disabled', !myTurn || !gameActive);
    }
  });
}

function setCellsEnabled(enabled) {
  myTurn = enabled;
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    if (!boardState[index]) {
      cell.classList.toggle('disabled', !enabled);
    }
  });
}

function handleCellClick(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);

  if (!gameActive || !myTurn || boardState[index]) {
    return;
  }

  setCellsEnabled(false);
  updateStatus('Sending move…');
  socket.emit('makeMove', { index });
}

function restartGame() {
  if (gameActive) {
    return;
  }
  socket.emit('restartGame');
  updateStatus('Restart requested. Waiting for opponent...');
  setCellsEnabled(false);
}

socket.on('waitingForOpponent', () => {
  gameActive = false;
  boardState = Array(9).fill('');
  renderBoard();
  updateStatus('Waiting for an opponent to join...');
});

socket.on('gameStart', ({ mark, board, currentTurn }) => {
  playerMark = mark;
  boardState = board;
  gameActive = true;
  myTurn = playerMark === currentTurn;
  updateStatus(`Game started — you are ${playerMark}. ${myTurn ? 'Your move' : "Opponent's turn"}`);
  renderBoard();
  setCellsEnabled(myTurn);
});

socket.on('moveAccepted', ({ index, mark, board, currentTurn }) => {
  boardState = board;
  myTurn = playerMark === currentTurn;
  gameActive = true;
  updateStatus(myTurn ? 'Your move' : "Opponent's turn");
  renderBoard();
  setCellsEnabled(myTurn);
});

socket.on('gameOver', ({ result, winner, board }) => {
  boardState = board;
  gameActive = false;
  renderBoard();

  if (result === 'win') {
    updateStatus(winner === playerMark ? 'You win!' : 'You lose.');
  } else {
    updateStatus("It's a draw!");
  }
});

socket.on('restartPending', () => {
  updateStatus('Restart requested. Waiting for opponent...');
});

socket.on('gameRestarted', ({ board, currentTurn }) => {
  boardState = board;
  gameActive = true;
  myTurn = playerMark === currentTurn;
  updateStatus(`Game restarted — you are ${playerMark}. ${myTurn ? 'Your move' : "Opponent's turn"}`);
  renderBoard();
  setCellsEnabled(myTurn);
});

socket.on('invalidMove', (message) => {
  updateStatus(message);
  setCellsEnabled(myTurn && gameActive);
});

socket.on('invalidRestart', (message) => {
  updateStatus(message);
});

socket.on('opponentLeft', () => {
  gameActive = false;
  updateStatus('Opponent disconnected. Waiting for a new opponent...');
  setCellsEnabled(false);
});

socket.on('connect', () => {
  updateStatus('Connected. Finding a match...');
});

socket.on('disconnect', () => {
  gameActive = false;
  updateStatus('Disconnected from server.');
  setCellsEnabled(false);
});

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
restartButton.addEventListener('click', restartGame);
