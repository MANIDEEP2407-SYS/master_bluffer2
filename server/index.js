const dns = require('dns');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Use public DNS for SRV lookups (some ISP/corporate DNS blocks MongoDB SRV records)
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
}

const mongo = require('./db');

const app = express();

// --------------- CORS (configurable) ---------------
const clientOrigin = process.env.CLIENT_ORIGIN || '*';
const corsOrigins = clientOrigin === '*' ? true : clientOrigin.split(',').map(s => s.trim());
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '16kb' }));

// --------------- REST API (MongoDB) ---------------
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mongo: mongo.isConnected(),
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development',
  });
});

const safe = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    console.error('api error', e.message);
    res.status(500).json({ error: 'server error' });
  }
};

app.get('/api/leaderboard', safe(() => mongo.leaderboard()));
app.get('/api/recent', safe(() => mongo.recentGames()));
app.get('/api/history/:uid', safe((req) => mongo.history(req.params.uid)));
app.delete('/api/history/:id/:uid', safe(async (req) => ({ ok: await mongo.deleteGame(req.params.id, req.params.uid) })));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigins } });

// --------------- Word pairs (fallback) ---------------
const WORD_PAIRS = [
  ['Pizza', 'Oven'], ['Dog', 'Cat'], ['Sun', 'Moon'],
  ['Coffee', 'Tea'], ['Beach', 'Pool'], ['Car', 'Bike'],
  ['Book', 'Pen'], ['Ice', 'Snow'], ['Bird', 'Fish'],
  ['King', 'Queen'], ['Gold', 'Silver'], ['Fire', 'Smoke'],
];

// --------------- Room state ---------------
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Iterative approach avoids potential stack overflow
  for (let attempt = 0; attempt < 100; attempt++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(c)) return c;
  }
  // Extremely unlikely fallback
  return Date.now().toString(36).toUpperCase().slice(-6).padStart(6, 'A');
}

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) return room;
  }
  return null;
}

// --------------- Phase helpers ---------------

function clearRoomTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startCluePhase(room) {
  // Guard: room may have been deleted while waiting
  if (!rooms.has(room.code)) return;
  room.phase = 'clue';
  room.clues = [];
  room.timer = 60;
  room.roundEnded = false;
  io.to(room.id).emit('phase_change', { phase: 'clue', timer: room.timer });
  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(room.id).emit('timer_tick', room.timer);
    if (room.timer <= 0) {
      clearRoomTimer(room);
      startVotingPhase(room);
    }
  }, 1000);
}

function startVotingPhase(room) {
  if (!rooms.has(room.code)) return;
  clearRoomTimer(room);
  room.phase = 'voting';
  room.votes = {};
  room.timer = 60;
  io.to(room.id).emit('phase_change', { phase: 'voting', timer: room.timer });
  io.to(room.id).emit('players_updated', room.players);
  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(room.id).emit('timer_tick', room.timer);
    if (room.timer <= 0) {
      clearRoomTimer(room);
      endRound(room);
    }
  }, 1000);
}

/** Idempotent — safe to call more than once per round. */
function endRound(room) {
  // Prevent double-fire: timer expiry + all-votes-in can race.
  if (room.roundEnded) return;
  room.roundEnded = true;

  clearRoomTimer(room);
  room.phase = 'results';

  const voteCounts = {};
  room.players.forEach(p => (voteCounts[p.id] = 0));
  Object.values(room.votes).forEach(votedId => {
    if (voteCounts[votedId] != null) voteCounts[votedId]++;
  });

  let maxVotes = 0, mostVoted = null, ties = [];
  for (const [pid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) { maxVotes = count; mostVoted = pid; ties = [pid]; }
    else if (count === maxVotes) { ties.push(pid); }
  }
  if (ties.length > 1) mostVoted = ties[Math.floor(Math.random() * ties.length)];

  const imposterCaught = mostVoted === room.imposterId;
  const winner = imposterCaught ? 'team' : 'imposter';

  io.to(room.id).emit('round_results', {
    imposterId: room.imposterId,
    imposterName: room.players.find(p => p.id === room.imposterId)?.name,
    mostVotedId: mostVoted,
    mostVotedName: room.players.find(p => p.id === mostVoted)?.name,
    voteCounts, winner,
    teamWord: room.teamWord,
    imposterWord: room.imposterWord,
  });

  mongo.saveGame({
    roomCode: room.code,
    winner,
    imposterName: room.players.find(p => p.id === room.imposterId)?.name,
    teamWord: room.teamWord,
    imposterWord: room.imposterWord,
    players: room.players.map(p => {
      const wasImposter = p.id === room.imposterId;
      return { uid: p.uid, name: p.name, wasImposter, won: wasImposter ? winner === 'imposter' : winner === 'team' };
    }),
  });

  // Auto-reset after 10 s — but only if the room still exists
  room._resetTimer = setTimeout(() => {
    if (rooms.has(room.code)) resetToLobby(room);
  }, 10000);
}

