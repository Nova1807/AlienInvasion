const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const VALID_ROLES = new Set(['villager', 'werewolf', 'seer']);
const PHASES = new Set(['lobby', 'night', 'day']);
const MAX_MESSAGES = 200;

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<string, Client>} */
const clients = new Map();

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`Host server listening on port ${PORT}`);
});

wss.on('connection', (ws) => {
  const clientId = randomUUID();
  clients.set(clientId, { ws, roomCode: null });

  ws.on('message', (buffer) => {
    let parsed;
    try {
      parsed = JSON.parse(buffer.toString());
    } catch (error) {
      send(ws, 'error', { message: 'Nachricht konnte nicht gelesen werden.' });
      return;
    }

    handleMessage(clientId, parsed);
  });

  ws.on('close', () => {
    handleDisconnect(clientId);
  });

  ws.on('error', () => {
    handleDisconnect(clientId);
  });

  send(ws, 'connected', { clientId });
});

/**
 * @param {string} clientId
 * @param {{ type: string; payload?: any }} message
 */
function handleMessage(clientId, message) {
  const entry = clients.get(clientId);
  if (!entry) {
    return;
  }

  const { ws } = entry;
  const { type, payload } = message;

  switch (type) {
    case 'create_room':
      return handleCreateRoom(clientId, payload);
    case 'join_room':
      return handleJoinRoom(clientId, payload);
    case 'public_chat':
      return handlePublicChat(clientId, payload);
    case 'werewolf_chat':
      return handleWerewolfChat(clientId, payload);
    case 'set_role':
      return handleSetRole(clientId, payload);
    case 'set_phase':
      return handleSetPhase(clientId, payload);
    case 'set_alive':
      return handleSetAlive(clientId, payload);
    case 'werewolf_vote':
      return handleWerewolfVote(clientId, payload);
    case 'day_vote':
      return handleDayVote(clientId, payload);
    case 'clear_votes':
      return handleClearVotes(clientId, payload);
    default:
      send(ws, 'error', { message: `Unbekannter Nachrichtentyp: ${type}` });
  }
}

/**
 * @param {string} clientId
 */
function handleDisconnect(clientId) {
  const entry = clients.get(clientId);
  if (!entry) {
    return;
  }

  const { roomCode } = entry;
  clients.delete(clientId);

  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  room.players.delete(clientId);
  room.werewolfVotes.delete(clientId);
  room.dayVotes.delete(clientId);

  if (room.hostId === clientId) {
    broadcast(room, 'room_closed', { reason: 'Der Host hat die Verbindung beendet.' });
    closeRoom(roomCode);
    return;
  }

  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ hostName?: string }} payload
 */
function handleCreateRoom(clientId, payload) {
  const entry = clients.get(clientId);
  if (!entry) {
    return;
  }

  const { ws } = entry;
  const hostName = (payload?.hostName || '').toString().trim();

  if (!hostName) {
    send(ws, 'error', { message: 'Bitte gib einen Host-Namen ein.' });
    return;
  }

  const code = generateRoomCode();
  const room = {
    code,
    hostId: clientId,
    players: new Map(),
    phase: 'lobby',
    werewolfVotes: new Map(),
    dayVotes: new Map(),
    messages: [],
  };

  const player = createPlayer({ id: clientId, name: hostName, isHost: true });
  room.players.set(clientId, player);
  rooms.set(code, room);

  entry.roomCode = code;

  send(ws, 'room_joined', { roomCode: code, playerId: clientId });
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ roomCode?: string; name?: string }} payload
 */
function handleJoinRoom(clientId, payload) {
  const entry = clients.get(clientId);
  if (!entry) {
    return;
  }

  const { ws } = entry;
  const roomCode = (payload?.roomCode || '').toString().trim().toUpperCase();
  const name = (payload?.name || '').toString().trim();

  if (!roomCode) {
    send(ws, 'error', { message: 'Bitte gib einen Raumcode ein.' });
    return;
  }
  if (!name) {
    send(ws, 'error', { message: 'Bitte gib einen Spielernamen ein.' });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(ws, 'error', { message: 'Kein Spiel mit diesem Code gefunden.' });
    return;
  }

  if (room.players.size >= 30) {
    send(ws, 'error', { message: 'Der Raum ist voll.' });
    return;
  }

  const player = createPlayer({ id: clientId, name, isHost: false });
  room.players.set(clientId, player);
  entry.roomCode = roomCode;

  send(ws, 'room_joined', { roomCode, playerId: clientId });
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ text?: string }} payload
 */
