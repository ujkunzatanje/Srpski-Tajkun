const PASS_START_BONUS = 200;
const LAND_START_BONUS = 300;
const CURRENCY = "€";
const MOVE_STEP_MS = 185;
const DICE_ANIMATION_MS = 1000;

let socket = null;
let roomCode = null;
let myPlayerId = null;
let isHost = false;
let players = [];
let tiles = [];
let currentPlayerIndex = 0;
let diceRolled = false;
let landedTileIndex = null;
let logs = [];
let actionText = "Čekam stanje igre.";
let gameOver = false;
let isAnimating = false;
let movingPlayerIndex = null;
let selectedTileIndex = null;
let lastRollTotal = 0;
let lastDice = [1, 1];
let trades = [];
let roomStatus = "setup";
let hostPlayerId = null;
let activeTradeDraft = null;
let heartbeatTimer = null;
let pendingState = null;
let vacationPot = 0;
let jailFee = 60;
let canRollAgain = false;
let doubleRollCount = 0;
let timerPhase = null;
let turnDeadline = null;
let timerInterval = null;
let joinedByRoomLink = false;
let unavailableColors = [];
let selectedPlayerColor = "#2f6bff";
let peekTimer = null;
let tradeNoticeEl = null;
let tradeNoticeTimer = null;

const setupColorChoices = [
  { name: "Plava", value: "#2f6bff" },
  { name: "Zelena", value: "#22c55e" },
  { name: "Narandžasta", value: "#f59e0b" },
  { name: "Roze", value: "#ef476f" }
];

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");
const board = document.getElementById("board");
const avatarLayer = document.getElementById("avatarLayer");
const tileInfoCard = document.getElementById("tileInfoCard");
const playersPanel = document.getElementById("playersPanel");
const logPanel = document.getElementById("logPanel");
const tradesPanel = document.getElementById("tradesPanel");
const createTradeBtn = document.getElementById("createTradeBtn");
const tradeOverlay = document.getElementById("tradeOverlay");
const tradeModal = document.getElementById("tradeModal");
const currentPlayerText = document.getElementById("currentPlayerText");
const actionTextEl = document.getElementById("actionText");
const die1 = document.getElementById("die1");
const die2 = document.getElementById("die2");
const rollBtn = document.getElementById("rollBtn");
const jailRollBtn = document.getElementById("jailRollBtn");
const jailPayBtn = document.getElementById("jailPayBtn");
const buyBtn = document.getElementById("buyBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const reconnectBtn = document.getElementById("reconnectBtn");
const playerNameInput = document.getElementById("playerName");
const playerColorInput = document.getElementById("playerColor");
const playerColorOptions = document.getElementById("playerColorOptions");
const roomCodeInput = document.getElementById("roomCodeInput");
const connectionStatus = document.getElementById("connectionStatus");
const lastRoomBox = document.getElementById("lastRoomBox");
const lastRoomCodeText = document.getElementById("lastRoomCodeText");
const roomInfoText = document.getElementById("roomInfoText");
const lobbyPanel = document.getElementById("lobbyPanel");
const lobbyCode = document.getElementById("lobbyCode");
const lobbyPlayers = document.getElementById("lobbyPlayers");
const hostStartBtn = document.getElementById("hostStartBtn");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const joinLinkNotice = document.getElementById("joinLinkNotice");
const turnTimer = document.getElementById("turnTimer");
const centerPanel = document.querySelector(".center-panel");

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
reconnectBtn.addEventListener("click", reconnectLastRoom);
hostStartBtn.addEventListener("click", () => socket.emit("game:start"));
copyRoomBtn.addEventListener("click", copyRoomLink);
leaveRoomBtn.addEventListener("click", leaveRoom);
roomCodeInput.addEventListener("input", scheduleRoomPeek);
createTradeBtn.addEventListener("click", openTradePlayerPicker);
rollBtn.addEventListener("click", () => socket.emit("game:rollDice"));
jailRollBtn.addEventListener("click", () => socket.emit("game:rollJail"));
jailPayBtn.addEventListener("click", () => socket.emit("game:payJail"));
buyBtn.addEventListener("click", () => socket.emit("game:buy"));
endTurnBtn.addEventListener("click", () => socket.emit("game:endTurn"));
window.addEventListener("resize", () => {
  renderAvatars();
  renderTileInfoCard();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    hideTileInfo();
    closeTradeModal();
  }
});

setDieValue(die1, 1);
setDieValue(die2, 1);
renderColorOptions();
createBoardTiles();
ensureTradeNotice();
connectSocket();
showLastRoomOption();
readRoomFromUrl();

function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    setConnectionStatus("Povezano", "ok");
    requestRoomPeek();
    showLastRoomOption();
  });

  socket.on("disconnect", () => {
    setConnectionStatus("Prekinuta veza", "bad");
  });

  socket.on("room:joined", payload => {
    roomCode = payload.roomCode;
    myPlayerId = payload.playerId;
    isHost = Boolean(payload.isHost);
    saveSession();
    startHeartbeat();
    setupScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    setUrlRoomCode(roomCode);
  });

  socket.on("room:state", state => {
    if (isAnimating) {
      pendingState = state;
      return;
    }
    applyState(state);
  });

  socket.on("room:animation", async payload => {
    if (payload.startState) applyState(payload.startState, { skipRender: false });
    isAnimating = true;
    movingPlayerIndex = payload.playerIndex;
    renderAll();
    await animateDice(payload.dice[0], payload.dice[1]);
    await animateMovementPaths(payload.paths || {});
    movingPlayerIndex = null;
    isAnimating = false;
    applyState(payload.finalState);
    if (pendingState) {
      applyState(pendingState);
      pendingState = null;
    }
  });

  socket.on("room:error", message => showError(message));

  socket.on("room:kicked", message => {
    showError(message || "Izbačen si iz sobe.", 3500);
    localStorage.removeItem("serbiaPropertyOnlineSession");
    setTimeout(() => { window.location.href = window.location.pathname; }, 900);
  });

  socket.on("room:peekResult", payload => {
    if (payload.requestTag === "lastRoom") {
      if (payload.exists && payload.status !== "ended" && payload.canReconnect) {
        lastRoomCodeText.textContent = payload.roomCode;
        lastRoomBox.classList.remove("hidden");
      } else {
        lastRoomBox.classList.add("hidden");
        localStorage.removeItem("serbiaPropertyOnlineSession");
      }
      return;
    }

    const currentCode = cleanRoomCode(roomCodeInput.value);
    if (payload.roomCode && currentCode && payload.roomCode !== currentCode) return;
    unavailableColors = Array.isArray(payload.takenColors) ? payload.takenColors : [];
    renderColorOptions();
  });

  socket.on("server:heartbeat", payload => {
    if (payload.ok) setConnectionStatus(`Povezano · heartbeat ${new Date().toLocaleTimeString()}`, "ok");
  });
}

function createRoom() {
  if (!socket || !socket.connected) return showError("Veza još nije spremna.");
  socket.emit("room:create", {
    name: getPlayerName(),
    color: getSelectedPlayerColor(),
    playerId: getSavedPlayerIdForRoom(null)
  });
}

function joinRoom() {
  if (!socket || !socket.connected) return showError("Veza još nije spremna.");
  const code = cleanRoomCode(roomCodeInput.value);
  if (!code) return showError("Unesi kod sobe.");
  socket.emit("room:join", {
    roomCode: code,
    name: getPlayerName(),
    color: getSelectedPlayerColor(),
    playerId: getSavedPlayerIdForRoom(code)
  });
}

