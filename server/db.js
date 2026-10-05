// MongoDB layer. If MONGODB_URI is not set (or the connection fails) every
// function falls back safely, so the game still works without a database.
const { MongoClient, ObjectId } = require('mongodb');

let db = null;

const DEFAULT_WORDS = [
  ['Pizza', 'Oven'], ['Dog', 'Cat'], ['Sun', 'Moon'],
  ['Coffee', 'Tea'], ['Beach', 'Pool'], ['Car', 'Bike'],
  ['Book', 'Pen'], ['Ice', 'Snow'], ['Bird', 'Fish'],
  ['King', 'Queen'], ['Gold', 'Silver'], ['Fire', 'Smoke'],
];

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('MONGODB_URI not set - running WITHOUT MongoDB');
    return;
  }
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'bluff_master');
    await db.collection('games').createIndex({ 'players.uid': 1, playedAt: -1 });
    // Seed the word bank the first time.
    const words = db.collection('words');
    if ((await words.countDocuments()) === 0) {
      await words.insertMany(DEFAULT_WORDS.map(([team, imposter]) => ({ team, imposter })));
    }
    console.log('MongoDB connected');
  } catch (e) {
    console.log('MongoDB connection failed:', e.message);
    db = null;
  }
}

const isConnected = () => db !== null;

/** Random [teamWord, imposterWord] from the words collection. */
async function randomWordPair() {
  if (db) {
    try {
      const [doc] = await db.collection('words').aggregate([{ $sample: { size: 1 } }]).toArray();
      if (doc) return [doc.team, doc.imposter];
    } catch (e) { console.log('word lookup failed:', e.message); }
  }
  return DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)];
}

async function saveRoom(room) {
  if (!db) return;
  try {
    await db.collection('rooms').insertOne({
      code: room.code,
      hostName: room.players[0]?.name,
      hostUid: room.players[0]?.uid || null,
      createdAt: new Date(),
    });
  } catch (e) { console.log('saveRoom failed:', e.message); }
}

/** game = { roomCode, winner, imposterName, teamWord, imposterWord, players:[{uid,name,wasImposter,won}] } */
async function saveGame(game) {
  if (!db) return;
  try {
    await db.collection('games').insertOne({ ...game, playedAt: new Date() });
  } catch (e) { console.log('saveGame failed:', e.message); }
}

async function history(uid) {
  if (!db) return [];
  const docs = await db.collection('games')
    .find({ 'players.uid': uid }).sort({ playedAt: -1 }).limit(50).toArray();
  return docs.map((g) => {
    const me = g.players.find((p) => p.uid === uid) || {};
    return {
      id: g._id.toString(),
      roomCode: g.roomCode,
      won: !!me.won,
      wasImposter: !!me.wasImposter,
      imposterName: g.imposterName,
      teamWord: g.teamWord,
      playedAt: g.playedAt,
    };
  });
}

async function deleteGame(id, uid) {
  if (!db) return false;
  // Validate ObjectId format to avoid crashes on malformed input
  if (!ObjectId.isValid(id)) return false;
  const _id = new ObjectId(id);
  await db.collection('games').updateOne({ _id }, { $pull: { players: { uid } } });
  await db.collection('games').deleteOne({ _id, players: { $size: 0 } });
  return true;
}

async function leaderboard() {
  if (!db) return [];
  return db.collection('games').aggregate([
    { $unwind: '$players' },
    { $match: { 'players.uid': { $ne: null } } },
    { $group: {
        _id: '$players.uid',
        name: { $last: '$players.name' },
        played: { $sum: 1 },
        wins: { $sum: { $cond: ['$players.won', 1, 0] } },
    } },
    { $sort: { wins: -1, played: 1 } },
    { $limit: 20 },
    { $project: { _id: 0, uid: '$_id', name: 1, played: 1, wins: 1 } },
  ]).toArray();
}

async function recentGames() {
  if (!db) return [];
  const docs = await db.collection('games').find().sort({ playedAt: -1 }).limit(20).toArray();
  return docs.map((g) => ({
    id: g._id.toString(),
    roomCode: g.roomCode,
    winner: g.winner,
    imposterName: g.imposterName,
    teamWord: g.teamWord,
    playerCount: g.players.length,
    playedAt: g.playedAt,
  }));
}

module.exports = {
  connect, isConnected, randomWordPair, saveRoom, saveGame,
  history, deleteGame, leaderboard, recentGames,
};
