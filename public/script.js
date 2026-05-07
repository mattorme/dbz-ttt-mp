const lobbyScreen = document.getElementById('lobbyScreen');
const lobbyStatus = document.getElementById('lobbyStatus');
const lobbyList = document.getElementById('lobbyList');
const createLobbyButton = document.getElementById('createLobbyButton');
const gameScreen = document.getElementById('gameScreen');
const gameInfo = document.getElementById('gameInfo');
const statusText = document.getElementById('statusText');
const modal = document.getElementById('resultModal');
const modalMessage = document.getElementById('modalMessage');
const returnLobbyButton = document.getElementById('returnLobbyButton');
const cells = Array.from(document.querySelectorAll('.cell'));

const socket = io();
let currentLobbyId = null;
let currentGameId = null;
let playerMark = '';
let boardState = Array(9).fill('');
let myTurn = false;
let gameActive = false;
const leaveGameButton = document.getElementById('leaveGameButton');

function showLobbyScreen() {
  lobbyScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  hideModal();
}

function showGameScreen() {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  hideModal();
}

function setLobbyStatus(message) {
  lobbyStatus.textContent = message;
}

function setGameStatus(message) {
  statusText.textContent = message;
}

function renderLobbyList(lobbies) {
  lobbyList.innerHTML = '';
  if (lobbies.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'lobby-empty';
    emptyItem.textContent = 'No available lobbies yet. Create one to start a game.';
    lobbyList.appendChild(emptyItem);
    return;
  }

  lobbies.forEach((lobby) => {
    const item = document.createElement('li');
    item.className = 'lobby-card';
    item.innerHTML = `
      <span>Lobby ${lobby.id.slice(-4).toUpperCase()}</span>
      <button type="button">Join</button>
    `;

    const button = item.querySelector('button');
    button.addEventListener('click', () => joinLobby(lobby.id));
    lobbyList.appendChild(item);
  });
}

function renderBoard() {
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    cell.textContent = boardState[index] || '';
    const disabled = !gameActive || !myTurn || !!boardState[index];
    cell.classList.toggle('disabled', disabled);
  });
}

function setTurnState({ active, turn }) {
  gameActive = active;
  myTurn = playerMark === turn;
  renderBoard();
}

function updateBoard(board) {
  boardState = board;
  renderBoard();
}

function handleCellClick(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);
  if (!gameActive || !myTurn || boardState[index]) {
    return;
  }

  myTurn = false;
  setGameStatus('Sending move...');
  socket.emit('makeMove', { index });
}

function createLobby() {
  setLobbyStatus('Creating lobby...');
  createLobbyButton.disabled = true;
  socket.emit('createLobby');
}

function joinLobby(lobbyId) {
  setLobbyStatus('Joining lobby...');
  socket.emit('joinLobby', { lobbyId });
}

function openLobby(lobbyId) {
  currentLobbyId = lobbyId;
  currentGameId = null;
  playerMark = '';
  boardState = Array(9).fill('');
  gameActive = false;
  myTurn = false;

  showGameScreen();
  gameInfo.textContent = 'Waiting for player to join...';
  setGameStatus('Waiting for player to join...');
  renderBoard();
  showModal('Waiting for player to join...', false);
  createLobbyButton.disabled = true;
}

function leaveLobby() {
  if (!currentLobbyId) {
    return;
  }
  socket.emit('leaveLobby');
  currentLobbyId = null;
  setLobbyStatus('Choose a lobby or create one.');
  createLobbyButton.disabled = false;
}

function openGame(mark, board, currentTurn) {
  currentGameId = true;
  playerMark = mark;
  boardState = board;
  gameActive = true;
  myTurn = playerMark === currentTurn;
  showGameScreen();
  gameInfo.textContent = `You are ${playerMark}`;
  setGameStatus(myTurn ? 'Your turn' : "Opponent's turn");
  renderBoard();
}

function showModal(message, showAction = true) {
  modalMessage.textContent = message;
  modal.classList.toggle('no-action', !showAction);
  if (showAction) {
    returnLobbyButton.classList.remove('hidden');
  } else {
    returnLobbyButton.classList.add('hidden');
  }
  modal.classList.remove('hidden');
}

function hideModal() {
  modal.classList.add('hidden');
}

function returnToLobby() {
  currentGameId = null;
  playerMark = '';
  boardState = Array(9).fill('');
  myTurn = false;
  gameActive = false;
  socket.emit('returnToLobby');
  showLobbyScreen();
  setLobbyStatus('Choose a lobby or create one.');
  createLobbyButton.disabled = false;
}

function leaveGame() {
  if (currentGameId) {
    socket.emit('leaveGame');
    returnToLobby();
    return;
  }

  if (currentLobbyId) {
    leaveLobby();
    showLobbyScreen();
    return;
  }
}

socket.on('leftGame', () => {
  returnToLobby();
});

socket.on('lobbyList', (lobbies) => {
  renderLobbyList(lobbies);
  if (!currentLobbyId) {
    setLobbyStatus('Choose a lobby or create one.');
  }
});

socket.on('lobbyCreated', ({ lobbyId }) => {
  openLobby(lobbyId);
});

socket.on('gameStart', ({ mark, board, currentTurn }) => {
  currentLobbyId = null;
  hideModal();
  openGame(mark, board, currentTurn);
});

socket.on('moveAccepted', ({ board, currentTurn }) => {
  updateBoard(board);
  setTurnState({ active: true, turn: currentTurn });
  setGameStatus(myTurn ? 'Your turn' : "Opponent's turn");
});

socket.on('gameOver', ({ result, winner, board }) => {
  updateBoard(board);
  gameActive = false;
  if (result === 'win') {
    showModal(winner === playerMark ? 'You win! Return to the lobby.' : 'You lose. Return to the lobby.');
  } else {
    showModal('Draw! Return to the lobby.');
  }
});

socket.on('opponentDisconnected', ({ winner, board }) => {
  updateBoard(board);
  gameActive = false;
  showModal(winner === playerMark ? 'Opponent disconnected. You win! Return to the lobby.' : 'Opponent disconnected. Return to the lobby.');
});

socket.on('lobbyError', (message) => {
  setLobbyStatus(message);
  createLobbyButton.disabled = false;
});

socket.on('invalidMove', (message) => {
  setGameStatus(message);
  renderBoard();
});

socket.on('connect', () => {
  setLobbyStatus('Connected. Choose a lobby or create one.');
});

socket.on('disconnect', () => {
  setLobbyStatus('Disconnected from server.');
  setGameStatus('Disconnected');
  gameActive = false;
  renderBoard();
});

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
createLobbyButton.addEventListener('click', createLobby);
leaveGameButton.addEventListener('click', leaveGame);
returnLobbyButton.addEventListener('click', returnToLobby);