function reconnectLastRoom() {
  const saved = getSavedSession();
  if (!saved || !saved.roomCode || !saved.playerId) return showError("Nema sačuvane sobe.");
  socket.emit("room:reconnect", { roomCode: saved.roomCode, playerId: saved.playerId });
}

function leaveRoom() {
  localStorage.removeItem("serbiaPropertyOnlineSession");
  window.location.href = window.location.pathname;
}

async function copyRoomLink() {
  if (!roomCode) return;
  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    showError("Link sobe je kopiran.", 1600);
  } catch {
    showError(url, 4500);
  }
}

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = cleanRoomCode(params.get("room"));
  if (code) {
    joinedByRoomLink = true;
    roomCodeInput.value = code;
    createRoomBtn.classList.add("hidden");
    if (joinLinkNotice) joinLinkNotice.classList.remove("hidden");
    setTimeout(requestRoomPeek, 350);
  }
}

function setUrlRoomCode(code) {
  if (!code) return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  history.replaceState({}, "", url);
}

function getPlayerName() {
  return (playerNameInput.value || "").trim().slice(0, 16) || "Igrač";
}

function cleanRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function getSelectedPlayerColor() {
  return playerColorInput?.value || selectedPlayerColor || setupColorChoices[0].value;
}

function selectPlayerColor(color) {
  if (unavailableColors.includes(color)) return;
  selectedPlayerColor = color;
  if (playerColorInput) playerColorInput.value = color;
  renderColorOptions();
}

function renderColorOptions() {
  if (!playerColorOptions) return;
  if (playerColorInput && !playerColorInput.value) playerColorInput.value = selectedPlayerColor;
  selectedPlayerColor = getSelectedPlayerColor();

  if (unavailableColors.includes(selectedPlayerColor)) {
    const firstFree = setupColorChoices.find(choice => !unavailableColors.includes(choice.value));
    if (firstFree) selectedPlayerColor = firstFree.value;
    if (playerColorInput) playerColorInput.value = selectedPlayerColor;
  }

  playerColorOptions.innerHTML = setupColorChoices.map(choice => {
    const taken = unavailableColors.includes(choice.value);
    const active = selectedPlayerColor === choice.value;
    return `
      <button type="button" class="color-choice${active ? " selected" : ""}${taken ? " taken" : ""}"
        style="--choice-color:${choice.value}"
        onclick="selectPlayerColor('${choice.value}')"
        ${taken ? "disabled" : ""}
        title="${taken ? `${choice.name} je zauzeta` : choice.name}">
        <span class="color-choice-swatch"></span>
        <span>${choice.name}</span>
        ${taken ? `<small>Zauzeta</small>` : ""}
      </button>
    `;
  }).join("");
}

function scheduleRoomPeek() {
  clearTimeout(peekTimer);
  peekTimer = setTimeout(requestRoomPeek, 250);
}

function requestRoomPeek() {
  if (!socket || !socket.connected) return;
  const code = cleanRoomCode(roomCodeInput.value);
  if (!code) {
    unavailableColors = [];
    renderColorOptions();
    return;
  }
  socket.emit("room:peek", { roomCode: code });
}

function saveSession() {
  if (!roomCode || !myPlayerId) return;
  localStorage.setItem("serbiaPropertyOnlineSession", JSON.stringify({ roomCode, playerId: myPlayerId, savedAt: Date.now() }));
}

function getSavedSession() {
  try {
    return JSON.parse(localStorage.getItem("serbiaPropertyOnlineSession") || "null");
  } catch {
    return null;
  }
}

function getSavedPlayerIdForRoom(code) {
  const saved = getSavedSession();
  if (saved && code && saved.roomCode === code) return saved.playerId;
  return null;
}

function showLastRoomOption() {
  const saved = getSavedSession();
  lastRoomBox.classList.add("hidden");
  if (!saved || !saved.roomCode || !saved.playerId) return;
  if (!socket || !socket.connected) return;
  socket.emit("room:peek", { roomCode: saved.roomCode, playerId: saved.playerId, requestTag: "lastRoom" });
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (socket && socket.connected && roomCode && myPlayerId) {
      socket.emit("client:heartbeat", { roomCode, playerId: myPlayerId });
    }
  }, 25000);
  socket.emit("client:heartbeat", { roomCode, playerId: myPlayerId });
}

function setConnectionStatus(text, mode) {
  connectionStatus.textContent = text;
  connectionStatus.classList.toggle("ok", mode === "ok");
  connectionStatus.classList.toggle("bad", mode === "bad");
}

function applyState(state, options = {}) {
  if (!state) return;
  const previousTrades = trades || [];
  roomCode = state.code;
  players = state.players || [];
  tiles = state.tiles || [];
  currentPlayerIndex = state.currentPlayerIndex || 0;
  diceRolled = Boolean(state.diceRolled);
  landedTileIndex = state.landedTileIndex;
  logs = state.logs || [];
  actionText = state.actionText || "";
  gameOver = Boolean(state.gameOver);
  lastRollTotal = state.lastRollTotal || 0;
  lastDice = state.lastDice || [1, 1];
  trades = state.trades || [];
  handleIncomingTradeNotifications(previousTrades, trades);
  vacationPot = Number(state.vacationPot) || 0;
  jailFee = Number(state.jailFee) || 60;
  canRollAgain = Boolean(state.canRollAgain);
  doubleRollCount = Number(state.doubleRollCount) || 0;
  timerPhase = state.timerPhase || null;
  turnDeadline = state.turnDeadline || null;
  roomStatus = state.status || "lobby";
  hostPlayerId = state.hostId || null;
  isHost = state.hostId === myPlayerId;
  setupScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  if (!isAnimating) {
    setDieValue(die1, lastDice[0] || 1);
    setDieValue(die2, lastDice[1] || 1);
  }
  if (!options.skipRender) renderAll();
}


function ensureTradeNotice() {
  if (tradeNoticeEl || !board) return;
  tradeNoticeEl = document.createElement("div");
  tradeNoticeEl.id = "tradeNotice";
  tradeNoticeEl.className = "trade-notice hidden";
  tradeNoticeEl.addEventListener("click", hideTradeNotice);
  board.appendChild(tradeNoticeEl);
}

function showTradeNotice(message, duration = 5000) {
  ensureTradeNotice();
  if (!tradeNoticeEl) return;
  tradeNoticeEl.textContent = message;
  tradeNoticeEl.classList.remove("hidden");
  tradeNoticeEl.classList.add("visible");
  clearTimeout(tradeNoticeTimer);
  tradeNoticeTimer = setTimeout(hideTradeNotice, duration);
}

function hideTradeNotice() {
  if (!tradeNoticeEl) return;
  tradeNoticeEl.classList.remove("visible");
  tradeNoticeEl.classList.add("hidden");
}

function handleIncomingTradeNotifications(previousTrades = [], nextTrades = []) {
  const me = myPlayerIndex();
  if (me < 0 || !Array.isArray(nextTrades)) return;
  const previousIncomingIds = new Set(
    previousTrades
      .filter(trade => trade && trade.status === "pending" && trade.to === me)
      .map(trade => trade.id)
  );

  const newIncoming = nextTrades.filter(trade =>
    trade && trade.status === "pending" && trade.to === me && !previousIncomingIds.has(trade.id)
  );

  if (!newIncoming.length) return;
  const newestTrade = newIncoming[0];
  showTradeNotice(newestTrade.kind === "counter" || newestTrade.replyTo ? "IMAS KONTRA PONUDU!" : "IMAS PONUDU!");
}

