const START_BONUS = 200;
const CURRENCY = "$";
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
const playerColorSelect = document.getElementById("playerColor");
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

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
reconnectBtn.addEventListener("click", reconnectLastRoom);
hostStartBtn.addEventListener("click", () => socket.emit("game:start"));
copyRoomBtn.addEventListener("click", copyRoomLink);
leaveRoomBtn.addEventListener("click", leaveRoom);
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
createBoardTiles();
connectSocket();
showLastRoomOption();
readRoomFromUrl();

function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    setConnectionStatus("Povezano", "ok");
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

  socket.on("server:heartbeat", payload => {
    if (payload.ok) setConnectionStatus(`Povezano · heartbeat ${new Date().toLocaleTimeString()}`, "ok");
  });
}

function createRoom() {
  if (!socket || !socket.connected) return showError("Veza još nije spremna.");
  socket.emit("room:create", {
    name: getPlayerName(),
    color: playerColorSelect.value,
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
    color: playerColorSelect.value,
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
  if (code) roomCodeInput.value = code;
}

function setUrlRoomCode(code) {
  if (!code) return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  history.replaceState({}, "", url);
}

function getPlayerName() {
  return (playerNameInput.value || "Igrač").trim().slice(0, 16) || "Igrač";
}

function cleanRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
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
  if (!saved || !saved.roomCode || !saved.playerId) return;
  lastRoomCodeText.textContent = saved.roomCode;
  lastRoomBox.classList.remove("hidden");
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
  vacationPot = Number(state.vacationPot) || 0;
  jailFee = Number(state.jailFee) || 60;
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

function createBoardTiles() {
  for (let i = 0; i < 40; i++) {
    const tileEl = document.createElement("div");
    tileEl.id = `tile-${i}`;
    tileEl.className = "tile";
    tileEl.title = "Click for tile info";

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
      <div>
        ${player.id === myPlayerId ? `<span class="you-pill">Ti</span>` : ""}
        ${player.id === roomHostId() ? `<span class="host-pill">Host</span>` : ""}
        ${!player.connected ? `<span class="offline-pill">Offline</span>` : ""}
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
    "Porez na dobit": "Porez na dobit",
    "Porez na luksuz": "Porez na luksuz"
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

    const ownerColor = isOwnedPurchasable ? players[tile.owner]?.color : "";
    const priceText = getTileBottomText(tile);
    const icon = isPurchasable ? tile.icon : tile.emoji;
    const groupStyle = tile.type === "property" ? `style="--group-color:${tile.color}"` : "";
    const buildingMarker = tile.type === "property" && (tile.houses || 0) > 0
      ? `<div class="building-marker">${tile.houses === 5 ? "🏨" : `🏠${tile.houses}`}</div>`
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
  const offsetAmount = Math.max(8, Math.min(tileRect.width, tileRect.height) * 0.20);
  const offsets = [
    { x: -offsetAmount, y: -offsetAmount },
    { x: offsetAmount, y: -offsetAmount },
    { x: -offsetAmount, y: offsetAmount },
    { x: offsetAmount, y: offsetAmount }
  ];
  const offset = offsets[playerIndex] || { x: 0, y: 0 };

  return {
    x: tileRect.left - boardRect.left + tileRect.width / 2 + offset.x,
    y: tileRect.top - boardRect.top + tileRect.height / 2 + offset.y
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
    const canDeclareSelfBankruptcy = player.id === myPlayerId && !player.bankrupt && player.money <= 0;
    const debtTools = canDeclareSelfBankruptcy
      ? `<div class="debt-warning">Moraš iznad ${money(0)} trgovinom ili proglasi bankrot.</div><button class="bankrupt-button" onclick="declareBankruptcy()">🏳 Proglasi bankrot</button>`
      : (!player.bankrupt && player.money <= 0 ? `<div class="debt-warning">Čeka se da ovaj igrač trguje ili proglasi bankrot.</div>` : "");

    return `
      <div class="player-card${currentClass}${bankruptClass}${debtClass}${disconnectedClass}${mineClass}">
        <div class="player-name-row">
          <div class="player-name">
            <span class="player-dot" style="--player-color:${player.color}"></span>
            ${safeText(player.name)} ${player.id === myPlayerId ? `<span class="you-pill">Ti</span>` : ""}
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

  currentPlayerText.textContent = gameOver ? "Kraj igre" : roomStatus === "lobby" ? "Čekaonica" : `${player?.name || "Igrač"}${player?.inJail ? " · pritvor" : ""}`;
  actionTextEl.textContent = actionText;

  rollBtn.classList.toggle("hidden", inJailTurn);
  jailRollBtn.classList.toggle("hidden", !inJailTurn);
  jailPayBtn.classList.toggle("hidden", !inJailTurn);
  jailPayBtn.textContent = `Plati ${money(jailFee)}`;

  rollBtn.disabled = !isMyTurn || diceRolled || gameOver || isAnimating || !player || player.bankrupt || blockedByDebt || player.inJail;
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
    const canAccept = to?.id === myPlayerId && canAcceptTrade(trade).ok;
    const canDecline = to?.id === myPlayerId;
    const canCancel = from?.id === myPlayerId;
    return `
      <div class="trade-card">
        <div class="trade-card-title">
          <span>${safeText(from?.name || "Igrač")} → ${safeText(to?.name || "Igrač")}</span>
          <span class="trade-card-status">Na čekanju</span>
        </div>
        <div class="trade-summary-line"><strong>${safeText(from?.name || "Igrač")} nudi:</strong> ${getTradeSideSummary(trade.fromMoney, trade.fromTiles)}</div>
        <div class="trade-summary-line"><strong>${safeText(to?.name || "Igrač")} daje:</strong> ${getTradeSideSummary(trade.toMoney, trade.toTiles)}</div>
        <div class="trade-card-actions">
          <button class="trade-accept-button" onclick="acceptTrade(${trade.id})" ${canAccept ? "" : "disabled"}>Prihvati</button>
          <button class="trade-decline-button" onclick="declineTrade(${trade.id})" ${canDecline ? "" : "disabled"}>Odbij</button>
          <button class="trade-cancel-button" onclick="cancelTrade(${trade.id})" ${canCancel ? "" : "disabled"}>Otkaži</button>
        </div>
      </div>
    `;
  }).join("");
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
    toTiles: []
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

function renderTradeBuilder() {
  if (!activeTradeDraft || activeTradeDraft.to === null) return;

  const from = players[activeTradeDraft.from];
  const to = players[activeTradeDraft.to];
  const fromMoneyMax = Math.max(0, from.money);
  const toMoneyMax = Math.max(0, to.money);

  tradeModal.innerHTML = `
    <button class="modal-close-button" onclick="closeTradeModal()">×</button>
    <h3>Napravi razmenu</h3>
    <div class="trade-builder">
      ${makeTradeColumnHtml("from", from, activeTradeDraft.from, fromMoneyMax)}
      <div class="trade-swap-icon">↔</div>
      ${makeTradeColumnHtml("to", to, activeTradeDraft.to, toMoneyMax)}
    </div>
    <div class="trade-send-row">
      <button class="trade-back-button" onclick="openTradePlayerPicker()">Nazad</button>
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

  return `
    <div class="trade-column">
      <div class="trade-column-title">
        <span class="trade-player-dot" style="--trade-player-color:${player.color}"></span>
        ${label}: ${safeText(player.name)}
      </div>
      <div class="trade-money-control">
        <label><span>Novac</span><strong id="${moneyLabelId}">${money(0)}</strong></label>
        <input id="${moneyInputId}" type="range" min="0" max="${moneyMax}" step="10" value="0" oninput="updateTradeMoneyLabels()" />
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
  const propertyColor = tile.type === "property" ? tile.color : tile.type === "utility" ? "#00a28f" : "#607d8b";
  const extra = tile.type === "property" && tile.houses ? ` · ${tile.houses === 5 ? "hotel" : `${tile.houses} kuća`}` : "";

  return `
    <label class="trade-property-row">
      <input type="checkbox" name="${checkboxName}" value="${tileIndex}" />
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
    toTiles
  });
  closeTradeModal();
}

function acceptTrade(tradeId) {
  socket.emit("trade:accept", { tradeId });
}

function declineTrade(tradeId) {
  socket.emit("trade:decline", { tradeId });
}

function cancelTrade(tradeId) {
  socket.emit("trade:cancel", { tradeId });
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

function declareBankruptcy() {
  const me = players[myPlayerIndex()];
  if (!me || me.bankrupt || me.money > 0) return;
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

function canBuildClient(tile, ownerIndex) {
  if (!tile || tile.type !== "property") return { ok: false, reason: "Samo gradovi mogu da imaju objekte." };
  const player = players[ownerIndex];
  if (!player || player.bankrupt) return { ok: false, reason: "Vlasnik je bankrotirao." };
  if (tile.owner !== ownerIndex) return { ok: false, reason: "Ne poseduješ ovo polje." };
  if (!ownsFullGroup(ownerIndex, tile.group)) return { ok: false, reason: "Prvo moraš da poseduješ ceo set." };
  if (player.money <= 0) return { ok: false, reason: "Prvo reši dug." };
  if ((tile.houses || 0) >= 5) return { ok: false, reason: "Hotel je već izgrađen." };
  const cost = (tile.houses || 0) === 4 ? tile.hotelCost : tile.houseCost;
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
    const nextCost = currentLevel === 4 ? tile.hotelCost : tile.houseCost;
    const sellRefund = Math.floor((currentLevel === 5 ? tile.hotelCost : tile.houseCost) / 2);
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
              <p class="building-note">Svaki ▲ dodaje jednu kuću. Posle 4 kuće, ▲ gradi hotel.</p>`
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
  if (tile.type === "start") return makeSimpleInfoCard(tile, "START", `Prođi ili stani na START i dobijaš ${money(START_BONUS)}.`);

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
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