async function resetToLobby(room) {
  if (!rooms.has(room.code)) return;
  clearRoomTimer(room);
  if (room._resetTimer) { clearTimeout(room._resetTimer); room._resetTimer = null; }

  room.phase = 'lobby';
  room.votes = {};
  room.clues = [];
  room.imposterId = null;
  room.roundEnded = false;
  room.players.forEach(p => { p.isReady = false; delete p.hasGivenClue; });

  const pair = await mongo.randomWordPair();
  room.teamWord = pair[0];
  room.imposterWord = pair[1];

  io.to(room.id).emit('room_reset', room);
  io.to(room.id).emit('players_updated', room.players);
}

/** Remove a player from their room and clean up. */
function removePlayerFromRooms(socketId) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx === -1) continue;

    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      clearRoomTimer(room);
      if (room._resetTimer) clearTimeout(room._resetTimer);
      rooms.delete(code);
    } else {
      // Reassign host if needed
      if (room.hostId === socketId) {
        room.hostId = room.players[0].id;
        io.to(code).emit('host_changed', { hostId: room.hostId });
      }
      io.to(code).emit('players_updated', room.players);
    }
  }
}

// --------------- Validation helpers ---------------
function isStr(v, maxLen = 100) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

// --------------- Socket.IO ---------------
io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('create_room', async (data) => {
    if (!data || !isStr(data.playerName, 20)) return;
    const playerName = data.playerName.trim().slice(0, 20);
    const uid = isStr(data.uid, 128) ? data.uid : null;

    const code = genCode();
    const pair = await mongo.randomWordPair();
    const room = {
      id: code,
      code,
      hostId: socket.id,
      players: [{ id: socket.id, uid, name: playerName, isReady: false }],
      phase: 'lobby',
      teamWord: pair[0], imposterWord: pair[1],
      imposterId: null,
      votes: {},
      clues: [],
      timer: 0,
      timerInterval: null,
      roundEnded: false,
      _resetTimer: null,
    };
    rooms.set(code, room);
    mongo.saveRoom(room);
    socket.join(code);
    io.to(code).emit('room_created', room);
    console.log('room created', code);
  });

  socket.on('join_room', (data) => {
    if (!data || !isStr(data.roomId, 6) || !isStr(data.playerName, 20)) return;
    const roomId = data.roomId.toUpperCase();
    const playerName = data.playerName.trim().slice(0, 20);
    const uid = isStr(data.uid, 128) ? data.uid : null;

    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.players.length >= 10) return socket.emit('error', { message: 'Room already full' });
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Game already started' });
    // Prevent duplicate joins
    if (room.players.some(p => p.id === socket.id)) return;

    room.players.push({ id: socket.id, uid, name: playerName, isReady: false });
    socket.join(room.code);
    socket.emit('room_joined', room);
    io.to(room.code).emit('players_updated', room.players);
  });

  socket.on('leave_room', () => {
    removePlayerFromRooms(socket.id);
  });

  socket.on('toggle_ready', () => {
    const room = getRoomBySocket(socket.id);
    if (room && room.phase === 'lobby') {
      const p = room.players.find(x => x.id === socket.id);
      if (p) {
        p.isReady = !p.isReady;
        io.to(room.id).emit('players_updated', room.players);
      }
    }
  });

  socket.on('start_game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
    if (room.phase !== 'lobby') return; // prevent double-start

    const idx = Math.floor(Math.random() * room.players.length);
    room.imposterId = room.players[idx].id;
    room.players.forEach(p => {
      const isImp = p.id === room.imposterId;
      io.to(p.id).emit('role_assigned', { isImposter: isImp, word: isImp ? room.imposterWord : room.teamWord });
    });
    io.to(room.id).emit('phase_change', { phase: 'word-reveal', timer: 5 });
    setTimeout(() => startCluePhase(room), 5000);
  });

  socket.on('submit_clue', (data) => {
    if (!data || !isStr(data.clue, 50)) return;
    const room = getRoomBySocket(socket.id);
    if (!room || room.phase !== 'clue') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasGivenClue) return;
    player.hasGivenClue = true;
    const clue = data.clue.trim().slice(0, 50);
    const playerName = player.name; // use server-known name, not client-supplied
    room.clues.push({ playerId: socket.id, playerName, clue });
    io.to(room.id).emit('clue_submitted', room.clues);
  });

  socket.on('submit_vote', (data) => {
    if (!data || !isStr(data.votedPlayerId, 50)) return;
    const room = getRoomBySocket(socket.id);
    if (!room || room.phase !== 'voting') return;
    if (room.votes[socket.id]) return; // already voted
    // Validate votedPlayerId is actually in the room
    if (!room.players.some(p => p.id === data.votedPlayerId)) return;
    room.votes[socket.id] = data.votedPlayerId;
    io.to(room.id).emit('votes_updated', {
      votesCast: Object.keys(room.votes).length,
      totalPlayers: room.players.length,
      hasVoted: true,
    });
    if (Object.keys(room.votes).length === room.players.length) {
      endRound(room);
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnected', socket.id);
    removePlayerFromRooms(socket.id);
  });
});

// --------------- Start ---------------
const PORT = process.env.PORT || 3000;
mongo.connect().finally(() => {
  server.listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));
});