function handlePublicChat(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context) {
    return;
  }

  const { room, player } = context;
  const text = sanitizeText(payload?.text);
  if (!text) {
    return;
  }

  const message = createMessage({ author: player, text, type: 'public' });
  room.messages.push(message);
  trimMessages(room);
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ text?: string }} payload
 */
function handleWerewolfChat(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context) {
    return;
  }

  const { room, player } = context;
  if (player.role !== 'werewolf' && !player.isHost) {
    return;
  }

  const text = sanitizeText(payload?.text);
  if (!text) {
    return;
  }

  const message = createMessage({ author: player, text, type: 'werewolf' });
  room.messages.push(message);
  trimMessages(room);
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ playerId?: string; role?: string }} payload
 */
function handleSetRole(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context || !context.player.isHost) {
    return;
  }

  const targetId = (payload?.playerId || '').toString();
  const role = (payload?.role || '').toString();
  if (!VALID_ROLES.has(role)) {
    return;
  }

  const target = context.room.players.get(targetId);
  if (!target) {
    return;
  }

  target.role = role;
  broadcastRoomState(context.room);
}

/**
 * @param {string} clientId
 * @param {{ phase?: string }} payload
 */
function handleSetPhase(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context || !context.player.isHost) {
    return;
  }

  const phase = (payload?.phase || '').toString();
  if (!PHASES.has(phase)) {
    return;
  }

  context.room.phase = phase;
  if (phase === 'day') {
    context.room.werewolfVotes.clear();
  }
  broadcastRoomState(context.room);
}

/**
 * @param {string} clientId
 * @param {{ playerId?: string; alive?: boolean }} payload
 */
function handleSetAlive(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context || !context.player.isHost) {
    return;
  }

  const targetId = (payload?.playerId || '').toString();
  const alive = Boolean(payload?.alive);
  const target = context.room.players.get(targetId);
  if (!target) {
    return;
  }

  target.alive = alive;
  if (!alive) {
    context.room.werewolfVotes.delete(targetId);
    context.room.dayVotes.delete(targetId);
    for (const [voterId, choice] of context.room.werewolfVotes.entries()) {
      if (choice === targetId) {
        context.room.werewolfVotes.delete(voterId);
      }
    }
    for (const [voterId, choice] of context.room.dayVotes.entries()) {
      if (choice === targetId) {
        context.room.dayVotes.delete(voterId);
      }
    }
  }
  broadcastRoomState(context.room);
}

/**
 * @param {string} clientId
 * @param {{ targetId?: string }} payload
 */
function handleWerewolfVote(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context) {
    return;
  }

  const { room, player } = context;
  if (player.role !== 'werewolf' || !player.alive) {
    return;
  }

  const targetId = (payload?.targetId || '').toString();
  const target = room.players.get(targetId);
  if (!target || !target.alive) {
    return;
  }

  room.werewolfVotes.set(clientId, targetId);
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ targetId?: string }} payload
 */
function handleDayVote(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context) {
    return;
  }

  const { room, player } = context;
  if (!player.alive) {
    return;
  }

  const targetId = (payload?.targetId || '').toString();
  const target = room.players.get(targetId);
  if (!target || !target.alive) {
    return;
  }

  room.dayVotes.set(clientId, targetId);
  broadcastRoomState(room);
}

/**
 * @param {string} clientId
 * @param {{ scope?: string }} payload
 */
function handleClearVotes(clientId, payload) {
  const context = resolveContext(clientId);
  if (!context || !context.player.isHost) {
    return;
  }

  const scope = (payload?.scope || '').toString();
  if (scope === 'werewolf') {
    context.room.werewolfVotes.clear();
  }
  if (scope === 'day') {
    context.room.dayVotes.clear();
  }
  broadcastRoomState(context.room);
}

/**
 * @param {Room} room
 */
function broadcastRoomState(room) {
  for (const [playerId] of room.players) {
    const client = clients.get(playerId);
    if (!client) {
      continue;
    }

    const payload = buildStateForPlayer(room, playerId);
    send(client.ws, 'room_update', payload);
  }
}

