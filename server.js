const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const PASS_START_BONUS = 200;
const LAND_START_BONUS = 300;
const TURN_TIMER_MS = 60 * 1000;
const CURRENCY = '€';
const STARTING_MONEY = 3000;
const MAX_PLAYERS = 4;
const ROOM_IDLE_DELETE_MS = 30 * 60 * 1000;
const ENDED_ROOM_DELETE_MS = 5 * 60 * 1000;
const JAIL_FEE = 60;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 20000,
  pingTimeout: 20000
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, rooms: rooms.size }));

const rooms = new Map();

function money(amount) {
  return `${CURRENCY}${amount}`;
}

function cityDataByBoardOrder() {
  return [
    { name: 'Sombor', price: 60, group: 'Braon', color: '#6f4d3c' },
    { name: 'Kikinda', price: 60, group: 'Braon', color: '#6f4d3c' },
    { name: 'Zrenjanin', price: 100, group: 'Svetlo plava', color: '#6f86bf' },
    { name: 'Kruševac', price: 110, group: 'Svetlo plava', color: '#6f86bf' },
    { name: 'Kraljevo', price: 120, group: 'Svetlo plava', color: '#6f86bf' },
    { name: 'Užice', price: 130, group: 'Roze', color: '#b047a7' },
    { name: 'Čačak', price: 140, group: 'Roze', color: '#b047a7' },
    { name: 'Subotica', price: 160, group: 'Roze', color: '#b047a7' },
    { name: 'Smederevo', price: 180, group: 'Narandžasta', color: '#e97824' },
    { name: 'Pančevo', price: 190, group: 'Narandžasta', color: '#e97824' },
    { name: 'Novi Pazar', price: 200, group: 'Narandžasta', color: '#e97824' },
    { name: 'Leskovac', price: 210, group: 'Crvena', color: '#d34152' },
    { name: 'Šabac', price: 220, group: 'Crvena', color: '#d34152' },
    { name: 'Valjevo', price: 240, group: 'Crvena', color: '#d34152' },
    { name: 'Jagodina', price: 260, group: 'Žuta', color: '#d7ac2a' },
    { name: 'Sremska Mitrovica', price: 270, group: 'Žuta', color: '#d7ac2a' },
    { name: 'Kragujevac', price: 280, group: 'Žuta', color: '#d7ac2a' },
    { name: 'Niš', price: 290, group: 'Zelena', color: '#269657' },
    { name: 'Zemun', price: 300, group: 'Zelena', color: '#269657' },
    { name: 'Novi Sad', price: 320, group: 'Zelena', color: '#269657' },
    { name: 'Zlatibor', price: 360, group: 'Tamno plava', color: '#2f3f94' },
    { name: 'Beograd', price: 400, group: 'Tamno plava', color: '#2f3f94' }
  ];
}

const rentTableByPrice = {
  60: [2, 10, 30, 90, 160, 250],
  100: [6, 30, 90, 270, 400, 550],
  110: [7, 35, 100, 300, 450, 600],
  120: [8, 40, 100, 300, 450, 600],
  130: [10, 50, 150, 450, 625, 750],
  140: [10, 50, 150, 450, 625, 750],
  160: [12, 60, 180, 500, 700, 900],
  180: [14, 70, 200, 550, 750, 950],
  190: [15, 70, 210, 560, 760, 960],
  200: [16, 80, 220, 600, 800, 1000],
  210: [17, 85, 250, 650, 850, 1050],
  220: [18, 90, 250, 700, 875, 1050],
  240: [20, 100, 300, 750, 925, 1100],
  260: [22, 110, 330, 800, 975, 1150],
  270: [24, 120, 350, 825, 1000, 1175],
  280: [25, 120, 350, 850, 1000, 1200],
  290: [25, 120, 380, 850, 1050, 1250],
  300: [26, 140, 400, 950, 1150, 1300],
  320: [30, 140, 440, 1000, 1200, 1400],
  360: [35, 180, 550, 1150, 1350, 1525],
  400: [50, 200, 600, 1400, 1700, 2000]
};

