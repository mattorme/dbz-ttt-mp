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
const characterSelector = document.getElementById('characterSelector');
const characterSelectorText = document.getElementById('characterSelectorText');
const characterOptions = document.getElementById('characterOptions');

const socket = io();
let currentLobbyId = null;
let isInGame = false;
let playerMark = '';
let boardState = Array(9).fill('');
let myTurn = false;
let gameActive = false;
let characterCatalog = [];
let markCharacters = { X: null, O: null };
let myCharacterId = null;
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

function findCharacter(characterId) {
  return characterCatalog.find((character) => character.id === characterId) || null;
}

function areCharactersLockedIn() {
  return Boolean(markCharacters.X && markCharacters.O);
}

function resetCharacterState() {
  characterCatalog = [];
  markCharacters = { X: null, O: null };
  myCharacterId = null;
  characterSelector.classList.add('hidden');
  characterOptions.innerHTML = '';
}

function renderCharacterSelector() {
  if (!characterCatalog.length) {
    characterOptions.innerHTML = '';
    return;
  }

  characterOptions.innerHTML = '';

  const takenCharacters = new Set(
    Object.values(markCharacters).filter((characterId) => Boolean(characterId))
  );

  characterCatalog.forEach((character) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'character-option';
    option.dataset.characterId = character.id;
    option.setAttribute('aria-label', `Select ${character.name}`);

    const unavailable = takenCharacters.has(character.id) && myCharacterId !== character.id;
    if (myCharacterId === character.id) {
      option.classList.add('selected');
    }
    if (unavailable) {
      option.classList.add('unavailable');
      option.disabled = true;
    }

    option.innerHTML = `
      <img src="${character.asset}" alt="${character.name}" />
      <span>${character.name}</span>
    `;

    option.addEventListener('click', () => {
      socket.emit('selectCharacter', { characterId: character.id });
    });

    characterOptions.appendChild(option);
  });
}

function updateCharacterSelectionState({ markCharacters: nextMarkCharacters }) {
  if (nextMarkCharacters) {
    markCharacters = nextMarkCharacters;
  }
  myCharacterId = markCharacters[playerMark] || null;
  const bothSelected = areCharactersLockedIn();

  characterSelector.classList.toggle('hidden', bothSelected);

  if (!bothSelected) {
    characterSelectorText.textContent = myCharacterId
      ? 'Character locked in. Waiting for opponent to choose...'
      : 'Select your fighter to start.';
    setGameStatus(myCharacterId ? 'Waiting for opponent to select a character...' : 'Select your character to begin.');
  } else {
    setGameStatus(myTurn ? 'Your turn' : "Opponent's turn");
  }

  const myCharacter = findCharacter(myCharacterId);
  gameInfo.textContent = `You are ${playerMark}${myCharacter ? ` (${myCharacter.name})` : ''}`;

  renderCharacterSelector();
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
    const mark = boardState[index];

    cell.innerHTML = '';
    Array.from(cell.classList).forEach((className) => {
      if (className.startsWith('character-')) {
        cell.classList.remove(className);
      }
    });

    if (mark === 'X' || mark === 'O') {
      const characterId = markCharacters[mark];
      const character = findCharacter(characterId);
      if (!character) {
        cell.textContent = mark;
      } else {
        const img = document.createElement('img');
        img.src = character.asset;
        img.alt = character.name;
        cell.appendChild(img);
        cell.classList.add(`character-${character.id}`);
      }
    }

    const disabled =
      !gameActive ||
      !myTurn ||
      !areCharactersLockedIn() ||
      !!boardState[index];
    cell.classList.toggle('disabled', disabled);
  });
}

function setTurnState({ active, turn }) {
  gameActive = active;
  myTurn = playerMark === turn;
  if (areCharactersLockedIn() && gameActive) {
    setGameStatus(myTurn ? 'Your turn' : "Opponent's turn");
  }
  renderBoard();
}

function updateBoard(board) {
  boardState = board;
  renderBoard();
}

function handleCellClick(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.index);
  if (!gameActive || !myTurn || !areCharactersLockedIn() || boardState[index]) {
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
  isInGame = false;
  playerMark = '';
  boardState = Array(9).fill('');
  gameActive = false;
  myTurn = false;
  resetCharacterState();

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

function openGame({ mark, board, currentTurn, characters, markCharacters: initialMarkCharacters }) {
  if (!Array.isArray(characters) || !characters.length) {
    setGameStatus('Unable to load character list. Please refresh or restart the server.');
    return;
  }

  isInGame = true;
  playerMark = mark;
  boardState = board;
  gameActive = true;
  myTurn = playerMark === currentTurn;
  characterCatalog = characters;
  markCharacters = initialMarkCharacters || { X: null, O: null };
  showGameScreen();
  updateCharacterSelectionState({ markCharacters });
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
  isInGame = false;
  playerMark = '';
  boardState = Array(9).fill('');
  myTurn = false;
  gameActive = false;
  resetCharacterState();
  socket.emit('returnToLobby');
  showLobbyScreen();
  setLobbyStatus('Choose a lobby or create one.');
  createLobbyButton.disabled = false;
}

function leaveGame() {
  if (isInGame) {
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

socket.on('gameStart', (payload) => {
  currentLobbyId = null;
  hideModal();
  openGame(payload);
});

socket.on('characterSelectionUpdate', (payload) => {
  updateCharacterSelectionState(payload);
  renderBoard();
});

socket.on('moveAccepted', ({ board, currentTurn }) => {
  updateBoard(board);
  setTurnState({ active: true, turn: currentTurn });
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