/**
 * @param {Room} room
 * @param {string} type
 * @param {any} payload
 */
function broadcast(room, type, payload) {
  for (const [playerId] of room.players) {
    const client = clients.get(playerId);
    if (!client) {
      continue;
    }
    send(client.ws, type, payload);
  }
}

/**
 * @param {Room} room
 * @param {string} playerId
 */
function buildStateForPlayer(room, playerId) {
  const player = room.players.get(playerId);
  const isHost = player?.isHost ?? false;
  const isWerewolf = player?.role === 'werewolf';

  const players = [];
  for (const [, value] of room.players) {
    const revealRole = isHost || value.id === playerId || !value.alive;
    players.push({
      id: value.id,
      name: value.name,
      role: revealRole ? value.role : undefined,
      isHost: value.isHost,
      alive: value.alive,
    });
  }

  const payload = {
    roomCode: room.code,
    phase: room.phase,
    self: player ?? null,
    players,
    publicChat: room.messages.filter((message) => message.type === 'public'),
    werewolfChat: [],
    werewolfVotes: [],
    dayVotes: [],
  };

  if (isHost || isWerewolf) {
    payload.werewolfChat = room.messages.filter((message) => message.type === 'werewolf');
    payload.werewolfVotes = aggregateVotes(room, room.werewolfVotes);
  }

  if (isHost || room.phase === 'day') {
    payload.dayVotes = aggregateVotes(room, room.dayVotes);
  }

  return payload;
}

/**
 * @param {Room} room
 * @param {Map<string, string>} map
 */
function aggregateVotes(room, map) {
  const tallies = new Map();
  for (const [voterId, targetId] of map.entries()) {
    const target = room.players.get(targetId);
    if (!target) {
      continue;
    }
    const voters = tallies.get(targetId) || { targetId, targetName: target.name, votes: 0, voters: [] };
    voters.votes += 1;
    const voter = room.players.get(voterId);
    if (voter) {
      voters.voters.push(voter.name);
    }
    tallies.set(targetId, voters);
  }
  return Array.from(tallies.values());
}

/**
 * @param {string} roomCode
 */
function closeRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }
  for (const [playerId] of room.players) {
    const client = clients.get(playerId);
    if (client) {
      client.roomCode = null;
    }
  }
  rooms.delete(roomCode);
}

/**
 * @param {{ author: Player; text: string; type: 'public' | 'werewolf' }} params
 */
function createMessage({ author, text, type }) {
  return {
    id: randomUUID(),
    authorId: author.id,
    authorName: author.name,
    text,
    timestamp: new Date().toISOString(),
    type,
  };
}

/**
 * @param {string} clientId
 */
function resolveContext(clientId) {
  const entry = clients.get(clientId);
  if (!entry || !entry.roomCode) {
    return null;
  }
  const room = rooms.get(entry.roomCode);
  if (!room) {
    return null;
  }
  const player = room.players.get(clientId);
  if (!player) {
    return null;
  }
  return { room, player };
}

function trimMessages(room) {
  if (room.messages.length <= MAX_MESSAGES) {
    return;
  }
  room.messages.splice(0, room.messages.length - MAX_MESSAGES);
}

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 })
      .map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26)))
      .join('');
  } while (rooms.has(code));
  return code;
}

/**
 * @param {{ id: string; name: string; isHost: boolean }} params
 * @returns {Player}
 */
function createPlayer({ id, name, isHost }) {
  return {
    id,
    name,
    role: 'villager',
    isHost,
    alive: true,
  };
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, 500);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} type
 * @param {any} payload
 */
function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   role: string;
 *   isHost: boolean;
 *   alive: boolean;
 * }} Player
 */

/**
 * @typedef {{
 *   code: string;
 *   hostId: string;
 *   players: Map<string, Player>;
 *   phase: string;
 *   werewolfVotes: Map<string, string>;
 *   dayVotes: Map<string, string>;
 *   messages: Array<ChatMessage>;
 * }} Room
 */

/**
 * @typedef {{
 *   ws: import('ws').WebSocket;
 *   roomCode: string | null;
 * }} Client
 */

/**
 * @typedef {{
 *   id: string;
 *   authorId: string;
 *   authorName: string;
 *   text: string;
 *   timestamp: string;
 *   type: 'public' | 'werewolf';
 * }} ChatMessage
 */