function buildingCostForPrice(price) {
  if (price <= 120) return 50;
  if (price <= 200) return 100;
  if (price <= 280) return 150;
  return 200;
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

function makeProperty(city) {
  const rentLevels = rentTableByPrice[city.price] || [city.price * 0.1, city.price * 0.5, city.price * 1.5, city.price * 4, city.price * 5, city.price * 6].map(Math.round);
  return {
    type: 'property',
    name: city.name,
    price: city.price,
    rent: rentLevels[0],
    rentLevels,
    houseCost: buildingCostForPrice(city.price),
    hotelCost: buildingCostForPrice(city.price) + 125,
    houses: 0,
    group: city.group,
    color: city.color,
    icon: '🏙️',
    owner: null
  };
}

function makeTransport(name, icon) {
  return { type: 'transport', name, price: 200, rent: 25, rentLevels: [25, 50, 100, 200], color: '#455a64', icon, owner: null };
}

function makeUtility(name, icon) {
  return { type: 'utility', name, price: 150, rent: 0, color: '#00897b', icon, owner: null };
}

function makeTiles() {
  const cities = cityDataByBoardOrder();
  let p = 0;
  return [
    { type: 'start', name: 'START', emoji: '▶', text: `Stani ${money(LAND_START_BONUS)} / prođi ${money(PASS_START_BONUS)}` },
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na dobit', emoji: '💸', taxMode: 'percent', percent: 10, text: 'Plati 10% novca u Odmor' },
    makeTransport('Aerodrom Niš', '✈️'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'jail', name: 'Pritvor / prolaz', emoji: '🚓', text: 'Samo prolaz' },
    makeProperty(cities[p++]),
    makeUtility('EPS', '⚡'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Železnička stanica', '🚆'),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'rest', name: 'Odmor', emoji: '🏝️', text: 'Pokupi fond' },
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Autobuska stanica', '🚌'),
    makeProperty(cities[p++]),
    makeUtility('Vodovod', '🚰'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'goToJail', name: 'Idi u pritvor', emoji: '👮', text: 'Idi u pritvor' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeTransport('Aerodrom Nikola Tesla', '✈️'),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na luksuz', emoji: '💎', amount: 140, text: `Plati ${money(140)} u Odmor` },
    makeProperty(cities[p++])
  ];
}

function makeEventDeck() {
  const cards = [
    { text: 'Dodatni posao. Uzmi €100.', effect: (room, player, paths) => addMoney(room, player, 100, 'dodatni posao') },
    { text: 'Kazna za parking. Plati €80.', effect: (room, player, paths) => payBank(room, player, 80, 'kazna za parking') },
    { text: 'Brz put autoputem. Pomeri se 3 polja napred.', effect: (room, player, paths) => { movePlayer(room, player, 3, paths); handleTile(room, player, paths); } },
    { text: 'Radovi na putu. Vrati se 2 polja nazad.', effect: (room, player, paths) => { movePlayer(room, player, -2, paths); handleTile(room, player, paths); } },
    { text: 'Greška banke u tvoju korist. Uzmi €150.', effect: (room, player, paths) => addMoney(room, player, 150, 'greška banke') },
    { text: 'Neočekivan račun. Plati €120.', effect: (room, player, paths) => payBank(room, player, 120, 'neočekivan račun') },
    { text: 'Autobus do STARTA. Uzmi €300.', effect: (room, player, paths) => directMove(room, player, 0, paths, true) },
    { text: 'Prijatelji su pomogli. Svaki aktivan igrač ti daje €30.', effect: (room, player) => {
      room.players.forEach(other => {
        if (other.id !== player.id && !other.bankrupt) {
          other.money -= 30;
          player.money += 30;
          addLog(room, `${other.name} je dao €30 igraču ${player.name}.`);
          checkDebt(room, other);
        }
      });
      checkDebt(room, player);
    } },
    { text: 'Častiš sve. Plati svakom aktivnom igraču €25.', effect: (room, player) => {
      room.players.forEach(other => {
        if (other.id !== player.id && !other.bankrupt) {
          player.money -= 25;
          other.money += 25;
          addLog(room, `${player.name} je dao €25 igraču ${other.name}.`);
        }
      });
      checkDebt(room, player);
    } }
  ];
  return shuffle(cards);
}

function createRoom(hostPlayer) {
  const code = makeRoomCode();
  const room = {
    code,
    hostId: hostPlayer.id,
    status: 'lobby',
    players: [hostPlayer],
    tiles: makeTiles(),
    currentPlayerIndex: 0,
    diceRolled: false,
    landedTileIndex: null,
    logs: [],
    eventDeck: makeEventDeck(),
    eventPointer: 0,
    actionText: 'Čekamo igrače.',
    gameOver: false,
    lastRollTotal: 0,
    lastDice: [1, 1],
    trades: [],
    tradeIdCounter: 1,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    endedAt: null,
    vacationPot: 0,
    canRollAgain: false,
    doubleRollCount: 0,
    timerPhase: null,
    turnDeadline: null,
    turnTimerHandle: null
  };
  addLog(room, `${hostPlayer.name} je napravio sobu ${code}.`);
  rooms.set(code, room);
  return room;
}

function makePlayer({ id, socketId, name, color }) {
  return {
    id,
    socketId,
    name: cleanName(name),
    color: color || '#2f6bff',
    money: STARTING_MONEY,
    position: 0,
    bankrupt: false,
    inDebt: false,
    inJail: false,
    connected: true,
    kicked: false,
    lastSeen: Date.now()
  };
}

function cleanName(name) {
  const text = String(name || '').trim().slice(0, 16);
  return text || 'Igrač';
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-5);
}

function cleanRoomCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function makePlayerId() {
  return `p_${crypto.randomBytes(8).toString('hex')}_${Date.now().toString(36)}`;
}

function publicRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(({ id, name, color, money, position, bankrupt, inDebt, inJail, connected, kicked }) => ({ id, name, color, money, position, bankrupt, inDebt, inJail, connected, kicked })),
    tiles: room.tiles,
    currentPlayerIndex: room.currentPlayerIndex,
    diceRolled: room.diceRolled,
    landedTileIndex: room.landedTileIndex,
    logs: room.logs,
    actionText: room.actionText,
    gameOver: room.gameOver,
    lastRollTotal: room.lastRollTotal,
    lastDice: room.lastDice,
    trades: room.trades,
    vacationPot: room.vacationPot || 0,
    jailFee: JAIL_FEE,
    canRollAgain: Boolean(room.canRollAgain),
    doubleRollCount: Number(room.doubleRollCount) || 0,
    timerPhase: room.timerPhase || null,
    turnDeadline: room.turnDeadline || null
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:state', publicRoomState(room));
}

function emitError(socket, message) {
  socket.emit('room:error', String(message || 'Something went wrong.'));
}

function getRoom(code) {
  return rooms.get(String(code || '').trim().toUpperCase());
}

function findPlayerIndex(room, playerId) {
  return room.players.findIndex(player => player.id === playerId);
}

function findPlayer(room, playerId) {
  return room.players.find(player => player.id === playerId);
}

function touchRoom(room) {
  room.lastActivity = Date.now();
}

function reconnectSeat(socket, room, player, logMessage) {
  player.socketId = socket.id;
  player.connected = true;
  player.lastSeen = Date.now();
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  touchRoom(room);
  addLog(room, logMessage || `${player.name} se ponovo povezao.`);
  socket.emit('room:joined', { roomCode: room.code, playerId: player.id, isHost: room.hostId === player.id });
  emitRoom(room);
}

io.on('connection', socket => {
  socket.on('room:peek', (payload = {}) => {
    const room = getRoom(payload.roomCode);
    if (!room) {
      socket.emit('room:peekResult', { roomCode: cleanRoomCode(payload.roomCode), exists: false, takenColors: [] });
      return;
    }
    socket.emit('room:peekResult', {
      roomCode: room.code,
      exists: true,
      status: room.status,
      playerCount: room.players.filter(player => !player.bankrupt).length,
      takenColors: room.players.filter(player => !player.bankrupt).map(player => player.color)
    });
  });

  socket.on('room:create', (payload = {}) => {
    const playerId = payload.playerId || makePlayerId();
    const player = makePlayer({ id: playerId, socketId: socket.id, name: payload.name, color: payload.color });
    const room = createRoom(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.emit('room:joined', { roomCode: room.code, playerId: player.id, isHost: true });
    emitRoom(room);
  });

  socket.on('room:join', (payload = {}) => {
    const room = getRoom(payload.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');

    const savedPlayerId = payload.playerId ? String(payload.playerId) : '';
    const savedPlayer = savedPlayerId ? findPlayer(room, savedPlayerId) : null;
    if (savedPlayer && !savedPlayer.bankrupt) {
      reconnectSeat(socket, room, savedPlayer, `${savedPlayer.name} se vratio u sobu.`);
      return;
    }

    if (room.status !== 'lobby') {
      const sameNameDisconnected = room.players.filter(player =>
        !player.bankrupt && !player.connected && cleanName(player.name).toLowerCase() === cleanName(payload.name).toLowerCase()
      );

      if (sameNameDisconnected.length === 1) {
        reconnectSeat(socket, room, sameNameDisconnected[0], `${sameNameDisconnected[0].name} se vratio u sobu.`);
        return;
      }

      return emitError(socket, 'Igra je već počela. Koristi povratak ako je ovo tvoje mesto.');
    }

    if (room.players.length >= MAX_PLAYERS) return emitError(socket, 'Soba je puna.');

    const colorTaken = room.players.some(player => player.color === payload.color && !player.bankrupt);
    if (colorTaken) return emitError(socket, 'Ta boja je već zauzeta u ovoj sobi.');

    const playerId = payload.playerId || makePlayerId();
    const player = makePlayer({ id: playerId, socketId: socket.id, name: payload.name, color: payload.color });
    room.players.push(player);
    touchRoom(room);
    addLog(room, `${player.name} se pridružio sobi.`);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.emit('room:joined', { roomCode: room.code, playerId: player.id, isHost: room.hostId === player.id });
    emitRoom(room);
  });

  socket.on('room:reconnect', (payload = {}) => {
    const room = getRoom(payload.roomCode);
    if (!room) return emitError(socket, 'Prethodna soba više ne postoji.');
    const player = findPlayer(room, payload.playerId);
    if (!player) return emitError(socket, 'Ne mogu da pronađem tvoje staro mesto u toj sobi.');
    if (player.bankrupt) return emitError(socket, 'To mesto je već bankrotiralo.');
    reconnectSeat(socket, room, player, `${player.name} se ponovo povezao.`);
  });

  socket.on('game:start', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    if (room.hostId !== socket.data.playerId) return emitError(socket, 'Samo host može da pokrene igru.');
    if (room.players.length < 2) return emitError(socket, 'Potrebna su bar 2 igrača.');
    if (room.status !== 'lobby') return emitError(socket, 'Igra je već počela.');

    room.status = 'playing';
    room.actionText = `${room.players[0].name}, baci kockice.`;
    addLog(room, `Igra je počela. Broj igrača: ${room.players.length}.`);
    scheduleRollTimer(room);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:rollDice', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex, { allowDebtBankruptcyOnly: false });
    if (!validation.ok) return emitError(socket, validation.reason);
    if (room.diceRolled && !room.canRollAgain) return emitError(socket, 'Kockice su već bačene ovaj potez.');
    performRollDice(room, playerIndex, false);
  });

  socket.on('game:payJail', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (room.diceRolled) return emitError(socket, 'Već si iskoristio potez.');
    const player = room.players[playerIndex];
    if (!player.inJail) return emitError(socket, 'Nisi u pritvoru.');
    resolveJailPayment(room, playerIndex, false);
  });

  socket.on('game:rollJail', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (room.diceRolled) return emitError(socket, 'Već si iskoristio potez.');
    const player = room.players[playerIndex];
    if (!player.inJail) return emitError(socket, 'Nisi u pritvoru.');
    performJailRoll(room, playerIndex, false);
  });

  socket.on('game:buy', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (!room.diceRolled || room.landedTileIndex === null) return emitError(socket, 'Prvo baci kockice.');

    const player = room.players[playerIndex];
    if (player.money <= 0) return emitError(socket, 'Prvo reši dug.');
    const tile = room.tiles[room.landedTileIndex];
    if (!isPurchasableTile(tile)) return emitError(socket, 'Ovo polje ne može da se kupi.');
    if (tile.owner !== null) return emitError(socket, 'Ovo polje već ima vlasnika.');
    if (player.money < tile.price) return emitError(socket, 'Nema dovoljno novca.');

    player.money -= tile.price;
    tile.owner = playerIndex;
    room.actionText = `${player.name} je kupio ${tile.name} za ${money(tile.price)}.`;
    addLog(room, room.actionText);
    checkDebt(room, player);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:endTurn', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (!room.diceRolled) return emitError(socket, 'Prvo baci kockice.');
    endTurnForRoom(room);
  });

  socket.on('trade:create', (payload = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const from = findPlayerIndex(room, socket.data.playerId);
    if (from < 0) return emitError(socket, 'Nisi u ovoj sobi.');
    const trade = {
      id: room.tradeIdCounter++,
      from,
      to: Number(payload.to),
      fromMoney: clampMoney(payload.fromMoney),
      toMoney: clampMoney(payload.toMoney),
      fromTiles: uniqueTileIndexes(payload.fromTiles),
      toTiles: uniqueTileIndexes(payload.toTiles),
      status: 'pending'
    };
    if (trade.fromMoney <= 0 && trade.toMoney <= 0 && trade.fromTiles.length === 0 && trade.toTiles.length === 0) {
      return emitError(socket, 'Izaberi novac ili bar jedno polje za razmenu.');
    }
    const validation = canAcceptTrade(room, trade);
    if (!validation.ok) return emitError(socket, validation.reason);
    room.trades.unshift(trade);
    addLog(room, `${room.players[from].name} je poslao ponudu za razmenu igraču ${room.players[trade.to].name}.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:accept', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Razmena nije pronađena.');
    if (trade.to !== playerIndex) return emitError(socket, 'Samo primalac može da prihvati ovu razmenu.');
    const validation = canAcceptTrade(room, trade);
    if (!validation.ok) return emitError(socket, validation.reason);

    const from = room.players[trade.from];
    const to = room.players[trade.to];
    from.money = from.money - trade.fromMoney + trade.toMoney;
    to.money = to.money - trade.toMoney + trade.fromMoney;
    trade.fromTiles.forEach(tileIndex => { room.tiles[tileIndex].owner = trade.to; });
    trade.toTiles.forEach(tileIndex => { room.tiles[tileIndex].owner = trade.from; });
    trade.status = 'accepted';
    room.trades = room.trades.filter(item => item.status === 'pending');
    addLog(room, `${to.name} je prihvatio ponudu za razmenu od ${from.name}.`);
    checkDebt(room, from);
    checkDebt(room, to);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:decline', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Razmena nije pronađena.');
    if (trade.to !== playerIndex) return emitError(socket, 'Samo primalac može da odbije ovu razmenu.');
    const from = room.players[trade.from];
    const to = room.players[trade.to];
    trade.status = 'declined';
    room.trades = room.trades.filter(item => item.status === 'pending');
    addLog(room, `${to?.name || 'Igrač'} je odbio ponudu za razmenu od ${from?.name || 'Igrač'}.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:cancel', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Razmena nije pronađena.');
    if (trade.from !== playerIndex) return emitError(socket, 'Samo pošiljalac može da otkaže ovu razmenu.');
    const from = room.players[trade.from];
    trade.status = 'cancelled';
    room.trades = room.trades.filter(item => item.status === 'pending');
    addLog(room, `${from?.name || 'Igrač'} je otkazao svoju ponudu za razmenu.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:building', (payload = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    if (room.status !== 'playing' || room.gameOver) return emitError(socket, 'Igra nije aktivna.');

    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    if (playerIndex < 0) return emitError(socket, 'Nisi u ovoj sobi.');

    const direction = Number(payload.direction) >= 0 ? 1 : -1;
    const tileIndex = Number(payload.tileIndex);
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= room.tiles.length) return emitError(socket, 'Neispravno polje.');

    const player = room.players[playerIndex];
    const tile = room.tiles[tileIndex];
    const validation = validateBuildingAction(room, playerIndex, tileIndex, direction);
    if (!validation.ok) return emitError(socket, validation.reason);

    if (direction > 0) {
      const cost = getBuildingBuildCost(tile);
      player.money -= cost;
      tile.houses += 1;
      const buildingName = tile.houses === 5 ? 'hotel' : `kuću ${tile.houses}`;
      addLog(room, `${player.name} je izgradio ${buildingName} na ${tile.name} za ${money(cost)}.`);
    } else {
      const refund = getBuildingSellRefund(tile);
      const removedName = tile.houses === 5 ? 'hotel' : 'kuću';
      tile.houses -= 1;
      player.money += refund;
      addLog(room, `${player.name} je prodao ${removedName} sa ${tile.name} i dobio ${money(refund)}.`);
    }

    checkDebt(room, player);
    room.actionText = `${player.name} je promenio objekte na ${tile.name}.`;
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:kick', (payload = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    if (room.hostId !== socket.data.playerId) return emitError(socket, 'Samo host može da izbaci igrača.');
    const target = findPlayerIndex(room, String(payload.playerId || ''));
    if (target < 0) return emitError(socket, 'Igrač nije pronađen.');
    if (room.players[target].id === room.hostId) return emitError(socket, 'Host ne može da izbaci sam sebe.');
    kickPlayer(room, target);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:bankrupt', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    if (playerIndex < 0) return emitError(socket, 'Nisi u ovoj sobi.');
    const player = room.players[playerIndex];
    if (room.status !== 'playing' || room.gameOver) return emitError(socket, 'Igra nije aktivna.');
    if (player.bankrupt) return emitError(socket, 'Već si bankrotirao.');

    declareBankruptcy(room, playerIndex);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('client:heartbeat', (payload = {}) => {
    const room = getRoom(payload.roomCode || socket.data.roomCode);
    if (!room) return socket.emit('server:heartbeat', { ok: false });
    const player = findPlayer(room, payload.playerId || socket.data.playerId);
    if (player && !player.bankrupt) {
      player.lastSeen = Date.now();
      player.connected = true;
      player.socketId = socket.id;
    }
    touchRoom(room);
    socket.emit('server:heartbeat', { ok: true, t: Date.now() });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const player = findPlayer(room, socket.data.playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      player.lastSeen = Date.now();
      addLog(room, `${player.name} je izašao iz sobe.`);
      emitRoom(room);
    }
  });
});


function clearTurnTimer(room) {
  if (!room) return;
  if (room.turnTimerHandle) clearTimeout(room.turnTimerHandle);
  room.turnTimerHandle = null;
  room.timerPhase = null;
  room.turnDeadline = null;
}

function scheduleTurnTimer(room, phase) {
  clearTurnTimer(room);
  if (!room || room.status !== 'playing' || room.gameOver) return;
  const player = room.players[room.currentPlayerIndex];
  if (!player || player.bankrupt || player.money <= 0) return;
  room.timerPhase = phase;
  room.turnDeadline = Date.now() + TURN_TIMER_MS;
  const playerIndex = room.currentPlayerIndex;
  const deadline = room.turnDeadline;
  room.turnTimerHandle = setTimeout(() => handleTurnTimeout(room.code, playerIndex, phase, deadline), TURN_TIMER_MS + 120);
}

function scheduleRollTimer(room) {
  scheduleTurnTimer(room, 'roll');
}

function scheduleEndTimer(room) {
  scheduleTurnTimer(room, 'end');
}

function handleTurnTimeout(roomCode, playerIndex, phase, deadline) {
  const room = getRoom(roomCode);
  if (!room || room.status !== 'playing' || room.gameOver) return;
  if (room.currentPlayerIndex !== playerIndex || room.turnDeadline !== deadline || room.timerPhase !== phase) return;
  const player = room.players[playerIndex];
  if (!player || player.bankrupt || player.money <= 0) return;

  if ((phase === 'roll' || phase === 'extraRoll') && (!room.diceRolled || room.canRollAgain)) {
    if (player.inJail) performJailRoll(room, playerIndex, true);
    else performRollDice(room, playerIndex, true);
    return;
  }

  if (phase === 'end' && room.diceRolled && !room.canRollAgain) {
    addLog(room, `⏱ ${player.name} nije završio potez na vreme. Potez se automatski završava.`);
    endTurnForRoom(room);
  }
}

function performRollDice(room, playerIndex, automatic) {
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return;
  if (player.inJail) {
    room.actionText = 'U pritvoru si. Plati izlaz ili baci kockice za duple.';
    emitRoom(room);
    return;
  }
  if (player.money <= 0) {
    player.inDebt = true;
    room.actionText = `${player.name} ima ${money(player.money)}. Razmeni nešto da odeš iznad ${money(0)} ili proglasi bankrot.`;
    emitRoom(room);
    return;
  }

  clearTurnTimer(room);
  const startState = publicRoomState(room);
  const d1 = randomNumber(1, 6);
  const d2 = randomNumber(1, 6);
  const total = d1 + d2;
  const paths = { [playerIndex]: [] };
  const isDouble = d1 === d2;

  room.diceRolled = true;
  room.canRollAgain = false;
  room.lastDice = [d1, d2];
  room.lastRollTotal = total;
  room.landedTileIndex = null;

  if (isDouble) room.doubleRollCount = (Number(room.doubleRollCount) || 0) + 1;
  else room.doubleRollCount = 0;

  if (isDouble && room.doubleRollCount >= 3) {
    player.inJail = true;
    room.doubleRollCount = 0;
    directMove(room, player, 10, paths, false);
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} je bacio treće duple (${d1}+${d2}) i ide direktno u pritvor.`;
    addLog(room, room.actionText);
    room.landedTileIndex = player.position;
    scheduleEndTimer(room);
  } else {
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} je bacio ${d1} + ${d2} = ${total}.`;
    addLog(room, room.actionText);
    movePlayer(room, player, total, paths);
    handleTile(room, player, paths);
    room.landedTileIndex = player.position;

    if (isDouble && !player.bankrupt && !player.inDebt && player.money > 0 && !player.inJail && !room.gameOver) {
      room.canRollAgain = true;
      room.actionText += ` Duple! ${player.name} može da baci opet.`;
      addLog(room, `🎲 ${player.name} ima duple i dobija još jedno bacanje.`);
      scheduleTurnTimer(room, 'extraRoll');
    } else {
      scheduleEndTimer(room);
    }
  }

  touchRoom(room);
  const finalState = publicRoomState(room);
  io.to(room.code).emit('room:animation', { playerIndex, dice: [d1, d2], paths, startState, finalState });
}

function resolveJailPayment(room, playerIndex, automatic) {
  const player = room.players[playerIndex];
  clearTurnTimer(room);
  player.money -= JAIL_FEE;
  player.inJail = false;
  room.diceRolled = true;
  room.canRollAgain = false;
  room.doubleRollCount = 0;
  room.landedTileIndex = player.position;
  room.actionText = `${automatic ? '⏱ ' : ''}${player.name} je platio ${money(JAIL_FEE)} i izašao iz pritvora. To je ceo potez za ovaj krug.`;
  addLog(room, room.actionText);
  checkDebt(room, player);
  if (player.money > 0) scheduleEndTimer(room);
  touchRoom(room);
  emitRoom(room);
}

function performJailRoll(room, playerIndex, automatic) {
  const player = room.players[playerIndex];
  clearTurnTimer(room);
  const startState = publicRoomState(room);
  const d1 = randomNumber(1, 6);
  const d2 = randomNumber(1, 6);
  const paths = { [playerIndex]: [] };
  room.diceRolled = true;
  room.canRollAgain = false;
  room.doubleRollCount = 0;
  room.lastDice = [d1, d2];
  room.lastRollTotal = d1 + d2;
  room.landedTileIndex = player.position;

  if (d1 === d2) {
    player.inJail = false;
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} je bacio duple ${d1}+${d2} i izašao iz pritvora. To je ceo potez za ovaj krug.`;
    addLog(room, room.actionText);
  } else {
    player.money -= JAIL_FEE;
    player.inJail = false;
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} nije bacio duple (${d1}+${d2}) i plaća ${money(JAIL_FEE)}. To je ceo potez za ovaj krug.`;
    addLog(room, room.actionText);
    checkDebt(room, player);
    if (player.money <= 0) {
      room.actionText = `${player.name} je izašao iz pritvora, ali ima ${money(player.money)}. Mora da trguje ili proglasi bankrot.`;
    }
  }

  if (player.money > 0) scheduleEndTimer(room);
  touchRoom(room);
  const finalState = publicRoomState(room);
  io.to(room.code).emit('room:animation', { playerIndex, dice: [d1, d2], paths, startState, finalState });
}

function endTurnForRoom(room) {
  if (!room || room.status !== 'playing' || room.gameOver) return;
  clearTurnTimer(room);
  const player = room.players[room.currentPlayerIndex];
  if (player && player.money <= 0) {
    player.inDebt = true;
    room.actionText = `${player.name} ne može da završi potez sa ${money(player.money)}. Trguj ili proglasi bankrot.`;
    emitRoom(room);
    return;
  }
  room.diceRolled = false;
  room.canRollAgain = false;
  room.doubleRollCount = 0;
  room.landedTileIndex = null;
  moveToNextActivePlayer(room);
  const next = room.players[room.currentPlayerIndex];
  room.actionText = `${next.name}, baci kockice.`;
  scheduleRollTimer(room);
  touchRoom(room);
  emitRoom(room);
}

function validateCurrentPlayerAction(room, playerIndex) {
  if (!room || room.status !== 'playing' || room.gameOver) return { ok: false, reason: 'Igra nije aktivna.' };
  if (playerIndex < 0) return { ok: false, reason: 'Nisi u ovoj sobi.' };
  if (playerIndex !== room.currentPlayerIndex) return { ok: false, reason: 'Nije tvoj potez.' };
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return { ok: false, reason: 'Bankrotirao si.' };
  if (player.money <= 0) return { ok: false, reason: `Moraš da se vratiš iznad ${money(0)} trgovinom ili da proglasiš bankrot.` };
  return { ok: true };
}

function movePlayer(room, player, steps, paths) {
  const playerIndex = room.players.indexOf(player);
  if (!paths[playerIndex]) paths[playerIndex] = [];
  const direction = steps >= 0 ? 1 : -1;
  const totalSteps = Math.abs(steps);
  for (let i = 0; i < totalSteps; i++) {
    let newPosition = player.position + direction;
    if (newPosition >= room.tiles.length) newPosition = 0;
    if (newPosition < 0) newPosition = room.tiles.length - 1;
    player.position = newPosition;
    paths[playerIndex].push(newPosition);
    if (direction > 0 && newPosition === 0) {
      const landedOnStart = i === totalSteps - 1;
      const bonus = landedOnStart ? LAND_START_BONUS : PASS_START_BONUS;
      player.money += bonus;
      addLog(room, `${player.name} je ${landedOnStart ? 'stao na' : 'prošao'} START i dobio ${money(bonus)}.`);
      checkDebt(room, player);
    }
  }
  room.landedTileIndex = player.position;
  addLog(room, `${player.name} je stao na ${room.tiles[player.position].name}.`);
}

function directMove(room, player, targetIndex, paths, collectStartBonus) {
  const playerIndex = room.players.indexOf(player);
  if (!paths[playerIndex]) paths[playerIndex] = [];
  player.position = targetIndex;
  room.landedTileIndex = targetIndex;
  paths[playerIndex].push(targetIndex);
  if (collectStartBonus) {
    player.money += LAND_START_BONUS;
    addLog(room, `${player.name} je dobio ${money(LAND_START_BONUS)} na STARTU.`);
    checkDebt(room, player);
  }
}

function handleTile(room, player, paths) {
  const tile = room.tiles[player.position];
  room.landedTileIndex = player.position;

  if (tile.type === 'start') {
    room.actionText = `${player.name} je na STARTU.`;
    return;
  }

  if (tile.type === 'rest') {
    const pot = Math.max(0, Number(room.vacationPot) || 0);
    if (pot > 0) {
      room.vacationPot = 0;
      player.money += pot;
      room.actionText = `${player.name} je stao na Odmor i pokupio ${money(pot)}.`;
      addLog(room, room.actionText);
      checkDebt(room, player);
    } else {
      room.actionText = `${player.name} je stao na Odmor, ali nema novca u fondu.`;
      addLog(room, room.actionText);
    }
    return;
  }

  if (tile.type === 'tax') {
    const taxAmount = getTaxAmount(tile, player);
    room.actionText = `${player.name} je platio ${money(taxAmount)} za ${tile.name}. Novac ide u Odmor.`;
    payTax(room, player, taxAmount, tile.name);
    return;
  }

  if (tile.type === 'event' || tile.type === 'treasure') {
    drawEvent(room, player, paths);
    return;
  }

  if (tile.type === 'goToJail') {
    player.inJail = true;
    room.actionText = `${player.name} ide u pritvor. Sledeći potez mora da plati ${money(JAIL_FEE)} ili baci duple.`;
    addLog(room, room.actionText);
    directMove(room, player, 10, paths, false);
    return;
  }

  if (tile.type === 'jail') {
    room.actionText = `${player.name} je samo u prolazu kroz pritvor.`;
    addLog(room, room.actionText);
    return;
  }

  if (isPurchasableTile(tile)) {
    if (tile.owner === null) {
      room.actionText = player.money >= tile.price
        ? `${tile.name} je slobodno. ${player.name} može da kupi za ${money(tile.price)}.`
        : `${tile.name} je slobodno, ali ${player.name} nema dovoljno novca.`;
      addLog(room, room.actionText);
      return;
    }

    const owner = room.players[tile.owner];
    if (!owner || owner.bankrupt) {
      tile.owner = null;
      room.actionText = `${tile.name} se vraća banci.`;
      addLog(room, room.actionText);
      return;
    }

    if (tile.owner === room.players.indexOf(player)) {
      room.actionText = `${player.name} je stao na svoje polje: ${tile.name}.`;
      addLog(room, room.actionText);
      return;
    }

    if (owner.inJail) {
      room.actionText = `${player.name} je stao na ${tile.name}, ali ${owner.name} je u pritvoru i ne naplaćuje rentu.`;
      addLog(room, room.actionText);
      return;
    }

    const rent = getTileRent(room, tile, room.lastRollTotal);
    room.actionText = `${player.name} plaća ${money(rent)} rente igraču ${owner.name} za ${tile.name}.`;
    payPlayer(room, player, owner, rent, `renta za ${tile.name}`);
  }
}

function drawEvent(room, player, paths) {
  if (room.eventPointer >= room.eventDeck.length) {
    room.eventDeck = makeEventDeck();
    room.eventPointer = 0;
    addLog(room, 'Špil karata je ponovo promešan.');
  }
  const card = room.eventDeck[room.eventPointer++];
  room.actionText = `Karta: ${card.text}`;
  addLog(room, room.actionText);
  card.effect(room, player, paths);
}

function isPurchasableTile(tile) {
  return Boolean(tile && ['property', 'utility', 'transport'].includes(tile.type));
}

function payBank(room, player, amount, reason) {
  player.money -= amount;
  addLog(room, `${player.name} je platio ${money(amount)} banci: ${reason}.`);
  checkDebt(room, player);
}

function payTax(room, player, amount, reason) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  player.money -= safeAmount;
  room.vacationPot = (Number(room.vacationPot) || 0) + safeAmount;
  addLog(room, `${player.name} je platio ${money(safeAmount)} za ${reason}. Odmor fond sada ima ${money(room.vacationPot)}.`);
  checkDebt(room, player);
}

function getTaxAmount(tile, player) {
  if (tile.taxMode === 'percent') {
    const percent = Math.max(0, Number(tile.percent) || 0);
    return Math.floor(Math.max(0, Number(player.money) || 0) * percent / 100);
  }
  return Math.max(0, Math.floor(Number(tile.amount) || 0));
}

function payPlayer(room, fromPlayer, toPlayer, amount, reason) {
  fromPlayer.money -= amount;
  toPlayer.money += amount;
  addLog(room, `${fromPlayer.name} je platio ${money(amount)} igraču ${toPlayer.name}: ${reason}.`);
  checkDebt(room, fromPlayer);
  checkDebt(room, toPlayer);
}

function addMoney(room, player, amount, reason) {
  player.money += amount;
  addLog(room, `${player.name} je dobio ${money(amount)}: ${reason}.`);
  checkDebt(room, player);
}

function checkDebt(room, player) {
  if (!player || player.bankrupt) return;
  const wasInDebt = Boolean(player.inDebt);
  if (player.money <= 0) {
    player.inDebt = true;
    if (!wasInDebt) addLog(room, `⚠️ ${player.name} ima ${money(player.money)} i mora da trguje ili proglasi bankrot.`);
    if (room.players.indexOf(player) === room.currentPlayerIndex) {
      room.actionText = `${player.name} ima ${money(player.money)}. Trguj da odeš iznad ${money(0)} ili proglasi bankrot.`;
    }
    return;
  }
  if (wasInDebt) {
    player.inDebt = false;
    addLog(room, `✅ ${player.name} se oporavio i sada ima ${money(player.money)}.`);
    if (room.players.indexOf(player) === room.currentPlayerIndex) {
      room.actionText = `${player.name} je opet iznad ${money(0)} i može da nastavi.`;
      if (room.diceRolled) scheduleEndTimer(room);
      else scheduleRollTimer(room);
    }
  }
}

function kickPlayer(room, playerIndex) {
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return;
  if (room.status === 'lobby') {
    addLog(room, `🚪 ${player.name} je izbačen iz sobe.`);
    const kickedSocket = io.sockets.sockets.get(player.socketId);
    if (kickedSocket) {
      kickedSocket.emit('room:kicked', 'Izbačen si iz sobe od strane hosta.');
      kickedSocket.leave(room.code);
    }
    room.players.splice(playerIndex, 1);
    return;
  }

  player.bankrupt = true;
  player.kicked = true;
  player.connected = false;
  player.inDebt = false;
  player.inJail = false;
  addLog(room, `🚪 ${player.name} je izbačen iz igre. Sva njegova polja se vraćaju banci.`);
  room.tiles.forEach(tile => {
    if (isPurchasableTile(tile) && tile.owner === playerIndex) {
      tile.owner = null;
      if (tile.type === 'property') tile.houses = 0;
    }
  });
  room.trades.forEach(trade => {
    if (trade.from === playerIndex || trade.to === playerIndex) trade.status = 'cancelled';
  });
  room.trades = room.trades.filter(trade => trade.status === 'pending');
  const kickedSocket = io.sockets.sockets.get(player.socketId);
  if (kickedSocket) {
    kickedSocket.emit('room:kicked', 'Izbačen si iz igre od strane hosta.');
    kickedSocket.leave(room.code);
  }

  const activePlayers = room.players.filter(item => !item.bankrupt);
  if (activePlayers.length === 1) {
    clearTurnTimer(room);
    room.gameOver = true;
    room.status = 'ended';
    room.endedAt = Date.now();
    room.actionText = `🏆 ${activePlayers[0].name} je pobedio!`;
    addLog(room, room.actionText);
    return;
  }
  if (playerIndex === room.currentPlayerIndex) {
    room.diceRolled = false;
    room.canRollAgain = false;
    room.doubleRollCount = 0;
    room.landedTileIndex = null;
    moveToNextActivePlayer(room);
    const next = room.players[room.currentPlayerIndex];
    room.actionText = `${next.name}, baci kockice.`;
    scheduleRollTimer(room);
  }
}

function declareBankruptcy(room, playerIndex) {
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return;
  player.bankrupt = true;
  player.inDebt = false;
  player.inJail = false;
  addLog(room, `💀 ${player.name} je proglasio bankrot. Sva polja se vraćaju banci.`);
  room.tiles.forEach(tile => {
    if (isPurchasableTile(tile) && tile.owner === playerIndex) {
      tile.owner = null;
      if (tile.type === 'property') tile.houses = 0;
    }
  });
  room.trades.forEach(trade => {
    if (trade.from === playerIndex || trade.to === playerIndex) trade.status = 'cancelled';
  });
  room.trades = room.trades.filter(trade => trade.status === 'pending');
  const activePlayers = room.players.filter(item => !item.bankrupt);
  if (activePlayers.length === 1) {
    clearTurnTimer(room);
    room.gameOver = true;
    room.status = 'ended';
    room.endedAt = Date.now();
    room.actionText = `🏆 ${activePlayers[0].name} je pobedio!`;
    addLog(room, room.actionText);
    return;
  }
  if (playerIndex === room.currentPlayerIndex) {
    clearTurnTimer(room);
    room.diceRolled = false;
    room.canRollAgain = false;
    room.doubleRollCount = 0;
    room.landedTileIndex = null;
    moveToNextActivePlayer(room);
    const next = room.players[room.currentPlayerIndex];
    room.actionText = `${next.name}, baci kockice.`;
    scheduleRollTimer(room);
  }
}

function moveToNextActivePlayer(room) {
  for (let i = 0; i < room.players.length; i++) {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    if (!room.players[room.currentPlayerIndex].bankrupt) return;
  }
}

function validateBuildingAction(room, playerIndex, tileIndex, direction) {
  const player = room.players[playerIndex];
  const tile = room.tiles[tileIndex];
  if (!player || player.bankrupt) return { ok: false, reason: 'Bankrotirao si.' };
  if (room.status !== 'playing' || room.gameOver) return { ok: false, reason: 'Igra nije aktivna.' };
  if (playerIndex !== room.currentPlayerIndex) return { ok: false, reason: 'Možeš da gradiš samo tokom svog poteza.' };
  if (!tile || tile.type !== 'property') return { ok: false, reason: 'Samo gradovi mogu da imaju objekte.' };
  if (tile.owner !== playerIndex) return { ok: false, reason: 'Ne poseduješ ovo polje.' };
  if (!ownsFullGroup(room, playerIndex, tile.group)) return { ok: false, reason: 'Moraš da poseduješ ceo set pre gradnje.' };

  tile.houses = Math.min(5, Math.max(0, Number(tile.houses) || 0));

  if (direction > 0) {
    if (player.money <= 0) return { ok: false, reason: 'Prvo reši dug.' };
    if (tile.houses >= 5) return { ok: false, reason: 'Ovo polje već ima hotel.' };
    const cost = getBuildingBuildCost(tile);
    if (player.money < cost) return { ok: false, reason: 'Nema dovoljno novca za gradnju.' };
  } else {
    if (tile.houses <= 0) return { ok: false, reason: 'Nema objekata za prodaju na ovom polju.' };
  }

  return { ok: true, reason: 'OK' };
}

function ownsFullGroup(room, ownerIndex, groupName) {
  const groupTiles = room.tiles.filter(tile => tile.type === 'property' && tile.group === groupName);
  return groupTiles.length > 0 && groupTiles.every(tile => tile.owner === ownerIndex);
}

function getTileRent(room, tile, diceTotal) {
  if (tile.type === 'property') {
    const houseLevel = Math.min(5, Math.max(0, tile.houses || 0));
    return tile.rentLevels[houseLevel] || tile.rent;
  }
  if (tile.type === 'transport') {
    const ownedCount = countOwnedTilesByType(room, tile.owner, 'transport');
    return tile.rentLevels[Math.max(0, ownedCount - 1)] || tile.rent;
  }
  if (tile.type === 'utility') {
    const ownedCount = countOwnedTilesByType(room, tile.owner, 'utility');
    const multiplier = ownedCount >= 2 ? 10 : 4;
    return (diceTotal || 0) * multiplier;
  }
  return tile.rent || 0;
}

function countOwnedTilesByType(room, ownerIndex, type) {
  return room.tiles.filter(tile => tile.type === type && tile.owner === ownerIndex).length;
}

function canAcceptTrade(room, trade) {
  const from = room.players[trade.from];
  const to = room.players[trade.to];
  if (!from || !to) return { ok: false, reason: 'Igrač više ne postoji.' };
  if (from.bankrupt || to.bankrupt) return { ok: false, reason: 'Igrač u ovoj razmeni je bankrotirao.' };
  if (trade.fromMoney > 0 && from.money < trade.fromMoney) return { ok: false, reason: `${from.name} nema dovoljno novca.` };
  if (trade.toMoney > 0 && to.money < trade.toMoney) return { ok: false, reason: `${to.name} nema dovoljno novca.` };
  for (const tileIndex of trade.fromTiles) {
    if (!isPurchasableTile(room.tiles[tileIndex]) || room.tiles[tileIndex].owner !== trade.from) return { ok: false, reason: `${room.tiles[tileIndex]?.name || 'Polje'} više nije u vlasništvu igrača ${from.name}.` };
  }
  for (const tileIndex of trade.toTiles) {
    if (!isPurchasableTile(room.tiles[tileIndex]) || room.tiles[tileIndex].owner !== trade.to) return { ok: false, reason: `${room.tiles[tileIndex]?.name || 'Polje'} više nije u vlasništvu igrača ${to.name}.` };
  }
  return { ok: true, reason: 'OK' };
}

function uniqueTileIndexes(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value < 40))];
}

function clampMoney(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  return Math.min(number, 100000);
}

function addLog(room, message) {
  room.logs.unshift(message);
  room.logs = room.logs.slice(0, 100);
}

function randomNumber(min, max) {
  return crypto.randomInt(min, max + 1);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const socketsInRoom = io.sockets.adapter.rooms.get(code);
    const connectedCount = socketsInRoom ? socketsInRoom.size : 0;
    if (connectedCount === 0 && now - room.lastActivity > ROOM_IDLE_DELETE_MS) rooms.delete(code);
    if (room.status === 'ended' && room.endedAt && now - room.endedAt > ENDED_ROOM_DELETE_MS) rooms.delete(code);
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Serbia Property online server running on port ${PORT}`);
});