function createBoardTiles() {
  for (let i = 0; i < 40; i++) {
    const tileEl = document.createElement("div");
    tileEl.id = `tile-${i}`;
    tileEl.className = "tile";
    tileEl.title = "Klikni za informacije";

    const position = getBoardPosition(i);
    tileEl.style.gridColumn = position.column;
    tileEl.style.gridRow = position.row;

    tileEl.addEventListener("click", event => {
      event.stopPropagation();
      showTileInfo(i);
    });

    board.appendChild(tileEl);
  }
}

function getBoardPosition(index) {
  if (index === 0) return { row: 1, column: 1 };
  if (index > 0 && index <= 10) return { row: 1, column: index + 1 };
  if (index > 10 && index <= 20) return { row: index - 9, column: 11 };
  if (index > 20 && index <= 30) return { row: 11, column: 31 - index };
  return { row: 41 - index, column: 1 };
}

function setDieValue(dieElement, value) {
  const safeValue = Math.min(6, Math.max(1, Number(value) || 1));
  dieElement.dataset.value = String(safeValue);

  const existingFront = dieElement.querySelector(".die-face.front");
  if (existingFront) {
    existingFront.innerHTML = makePips(safeValue);
    return;
  }

  dieElement.innerHTML = `
    <div class="die-cube">
      ${makeDieFace("front", safeValue)}
      ${makeDieFace("right", 2)}
      ${makeDieFace("top", 3)}
      ${makeDieFace("bottom", 4)}
      ${makeDieFace("left", 5)}
      ${makeDieFace("back", 6)}
    </div>
  `;
}

function makeDieFace(faceClass, value) {
  return `<div class="die-face ${faceClass}">${makePips(value)}</div>`;
}

