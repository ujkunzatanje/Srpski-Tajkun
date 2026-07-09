const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const START_BONUS = 200;
const STARTING_MONEY = 3000;
const MAX_PLAYERS = 4;
const ROOM_IDLE_DELETE_MS = 30 * 60 * 1000;
const ENDED_ROOM_DELETE_MS = 5 * 60 * 1000;

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

function makeProperty(city) {
  const rentLevels = rentTableByPrice[city.price] || [city.price * 0.1, city.price * 0.5, city.price * 1.5, city.price * 4, city.price * 5, city.price * 6].map(Math.round);
  return {
    type: 'property',
    name: city.name,
    price: city.price,
    rent: rentLevels[0],
    rentLevels,
    houseCost: buildingCostForPrice(city.price),
    hotelCost: buildingCostForPrice(city.price),
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
    { type: 'start', name: 'START', emoji: '▶', text: `Collect $${START_BONUS}` },
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Draw card' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na dobit', emoji: '💸', amount: 100 },
    makeTransport('Aerodrom Niš', '✈️'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Draw card' },
    makeProperty(cities[p++]),
    { type: 'jail', name: 'Pritvor / prolaz', emoji: '🚓', text: 'Only visiting' },
    makeProperty(cities[p++]),
    makeUtility('EPS', '⚡'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Železnička stanica', '🚆'),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Draw card' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'rest', name: 'Odmor', emoji: '🏝️', text: 'Nothing happens' },
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Draw card' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Autobuska stanica', '🚌'),
    makeProperty(cities[p++]),
    makeUtility('Vodovod', '🚰'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'goToJail', name: 'Idi u pritvor', emoji: '👮', text: 'Move to Pritvor' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Draw card' },
    makeProperty(cities[p++]),
    makeTransport('Aerodrom Nikola Tesla', '✈️'),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Draw card' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na luksuz', emoji: '💎', amount: 170 },
    makeProperty(cities[p++])
  ];
}

