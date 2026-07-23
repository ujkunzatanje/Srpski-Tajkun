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
const MAX_PLAYERS = 6;
const ROOM_IDLE_DELETE_MS = 30 * 60 * 1000;
const ENDED_ROOM_DELETE_MS = 5 * 60 * 1000;
const JAIL_FEE = 140;
const ADMIN_STATS_KEY = process.env.ADMIN_STATS_KEY || 'kuntaj1312';
const DEFAULT_MAP_KEY = 'serbia';
const RENT_FREE_MAX_LAPS = 5;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 20000,
  pingTimeout: 20000
});

app.get('/health', (_req, res) => res.status(200).json({ ok: true, rooms: rooms.size }));
app.get('/stats', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));
app.get('/api/stats', (req, res) => {
  if (!isValidStatsKey(req.query.key)) return res.status(403).json({ ok: false, error: 'Pogrešan stats ključ.' });

  const roomCode = cleanRoomCode(req.query.room || '');
  if (roomCode) {
    const room = getRoom(roomCode);
    if (!room) return res.status(404).json({ ok: false, error: 'Soba nije pronađena ili je već obrisana.' });
    return res.status(200).json(buildStatsExport(room));
  }

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    rooms: [...rooms.values()].map(makeStatsRoomSummary)
  });
});
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function money(amount) {
  return `${CURRENCY}${amount}`;
}

const mobileShortNames = {
  'Beograd': 'BG',
  'Novi Sad': 'NS',
  'Sremska Mitrovica': 'S. Mit.',
  'Kragujevac': 'KG',
  'Kraljevo': 'KR',
  'Kruševac': 'KŠ',
  'Zrenjanin': 'ZR',
  'Smederevo': 'SD',
  'Pančevo': 'PA',
  'Novi Pazar': 'NP',
  'Aerodrom Nikola Tesla': 'N. Tesla',
  'Aerodrom Niš': 'Aer. Niš',
  'Autobuska stanica': 'Bus',
  'Železnička stanica': 'Voz',
  'Lazarevac': 'Laz.',
  'Barajevo': 'Bar.',
  'Mladenovac': 'Mlad.',
  'Grocka': 'Gro.',
  'Obrenovac': 'Obr.',
  'Batajnica': 'Bat.',
  'Sopot': 'Sop.',
  'Borča': 'Bor.',
  'Surčin': 'Sur.',
  'Rakovica': 'Rak.',
  'Železnik': 'Žel.',
  'Palilula': 'Pal.',
  'Čukarica': 'Čuk.',
  'Zemun': 'Zem.',
  'Mirijevo': 'Mir.',
  'Zvezdara': 'Zvez.',
  'Karaburma': 'Karb.',
  'Voždovac': 'Vožd.',
  'Banovo brdo': 'B. brdo',
  'Gardoš': 'Gard.',
  'Novi Beograd': 'NBG',
  'Dedinje': 'Ded.',
  'Vračar': 'Vrač.',
  'Dorćol': 'Dor.',
  'Stari grad': 'S. grad',
  'Savski venac': 'S. venac',
  'Stadion Partizana': 'Partizan',
  'Stadion Rajko Mitić': 'Zvezda',
  'Beogradska autobuska stanica': 'BAS',
  'Tramvajska stanica': 'Tramvaj',
  'Trolejbuska stanica': 'Trola',
  'BG Voz stanica': 'BG Voz',
  'Autobuski terminal': 'Bus',
  'Porez na dobit': 'Porez',
  'Porez na luksuz': 'Luksuz',
  'Idi u pritvor': 'Pritvor',
  'Pritvor / prolaz': 'Pritvor',
  'Vodovod': 'Voda',
  'START': 'START',
  'Odmor': 'Odmor',
  'Blago': 'Blago',
  'Karta': 'Karta'
};

