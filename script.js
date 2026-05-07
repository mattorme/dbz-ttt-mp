const statusText = document.getElementById('statusText');
const restartButton = document.getElementById('restartButton');
const board = document.getElementById('board');
const cells = Array.from(document.querySelectorAll('.cell'));

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

let currentPlayer = 'X';
let boardState = Array(9).fill('');
let gameActive = true;

function updateStatus(message) {
  statusText.textContent = message;
}

function checkForWin() {
  return WINNING_LINES.some((line) => {
    const [a, b, c] = line;
    return (
      boardState[a] &&
      boardState[a] === boardState[b] &&
      boardState[a] === boardState[c]
    );
  });
}

function checkForDraw() {
  return boardState.every((value) => value !== '');
}

function handleCellClick(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);

  if (!gameActive || boardState[index]) {
    return;
  }

  boardState[index] = currentPlayer;
  cell.textContent = currentPlayer;
  cell.classList.add('disabled');

  if (checkForWin()) {
    updateStatus(`Player ${currentPlayer} wins!`);
    gameActive = false;
    return;
  }

  if (checkForDraw()) {
    updateStatus("It's a draw!");
    gameActive = false;
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateStatus(`Player ${currentPlayer}'s turn`);
}

function restartGame() {
  boardState = Array(9).fill('');
  currentPlayer = 'X';
  gameActive = true;
  updateStatus(`Player ${currentPlayer}'s turn`);
  cells.forEach((cell) => {
    cell.textContent = '';
    cell.classList.remove('disabled');
  });
}

cells.forEach((cell) => {
  cell.addEventListener('click', handleCellClick);
});
restartButton.addEventListener('click', restartGame);
updateStatus(`Player ${currentPlayer}'s turn`);