function makeEventDeck() {
  const cards = [
    { text: 'Bonus from a weekend job. Collect $100.', effect: (room, player, paths) => addMoney(room, player, 100, 'weekend job bonus') },
    { text: 'Parking fine. Pay $80.', effect: (room, player, paths) => payBank(room, player, 80, 'parking fine') },
    { text: 'Fast highway trip. Move forward 3 tiles.', effect: (room, player, paths) => { movePlayer(room, player, 3, paths); handleTile(room, player, paths); } },
    { text: 'Bad road works. Move back 2 tiles.', effect: (room, player, paths) => { movePlayer(room, player, -2, paths); handleTile(room, player, paths); } },
    { text: 'Bank mistake in your favor. Collect $150.', effect: (room, player, paths) => addMoney(room, player, 150, 'bank mistake') },
    { text: 'Unexpected bill. Pay $120.', effect: (room, player, paths) => payBank(room, player, 120, 'unexpected bill') },
    { text: 'Take a bus to START. Collect $200.', effect: (room, player, paths) => directMove(room, player, 0, paths, true) },
    { text: 'Your friends helped you. Every active player gives you $30.', effect: (room, player) => {
      room.players.forEach(other => {
        if (other.id !== player.id && !other.bankrupt) {
          other.money -= 30;
          player.money += 30;
          addLog(room, `${other.name} gave $30 to ${player.name}.`);
          checkDebt(room, other);
        }
      });
      checkDebt(room, player);
    } },
    { text: 'You bought snacks for everyone. Pay every active player $25.', effect: (room, player) => {
      room.players.forEach(other => {
        if (other.id !== player.id && !other.bankrupt) {
          player.money -= 25;
          other.money += 25;
          addLog(room, `${player.name} gave $25 to ${other.name}.`);
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
    actionText: 'Waiting for players.',
    gameOver: false,
    lastRollTotal: 0,
    lastDice: [1, 1],
    trades: [],
    tradeIdCounter: 1,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    endedAt: null
  };
  addLog(room, `${hostPlayer.name} created room ${code}.`);
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
    connected: true,
    lastSeen: Date.now()
  };
}

function cleanName(name) {
  const text = String(name || '').trim().slice(0, 16);
  return text || 'Player';
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-5);
}

function makePlayerId() {
  return `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function publicRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(({ id, name, color, money, position, bankrupt, inDebt, connected }) => ({ id, name, color, money, position, bankrupt, inDebt, connected })),
    tiles: room.tiles,
    currentPlayerIndex: room.currentPlayerIndex,
    diceRolled: room.diceRolled,
    landedTileIndex: room.landedTileIndex,
    logs: room.logs,
    actionText: room.actionText,
    gameOver: room.gameOver,
    lastRollTotal: room.lastRollTotal,
    lastDice: room.lastDice,
    trades: room.trades
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
  addLog(room, logMessage || `${player.name} reconnected.`);
  socket.emit('room:joined', { roomCode: room.code, playerId: player.id, isHost: room.hostId === player.id });
  emitRoom(room);
}

io.on('connection', socket => {
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
    if (!room) return emitError(socket, 'Room not found.');

    const savedPlayerId = payload.playerId ? String(payload.playerId) : '';
    const savedPlayer = savedPlayerId ? findPlayer(room, savedPlayerId) : null;
    if (savedPlayer && !savedPlayer.bankrupt) {
      reconnectSeat(socket, room, savedPlayer, `${savedPlayer.name} rejoined the room.`);
      return;
    }

    if (room.status !== 'lobby') {
      const sameNameDisconnected = room.players.filter(player =>
        !player.bankrupt && !player.connected && cleanName(player.name).toLowerCase() === cleanName(payload.name).toLowerCase()
      );

      if (sameNameDisconnected.length === 1) {
        reconnectSeat(socket, room, sameNameDisconnected[0], `${sameNameDisconnected[0].name} rejoined the room.`);
        return;
      }

      return emitError(socket, 'This game already started. Use Reconnect if this was your seat.');
    }

    if (room.players.length >= MAX_PLAYERS) return emitError(socket, 'Room is full.');

    const colorTaken = room.players.some(player => player.color === payload.color && !player.bankrupt);
    if (colorTaken) return emitError(socket, 'That color is already taken in this room.');

    const playerId = payload.playerId || makePlayerId();
    const player = makePlayer({ id: playerId, socketId: socket.id, name: payload.name, color: payload.color });
    room.players.push(player);
    touchRoom(room);
    addLog(room, `${player.name} joined the room.`);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.emit('room:joined', { roomCode: room.code, playerId: player.id, isHost: room.hostId === player.id });
    emitRoom(room);
  });

  socket.on('room:reconnect', (payload = {}) => {
    const room = getRoom(payload.roomCode);
    if (!room) return emitError(socket, 'Previous room is gone.');
    const player = findPlayer(room, payload.playerId);
    if (!player) return emitError(socket, 'Could not find your old seat in that room.');
    if (player.bankrupt) return emitError(socket, 'That seat is already bankrupt.');
    reconnectSeat(socket, room, player, `${player.name} reconnected.`);
  });

  socket.on('game:start', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    if (room.hostId !== socket.data.playerId) return emitError(socket, 'Only the host can start the game.');
    if (room.players.length < 2) return emitError(socket, 'At least 2 players are needed.');
    if (room.status !== 'lobby') return emitError(socket, 'Game already started.');

    room.status = 'playing';
    room.actionText = `${room.players[0].name}, roll the dice.`;
    addLog(room, `Game started with ${room.players.length} players.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:rollDice', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (room.diceRolled) return emitError(socket, 'Dice already rolled this turn.');

    const player = room.players[playerIndex];
    if (player.money <= 0) {
      player.inDebt = true;
      room.actionText = `${player.name} has $${player.money}. Trade to get above $0 or declare bankruptcy.`;
      emitRoom(room);
      return;
    }

    const startState = publicRoomState(room);
    const d1 = randomNumber(1, 6);
    const d2 = randomNumber(1, 6);
    const total = d1 + d2;
    const paths = { [playerIndex]: [] };

    room.diceRolled = true;
    room.lastDice = [d1, d2];
    room.lastRollTotal = total;
    room.landedTileIndex = null;
    room.actionText = `${player.name} rolled ${d1} + ${d2} = ${total}.`;
    addLog(room, room.actionText);

    movePlayer(room, player, total, paths);
    handleTile(room, player, paths);
    room.landedTileIndex = player.position;
    touchRoom(room);

    const finalState = publicRoomState(room);
    io.to(room.code).emit('room:animation', { playerIndex, dice: [d1, d2], paths, startState, finalState });
  });

  socket.on('game:buy', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (!room.diceRolled || room.landedTileIndex === null) return emitError(socket, 'Roll first.');

    const player = room.players[playerIndex];
    if (player.money <= 0) return emitError(socket, 'Fix debt before buying.');
    const tile = room.tiles[room.landedTileIndex];
    if (!isPurchasableTile(tile)) return emitError(socket, 'This tile cannot be bought.');
    if (tile.owner !== null) return emitError(socket, 'This tile is already owned.');
    if (player.money < tile.price) return emitError(socket, 'Not enough money.');

    player.money -= tile.price;
    tile.owner = playerIndex;
    room.actionText = `${player.name} bought ${tile.name} for $${tile.price}.`;
    addLog(room, room.actionText);
    checkDebt(room, player);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:endTurn', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (!room.diceRolled) return emitError(socket, 'Roll first.');

    const player = room.players[playerIndex];
    if (player.money <= 0) {
      player.inDebt = true;
      room.actionText = `${player.name} cannot end the turn with $${player.money}. Trade or declare bankruptcy.`;
      emitRoom(room);
      return;
    }

    room.diceRolled = false;
    room.landedTileIndex = null;
    moveToNextActivePlayer(room);
    const next = room.players[room.currentPlayerIndex];
    room.actionText = `${next.name}, roll the dice.`;
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:create', (payload = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const from = findPlayerIndex(room, socket.data.playerId);
    if (from < 0) return emitError(socket, 'You are not in this room.');
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
      return emitError(socket, 'Choose money or at least one property for the trade.');
    }
    const validation = canAcceptTrade(room, trade);
    if (!validation.ok) return emitError(socket, validation.reason);
    room.trades.unshift(trade);
    addLog(room, `${room.players[from].name} sent a trade offer to ${room.players[trade.to].name}.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:accept', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Trade not found.');
    if (trade.to !== playerIndex) return emitError(socket, 'Only the receiver can accept this trade.');
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
    addLog(room, `${to.name} accepted ${from.name}'s trade offer.`);
    checkDebt(room, from);
    checkDebt(room, to);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:decline', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Trade not found.');
    if (trade.to !== playerIndex) return emitError(socket, 'Only the receiver can decline this trade.');
    const from = room.players[trade.from];
    const to = room.players[trade.to];
    trade.status = 'declined';
    room.trades = room.trades.filter(item => item.status === 'pending');
    addLog(room, `${to?.name || 'Player'} declined ${from?.name || 'Player'}'s trade offer.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('trade:cancel', ({ tradeId } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const trade = room.trades.find(item => item.id === Number(tradeId) && item.status === 'pending');
    if (!trade) return emitError(socket, 'Trade not found.');
    if (trade.from !== playerIndex) return emitError(socket, 'Only the sender can cancel this trade.');
    const from = room.players[trade.from];
    trade.status = 'cancelled';
    room.trades = room.trades.filter(item => item.status === 'pending');
    addLog(room, `${from?.name || 'Player'} cancelled their trade offer.`);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:building', (payload = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    if (room.status !== 'playing' || room.gameOver) return emitError(socket, 'Game is not active.');

    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    if (playerIndex < 0) return emitError(socket, 'You are not in this room.');

    const direction = Number(payload.direction) >= 0 ? 1 : -1;
    const tileIndex = Number(payload.tileIndex);
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= room.tiles.length) return emitError(socket, 'Invalid tile.');

    const player = room.players[playerIndex];
    const tile = room.tiles[tileIndex];
    const validation = validateBuildingAction(room, playerIndex, tileIndex, direction);
    if (!validation.ok) return emitError(socket, validation.reason);

    if (direction > 0) {
      const cost = tile.houses === 4 ? tile.hotelCost : tile.houseCost;
      player.money -= cost;
      tile.houses += 1;
      const buildingName = tile.houses === 5 ? 'hotel' : `house ${tile.houses}`;
      addLog(room, `${player.name} built ${buildingName} on ${tile.name} for $${cost}.`);
    } else {
      const refund = Math.floor((tile.houses === 5 ? tile.hotelCost : tile.houseCost) / 2);
      const removedName = tile.houses === 5 ? 'hotel' : 'house';
      tile.houses -= 1;
      player.money += refund;
      addLog(room, `${player.name} sold one ${removedName} from ${tile.name} and received $${refund}.`);
    }

    checkDebt(room, player);
    room.actionText = `${player.name} updated buildings on ${tile.name}.`;
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('game:bankrupt', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Room not found.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    if (playerIndex < 0) return emitError(socket, 'You are not in this room.');
    const player = room.players[playerIndex];
    if (player.bankrupt) return emitError(socket, 'Already bankrupt.');
    if (player.money > 0) return emitError(socket, 'You can only declare bankruptcy when you are at $0 or below.');

    declareBankruptcy(room, playerIndex);
    touchRoom(room);
    emitRoom(room);
  });

  socket.on('client:heartbeat', (payload = {}) => {
    const room = getRoom(payload.roomCode || socket.data.roomCode);
    if (!room) return socket.emit('server:heartbeat', { ok: false });
    const player = findPlayer(room, payload.playerId || socket.data.playerId);
    if (player) {
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
      addLog(room, `${player.name} disconnected.`);
      emitRoom(room);
    }
  });
});

function validateCurrentPlayerAction(room, playerIndex) {
  if (!room || room.status !== 'playing' || room.gameOver) return { ok: false, reason: 'Game is not active.' };
  if (playerIndex < 0) return { ok: false, reason: 'You are not in this room.' };
  if (playerIndex !== room.currentPlayerIndex) return { ok: false, reason: 'It is not your turn.' };
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return { ok: false, reason: 'You are bankrupt.' };
  if (player.money <= 0) return { ok: false, reason: 'You must trade above $0 or declare bankruptcy.' };
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
      player.money += START_BONUS;
      addLog(room, `${player.name} passed START and collected $${START_BONUS}.`);
      checkDebt(room, player);
    }
  }
  room.landedTileIndex = player.position;
  addLog(room, `${player.name} landed on ${room.tiles[player.position].name}.`);
}

function directMove(room, player, targetIndex, paths, collectStartBonus) {
  const playerIndex = room.players.indexOf(player);
  if (!paths[playerIndex]) paths[playerIndex] = [];
  player.position = targetIndex;
  room.landedTileIndex = targetIndex;
  paths[playerIndex].push(targetIndex);
  if (collectStartBonus) {
    player.money += START_BONUS;
    addLog(room, `${player.name} collected $${START_BONUS} at START.`);
    checkDebt(room, player);
  }
}

function handleTile(room, player, paths) {
  const tile = room.tiles[player.position];
  room.landedTileIndex = player.position;
  if (tile.type === 'start') {
    room.actionText = `${player.name} is on START.`;
    return;
  }
  if (tile.type === 'rest') {
    room.actionText = `${player.name} is resting on ${tile.name}. Nothing happens.`;
    addLog(room, room.actionText);
    return;
  }
  if (tile.type === 'tax') {
    room.actionText = `${player.name} paid $${tile.amount} for ${tile.name}.`;
    payBank(room, player, tile.amount, tile.name);
    return;
  }
  if (tile.type === 'event' || tile.type === 'treasure') {
    drawEvent(room, player, paths);
    return;
  }
  if (tile.type === 'goToJail') {
    room.actionText = `${player.name} was sent to Pritvor.`;
    addLog(room, room.actionText);
    directMove(room, player, 10, paths, false);
    return;
  }
  if (tile.type === 'jail') {
    room.actionText = `${player.name} is only visiting Pritvor.`;
    addLog(room, room.actionText);
    return;
  }
  if (isPurchasableTile(tile)) {
    if (tile.owner === null) {
      room.actionText = player.money >= tile.price
        ? `${tile.name} is unowned. ${player.name} can buy it for $${tile.price}.`
        : `${tile.name} is unowned, but ${player.name} does not have enough money to buy it.`;
      addLog(room, room.actionText);
      return;
    }
    const owner = room.players[tile.owner];
    if (!owner || owner.bankrupt) {
      tile.owner = null;
      room.actionText = `${tile.name} returned to the bank.`;
      addLog(room, room.actionText);
      return;
    }
    if (tile.owner === room.players.indexOf(player)) {
      room.actionText = `${player.name} landed on their own tile: ${tile.name}.`;
      addLog(room, room.actionText);
      return;
    }
    const rent = getTileRent(room, tile, room.lastRollTotal);
    room.actionText = `${player.name} paid $${rent} rent to ${owner.name} for ${tile.name}.`;
    payPlayer(room, player, owner, rent, `rent for ${tile.name}`);
  }
}

function drawEvent(room, player, paths) {
  if (room.eventPointer >= room.eventDeck.length) {
    room.eventDeck = makeEventDeck();
    room.eventPointer = 0;
    addLog(room, 'Event deck reshuffled.');
  }
  const card = room.eventDeck[room.eventPointer++];
  room.actionText = `Event card: ${card.text}`;
  addLog(room, room.actionText);
  card.effect(room, player, paths);
}

function isPurchasableTile(tile) {
  return Boolean(tile && ['property', 'utility', 'transport'].includes(tile.type));
}

function payBank(room, player, amount, reason) {
  player.money -= amount;
  addLog(room, `${player.name} paid $${amount} to the bank: ${reason}.`);
  checkDebt(room, player);
}

function payPlayer(room, fromPlayer, toPlayer, amount, reason) {
  fromPlayer.money -= amount;
  toPlayer.money += amount;
  addLog(room, `${fromPlayer.name} paid $${amount} to ${toPlayer.name}: ${reason}.`);
  checkDebt(room, fromPlayer);
  checkDebt(room, toPlayer);
}

function addMoney(room, player, amount, reason) {
  player.money += amount;
  addLog(room, `${player.name} received $${amount}: ${reason}.`);
  checkDebt(room, player);
}

function checkDebt(room, player) {
  if (!player || player.bankrupt) return;
  const wasInDebt = Boolean(player.inDebt);
  if (player.money <= 0) {
    player.inDebt = true;
    if (!wasInDebt) addLog(room, `⚠️ ${player.name} has $${player.money} and must trade or declare bankruptcy.`);
    if (room.players.indexOf(player) === room.currentPlayerIndex) {
      room.actionText = `${player.name} has $${player.money}. Trade to get above $0 or declare bankruptcy.`;
    }
    return;
  }
  if (wasInDebt) {
    player.inDebt = false;
    addLog(room, `✅ ${player.name} recovered and now has $${player.money}.`);
    if (room.players.indexOf(player) === room.currentPlayerIndex) {
      room.actionText = `${player.name} is above $0 again and can continue.`;
    }
  }
}

function declareBankruptcy(room, playerIndex) {
  const player = room.players[playerIndex];
  if (!player || player.bankrupt) return;
  player.bankrupt = true;
  player.inDebt = false;
  addLog(room, `💀 ${player.name} declared bankruptcy. Their properties return to the bank.`);
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
    room.gameOver = true;
    room.status = 'ended';
    room.endedAt = Date.now();
    room.actionText = `🏆 ${activePlayers[0].name} wins the game!`;
    addLog(room, room.actionText);
    return;
  }
  if (playerIndex === room.currentPlayerIndex) {
    room.diceRolled = false;
    room.landedTileIndex = null;
    moveToNextActivePlayer(room);
    const next = room.players[room.currentPlayerIndex];
    room.actionText = `${next.name}, roll the dice.`;
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
  if (!player || player.bankrupt) return { ok: false, reason: 'You are bankrupt.' };
  if (!tile || tile.type !== 'property') return { ok: false, reason: 'Only city properties can have buildings.' };
  if (tile.owner !== playerIndex) return { ok: false, reason: 'You do not own this property.' };
  if (!ownsFullGroup(room, playerIndex, tile.group)) return { ok: false, reason: 'You need the full color set before building.' };

  tile.houses = Math.min(5, Math.max(0, Number(tile.houses) || 0));

  if (direction > 0) {
    if (player.money <= 0) return { ok: false, reason: 'Fix debt before building.' };
    if (tile.houses >= 5) return { ok: false, reason: 'This property already has a hotel.' };
    const cost = tile.houses === 4 ? tile.hotelCost : tile.houseCost;
    if (player.money < cost) return { ok: false, reason: 'Not enough money to build.' };
  } else {
    if (tile.houses <= 0) return { ok: false, reason: 'There is nothing to sell on this property.' };
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
  if (!from || !to) return { ok: false, reason: 'A player no longer exists.' };
  if (from.bankrupt || to.bankrupt) return { ok: false, reason: 'A player in this trade is bankrupt.' };
  if (trade.fromMoney > 0 && from.money < trade.fromMoney) return { ok: false, reason: `${from.name} does not have enough money.` };
  if (trade.toMoney > 0 && to.money < trade.toMoney) return { ok: false, reason: `${to.name} does not have enough money.` };
  for (const tileIndex of trade.fromTiles) {
    if (!isPurchasableTile(room.tiles[tileIndex]) || room.tiles[tileIndex].owner !== trade.from) return { ok: false, reason: `${room.tiles[tileIndex]?.name || 'A property'} is no longer owned by ${from.name}.` };
  }
  for (const tileIndex of trade.toTiles) {
    if (!isPurchasableTile(room.tiles[tileIndex]) || room.tiles[tileIndex].owner !== trade.to) return { ok: false, reason: `${room.tiles[tileIndex]?.name || 'A property'} is no longer owned by ${to.name}.` };
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
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