function getMobileShortName(name) {
  return mobileShortNames[name] || name;
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

// The 17 official Belgrade municipalities are kept on the board. Nine well-known
// neighbourhoods are added so the 13x13 board keeps the property density and pacing
// of the smaller map. Ordering follows the broad 2025/2026 market-price hierarchy.
function municipalityDataByBoardOrder() {
  return [
    { name: 'Lazarevac', price: 60, group: 'Braon', color: '#6f4d3c', areaType: 'Opština' },
    { name: 'Barajevo', price: 60, group: 'Braon', color: '#6f4d3c', areaType: 'Opština' },

    { name: 'Mladenovac', price: 100, group: 'Svetlo plava', color: '#6f86bf', areaType: 'Opština' },
    { name: 'Grocka', price: 110, group: 'Svetlo plava', color: '#6f86bf', areaType: 'Opština' },
    { name: 'Obrenovac', price: 120, group: 'Svetlo plava', color: '#6f86bf', areaType: 'Opština' },

    { name: 'Batajnica', price: 130, group: 'Roze', color: '#b047a7', areaType: 'Naselje', municipality: 'Zemun' },
    { name: 'Sopot', price: 140, group: 'Roze', color: '#b047a7', areaType: 'Opština' },
    { name: 'Borča', price: 160, group: 'Roze', color: '#b047a7', areaType: 'Naselje', municipality: 'Palilula' },

    { name: 'Surčin', price: 180, group: 'Narandžasta', color: '#e97824', areaType: 'Opština' },
    { name: 'Rakovica', price: 190, group: 'Narandžasta', color: '#e97824', areaType: 'Opština' },
    { name: 'Železnik', price: 200, group: 'Narandžasta', color: '#e97824', areaType: 'Naselje', municipality: 'Čukarica' },

    { name: 'Palilula', price: 210, group: 'Crvena', color: '#d34152', areaType: 'Opština' },
    { name: 'Čukarica', price: 220, group: 'Crvena', color: '#d34152', areaType: 'Opština' },
    { name: 'Zemun', price: 240, group: 'Crvena', color: '#d34152', areaType: 'Opština' },

    { name: 'Mirijevo', price: 260, group: 'Žuta', color: '#d7ac2a', areaType: 'Naselje', municipality: 'Zvezdara' },
    { name: 'Zvezdara', price: 270, group: 'Žuta', color: '#d7ac2a', areaType: 'Opština' },
    { name: 'Karaburma', price: 280, group: 'Žuta', color: '#d7ac2a', areaType: 'Naselje', municipality: 'Palilula' },
    { name: 'Voždovac', price: 290, group: 'Žuta', color: '#d7ac2a', areaType: 'Opština' },

    { name: 'Banovo brdo', price: 300, group: 'Zelena', color: '#269657', areaType: 'Naselje', municipality: 'Čukarica' },
    { name: 'Gardoš', price: 320, group: 'Zelena', color: '#269657', areaType: 'Naselje', municipality: 'Zemun' },
    { name: 'Novi Beograd', price: 340, group: 'Zelena', color: '#269657', areaType: 'Opština' },
    { name: 'Dedinje', price: 350, group: 'Zelena', color: '#269657', areaType: 'Naselje', municipality: 'Savski venac' },

    { name: 'Vračar', price: 360, group: 'Tamno plava', color: '#2f3f94', areaType: 'Opština' },
    { name: 'Dorćol', price: 380, group: 'Tamno plava', color: '#2f3f94', areaType: 'Naselje', municipality: 'Stari grad' },
    { name: 'Stari grad', price: 400, group: 'Tamno plava', color: '#2f3f94', areaType: 'Opština' },
    { name: 'Savski venac', price: 420, group: 'Tamno plava', color: '#2f3f94', areaType: 'Opština' }
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
  340: [32, 155, 475, 1050, 1260, 1450],
  350: [34, 165, 510, 1100, 1310, 1500],
  360: [35, 180, 550, 1150, 1350, 1525],
  380: [42, 190, 575, 1275, 1525, 1775],
  400: [50, 200, 600, 1400, 1700, 2000],
  420: [55, 220, 650, 1500, 1800, 2150]
};

function buildingCostForPrice(price) {
  if (price <= 120) return 50;
  if (price <= 200) return 100;
  if (price <= 280) return 150;
  return 200;
}

function getMaxBuildingLevel(tile) {
  return tile?.type === 'stadium' ? 3 : 5;
}

function getBuildingBuildCost(tile) {
  const maxLevel = getMaxBuildingLevel(tile);
  const level = Math.min(maxLevel, Math.max(0, Number(tile?.houses) || 0));
  if (level >= maxLevel) return 0;
  if (tile?.type === 'stadium') {
    const costs = Array.isArray(tile.upgradeCosts) ? tile.upgradeCosts : [100, 150, 200];
    return Math.max(0, Math.floor(Number(costs[level]) || 0));
  }
  const baseCost = Math.max(0, Math.floor(Number(tile?.houseCost) || 0));
  if (level === 4) return baseCost + 125;
  return baseCost + level * 25;
}

function getBuildingSellRefund(tile) {
  const maxLevel = getMaxBuildingLevel(tile);
  const level = Math.min(maxLevel, Math.max(0, Number(tile?.houses) || 0));
  if (level <= 0) return 0;
  if (tile?.type === 'stadium') {
    const costs = Array.isArray(tile.upgradeCosts) ? tile.upgradeCosts : [100, 150, 200];
    return Math.floor(Math.max(0, Number(costs[level - 1]) || 0) / 2);
  }
  const baseCost = Math.max(0, Math.floor(Number(tile?.houseCost) || 0));
  const originalCost = level === 5 ? baseCost + 125 : baseCost + (level - 1) * 25;
  return Math.floor(originalCost / 2);
}

function makeProperty(area) {
  let rentLevels = rentTableByPrice[area.price] || [area.price * 0.1, area.price * 0.5, area.price * 1.5, area.price * 4, area.price * 5, area.price * 6].map(Math.round);
  if (area.name === 'Kikinda') rentLevels = [4, 20, 60, 190, 330, 460];
  const houseCost = area.name === 'Sombor' ? 15 : buildingCostForPrice(area.price);
  return {
    type: 'property',
    name: area.name,
    price: area.price,
    rent: rentLevels[0],
    rentLevels,
    houseCost,
    hotelCost: houseCost + 125,
    houses: 0,
    group: area.group,
    color: area.color,
    areaType: area.areaType || null,
    municipality: area.municipality || null,
    icon: '🏙️',
    owner: null,
    mobileShortName: getMobileShortName(area.name)
  };
}

function makeStadium(name, clubColor) {
  return {
    type: 'stadium',
    name,
    price: 250,
    rent: 20,
    rentLevels: [20, 80, 220, 600],
    upgradeCosts: [100, 150, 200],
    houses: 0,
    color: clubColor,
    icon: '⚽',
    owner: null,
    mobileShortName: getMobileShortName(name)
  };
}

function makeTransport(name, icon, maxOwned = 5) {
  const rentLevels = [25, 50, 100, 200, 300].slice(0, Math.max(1, Math.min(5, Number(maxOwned) || 5)));
  return { type: 'transport', name, price: 200, rent: 25, rentLevels, color: '#455a64', icon, owner: null, mobileShortName: getMobileShortName(name) };
}

function makeUtility(name, icon) {
  return { type: 'utility', name, price: 150, rent: 0, color: '#00897b', icon, owner: null, mobileShortName: getMobileShortName(name) };
}

function makeBelgradeTiles() {
  const areas = municipalityDataByBoardOrder();
  let p = 0;
  const tiles = [
    { type: 'start', name: 'START', emoji: '▶', text: `Stani ${money(LAND_START_BONUS)} / prođi ${money(PASS_START_BONUS)}` },
    makeProperty(areas[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    { type: 'tax', name: 'Porez na dobit', emoji: '💸', taxMode: 'percent', percent: 10, text: 'Plati 10% novca u Odmor' },
    makeTransport('Beogradska autobuska stanica', '🚌'),
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    { type: 'jail', name: 'Pritvor / prolaz', emoji: '🚓', text: 'Samo prolaz' },

    makeProperty(areas[p++]),
    makeUtility('EPS', '⚡'),
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    makeTransport('Tramvajska stanica', '🚋'),
    makeProperty(areas[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    makeStadium('Stadion Partizana', '#111111'),
    makeProperty(areas[p++]),
    { type: 'rest', name: 'Odmor', emoji: '🏝️', text: 'Pokupi fond' },

    makeProperty(areas[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    makeTransport('Trolejbuska stanica', '🚎'),
    makeProperty(areas[p++]),
    makeUtility('Vodovod', '🚰'),
    makeProperty(areas[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    makeProperty(areas[p++]),
    { type: 'goToJail', name: 'Idi u pritvor', emoji: '👮', text: 'Idi u pritvor' },

    makeProperty(areas[p++]),
    makeTransport('BG Voz stanica', '🚆'),
    makeProperty(areas[p++]),
    makeStadium('Stadion Rajko Mitić', '#d71920'),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    makeTransport('Autobuski terminal', '🚏'),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(areas[p++]),
    { type: 'tax', name: 'Porez na luksuz', emoji: '💎', amount: 140, text: `Plati ${money(140)} u Odmor` },
    makeProperty(areas[p++])
  ];

  if (tiles.length !== 48 || p !== areas.length) {
    throw new Error(`Neispravna tabla: ${tiles.length} polja, iskorišćeno ${p}/${areas.length} lokacija.`);
  }

  tiles.forEach(tile => {
    if (!tile.mobileShortName) tile.mobileShortName = getMobileShortName(tile.name);
  });
  return tiles;
}


function makeSerbiaTiles() {
  const cities = cityDataByBoardOrder();
  let p = 0;
  const tiles = [
    { type: 'start', name: 'START', emoji: '▶', text: `Stani ${money(LAND_START_BONUS)} / prođi ${money(PASS_START_BONUS)}` },
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na dobit', emoji: '💸', taxMode: 'percent', percent: 10, text: 'Plati 10% novca u Odmor' },
    makeTransport('Aerodrom Niš', '✈️', 4),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'jail', name: 'Pritvor / prolaz', emoji: '🚓', text: 'Samo prolaz' },
    makeProperty(cities[p++]),
    makeUtility('EPS', '⚡'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Železnička stanica', '🚆', 4),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'rest', name: 'Odmor', emoji: '🏝️', text: 'Pokupi fond' },
    makeProperty(cities[p++]),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    makeTransport('Autobuska stanica', '🚌', 4),
    makeProperty(cities[p++]),
    makeUtility('Vodovod', '🚰'),
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'goToJail', name: 'Idi u pritvor', emoji: '👮', text: 'Idi u pritvor' },
    makeProperty(cities[p++]),
    makeProperty(cities[p++]),
    { type: 'treasure', name: 'Blago', emoji: '🎁', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    makeTransport('Aerodrom Nikola Tesla', '✈️', 4),
    { type: 'event', name: 'Karta', emoji: '?', text: 'Izvuci kartu' },
    makeProperty(cities[p++]),
    { type: 'tax', name: 'Porez na luksuz', emoji: '💎', amount: 140, text: `Plati ${money(140)} u Odmor` },
    makeProperty(cities[p++])
  ];
  if (tiles.length !== 40 || p !== cities.length) {
    throw new Error(`Neispravna Srbija tabla: ${tiles.length} polja, iskorišćeno ${p}/${cities.length} gradova.`);
  }
  tiles.forEach(tile => {
    if (!tile.mobileShortName) tile.mobileShortName = getMobileShortName(tile.name);
  });
  return tiles;
}

const MAP_CONFIGS = Object.freeze({
  serbia: {
    key: 'serbia',
    name: 'Srbija — gradovi',
    shortName: 'Gradovi Srbije',
    sideLength: 11,
    tileCount: 40,
    jailTileIndex: 10,
    makeTiles: makeSerbiaTiles
  },
  belgrade: {
    key: 'belgrade',
    name: 'Beograd — opštine',
    shortName: 'Opštine Beograda',
    sideLength: 13,
    tileCount: 48,
    jailTileIndex: 12,
    makeTiles: makeBelgradeTiles
  }
});

function cleanMapKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return MAP_CONFIGS[key] ? key : DEFAULT_MAP_KEY;
}

function getMapConfig(value) {
  return MAP_CONFIGS[cleanMapKey(value)];
}

function makeEventDeck() {
  const cards = [
    { text: 'Dodatni posao. Uzmi €100.', effect: (room, player, paths) => addMoney(room, player, 100, 'dodatni posao') },
    { text: 'Kazna za parking. Plati €80.', effect: (room, player, paths) => payBank(room, player, 80, 'kazna za parking') },
    { text: 'Brz put autoputem. Pomeri se 3 polja napred.', effect: (room, player, paths) => { movePlayer(room, player, 3, paths); handleTile(room, player, paths); } },
    { text: 'Radovi na putu. Vrati se 2 polja nazad.', effect: (room, player, paths) => { movePlayer(room, player, -2, paths); handleTile(room, player, paths); } },
    { text: 'Greška banke u tvoju korist. Uzmi €150.', effect: (room, player, paths) => addMoney(room, player, 150, 'greška banke') },
    { text: 'Vaučer za izlazak iz pritvora. Sačuvaj ga i iskoristi kada završiš u pritvoru.', effect: (room, player) => { player.jailVouchers = (Number(player.jailVouchers) || 0) + 1; addLog(room, `${player.name} je dobio vaučer za izlazak iz pritvora.`); } },
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

function createRoom(hostPlayer, requestedMapKey = DEFAULT_MAP_KEY) {
  const code = makeRoomCode();
  const mapConfig = getMapConfig(requestedMapKey);
  const roomTiles = mapConfig.makeTiles();
  const room = {
    code,
    hostId: hostPlayer.id,
    mapKey: mapConfig.key,
    mapName: mapConfig.name,
    boardSideLength: mapConfig.sideLength,
    jailTileIndex: mapConfig.jailTileIndex,
    status: 'lobby',
    players: [hostPlayer],
    tiles: roomTiles,
    currentPlayerIndex: 0,
    diceRolled: false,
    landedTileIndex: null,
    logs: [],
    eventDeck: makeEventDeck(),
    eventPointer: 0,
    actionText: 'Čekamo igrače.',
    gameOver: false,
    gameStartedAt: null,
    lastRollTotal: 0,
    lastDice: [1, 1],
    trades: [],
    tradeIdCounter: 1,
    agreements: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    endedAt: null,
    vacationPot: 0,
    canRollAgain: false,
    doubleRollCount: 0,
    diceDeck: makeDiceDeck(),
    recentDiceTotals: [],
    timerPhase: null,
    turnDeadline: null,
    turnTimerHandle: null,
    stats: makeStats(code, roomTiles, [hostPlayer])
  };
  addLog(room, `${hostPlayer.name} je napravio sobu ${code} · ${mapConfig.name}.`);
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
    jailRollAttempts: 0,
    jailVouchers: 0,
    laps: 0,
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
    mapKey: room.mapKey || DEFAULT_MAP_KEY,
    mapName: room.mapName || getMapConfig(room.mapKey).name,
    boardSideLength: room.boardSideLength || getMapConfig(room.mapKey).sideLength,
    jailTileIndex: Number.isInteger(room.jailTileIndex) ? room.jailTileIndex : getMapConfig(room.mapKey).jailTileIndex,
    status: room.status,
    players: room.players.map(({ id, name, color, money, position, bankrupt, inDebt, inJail, jailRollAttempts, jailVouchers, laps, connected, kicked }) => ({ id, name, color, money, position, bankrupt, inDebt, inJail, jailRollAttempts: Number(jailRollAttempts) || 0, jailVouchers: Number(jailVouchers) || 0, laps: Number(laps) || 0, connected, kicked })),
    tiles: room.tiles,
    currentPlayerIndex: room.currentPlayerIndex,
    diceRolled: room.diceRolled,
    landedTileIndex: room.landedTileIndex,
    logs: room.logs,
    actionText: room.actionText,
    gameOver: room.gameOver,
    gameStartedAt: room.gameStartedAt || null,
    lastRollTotal: room.lastRollTotal,
    lastDice: room.lastDice,
    trades: room.trades,
    agreements: room.agreements || [],
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


function cleanTradeConditions(rawConditions) {
  const conditions = rawConditions && typeof rawConditions === 'object' ? rawConditions : {};
  const rawItems = Array.isArray(conditions.items)
    ? conditions.items
    : convertLegacyTradeConditions(conditions);

  const items = [];
  const seen = new Set();

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const type = rawItem.type === 'revenueShare' ? 'revenueShare' : rawItem.type === 'rentFree' ? 'rentFree' : '';
    if (!type) continue;

    const beneficiarySide = rawItem.beneficiary === 'to' ? 'to' : 'from';
    const grantorSide = rawItem.grantor === 'from' ? 'from' : 'to';
    if (beneficiarySide === grantorSide) continue;

    const group = cleanGroupName(rawItem.group || rawItem.rentFreeGroup || rawItem.revenueShareGroup);
    if (!group) continue;

    const percent = type === 'revenueShare' ? clampPercent(rawItem.percent ?? rawItem.revenueSharePercent, 0, 40) : 0;
    const laps = type === 'rentFree' ? clampLaps(rawItem.laps ?? rawItem.circles ?? rawItem.rentFreeLaps, 1, RENT_FREE_MAX_LAPS) : 0;
    if (type === 'revenueShare' && percent <= 0) continue;

    const key = `${type}:${beneficiarySide}:${grantorSide}:${group}:${percent}:${laps}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ type, beneficiary: beneficiarySide, grantor: grantorSide, group, percent, laps });
    if (items.length >= 8) break;
  }

  return { items };
}

function convertLegacyTradeConditions(conditions) {
  const items = [];
  if (conditions.rentFreeEnabled || conditions.rentFreeGroup) {
    items.push({ type: 'rentFree', beneficiary: 'from', grantor: 'to', group: conditions.rentFreeGroup, laps: conditions.rentFreeLaps || conditions.laps || 1 });
  }
  if (conditions.revenueShareEnabled || conditions.revenueShareGroup || Number(conditions.revenueSharePercent) > 0) {
    items.push({ type: 'revenueShare', beneficiary: 'from', grantor: 'to', group: conditions.revenueShareGroup, percent: conditions.revenueSharePercent });
  }
  return items;
}

function cleanGroupName(value) {
  return String(value || '').trim().slice(0, 40);
}

function clampPercent(value, min = 0, max = 40) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}

function clampLaps(value, min = 1, max = 3) {
  const number = Math.floor(Number(value) || min);
  return Math.max(min, Math.min(max, number));
}

function getPlayerOwnedGroups(room, playerIndex) {
  return getPlayerFullGroups(room, playerIndex);
}

function getPlayerFullGroups(room, playerIndex) {
  const groups = [...new Set(room.tiles.filter(tile => tile.type === 'property').map(tile => tile.group).filter(Boolean))];
  return groups.filter(group => {
    const groupTiles = room.tiles.filter(tile => tile.type === 'property' && tile.group === group);
    return groupTiles.length > 0 && groupTiles.every(tile => tile.owner === playerIndex);
  });
}

function getOwnerMapAfterTrade(room, trade) {
  const ownerAfter = room.tiles.map(tile => isPurchasableTile(tile) ? tile.owner : null);

  for (const tileIndex of trade.fromTiles || []) {
    if (room.tiles[tileIndex]?.type === 'property') ownerAfter[tileIndex] = trade.to;
  }

  for (const tileIndex of trade.toTiles || []) {
    if (room.tiles[tileIndex]?.type === 'property') ownerAfter[tileIndex] = trade.from;
  }

  return ownerAfter;
}

function getFullGroupsAfterTradeForOwner(room, trade, ownerIndex) {
  const ownerAfter = getOwnerMapAfterTrade(room, trade);
  const groups = [...new Set(room.tiles.filter(tile => tile.type === 'property').map(tile => tile.group).filter(Boolean))];
  return groups.filter(group => {
    const groupIndexes = room.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(item => item.tile.type === 'property' && item.tile.group === group)
      .map(item => item.index);
    return groupIndexes.length > 0 && groupIndexes.every(index => ownerAfter[index] === ownerIndex);
  });
}

function sideToPlayerIndex(trade, side) {
  return side === 'to' ? trade.to : trade.from;
}

function canUseTradeConditions(room, trade) {
  const items = Array.isArray(trade.conditions?.items) ? trade.conditions.items : [];
  if (!items.length) return { ok: true, reason: 'OK' };

  for (const item of items) {
    const grantorIndex = sideToPlayerIndex(trade, item.grantor);
    const beneficiaryIndex = sideToPlayerIndex(trade, item.beneficiary);
    if (!room.players[grantorIndex] || !room.players[beneficiaryIndex]) {
      return { ok: false, reason: 'Igrač u uslovu više ne postoji.' };
    }
    if (!item.group) return { ok: false, reason: 'Izaberi set za svaki uslov.' };
    if (item.type === 'revenueShare' && clampPercent(item.percent, 0, 40) <= 0) {
      return { ok: false, reason: 'Procenat rente mora biti veći od 0%.' };
    }

    const validGroups = new Set(getFullGroupsAfterTradeForOwner(room, trade, grantorIndex));
    if (!validGroups.has(item.group)) {
      return { ok: false, reason: `${room.players[grantorIndex]?.name || 'Igrač'} neće imati ceo izabrani set posle razmene.` };
    }
  }

  return { ok: true, reason: 'OK' };
}

function addTradeAgreement(room, trade) {
  const items = Array.isArray(trade.conditions?.items) ? trade.conditions.items : [];
  if (!items.length) return;

  room.agreements = Array.isArray(room.agreements) ? room.agreements : [];
  const summary = [];

  for (const item of items) {
    const beneficiaryIndex = sideToPlayerIndex(trade, item.beneficiary);
    const grantorIndex = sideToPlayerIndex(trade, item.grantor);
    const beneficiary = room.players[beneficiaryIndex];
    const grantor = room.players[grantorIndex];
    if (!beneficiary || !grantor) continue;

    const agreement = {
      id: `a_${Date.now().toString(36)}_${room.tradeIdCounter}_${crypto.randomBytes(3).toString('hex')}`,
      type: item.type,
      beneficiary: beneficiaryIndex,
      grantor: grantorIndex,
      group: item.group,
      percent: item.type === 'revenueShare' ? clampPercent(item.percent, 0, 40) : 0,
      laps: item.type === 'rentFree' ? clampLaps(item.laps, 1, RENT_FREE_MAX_LAPS) : 0,
      beneficiaryStartLaps: item.type === 'rentFree' ? (Number(beneficiary.laps) || 0) : null,
      rentFreeGroup: item.type === 'rentFree' ? item.group : null,
      revenueShareGroup: item.type === 'revenueShare' ? item.group : null,
      revenueSharePercent: item.type === 'revenueShare' ? clampPercent(item.percent, 0, 40) : 0,
      createdAt: Date.now(),
      sourceTradeId: trade.id
    };

    room.agreements.push(agreement);
    if (item.type === 'rentFree') {
      summary.push(`${beneficiary.name} ne plaća rentu ${clampLaps(item.laps, 1, RENT_FREE_MAX_LAPS)} krug/a na ${item.group} setu igrača ${grantor.name}`);
    } else {
      summary.push(`${grantor.name} plaća ${agreement.percent}% rente sa ${item.group} seta igraču ${beneficiary.name}`);
    }
  }

  if (summary.length) addLog(room, `📜 Uslov razmene: ${summary.join(' + ')}.`);
}

function getRemainingRentFreeLaps(room, agreement) {
  if (!agreement || agreement.expired) return 0;
  const beneficiary = room.players[agreement.beneficiary];
  if (!beneficiary || beneficiary.bankrupt) return 0;
  const duration = clampLaps(agreement.laps || agreement.rentFreeLaps || 1, 1, RENT_FREE_MAX_LAPS);
  const startLaps = Number.isFinite(Number(agreement.beneficiaryStartLaps))
    ? Number(agreement.beneficiaryStartLaps)
    : 0;
  return Math.max(0, startLaps + duration - (Number(beneficiary.laps) || 0));
}

function hasRentFreeAgreement(room, payerIndex, ownerIndex, groupName) {
  return (room.agreements || []).some(agreement => {
    if (agreement.beneficiary !== payerIndex) return false;
    if (agreement.grantor !== ownerIndex) return false;
    if (agreement.group !== groupName && agreement.rentFreeGroup !== groupName) return false;
    if (agreement.type !== 'rentFree' && !agreement.rentFreeGroup) return false;
    return getRemainingRentFreeLaps(room, agreement) > 0;
  });
}

function applyRevenueShareAgreements(room, payerIndex, ownerIndex, tile, rentAmount) {
  if (!tile?.group || rentAmount <= 0) return;
  const agreements = (room.agreements || []).filter(agreement =>
    agreement.grantor === ownerIndex &&
    (agreement.group === tile.group || agreement.revenueShareGroup === tile.group) &&
    (agreement.type === 'revenueShare' || agreement.revenueShareGroup) &&
    Number(agreement.percent ?? agreement.revenueSharePercent) > 0
  );

  for (const agreement of agreements) {
    const beneficiary = room.players[agreement.beneficiary];
    const owner = room.players[ownerIndex];
    if (!beneficiary || !owner || beneficiary.bankrupt || owner.bankrupt) continue;

    const percent = clampPercent(agreement.percent ?? agreement.revenueSharePercent, 0, 40);
    const share = Math.floor(rentAmount * percent / 100);
    if (share <= 0) continue;

    owner.money -= share;
    beneficiary.money += share;
    addLog(room, `📜 Uslov: ${owner.name} plaća ${money(share)} (${percent}%) igraču ${beneficiary.name} od rente za ${tile.name}.`);
    checkDebt(room, owner);
    checkDebt(room, beneficiary);
  }
}

function removePlayerAgreements(room, playerIndex) {
  room.agreements = (room.agreements || []).filter(agreement =>
    agreement.beneficiary !== playerIndex && agreement.grantor !== playerIndex
  );
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
    const requestTag = String(payload.requestTag || '');
    if (!room) {
      socket.emit('room:peekResult', { roomCode: cleanRoomCode(payload.roomCode), exists: false, takenColors: [], requestTag, canReconnect: false });
      return;
    }

    const requestedPlayerId = String(payload.playerId || '');
    const reconnectPlayer = requestedPlayerId ? findPlayer(room, requestedPlayerId) : null;
    const canReconnect = Boolean(reconnectPlayer && !reconnectPlayer.bankrupt && !reconnectPlayer.kicked && room.status !== 'ended');

    socket.emit('room:peekResult', {
      roomCode: room.code,
      exists: true,
      status: room.status,
      playerCount: room.players.filter(player => !player.bankrupt).length,
      mapKey: room.mapKey || DEFAULT_MAP_KEY,
      mapName: room.mapName || getMapConfig(room.mapKey).name,
      boardSideLength: room.boardSideLength || getMapConfig(room.mapKey).sideLength,
      takenColors: room.players.filter(player => !player.bankrupt).map(player => player.color),
      requestTag,
      canReconnect
    });
  });

  socket.on('room:create', (payload = {}) => {
    const requestedMapKey = String(payload.mapKey || '').trim().toLowerCase();
    if (!MAP_CONFIGS[requestedMapKey]) return emitError(socket, 'Izaberi mapu pre nego što napraviš sobu.');
    const playerId = payload.playerId || makePlayerId();
    const player = makePlayer({ id: playerId, socketId: socket.id, name: payload.name, color: payload.color });
    const room = createRoom(player, requestedMapKey);
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
    ensurePlayerStats(room, player);
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

    room.players = shuffle(room.players);
    room.currentPlayerIndex = 0;
    room.status = 'playing';
    room.gameStartedAt = Date.now();
    room.stats.game.startedAt = new Date().toISOString();
    room.stats.game.status = 'playing';
    room.stats.game.playerCount = room.players.filter(player => !player.bankrupt).length;
    room.players.forEach(player => ensurePlayerStats(room, player));
    const playOrder = room.players.map(player => player.name).join(' → ');
    room.actionText = `${room.players[0].name}, baci kockice.`;
    addLog(room, `Igra je počela. Broj igrača: ${room.players.length}.`);
    addLog(room, `Nasumičan redosled igranja: ${playOrder}.`);
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


  socket.on('game:useJailVoucher', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return emitError(socket, 'Soba nije pronađena.');
    const playerIndex = findPlayerIndex(room, socket.data.playerId);
    const validation = validateCurrentPlayerAction(room, playerIndex);
    if (!validation.ok) return emitError(socket, validation.reason);
    if (room.diceRolled) return emitError(socket, 'Već si iskoristio potez.');
    const player = room.players[playerIndex];
    if (!player.inJail) return emitError(socket, 'Nisi u pritvoru.');
    if ((Number(player.jailVouchers) || 0) <= 0) return emitError(socket, 'Nemaš vaučer za izlazak iz pritvora.');
    resolveJailVoucher(room, playerIndex);
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
    recordPurchase(room, playerIndex, room.landedTileIndex, tile.price);
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

    const requestedTo = Number(payload.to);
    if (!Number.isInteger(requestedTo) || requestedTo < 0 || requestedTo >= room.players.length || requestedTo === from) {
      return emitError(socket, 'Izabrani igrač za razmenu nije ispravan.');
    }

    let originalTrade = null;
    const replaceTradeId = Number(payload.replaceTradeId);
    if (Number.isInteger(replaceTradeId) && replaceTradeId > 0) {
      originalTrade = room.trades.find(item => item.id === replaceTradeId && item.status === 'pending');
      if (!originalTrade) return emitError(socket, 'Originalna ponuda više ne postoji.');
      if (originalTrade.from !== from && originalTrade.to !== from) return emitError(socket, 'Možeš da pregovaraš samo o svojim ponudama.');
      const otherParty = originalTrade.from === from ? originalTrade.to : originalTrade.from;
      if (requestedTo !== otherParty) return emitError(socket, 'Kontra ponuda mora da ide istom igraču.');
    }

    const trade = {
      id: room.tradeIdCounter++,
      from,
      to: requestedTo,
      fromMoney: clampMoney(payload.fromMoney),
      toMoney: clampMoney(payload.toMoney),
      fromTiles: uniqueTileIndexes(payload.fromTiles, room.tiles.length),
      toTiles: uniqueTileIndexes(payload.toTiles, room.tiles.length),
      conditions: cleanTradeConditions(payload.conditions),
      status: 'pending',
      kind: originalTrade ? 'counter' : 'offer',
      replyTo: originalTrade ? originalTrade.id : null
    };
    const hasConditions = Boolean(Array.isArray(trade.conditions?.items) && trade.conditions.items.length > 0);
    if (trade.fromMoney <= 0 && trade.toMoney <= 0 && trade.fromTiles.length === 0 && trade.toTiles.length === 0 && !hasConditions) {
      return emitError(socket, 'Izaberi novac, polje ili uslov za razmenu.');
    }
    const validation = canAcceptTrade(room, trade);
    if (!validation.ok) return emitError(socket, validation.reason);
    const conditionValidation = canUseTradeConditions(room, trade);
    if (!conditionValidation.ok) return emitError(socket, conditionValidation.reason);

    if (originalTrade) {
      originalTrade.status = 'countered';
      room.trades = room.trades.filter(item => item.id !== originalTrade.id && item.status === 'pending');
      recordTrade(room, 'countered');
      addLog(room, `${room.players[from].name} je poslao kontra ponudu igraču ${room.players[trade.to].name}.`);
    } else {
      recordTrade(room, 'created');
      addLog(room, `${room.players[from].name} je poslao ponudu za razmenu igraču ${room.players[trade.to].name}.`);
    }

    room.trades.unshift(trade);
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
    const conditionValidation = canUseTradeConditions(room, trade);
    if (!conditionValidation.ok) return emitError(socket, conditionValidation.reason);

    const from = room.players[trade.from];
    const to = room.players[trade.to];
    from.money = from.money - trade.fromMoney + trade.toMoney;
    to.money = to.money - trade.toMoney + trade.fromMoney;
    trade.fromTiles.forEach(tileIndex => { room.tiles[tileIndex].owner = trade.to; });
    trade.toTiles.forEach(tileIndex => { room.tiles[tileIndex].owner = trade.from; });
    addTradeAgreement(room, trade);
    trade.status = 'accepted';
    room.trades = room.trades.filter(item => item.status === 'pending');
    recordTrade(room, 'accepted');
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
    recordTrade(room, 'declined');
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
    recordTrade(room, 'cancelled');
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
      const buildingType = tile.type === 'stadium' ? 'stadiumUpgrade' : (tile.houses === 5 ? 'hotel' : 'house');
      recordBuilding(room, playerIndex, tileIndex, 'build', cost, buildingType);
      const buildingName = tile.type === 'stadium'
        ? `unapređenje ${tile.houses}/3`
        : (tile.houses === 5 ? 'hotel' : `kuću ${tile.houses}`);
      addLog(room, `${player.name} je izgradio ${buildingName} na ${tile.name} za ${money(cost)}.`);
    } else {
      const refund = getBuildingSellRefund(tile);
      const removedType = tile.type === 'stadium' ? 'stadiumUpgrade' : (tile.houses === 5 ? 'hotel' : 'house');
      const removedName = tile.type === 'stadium' ? 'stadionsko unapređenje' : (tile.houses === 5 ? 'hotel' : 'kuću');
      tile.houses -= 1;
      player.money += refund;
      recordBuilding(room, playerIndex, tileIndex, 'sell', refund, removedType);
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


function isValidStatsKey(key) {
  return String(key || '') === ADMIN_STATS_KEY;
}

function makeStats(roomCode, tiles, players = []) {
  const stats = {
    version: 1,
    roomCode,
    createdAt: new Date().toISOString(),
    generatedAt: null,
    game: {
      status: 'lobby',
      startedAt: null,
      endedAt: null,
      durationMs: null,
      playerCount: players.length,
      turnsEnded: 0,
      winner: null
    },
    rolls: {
      totalRolls: 0,
      combinations: makeEmptyDiceCombinations(),
      totals: makeEmptyDiceTotals(),
      doubles: 0,
      jailRolls: 0,
      automaticRolls: 0,
      threeDoublesToJail: 0,
      redrawnThirdSameTotal: 0,
      sumTotal: 0,
      averageTotal: 0,
      lastTotals: []
    },
    tiles: {},
    economy: {
      rentTotal: 0,
      taxTotal: 0,
      startPassTotal: 0,
      startLandTotal: 0,
      odmorPaidTotal: 0,
      cardNetTotal: 0,
      purchasesTotal: 0,
      buildingSpendTotal: 0,
      buildingRefundTotal: 0,
      bankPaymentsTotal: 0
    },
    cards: {
      draws: 0,
      byText: {}
    },
    trades: {
      created: 0,
      accepted: 0,
      declined: 0,
      cancelled: 0,
      countered: 0
    },
    jail: {
      sentToJail: 0,
      paidToLeave: 0,
      rollAttempts: 0,
      rollSuccess: 0,
      rollFailPaid: 0,
      threeDoubles: 0,
      feesPaid: 0
    },
    bankruptcies: {
      declared: 0,
      kicked: 0
    },
    players: {}
  };

  tiles.forEach((tile, index) => {
    stats.tiles[index] = {
      index,
      name: tile.name,
      type: tile.type,
      group: tile.group || null,
      landed: 0,
      passed: 0,
      bought: 0,
      rentPaid: 0,
      rentEvents: 0,
      taxesPaid: 0,
      odmorPaid: 0,
      housesBuilt: 0,
      hotelsBuilt: 0,
      stadiumUpgradesBuilt: 0,
      housesSold: 0,
      hotelsSold: 0,
      stadiumUpgradesSold: 0
    };
  });

  players.forEach(player => ensurePlayerStatsObject(stats, player));
  return stats;
}

function makeEmptyDiceCombinations() {
  const combinations = {};
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) combinations[`${d1}+${d2}`] = 0;
  }
  return combinations;
}

function makeEmptyDiceTotals() {
  const totals = {};
  for (let total = 2; total <= 12; total++) totals[String(total)] = 0;
  return totals;
}

function ensurePlayerStatsObject(stats, player) {
  if (!player || !stats) return null;
  if (!stats.players[player.id]) {
    stats.players[player.id] = {
      id: player.id,
      name: player.name,
      color: player.color,
      rolls: 0,
      doubles: 0,
      turnsEnded: 0,
      landed: {},
      rentPaid: 0,
      rentReceived: 0,
      taxPaid: 0,
      startMoney: 0,
      odmorMoney: 0,
      cardNet: 0,
      purchases: 0,
      purchaseSpend: 0,
      buildingSpend: 0,
      buildingRefund: 0,
      tradesAccepted: 0,
      bankrupt: false,
      kicked: false
    };
  } else {
    stats.players[player.id].name = player.name;
    stats.players[player.id].color = player.color;
  }
  return stats.players[player.id];
}

function ensurePlayerStats(room, player) {
  if (!room || !room.stats || !player) return null;
  return ensurePlayerStatsObject(room.stats, player);
}

function getPlayerStatsByIndex(room, playerIndex) {
  const player = room?.players?.[playerIndex];
  return ensurePlayerStats(room, player);
}

function recordRoll(room, playerIndex, d1, d2, options = {}) {
  if (!room?.stats) return;
  const total = d1 + d2;
  const combo = `${d1}+${d2}`;
  room.stats.rolls.totalRolls += 1;
  room.stats.rolls.combinations[combo] = (room.stats.rolls.combinations[combo] || 0) + 1;
  room.stats.rolls.totals[String(total)] = (room.stats.rolls.totals[String(total)] || 0) + 1;
  room.stats.rolls.sumTotal += total;
  room.stats.rolls.averageTotal = Number((room.stats.rolls.sumTotal / room.stats.rolls.totalRolls).toFixed(3));
  room.stats.rolls.lastTotals.push(total);
  room.stats.rolls.lastTotals = room.stats.rolls.lastTotals.slice(-20);
  if (d1 === d2) room.stats.rolls.doubles += 1;
  if (options.jail) room.stats.rolls.jailRolls += 1;
  if (options.automatic) room.stats.rolls.automaticRolls += 1;

  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) {
    pstats.rolls += 1;
    if (d1 === d2) pstats.doubles += 1;
  }
}

function recordDiceRedraw(room) {
  if (room?.stats) room.stats.rolls.redrawnThirdSameTotal += 1;
}

function recordTilePassed(room, tileIndex, playerIndex) {
  if (!room?.stats?.tiles?.[tileIndex]) return;
  room.stats.tiles[tileIndex].passed += 1;
}

function recordTileLanding(room, tileIndex, playerIndex) {
  if (!room?.stats?.tiles?.[tileIndex]) return;
  room.stats.tiles[tileIndex].landed += 1;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.landed[tileIndex] = (pstats.landed[tileIndex] || 0) + 1;
}

function recordStartBonus(room, playerIndex, amount, landedOnStart) {
  if (!room?.stats) return;
  if (landedOnStart) room.stats.economy.startLandTotal += amount;
  else room.stats.economy.startPassTotal += amount;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.startMoney += amount;
}

function recordPurchase(room, playerIndex, tileIndex, amount) {
  if (!room?.stats) return;
  if (room.stats.tiles[tileIndex]) room.stats.tiles[tileIndex].bought += 1;
  room.stats.economy.purchasesTotal += amount;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) {
    pstats.purchases += 1;
    pstats.purchaseSpend += amount;
  }
}

function recordRent(room, payerIndex, ownerIndex, tileIndex, amount) {
  if (!room?.stats) return;
  if (room.stats.tiles[tileIndex]) {
    room.stats.tiles[tileIndex].rentPaid += amount;
    room.stats.tiles[tileIndex].rentEvents += 1;
  }
  room.stats.economy.rentTotal += amount;
  const payerStats = getPlayerStatsByIndex(room, payerIndex);
  const ownerStats = getPlayerStatsByIndex(room, ownerIndex);
  if (payerStats) payerStats.rentPaid += amount;
  if (ownerStats) ownerStats.rentReceived += amount;
}

function recordTax(room, playerIndex, tileIndex, amount) {
  if (!room?.stats) return;
  if (room.stats.tiles[tileIndex]) room.stats.tiles[tileIndex].taxesPaid += amount;
  room.stats.economy.taxTotal += amount;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.taxPaid += amount;
}

function recordOdmorPayout(room, playerIndex, tileIndex, amount) {
  if (!room?.stats) return;
  if (room.stats.tiles[tileIndex]) room.stats.tiles[tileIndex].odmorPaid += amount;
  room.stats.economy.odmorPaidTotal += amount;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.odmorMoney += amount;
}

function recordBankPayment(room, playerIndex, amount) {
  if (!room?.stats) return;
  room.stats.economy.bankPaymentsTotal += amount;
}

function recordCard(room, playerIndex, text, moneyDelta) {
  if (!room?.stats) return;
  room.stats.cards.draws += 1;
  if (!room.stats.cards.byText[text]) room.stats.cards.byText[text] = { text, draws: 0, moneyDelta: 0 };
  room.stats.cards.byText[text].draws += 1;
  room.stats.cards.byText[text].moneyDelta += moneyDelta;
  room.stats.economy.cardNetTotal += moneyDelta;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.cardNet += moneyDelta;
}

function recordTrade(room, action) {
  if (!room?.stats?.trades) return;
  if (typeof room.stats.trades[action] !== 'number') room.stats.trades[action] = 0;
  room.stats.trades[action] += 1;
}

function recordBuilding(room, playerIndex, tileIndex, direction, amount, buildingType) {
  if (!room?.stats) return;
  const tileStats = room.stats.tiles[tileIndex];
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (direction === 'build') {
    room.stats.economy.buildingSpendTotal += amount;
    if (buildingType === 'stadiumUpgrade') tileStats.stadiumUpgradesBuilt = (tileStats.stadiumUpgradesBuilt || 0) + 1;
    else if (buildingType === 'hotel') tileStats.hotelsBuilt += 1;
    else tileStats.housesBuilt += 1;
    if (pstats) pstats.buildingSpend += amount;
  } else {
    room.stats.economy.buildingRefundTotal += amount;
    if (buildingType === 'stadiumUpgrade') tileStats.stadiumUpgradesSold = (tileStats.stadiumUpgradesSold || 0) + 1;
    else if (buildingType === 'hotel') tileStats.hotelsSold += 1;
    else tileStats.housesSold += 1;
    if (pstats) pstats.buildingRefund += amount;
  }
}

function recordJail(room, playerIndex, action, amount = 0) {
  if (!room?.stats?.jail) return;
  if (action === 'sentToJail') room.stats.jail.sentToJail += 1;
  if (action === 'paidToLeave') {
    room.stats.jail.paidToLeave += 1;
    room.stats.jail.feesPaid += amount;
  }
  if (action === 'rollSuccess') {
    room.stats.jail.rollAttempts += 1;
    room.stats.jail.rollSuccess += 1;
  }
  if (action === 'rollFailPaid') {
    room.stats.jail.rollAttempts += 1;
    room.stats.jail.rollFailPaid += 1;
    room.stats.jail.feesPaid += amount;
  }
  if (action === 'rollFailStay') {
    room.stats.jail.rollAttempts += 1;
  }
  if (action === 'threeDoubles') {
    room.stats.jail.threeDoubles += 1;
    room.stats.rolls.threeDoublesToJail += 1;
  }
}

function recordTurnEnded(room, playerIndex) {
  if (!room?.stats) return;
  room.stats.game.turnsEnded += 1;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) pstats.turnsEnded += 1;
}

function recordBankruptcy(room, playerIndex, type) {
  if (!room?.stats) return;
  if (type === 'kick') room.stats.bankruptcies.kicked += 1;
  else room.stats.bankruptcies.declared += 1;
  const pstats = getPlayerStatsByIndex(room, playerIndex);
  if (pstats) {
    pstats.bankrupt = true;
    if (type === 'kick') pstats.kicked = true;
  }
}

function finishStats(room, winner) {
  if (!room?.stats) return;
  room.stats.game.status = 'ended';
  room.stats.game.endedAt = new Date().toISOString();
  room.stats.game.winner = winner ? { id: winner.id, name: winner.name, color: winner.color } : null;
  const start = room.stats.game.startedAt ? Date.parse(room.stats.game.startedAt) : room.createdAt;
  room.stats.game.durationMs = Number.isFinite(start) ? Date.now() - start : null;
}

function makeStatsRoomSummary(room) {
  return {
    code: room.code,
    mapKey: room.mapKey || DEFAULT_MAP_KEY,
    mapName: room.mapName || getMapConfig(room.mapKey).name,
    boardSideLength: room.boardSideLength || getMapConfig(room.mapKey).sideLength,
    status: room.status,
    playerCount: room.players.filter(player => !player.bankrupt).length,
    players: room.players.map(player => ({ name: player.name, color: player.color, bankrupt: player.bankrupt, connected: player.connected })),
    createdAt: new Date(room.createdAt).toISOString(),
    startedAt: room.stats?.game?.startedAt || null,
    endedAt: room.stats?.game?.endedAt || (room.endedAt ? new Date(room.endedAt).toISOString() : null),
    totalRolls: room.stats?.rolls?.totalRolls || 0,
    turnsEnded: room.stats?.game?.turnsEnded || 0
  };
}

function buildStatsExport(room) {
  const stats = JSON.parse(JSON.stringify(room.stats || {}));
  stats.generatedAt = new Date().toISOString();
  return {
    ok: true,
    room: makeStatsRoomSummary(room),
    stats,
    agreements: room.agreements || [],
    currentState: {
      status: room.status,
      mapKey: room.mapKey || DEFAULT_MAP_KEY,
      mapName: room.mapName || getMapConfig(room.mapKey).name,
      boardSideLength: room.boardSideLength || getMapConfig(room.mapKey).sideLength,
      actionText: room.actionText,
      currentPlayerIndex: room.currentPlayerIndex,
      vacationPot: room.vacationPot,
      gameOver: room.gameOver
    },
    tiles: room.tiles.map((tile, index) => ({
      index,
      name: tile.name,
      type: tile.type,
      group: tile.group || null,
      owner: Number.isInteger(tile.owner) ? room.players[tile.owner]?.name || null : null,
      houses: tile.houses || 0,
      price: tile.price || null,
      rent: tile.rent || null
    })),
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      money: player.money,
      position: player.position,
      bankrupt: player.bankrupt,
      inDebt: player.inDebt,
      inJail: player.inJail,
      connected: player.connected
    })),
    log: room.logs
  };
}


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
  const [d1, d2] = drawDice(room);
  recordRoll(room, playerIndex, d1, d2, { automatic });
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
    player.jailRollAttempts = 0;
    room.doubleRollCount = 0;
    recordJail(room, playerIndex, 'threeDoubles');
    directMove(room, player, room.jailTileIndex, paths, false);
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

function resolveJailVoucher(room, playerIndex) {
  const player = room.players[playerIndex];
  clearTurnTimer(room);
  player.jailVouchers = Math.max(0, (Number(player.jailVouchers) || 0) - 1);
  player.inJail = false;
  player.jailRollAttempts = 0;
  room.diceRolled = true;
  room.canRollAgain = false;
  room.doubleRollCount = 0;
  room.landedTileIndex = player.position;
  room.actionText = `${player.name} je iskoristio vaučer i izašao iz pritvora. To je ceo potez za ovaj krug.`;
  addLog(room, room.actionText);
  if (player.money > 0) scheduleEndTimer(room);
  touchRoom(room);
  emitRoom(room);
}

function resolveJailPayment(room, playerIndex, automatic) {
  const player = room.players[playerIndex];
  clearTurnTimer(room);
  player.money -= JAIL_FEE;
  player.inJail = false;
  player.jailRollAttempts = 0;
  recordJail(room, playerIndex, 'paidToLeave', JAIL_FEE);
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
  const [d1, d2] = drawDice(room);
  recordRoll(room, playerIndex, d1, d2, { jail: true, automatic });
  const paths = { [playerIndex]: [] };
  room.diceRolled = true;
  room.canRollAgain = false;
  room.doubleRollCount = 0;
  room.lastDice = [d1, d2];
  room.lastRollTotal = d1 + d2;
  room.landedTileIndex = player.position;

  player.jailRollAttempts = (Number(player.jailRollAttempts) || 0) + 1;

  if (d1 === d2) {
    player.inJail = false;
    player.jailRollAttempts = 0;
    recordJail(room, playerIndex, 'rollSuccess');
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} je bacio duple ${d1}+${d2} i izašao iz pritvora. To je ceo potez za ovaj krug.`;
    addLog(room, room.actionText);
  } else if (player.jailRollAttempts < 2) {
    player.inJail = true;
    recordJail(room, playerIndex, 'rollFailStay');
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} nije bacio duple (${d1}+${d2}). Ostaje u pritvoru i ima još jedan pokušaj sledeći potez, ili može da plati ${money(JAIL_FEE)}.`;
    addLog(room, room.actionText);
  } else {
    player.money -= JAIL_FEE;
    player.inJail = false;
    player.jailRollAttempts = 0;
    recordJail(room, playerIndex, 'rollFailPaid', JAIL_FEE);
    room.actionText = `${automatic ? '⏱ ' : ''}${player.name} nije bacio duple (${d1}+${d2}) ni iz drugog pokušaja i plaća ${money(JAIL_FEE)}. To je ceo potez za ovaj krug.`;
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
  recordTurnEnded(room, room.currentPlayerIndex);
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

function incrementPlayerLap(room, player) {
  if (!player || player.bankrupt) return;
  player.laps = (Number(player.laps) || 0) + 1;
  const playerIndex = room.players.indexOf(player);
  const expiredIds = new Set();

  for (const agreement of room.agreements || []) {
    if (agreement.beneficiary !== playerIndex) continue;
    if (agreement.type !== 'rentFree' && !agreement.rentFreeGroup) continue;
    if (getRemainingRentFreeLaps(room, agreement) <= 0) {
      agreement.expired = true;
      expiredIds.add(agreement.id);
    }
  }

  if (expiredIds.size) {
    room.agreements = (room.agreements || []).filter(agreement => !expiredIds.has(agreement.id));
    addLog(room, `📜 ${player.name} je prošao START i istekao mu je ${expiredIds.size === 1 ? 'uslov' : 'jedan ili više uslova'} bez rente.`);
  }
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
    recordTilePassed(room, newPosition, playerIndex);
    if (direction > 0 && newPosition === 0) {
      incrementPlayerLap(room, player);
      const landedOnStart = i === totalSteps - 1;
      const bonus = landedOnStart ? LAND_START_BONUS : PASS_START_BONUS;
      player.money += bonus;
      recordStartBonus(room, playerIndex, bonus, landedOnStart);
      addLog(room, `${player.name} je ${landedOnStart ? 'stao na' : 'prošao'} START i dobio ${money(bonus)}.`);
      checkDebt(room, player);
    }
  }
  room.landedTileIndex = player.position;
  recordTileLanding(room, player.position, playerIndex);
  addLog(room, `${player.name} je stao na ${room.tiles[player.position].name}.`);
}

function directMove(room, player, targetIndex, paths, collectStartBonus) {
  const playerIndex = room.players.indexOf(player);
  if (!paths[playerIndex]) paths[playerIndex] = [];
  const previousPosition = player.position;
  player.position = targetIndex;
  room.landedTileIndex = targetIndex;
  paths[playerIndex].push(targetIndex);
  recordTileLanding(room, targetIndex, playerIndex);
  if (collectStartBonus) {
    if (targetIndex === 0 && previousPosition !== 0) incrementPlayerLap(room, player);
    player.money += LAND_START_BONUS;
    recordStartBonus(room, playerIndex, LAND_START_BONUS, true);
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
      recordOdmorPayout(room, room.players.indexOf(player), player.position, pot);
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
    player.jailRollAttempts = 0;
    recordJail(room, room.players.indexOf(player), 'sentToJail');
    room.actionText = `${player.name} ide u pritvor. Ima 2 pokušaja da baci duple ili može da plati ${money(JAIL_FEE)}.`;
    addLog(room, room.actionText);
    directMove(room, player, room.jailTileIndex, paths, false);
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

    const payerIndex = room.players.indexOf(player);
    if (tile.type === 'property' && hasRentFreeAgreement(room, payerIndex, tile.owner, tile.group)) {
      room.actionText = `${player.name} je stao na ${tile.name}, ali po uslovu razmene ne plaća rentu za ${tile.group} set igraču ${owner.name}.`;
      addLog(room, room.actionText);
      return;
    }

    const rent = getTileRent(room, tile, room.lastRollTotal);
    recordRent(room, payerIndex, tile.owner, player.position, rent);
    room.actionText = `${player.name} plaća ${money(rent)} rente igraču ${owner.name} za ${tile.name}.`;
    payPlayer(room, player, owner, rent, `renta za ${tile.name}`);
    if (tile.type === 'property') applyRevenueShareAgreements(room, payerIndex, tile.owner, tile, rent);
  }
}

function drawEvent(room, player, paths) {
  if (room.eventPointer >= room.eventDeck.length) {
    room.eventDeck = makeEventDeck();
    room.eventPointer = 0;
    addLog(room, 'Špil karata je ponovo promešan.');
  }
  const card = room.eventDeck[room.eventPointer++];
  const playerIndex = room.players.indexOf(player);
  const beforeMoney = player.money;
  room.actionText = `Karta: ${card.text}`;
  addLog(room, room.actionText);
  card.effect(room, player, paths);
  recordCard(room, playerIndex, card.text, player.money - beforeMoney);
}

function isPurchasableTile(tile) {
  return Boolean(tile && ['property', 'stadium', 'utility', 'transport'].includes(tile.type));
}

function payBank(room, player, amount, reason) {
  player.money -= amount;
  recordBankPayment(room, room.players.indexOf(player), amount, reason);
  addLog(room, `${player.name} je platio ${money(amount)} banci: ${reason}.`);
  checkDebt(room, player);
}

function payTax(room, player, amount, reason) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  player.money -= safeAmount;
  room.vacationPot = (Number(room.vacationPot) || 0) + safeAmount;
  recordTax(room, room.players.indexOf(player), player.position, safeAmount, reason);
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
  player.jailRollAttempts = 0;
  recordBankruptcy(room, playerIndex, 'kick');
  addLog(room, `🚪 ${player.name} je izbačen iz igre. Sva njegova polja se vraćaju banci.`);
  room.tiles.forEach(tile => {
    if (isPurchasableTile(tile) && tile.owner === playerIndex) {
      tile.owner = null;
      if (tile.type === 'property' || tile.type === 'stadium') tile.houses = 0;
    }
  });
  room.trades.forEach(trade => {
    if (trade.from === playerIndex || trade.to === playerIndex) trade.status = 'cancelled';
  });
  room.trades = room.trades.filter(trade => trade.status === 'pending');
  removePlayerAgreements(room, playerIndex);
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
    finishStats(room, activePlayers[0]);
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
  player.jailRollAttempts = 0;
  recordBankruptcy(room, playerIndex, 'declared');
  addLog(room, `💀 ${player.name} je proglasio bankrot. Sva polja se vraćaju banci.`);
  room.tiles.forEach(tile => {
    if (isPurchasableTile(tile) && tile.owner === playerIndex) {
      tile.owner = null;
      if (tile.type === 'property' || tile.type === 'stadium') tile.houses = 0;
    }
  });
  room.trades.forEach(trade => {
    if (trade.from === playerIndex || trade.to === playerIndex) trade.status = 'cancelled';
  });
  room.trades = room.trades.filter(trade => trade.status === 'pending');
  removePlayerAgreements(room, playerIndex);
  const activePlayers = room.players.filter(item => !item.bankrupt);
  if (activePlayers.length === 1) {
    clearTurnTimer(room);
    room.gameOver = true;
    room.status = 'ended';
    room.endedAt = Date.now();
    finishStats(room, activePlayers[0]);
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
  if (!tile || !['property', 'stadium'].includes(tile.type)) return { ok: false, reason: 'Na ovom polju nema gradnje.' };
  if (tile.owner !== playerIndex) return { ok: false, reason: 'Ne poseduješ ovo polje.' };
  if (tile.type === 'property' && !ownsFullGroup(room, playerIndex, tile.group)) return { ok: false, reason: 'Moraš da poseduješ ceo set pre gradnje.' };

  const maxLevel = getMaxBuildingLevel(tile);
  tile.houses = Math.min(maxLevel, Math.max(0, Number(tile.houses) || 0));

  if (direction > 0) {
    if (player.money <= 0) return { ok: false, reason: 'Prvo reši dug.' };
    if (tile.houses >= maxLevel) return { ok: false, reason: tile.type === 'stadium' ? 'Stadion je već potpuno izgrađen.' : 'Ovo polje već ima hotel.' };
    const cost = getBuildingBuildCost(tile);
    if (player.money < cost) return { ok: false, reason: 'Nema dovoljno novca za gradnju.' };
  } else if (tile.houses <= 0) {
    return { ok: false, reason: 'Nema objekata za prodaju na ovom polju.' };
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
    const baseRent = tile.rentLevels[houseLevel] || tile.rent;
    if (houseLevel === 0 && Number.isInteger(tile.owner) && ownsFullGroup(room, tile.owner, tile.group)) {
      return baseRent * 2;
    }
    return baseRent;
  }
  if (tile.type === 'stadium') {
    const level = Math.min(3, Math.max(0, Number(tile.houses) || 0));
    return tile.rentLevels[level] || tile.rent;
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

function uniqueTileIndexes(values, tileCount = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value < tileCount))];
}

function clampMoney(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  return Math.min(number, 100000);
}

function addLog(room, message) {
  room.logs.unshift(message);
  room.logs = room.logs.slice(0, 100);
}


function makeDiceDeck() {
  const deck = [];
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      deck.push([d1, d2]);
    }
  }
  return shuffle(deck);
}

function drawDice(room) {
  if (!room.diceDeck || room.diceDeck.length <= 12) {
    room.diceDeck = makeDiceDeck();
  }

  let dice = room.diceDeck.shift();
  if (!dice) {
    room.diceDeck = makeDiceDeck();
    dice = room.diceDeck.shift();
  }

  const total = dice[0] + dice[1];
  const recentTotals = Array.isArray(room.recentDiceTotals) ? room.recentDiceTotals : [];
  const wouldBeThirdSameTotal = recentTotals.length >= 2 && recentTotals[0] === total && recentTotals[1] === total;

  if (wouldBeThirdSameTotal && room.diceDeck.length > 0) {
    const replacement = room.diceDeck.shift();
    room.diceDeck.push(dice);
    dice = replacement;
    recordDiceRedraw(room);
  }

  const finalTotal = dice[0] + dice[1];
  room.recentDiceTotals = [finalTotal, ...recentTotals].slice(0, 2);
  return dice;
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