function makePips(value) {
  const positionsByValue = {
    1: ["center"],
    2: ["tl", "br"],
    3: ["tl", "center", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "center", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"]
  };

  return positionsByValue[value]
    .map(position => `<span class="pip ${position}"></span>`)
    .join("");
}

function animateDice(finalOne, finalTwo) {
  die1.classList.remove("rolling-one");
  die2.classList.remove("rolling-two");
  void die1.offsetWidth;
  void die2.offsetWidth;

  die1.classList.add("rolling-one");
  die2.classList.add("rolling-two");

  const interval = setInterval(() => {
    setDieValue(die1, randomNumber(1, 6));
    setDieValue(die2, randomNumber(1, 6));
  }, 80);

  return new Promise(resolve => {
    setTimeout(() => {
      clearInterval(interval);
      die1.classList.remove("rolling-one");
      die2.classList.remove("rolling-two");
      setDieValue(die1, finalOne);
      setDieValue(die2, finalTwo);
      resolve();
    }, DICE_ANIMATION_MS);
  });
}

async function animateMovementPaths(paths) {
  const playerIndex = Number(Object.keys(paths)[0]);
  const path = paths[playerIndex] || [];
  movingPlayerIndex = playerIndex;
  for (const tileIndex of path) {
    if (players[playerIndex]) players[playerIndex].position = tileIndex;
    renderAll();
    await sleep(MOVE_STEP_MS);
  }
}

function isPurchasableTile(tile) {
  return Boolean(tile && ["property", "utility", "transport"].includes(tile.type));
}

function renderAll() {
  renderLobby();
  renderBoard();
  renderAvatars();
  renderPlayers();
  renderTrades();
  renderLog();
  renderControls();
  renderTurnTimer();
  renderTileInfoCard();
}

function renderLobby() {
  const inLobby = roomStatus === "lobby";
  lobbyPanel.classList.toggle("hidden", !inLobby);
  roomInfoText.textContent = roomCode ? `Soba ${roomCode} · ${translateRoomStatus(roomStatus)}${myPlayerIndex() >= 0 ? ` · Ti si ${players[myPlayerIndex()].name}` : ""}` : "Soba";
  lobbyCode.textContent = roomCode || "-----";
  lobbyPlayers.innerHTML = players.map(player => `
    <div class="lobby-player-row">
      <div class="lobby-player-left">
        <span class="player-dot" style="--player-color:${player.color}"></span>
        ${safeText(player.name)}
      </div>
      <div class="lobby-player-actions">
        ${player.id === myPlayerId ? `<span class="you-pill">Ti</span>` : ""}
        ${player.id === roomHostId() ? `<span class="host-pill">Host</span>` : ""}
        ${!player.connected ? `<span class="offline-pill">Offline</span>` : ""}
        ${isHost && player.id !== myPlayerId ? `<button class="kick-button" onclick="kickPlayer('${player.id}', '${escapeJsString(player.name)}')">Izbaci</button>` : ""}
      </div>
    </div>
  `).join("");
  hostStartBtn.classList.toggle("hidden", !isHost);
  hostStartBtn.disabled = !isHost || players.length < 2;
}

function roomHostId() {
  return hostPlayerId || "";
}

function translateRoomStatus(status) {
  if (status === "lobby") return "čekaonica";
  if (status === "playing") return "igra u toku";
  if (status === "ended") return "završeno";
  return status || "soba";
}

function getTileDisplayName(tile) {
  if (!tile) return "";
  const shortNames = {
    "Aerodrom Nikola Tesla": "A. Nikola Tesla",
    "Železnička stanica": "Železnica",
    "Autobuska stanica": "Autobus",
    "Sremska Mitrovica": "S. Mitrovica",
    "Pritvor / prolaz": "Pritvor",
    "Porez na dobit": "Porez dobit",
    "Porez na luksuz": "Porez luksuz"
  };
  return shortNames[tile.name] || tile.name;
}

function getTileBottomText(tile) {
  if (!tile) return "";
  if (isPurchasableTile(tile)) return money(tile.price);
  if (tile.type === "tax") {
    if (tile.taxMode === "percent") return `${tile.percent || 10}%`;
    return money(tile.amount || 0);
  }
  if (tile.type === "rest") return vacationPot > 0 ? money(vacationPot) : "Odmor";
  return tile.amount ? money(tile.amount) : tile.text || "";
}

function renderBoard() {
  if (!tiles.length) return;
  tiles.forEach((tile, index) => {
    const tileEl = document.getElementById(`tile-${index}`);
    if (!tileEl) return;

    const isPurchasable = isPurchasableTile(tile);
    const ownerName = isPurchasable && tile.owner !== null ? players[tile.owner]?.name : "";
    const isOwnedPurchasable = isPurchasable && tile.owner !== null;

    let classes = "tile";
    if (tile.type === "property") classes += " property-tile";
    if (isOwnedPurchasable) classes += " owned";
    if (selectedTileIndex === index) classes += " selected";
    if ([0, 10, 20, 30].includes(index)) classes += " corner";
    if (["start", "rest", "jail", "goToJail"].includes(tile.type)) classes += " special";
    if (tile.type === "event") classes += " event";
    if (tile.type === "treasure") classes += " treasure";
    if (tile.type === "tax") classes += " tax";
    if (tile.type === "utility") classes += " utility";
    if (tile.type === "transport") classes += " transport";
    tileEl.className = classes;
    if (tile.type === "property") tileEl.style.setProperty("--group-color", tile.color || "#7c4dff");
    else tileEl.style.removeProperty("--group-color");

    const ownerColor = isOwnedPurchasable ? players[tile.owner]?.color : "";
    const priceText = getTileBottomText(tile);
    const icon = isPurchasable ? tile.icon : tile.emoji;
    const groupStyle = tile.type === "property" ? `style="--group-color:${tile.color}"` : "";
    const buildingMarker = tile.type === "property" && (tile.houses || 0) > 0
      ? `<div class="building-marker ${tile.houses === 5 ? "hotel-marker" : "house-marker"}">${getBuildingIconHtml(tile.houses)}</div>`
      : "";
    const bottomContent = isOwnedPurchasable
      ? `<div class="owned-strip" style="--owner-color:${ownerColor}"><span>${safeText(ownerName)}</span></div>`
      : `<div class="tile-bottom"><span class="tile-price">${safeText(priceText)}</span></div>`;

    tileEl.innerHTML = `
      ${tile.type === "property" ? `<div class="group-glow" ${groupStyle}></div>` : ""}
      <div class="tile-name">${safeText(getTileDisplayName(tile))}</div>
      <div class="tile-icon-slot">${icon || ""}</div>
      ${buildingMarker}
      ${bottomContent}
    `;
  });
}

function getBuildingIconHtml(houses) {
  const level = Math.min(5, Math.max(0, Number(houses) || 0));
  if (level === 5) return `<span class="hotel-icon">🏨</span>`;
  if (level <= 0) return "";
  return `<span class="single-building-icon">🏠</span>${level > 1 ? `<span class="building-count">x${level}</span>` : ""}`;
}

function renderAvatars() {
  if (!players.length || !tiles.length) return;

  players.forEach((player, index) => {
    let avatar = document.getElementById(`avatar-${index}`);
    if (!avatar) {
      avatar = document.createElement("div");
      avatar.id = `avatar-${index}`;
      avatar.className = "avatar";
      avatar.innerHTML = `
        <div class="avatar-head"></div>
        <div class="avatar-body">${index + 1}</div>
      `;
      avatarLayer.appendChild(avatar);
    }

    avatar.style.setProperty("--avatar-color", player.color);
    avatar.classList.toggle("moving", movingPlayerIndex === index && !player.bankrupt);
    avatar.style.display = player.bankrupt ? "none" : "block";

    const { x, y } = getTileCenter(player.position, index);
    avatar.style.left = `${x}px`;
    avatar.style.top = `${y}px`;
  });
}

function getTileCenter(tileIndex, playerIndex) {
  const tileEl = document.getElementById(`tile-${tileIndex}`);
  if (!tileEl) return { x: 0, y: 0 };
  const boardRect = board.getBoundingClientRect();
  const tileRect = tileEl.getBoundingClientRect();
  return {
    x: tileRect.left - boardRect.left + tileRect.width / 2,
    y: tileRect.top - boardRect.top + tileRect.height / 2
  };
}

function renderPlayers() {
  playersPanel.innerHTML = players.map((player, index) => {
    const propertiesOwned = tiles.filter(tile => isPurchasableTile(tile) && tile.owner === index).length;
    const fullSetsOwned = getAllPropertyGroups().filter(groupName => ownsFullGroup(index, groupName)).length;
    const currentClass = index === currentPlayerIndex && !gameOver && roomStatus === "playing" ? " current" : "";
    const bankruptClass = player.bankrupt ? " bankrupt" : "";
    const debtClass = !player.bankrupt && player.money <= 0 ? " in-debt" : "";
    const disconnectedClass = !player.connected ? " disconnected" : "";
    const mineClass = player.id === myPlayerId ? " mine" : "";
    const status = player.bankrupt ? "Bankrot" : player.money <= 0 ? "Dug" : player.inJail ? "Pritvor" : !player.connected ? "Offline" : index === currentPlayerIndex && roomStatus === "playing" && !gameOver ? "Potez" : "Čeka";
    const canDeclareSelfBankruptcy = player.id === myPlayerId && !player.bankrupt && roomStatus === "playing";
    const canHostKick = isHost && player.id !== myPlayerId && !player.bankrupt && (roomStatus === "playing" || roomStatus === "lobby");
    const debtMessage = !player.bankrupt && player.money <= 0
      ? (player.id === myPlayerId ? `<div class="debt-warning">Moraš iznad ${money(0)} trgovinom ili proglasi bankrot.</div>` : `<div class="debt-warning">Čeka se da ovaj igrač trguje ili proglasi bankrot.</div>`)
      : "";
    const smallKickButton = canHostKick ? `<button class="kick-button player-kick" onclick="kickPlayer('${player.id}', '${escapeJsString(player.name)}')">Izbaci</button>` : "";
    const debtTools = `${debtMessage}${canDeclareSelfBankruptcy ? `<button class="bankrupt-button" onclick="declareBankruptcy()">🏳 Proglasi bankrot</button>` : ""}`;

    return `
      <div class="player-card${currentClass}${bankruptClass}${debtClass}${disconnectedClass}${mineClass}">
        <div class="player-name-row">
          <div class="player-name-block">
            <div class="player-name">
              <span class="player-dot" style="--player-color:${player.color}"></span>
              ${safeText(player.name)} ${player.id === myPlayerId ? `<span class="you-pill">Ti</span>` : ""}
            </div>
            ${smallKickButton}
          </div>
          <span class="badge">${status}</span>
        </div>
        <div class="player-stats">
          <div>Novac: <strong>${money(player.money)}</strong></div>
          <div>Polje: <strong>${safeText(tiles[player.position]?.name || "-")}</strong></div>
          <div>Vlasništvo: <strong>${propertiesOwned}</strong></div>
          <div>Celi setovi: <strong>${fullSetsOwned}</strong></div>
          ${debtTools}
        </div>
      </div>
    `;
  }).join("");
}

function renderLog() {
  logPanel.innerHTML = logs.map(log => `<div class="log-item">${safeText(log)}</div>`).join("");
}

function renderTurnTimer() {
  if (!turnTimer) return;
  if (!turnDeadline || roomStatus !== "playing" || gameOver) {
    turnTimer.classList.add("hidden");
    return;
  }
  const remaining = Math.max(0, Math.ceil((Number(turnDeadline) - Date.now()) / 1000));
  const label = timerPhase === "end" ? "Završi potez" : timerPhase === "extraRoll" ? "Baci opet" : "Baci kockice";
  turnTimer.textContent = `${label}: ${remaining}s`;
  turnTimer.classList.toggle("danger", remaining <= 10);
  turnTimer.classList.remove("hidden");
}

function ensureTimerLoop() {
  if (timerInterval) return;
  timerInterval = setInterval(renderTurnTimer, 250);
}

ensureTimerLoop();

function renderControls() {
  const player = players[currentPlayerIndex];
  const me = players[myPlayerIndex()];
  const tile = landedTileIndex === null ? null : tiles[landedTileIndex];
  const isMyTurn = Boolean(player && player.id === myPlayerId && roomStatus === "playing" && !gameOver);
  const blockedByDebt = Boolean(player && !player.bankrupt && player.money <= 0);
  const inJailTurn = Boolean(isMyTurn && player?.inJail && !diceRolled && !blockedByDebt);

  const canBuy = Boolean(
    isMyTurn &&
    diceRolled &&
    tile &&
    isPurchasableTile(tile) &&
    tile.owner === null &&
    player &&
    !player.bankrupt &&
    player.money > 0 &&
    player.money >= tile.price &&
    !gameOver &&
    !isAnimating
  );

  const showBuyButton = Boolean(
    isMyTurn &&
    diceRolled &&
    tile &&
    isPurchasableTile(tile) &&
    tile.owner === null &&
    player &&
    !player.bankrupt &&
    !gameOver &&
    !isAnimating
  );

  currentPlayerText.textContent = gameOver ? "Kraj igre" : roomStatus === "lobby" ? "Čekaonica" : `${player?.name || "Igrač"}${player?.inJail ? " · pritvor" : ""}${canRollAgain ? " · duple" : ""}`;
  actionTextEl.textContent = actionText;

  rollBtn.classList.toggle("hidden", inJailTurn);
  jailRollBtn.classList.toggle("hidden", !inJailTurn);
  jailPayBtn.classList.toggle("hidden", !inJailTurn);
  jailPayBtn.textContent = `Plati ${money(jailFee)}`;

  rollBtn.disabled = !isMyTurn || (diceRolled && !canRollAgain) || gameOver || isAnimating || !player || player.bankrupt || blockedByDebt || player.inJail;
  rollBtn.textContent = canRollAgain && isMyTurn ? "Baci opet" : "Baci kockice";
  jailRollBtn.disabled = !inJailTurn || isAnimating;
  jailPayBtn.disabled = !inJailTurn || isAnimating;
  endTurnBtn.disabled = !isMyTurn || !diceRolled || gameOver || isAnimating || blockedByDebt;

  buyBtn.classList.toggle("hidden", !showBuyButton);
  buyBtn.disabled = !canBuy;
  if (tile && isPurchasableTile(tile)) {
    buyBtn.textContent = canBuy ? `Kupi ${tile.name} za ${money(tile.price)}` : "Nema dovoljno novca";
  }

  createTradeBtn.disabled = roomStatus !== "playing" || gameOver || isAnimating || !me || me.bankrupt || players.filter(p => !p.bankrupt).length < 2;
}

function renderTrades() {
  if (!tradesPanel || !createTradeBtn) return;
  const pendingTrades = trades.filter(trade => trade.status === "pending");
  if (!players.length) {
    tradesPanel.innerHTML = `<div class="trade-empty">Uđi u sobu da koristiš razmene.</div>`;
    return;
  }

  if (!pendingTrades.length) {
    tradesPanel.innerHTML = `<div class="trade-empty">Nema aktivnih razmena. Svaki aktivan igrač može da napravi ponudu.</div>`;
    return;
  }

  tradesPanel.innerHTML = pendingTrades.map(trade => {
    const from = players[trade.from];
    const to = players[trade.to];
    const mine = from?.id === myPlayerId || to?.id === myPlayerId;
    const isCounter = trade.kind === "counter" || trade.replyTo;
    const label = isCounter
      ? `${safeText(from?.name || "Igrač")} je poslao kontra ponudu igraču ${safeText(to?.name || "Igrač")}`
      : `${safeText(from?.name || "Igrač")} je poslao ponudu igraču ${safeText(to?.name || "Igrač")}`;
    return `
      <button class="trade-list-item${mine ? " mine" : ""}" onclick="openTradeOffer(${trade.id})">
        <span class="trade-list-main">${label}</span>
        <span class="trade-list-sub">Klikni za detalje</span>
      </button>
    `;
  }).join("");
}

function openTradeOffer(tradeId) {
  const trade = trades.find(item => item.id === Number(tradeId) && item.status === "pending");
  if (!trade) return showError("Razmena nije pronađena.");
  const from = players[trade.from];
  const to = players[trade.to];
  const me = myPlayerIndex();
  const canAccept = to?.id === myPlayerId && canAcceptTrade(trade).ok;
  const canDecline = to?.id === myPlayerId;
  const canCancel = from?.id === myPlayerId;
  const canNegotiate = me === trade.from || me === trade.to;
  const isCounter = trade.kind === "counter" || trade.replyTo;

  tradeModal.innerHTML = `
    <button class="modal-close-button" onclick="closeTradeModal()">×</button>
    <h3>${isCounter ? "Kontra ponuda" : "Ponuda za razmenu"}</h3>
    <p class="trade-help">${safeText(from?.name || "Igrač")} je ${isCounter ? "poslao kontra ponudu" : "poslao ponudu"} igraču ${safeText(to?.name || "Igrač")}.</p>
    <div class="trade-offer-detail">
      <div class="trade-offer-side">
        <h4>${safeText(from?.name || "Igrač")} nudi</h4>
        ${makeTradeDetailSide(trade.fromMoney, trade.fromTiles)}
      </div>
      <div class="trade-swap-icon compact">↔</div>
      <div class="trade-offer-side">
        <h4>${safeText(to?.name || "Igrač")} daje</h4>
        ${makeTradeDetailSide(trade.toMoney, trade.toTiles)}
      </div>
    </div>
    <div class="trade-send-row wrap">
      <button class="trade-back-button" onclick="closeTradeModal()">Zatvori</button>
      ${canAccept ? `<button class="trade-accept-button" onclick="acceptTrade(${trade.id})">Prihvati</button>` : ""}
      ${canDecline ? `<button class="trade-decline-button" onclick="declineTrade(${trade.id})">Odbij</button>` : ""}
      ${canCancel ? `<button class="trade-cancel-button" onclick="cancelTrade(${trade.id})">Otkaži</button>` : ""}
      ${canNegotiate ? `<button class="trade-send-button" onclick="negotiateTrade(${trade.id})">Pregovaraj</button>` : ""}
    </div>
  `;
  tradeOverlay.classList.remove("hidden");
}

function makeTradeDetailSide(moneyAmount, tileIndexes) {
  const parts = [];
  if (moneyAmount > 0) parts.push(`<div class="trade-detail-money">${money(moneyAmount)}</div>`);
  if (tileIndexes.length) {
    parts.push(tileIndexes.map(tileIndex => {
      const tile = tiles[tileIndex];
      const propertyColor = tile?.type === "property" ? tile.color : tile?.type === "utility" ? "#00a28f" : "#607d8b";
      return `<div class="trade-detail-property"><span class="trade-property-color" style="--property-color:${propertyColor}"></span>${safeText(tile?.name || "Polje")}</div>`;
    }).join(""));
  }
  return parts.length ? parts.join("") : `<div class="trade-detail-empty">Ništa</div>`;
}

function negotiateTrade(tradeId) {
  const trade = trades.find(item => item.id === Number(tradeId) && item.status === "pending");
  if (!trade) return showError("Razmena nije pronađena.");
  const me = myPlayerIndex();
  if (me !== trade.from && me !== trade.to) return showError("Možeš pregovarati samo oko svojih razmena.");

  const other = me === trade.from ? trade.to : trade.from;
  activeTradeDraft = {
    from: me,
    to: other,
    fromMoney: me === trade.from ? trade.fromMoney : trade.toMoney,
    toMoney: me === trade.from ? trade.toMoney : trade.fromMoney,
    fromTiles: me === trade.from ? [...trade.fromTiles] : [...trade.toTiles],
    toTiles: me === trade.from ? [...trade.toTiles] : [...trade.fromTiles],
    replaceTradeId: trade.id
  };
  renderTradeBuilder("Pregovaraj i pošalji novu ponudu");
}

function openTradePlayerPicker() {
  if (gameOver || isAnimating || !players.length || roomStatus !== "playing") return;

  const senderIndex = myPlayerIndex();
  const sender = players[senderIndex];
  if (!sender || sender.bankrupt) return;

  const targets = players
    .map((player, index) => ({ player, index }))
    .filter(item => item.index !== senderIndex && !item.player.bankrupt);

  if (!targets.length) return;

  activeTradeDraft = {
    from: senderIndex,
    to: null,
    fromMoney: 0,
    toMoney: 0,
    fromTiles: [],
    toTiles: [],
    replaceTradeId: null
  };

  tradeModal.innerHTML = `
    <button class="modal-close-button" onclick="closeTradeModal()">×</button>
    <h3>Napravi razmenu</h3>
    <p class="trade-help">${safeText(sender.name)} šalje ponudu. Izaberi igrača za razmenu.</p>
    <div class="trade-target-list">
      ${targets.map(item => `
        <button class="trade-target-button" onclick="chooseTradeTarget(${item.index})">
          <span class="trade-player-dot" style="--trade-player-color:${item.player.color}"></span>
          ${safeText(item.player.name)} · ${money(item.player.money)}
        </button>
      `).join("")}
    </div>
  `;
  tradeOverlay.classList.remove("hidden");
}

function chooseTradeTarget(targetIndex) {
  if (!activeTradeDraft) return;
  if (!players[targetIndex] || players[targetIndex].bankrupt) return;
  activeTradeDraft.to = targetIndex;
  renderTradeBuilder();
}

function renderTradeBuilder(title = "Napravi razmenu") {
  if (!activeTradeDraft || activeTradeDraft.to === null) return;

  const from = players[activeTradeDraft.from];
  const to = players[activeTradeDraft.to];
  const fromMoneyMax = Math.max(0, from.money);
  const toMoneyMax = Math.max(0, to.money);

  const backAction = activeTradeDraft?.replaceTradeId
    ? `openTradeOffer(${Number(activeTradeDraft.replaceTradeId) || 0})`
    : "openTradePlayerPicker()";

  tradeModal.innerHTML = `
    <button class="modal-close-button" onclick="closeTradeModal()">×</button>
    <h3>${safeText(title)}</h3>
    <div class="trade-builder">
      ${makeTradeColumnHtml("from", from, activeTradeDraft.from, fromMoneyMax)}
      <div class="trade-swap-icon">↔</div>
      ${makeTradeColumnHtml("to", to, activeTradeDraft.to, toMoneyMax)}
    </div>
    <div class="trade-send-row">
      <button class="trade-back-button" onclick="${backAction}">Nazad</button>
      <button class="trade-send-button" onclick="sendTradeOffer()">Pošalji razmenu</button>
    </div>
  `;
  updateTradeMoneyLabels();
}

function makeTradeColumnHtml(side, player, playerIndex, moneyMax) {
  const ownedTiles = getOwnedTileIndexes(playerIndex);
  const label = side === "from" ? "Nudi" : "Traži od";
  const moneyInputId = side === "from" ? "tradeFromMoney" : "tradeToMoney";
  const moneyLabelId = side === "from" ? "tradeFromMoneyLabel" : "tradeToMoneyLabel";
  const checkboxName = side === "from" ? "tradeFromTile" : "tradeToTile";
  const currentMoney = side === "from" ? Number(activeTradeDraft.fromMoney || 0) : Number(activeTradeDraft.toMoney || 0);

  return `
    <div class="trade-column">
      <div class="trade-column-title">
        <span class="trade-player-dot" style="--trade-player-color:${player.color}"></span>
        ${label}: ${safeText(player.name)}
      </div>
      <div class="trade-money-control">
        <label><span>Novac</span><strong id="${moneyLabelId}">${money(0)}</strong></label>
        <input id="${moneyInputId}" type="range" min="0" max="${moneyMax}" step="10" value="${Math.min(currentMoney, moneyMax)}" oninput="updateTradeMoneyLabels()" />
        <label><span>Ima</span><strong>${money(player.money)}</strong></label>
      </div>
      <div class="trade-property-list">
        ${ownedTiles.length ? ownedTiles.map(tileIndex => makeTradePropertyRow(tileIndex, checkboxName)).join("") : `<div class="trade-no-property">Nema kupljenih polja.</div>`}
      </div>
    </div>
  `;
}

function makeTradePropertyRow(tileIndex, checkboxName) {
  const tile = tiles[tileIndex];
  const checkedTiles = checkboxName === "tradeFromTile" ? (activeTradeDraft?.fromTiles || []) : (activeTradeDraft?.toTiles || []);
  const checked = checkedTiles.includes(tileIndex) ? "checked" : "";
  const propertyColor = tile.type === "property" ? tile.color : tile.type === "utility" ? "#00a28f" : "#607d8b";
  const extra = tile.type === "property" && tile.houses ? ` · ${tile.houses === 5 ? "hotel" : `${tile.houses} kuća`}` : "";

  return `
    <label class="trade-property-row">
      <input type="checkbox" name="${checkboxName}" value="${tileIndex}" ${checked} />
      <span><span class="trade-property-color" style="--property-color:${propertyColor}"></span></span>
      <span>${safeText(tile.name)}${safeText(extra)}</span>
      <span class="trade-property-price">${money(tile.price)}</span>
    </label>
  `;
}

function updateTradeMoneyLabels() {
  const fromInput = document.getElementById("tradeFromMoney");
  const toInput = document.getElementById("tradeToMoney");
  const fromLabel = document.getElementById("tradeFromMoneyLabel");
  const toLabel = document.getElementById("tradeToMoneyLabel");
  if (fromInput && fromLabel) fromLabel.textContent = money(Number(fromInput.value) || 0);
  if (toInput && toLabel) toLabel.textContent = money(Number(toInput.value) || 0);
}

function sendTradeOffer() {
  if (!activeTradeDraft || activeTradeDraft.to === null) return;

  const fromMoney = Number(document.getElementById("tradeFromMoney")?.value || 0);
  const toMoney = Number(document.getElementById("tradeToMoney")?.value || 0);
  const fromTiles = [...document.querySelectorAll('input[name="tradeFromTile"]:checked')].map(input => Number(input.value));
  const toTiles = [...document.querySelectorAll('input[name="tradeToTile"]:checked')].map(input => Number(input.value));

  if (fromMoney <= 0 && toMoney <= 0 && fromTiles.length === 0 && toTiles.length === 0) {
    showError("Izaberi novac ili bar jedno polje za razmenu.");
    return;
  }

  socket.emit("trade:create", {
    to: activeTradeDraft.to,
    fromMoney,
    toMoney,
    fromTiles,
    toTiles,
    replaceTradeId: activeTradeDraft.replaceTradeId || null
  });
  closeTradeModal();
}

function acceptTrade(tradeId) {
  socket.emit("trade:accept", { tradeId });
  closeTradeModal();
}

function declineTrade(tradeId) {
  socket.emit("trade:decline", { tradeId });
  closeTradeModal();
}

function cancelTrade(tradeId) {
  socket.emit("trade:cancel", { tradeId });
  closeTradeModal();
}

function canAcceptTrade(trade) {
  const from = players[trade.from];
  const to = players[trade.to];
  if (!from || !to) return { ok: false, reason: "Igrač više ne postoji." };
  if (from.bankrupt || to.bankrupt) return { ok: false, reason: "Igrač u ovoj razmeni je bankrotirao." };
  if (trade.fromMoney > 0 && from.money < trade.fromMoney) return { ok: false, reason: `${from.name} nema dovoljno novca.` };
  if (trade.toMoney > 0 && to.money < trade.toMoney) return { ok: false, reason: `${to.name} nema dovoljno novca.` };

  for (const tileIndex of trade.fromTiles) {
    if (!isPurchasableTile(tiles[tileIndex]) || tiles[tileIndex].owner !== trade.from) {
      return { ok: false, reason: `${tiles[tileIndex]?.name || "Polje"} više nije u vlasništvu igrača ${from.name}.` };
    }
  }

  for (const tileIndex of trade.toTiles) {
    if (!isPurchasableTile(tiles[tileIndex]) || tiles[tileIndex].owner !== trade.to) {
      return { ok: false, reason: `${tiles[tileIndex]?.name || "Polje"} više nije u vlasništvu igrača ${to.name}.` };
    }
  }

  return { ok: true, reason: "OK" };
}

function getTradeSideSummary(moneyAmount, tileIndexes) {
  const parts = [];
  if (moneyAmount > 0) parts.push(money(moneyAmount));
  if (tileIndexes.length) {
    parts.push(tileIndexes.map(tileIndex => safeText(tiles[tileIndex]?.name || "Polje")).join(" + "));
  }
  return parts.length ? parts.join(" + ") : "ništa";
}

function getOwnedTileIndexes(playerIndex) {
  return tiles
    .map((tile, index) => ({ tile, index }))
    .filter(item => isPurchasableTile(item.tile) && item.tile.owner === playerIndex)
    .map(item => item.index);
}

function closeTradeModal() {
  activeTradeDraft = null;
  if (!tradeOverlay || !tradeModal) return;
  tradeOverlay.classList.add("hidden");
  tradeModal.innerHTML = "";
}

function kickPlayer(playerId, playerName) {
  if (!isHost || !playerId || playerId === myPlayerId) return;
  const ok = confirm(`Izbaciti igrača ${playerName || "Igrač"}? Ako je igra počela, njegova polja se vraćaju banci.`);
  if (!ok) return;
  socket.emit("game:kick", { playerId });
}

function declareBankruptcy() {
  const me = players[myPlayerIndex()];
  if (!me || me.bankrupt || roomStatus !== "playing") return;
  const ok = confirm(`${me.name} napušta igru i gubi sva kupljena polja. Nastaviti?`);
  if (!ok) return;
  socket.emit("game:bankrupt");
}

function changeBuilding(tileIndex, direction) {
  if (!socket || !socket.connected) return showError("Veza još nije spremna.");
  socket.emit("game:building", { tileIndex, direction });
}

function getBuildingLabel(houses) {
  const level = Number(houses) || 0;
  if (level <= 0) return "Nema objekata";
  if (level === 5) return "Hotel";
  return `${level} kuć${level === 1 ? "a" : "e"}`;
}

function getBuildingBuildCost(tile) {
  const level = Math.min(5, Math.max(0, Number(tile?.houses) || 0));
  const baseCost = Math.max(0, Math.floor(Number(tile?.houseCost) || 0));
  if (level >= 5) return 0;
  if (level === 4) return baseCost + 125;
  return baseCost + level * 25;
}

function getBuildingSellRefund(tile) {
  const level = Math.min(5, Math.max(0, Number(tile?.houses) || 0));
  if (level <= 0) return 0;
  const baseCost = Math.max(0, Math.floor(Number(tile?.houseCost) || 0));
  const originalCost = level === 5 ? baseCost + 125 : baseCost + (level - 1) * 25;
  return Math.floor(originalCost / 2);
}

function canBuildClient(tile, ownerIndex) {
  if (!tile || tile.type !== "property") return { ok: false, reason: "Samo gradovi mogu da imaju objekte." };
  const player = players[ownerIndex];
  if (!player || player.bankrupt) return { ok: false, reason: "Vlasnik je bankrotirao." };
  if (roomStatus !== "playing" || gameOver) return { ok: false, reason: "Igra nije aktivna." };
  if (ownerIndex !== currentPlayerIndex) return { ok: false, reason: "Možeš da gradiš samo tokom svog poteza." };
  if (tile.owner !== ownerIndex) return { ok: false, reason: "Ne poseduješ ovo polje." };
  if (!ownsFullGroup(ownerIndex, tile.group)) return { ok: false, reason: "Prvo moraš da poseduješ ceo set." };
  if (player.money <= 0) return { ok: false, reason: "Prvo reši dug." };
  if ((tile.houses || 0) >= 5) return { ok: false, reason: "Hotel je već izgrađen." };
  const cost = getBuildingBuildCost(tile);
  if (player.money < cost) return { ok: false, reason: "Nema dovoljno novca." };
  return { ok: true, reason: "OK" };
}

function showTileInfo(index) {
  selectedTileIndex = index;
  renderBoard();
  renderTileInfoCard();
}

function hideTileInfo() {
  selectedTileIndex = null;
  if (tileInfoCard) {
    tileInfoCard.classList.add("hidden");
    tileInfoCard.innerHTML = "";
  }
  renderBoard();
}

function renderTileInfoCard() {
  if (!tileInfoCard || selectedTileIndex === null || !document.getElementById(`tile-${selectedTileIndex}`) || !tiles[selectedTileIndex]) {
    if (tileInfoCard) tileInfoCard.classList.add("hidden");
    return;
  }

  const tile = tiles[selectedTileIndex];
  tileInfoCard.innerHTML = getTileInfoHtml(tile, selectedTileIndex);
  tileInfoCard.classList.remove("hidden");

  if (window.innerWidth <= 720) {
    tileInfoCard.style.left = "50%";
    tileInfoCard.style.top = "50%";
    tileInfoCard.style.transform = "translate(-50%, -50%)";
    return;
  }

  tileInfoCard.style.transform = "none";
  const tileEl = document.getElementById(`tile-${selectedTileIndex}`);
  const boardRect = board.getBoundingClientRect();
  const tileRect = tileEl.getBoundingClientRect();
  const cardRect = tileInfoCard.getBoundingClientRect();

  let left = tileRect.left - boardRect.left + tileRect.width + 12;
  if (left + cardRect.width > boardRect.width - 8) {
    left = tileRect.left - boardRect.left - cardRect.width - 12;
  }
  left = clamp(left, 8, boardRect.width - cardRect.width - 8);

  let top = tileRect.top - boardRect.top + tileRect.height / 2 - cardRect.height / 2;
  top = clamp(top, 8, boardRect.height - cardRect.height - 8);

  tileInfoCard.style.left = `${left}px`;
  tileInfoCard.style.top = `${top}px`;
}

function getTileInfoHtml(tile, index) {
  const closeButton = `<button class="info-close" onclick="hideTileInfo()" aria-label="Close">×</button>`;

  if (tile.type === "property") {
    const owner = tile.owner !== null ? players[tile.owner]?.name : "Banka";
    const groupCities = getGroupTiles(tile.group).map(groupTile => groupTile.name).join(" + ");
    const fullSetText = tile.owner !== null && ownsFullGroup(tile.owner, tile.group)
      ? "Ceo set poseduje vlasnik"
      : `Ceo set: ${groupCities}`;

    const myIndex = myPlayerIndex();
    const ownerIndex = tile.owner;
    const isMine = ownerIndex === myIndex;
    const hasFullSet = ownerIndex !== null && ownsFullGroup(ownerIndex, tile.group);
    const currentLevel = Math.min(5, Math.max(0, Number(tile.houses) || 0));
    const activeRent = tile.rentLevels[currentLevel] || tile.rentLevels[0];
    const nextCost = getBuildingBuildCost(tile);
    const sellRefund = getBuildingSellRefund(tile);
    const buildCheck = isMine ? canBuildClient(tile, myIndex) : { ok: false, reason: "Samo vlasnik može da gradi." };
    const canSellBuilding = isMine && currentLevel > 0;
    const buildingControls = isMine
      ? `<div class="building-controls">
          <div class="building-status">
            <span>Objekti</span>
            <strong>${safeText(getBuildingLabel(currentLevel))}</strong>
            <small>Trenutna renta: ${money(activeRent)}</small>
          </div>
          ${hasFullSet
            ? `<div class="building-buttons">
                <button onclick="changeBuilding(${index}, -1)" ${canSellBuilding ? "" : "disabled"}>▼ Prodaj ${currentLevel === 5 ? "hotel" : "kuću"}<small>+${money(sellRefund)}</small></button>
                <button onclick="changeBuilding(${index}, 1)" ${buildCheck.ok ? "" : "disabled"}>▲ ${currentLevel === 4 ? "Izgradi hotel" : "Izgradi kuću"}<small>-${money(nextCost)}</small></button>
              </div>
              <p class="building-note">Svaki ▲ dodaje jednu kuću. Posle 4 kuće, ▲ gradi hotel.${buildCheck.ok ? "" : ` ${safeText(buildCheck.reason)}`}</p>`
            : `<p class="building-note blocked">Moraš da poseduješ ceo ${safeText(tile.group)} set pre gradnje.</p>`}
        </div>`
      : "";

    return `
      ${closeButton}
      <div class="info-card property-card" style="--card-accent:${tile.color}">
        <div class="info-accent"></div>
        <h3>${safeText(tile.name)}</h3>
        <p class="info-subline">${safeText(tile.group)} set · vlasnik: ${safeText(owner)}</p>
        <p class="info-set-line">${safeText(fullSetText)}</p>

        <div class="info-table">
          <div class="info-row info-head"><span>kada</span><span>dobijaš</span></div>
          <div class="info-row ${currentLevel === 0 ? "active-rent-row" : ""}"><span>osnovna renta</span><strong>${money(tile.rentLevels[0])}</strong></div>
          <div class="info-row ${currentLevel === 1 ? "active-rent-row" : ""}"><span>sa jednom kućom</span><strong>${money(tile.rentLevels[1])}</strong></div>
          <div class="info-row ${currentLevel === 2 ? "active-rent-row" : ""}"><span>sa dve kuće</span><strong>${money(tile.rentLevels[2])}</strong></div>
          <div class="info-row ${currentLevel === 3 ? "active-rent-row" : ""}"><span>sa tri kuće</span><strong>${money(tile.rentLevels[3])}</strong></div>
          <div class="info-row ${currentLevel === 4 ? "active-rent-row" : ""}"><span>sa četiri kuće</span><strong>${money(tile.rentLevels[4])}</strong></div>
          <div class="info-row ${currentLevel === 5 ? "active-rent-row" : ""}"><span>sa hotelom</span><strong>${money(tile.rentLevels[5])}</strong></div>
        </div>

        <div class="info-divider"></div>
        <div class="info-footer three-cols">
          <div><span>Cena</span><strong>${money(tile.price)}</strong></div>
          <div><span>🏠 Kuća</span><strong>${money(tile.houseCost)}</strong></div>
          <div><span>🏨 Hotel</span><strong>${money(tile.hotelCost)}</strong></div>
        </div>
        ${buildingControls}
      </div>
    `;
  }

  if (tile.type === "transport") {
    const owner = tile.owner !== null ? players[tile.owner]?.name : "Banka";
    return `
      ${closeButton}
      <div class="info-card transport-card">
        <div class="info-big-icon">${tile.icon}</div>
        <h3>${safeText(tile.name)}</h3>
        <p class="info-subline">Prevoz · vlasnik: ${safeText(owner)}</p>
        <div class="info-table">
          <div class="info-row info-head"><span>kada</span><span>dobijaš</span></div>
          <div class="info-row"><span>poseduje 1 prevoz</span><strong>${money(tile.rentLevels[0])}</strong></div>
          <div class="info-row"><span>poseduje 2 prevoza</span><strong>${money(tile.rentLevels[1])}</strong></div>
          <div class="info-row"><span>poseduje 3 prevoza</span><strong>${money(tile.rentLevels[2])}</strong></div>
          <div class="info-row"><span>poseduje 4 prevoza</span><strong>${money(tile.rentLevels[3])}</strong></div>
        </div>
        <div class="info-divider"></div>
        <div class="info-footer one-col"><div><span>Cena</span><strong>${money(tile.price)}</strong></div></div>
      </div>
    `;
  }

  if (tile.type === "utility") {
    const owner = tile.owner !== null ? players[tile.owner]?.name : "Banka";
    return `
      ${closeButton}
      <div class="info-card utility-card">
        <div class="info-big-icon">${tile.icon}</div>
        <h3>${safeText(tile.name)}</h3>
        <p class="info-subline">Komunalije · vlasnik: ${safeText(owner)}</p>
        <div class="info-table utility-text">
          <p>Ako poseduješ jedno komunalno polje, renta je <strong>4 × bacanje</strong>.</p>
          <p>Ako poseduješ EPS i Vodovod, renta je <strong>10 × bacanje</strong>.</p>
          <p>Poslednje bacanje: <strong>${lastRollTotal || "-"}</strong></p>
        </div>
        <div class="info-divider"></div>
        <div class="info-footer one-col"><div><span>Cena</span><strong>${money(tile.price)}</strong></div></div>
      </div>
    `;
  }

  if (tile.type === "tax") return makeSimpleInfoCard(tile, "Porez", tile.taxMode === "percent" ? `${safeText(tile.name)} uzima ${tile.percent || 10}% tvog novca i šalje ga u Odmor.` : `${safeText(tile.name)} košta ${money(tile.amount || 0)} i ide u Odmor.`);
  if (tile.type === "event" || tile.type === "treasure") return makeSimpleInfoCard(tile, tile.type === "event" ? "Karta" : "Blago", "Izvuci kartu i odmah primeni efekat.");
  if (tile.type === "jail") return makeSimpleInfoCard(tile, "Pritvor", `Ako staneš ovde normalno, samo si u prolazu. Ako si poslat u pritvor, sledeći potez plaćaš ${money(jailFee)} ili bacaš za duple.`);
  if (tile.type === "goToJail") return makeSimpleInfoCard(tile, "Pritvor", `Ovo polje šalje igrača direktno u pritvor. Izlaz je ${money(jailFee)} ili duple kockice.`);
  if (tile.type === "start") return makeSimpleInfoCard(tile, "START", `Ako prođeš START dobijaš ${money(PASS_START_BONUS)}. Ako staneš tačno na START dobijaš ${money(LAND_START_BONUS)}.`);

  if (tile.type === "rest") return makeSimpleInfoCard(tile, "Odmor", vacationPot > 0 ? `U fondu je ${money(vacationPot)}. Ko stane ovde, dobija ceo fond.` : "Fond je prazan.");

  return makeSimpleInfoCard(tile, tile.name, tile.text || "Ovde se ništa ne dešava.");
}

function makeSimpleInfoCard(tile, title, text) {
  return `
    <button class="info-close" onclick="hideTileInfo()" aria-label="Close">×</button>
    <div class="info-card simple-card">
      <div class="info-big-icon">${tile.emoji || tile.icon || ""}</div>
      <h3>${safeText(tile.name)}</h3>
      <p class="info-subline">${safeText(title)}</p>
      <p class="info-description">${text}</p>
    </div>
  `;
}

function getGroupTiles(groupName) {
  return tiles.filter(tile => tile.type === "property" && tile.group === groupName);
}

function getAllPropertyGroups() {
  return [...new Set(tiles.filter(tile => tile.type === "property").map(tile => tile.group))];
}

function ownsFullGroup(ownerIndex, groupName) {
  const groupTiles = getGroupTiles(groupName);
  return groupTiles.length > 0 && groupTiles.every(tile => tile.owner === ownerIndex);
}

function myPlayerIndex() {
  return players.findIndex(player => player.id === myPlayerId);
}

function money(amount) {
  return `${CURRENCY}${amount}`;
}

function randomNumber(min, max) {
  const range = max - min + 1;
  if (window.crypto && window.crypto.getRandomValues) {
    const maxUint = 0xffffffff;
    const limit = maxUint - (maxUint % range);
    const buffer = new Uint32Array(1);
    let value;
    do {
      window.crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return min + (value % range);
  }
  return min + Math.floor(Date.now() % range);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeJsString(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', '\\"')
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function safeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(message, duration = 2600) {
  const toast = document.createElement("div");
  toast.className = "error-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
