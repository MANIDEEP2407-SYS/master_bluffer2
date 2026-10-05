# Bluff Master — Multiplayer Party Bluffing Game

A real-time multiplayer bluffing game built with Flutter + Node.js + Socket.IO + MongoDB + Firebase.

## Architecture

```
┌──────────────────────┐
│   Flutter Mobile App  │
└──────────┬───────────┘
           │
 ┌─────────┴──────────┐
 │                     │
 ▼                     ▼
┌─────────────┐  ┌──────────────────┐
│  Firebase    │  │ Node.js Backend  │
│             │  │ Express+Socket.IO │
│ Auth        │  └────────┬─────────┘
│ Google SSO  │           │
│ Anonymous   │           ▼
│ Firestore   │     ┌──────────┐
└─────────────┘     │ MongoDB  │
                    └──────────┘
```

**Firebase** handles: Authentication, Google Sign-In, Anonymous auth, Firestore (user stats, per-user game history, room bookings).

**MongoDB** handles: Global game history, leaderboard, recent games, word pairs.

---

## Quick Start (Development)

### 1. Backend

```bash
cd server
cp .env.example .env          # Edit with your MongoDB URI
npm ci
npm start                     # Runs on :3000
```

### 2. Flutter

```bash
cd bluff_master
flutter clean
flutter pub get
flutter run                   # Connects to http://10.0.2.2:3000 on emulator
```

For a **physical device**, pass your machine's LAN IP:
```bash
flutter run --dart-define=SERVER_URL=http://192.168.1.X:3000
```

---

## Production Deployment

### Backend (Render / Railway / Fly.io)

Any Node.js host that supports **WebSockets** (not serverless).

Required environment variables:
| Variable | Example |
|----------|---------|
| `PORT` | `3000` (usually set by host) |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster/bluff_master` |
| `CLIENT_ORIGIN` | `*` (for mobile) or specific web origin |
| `NODE_ENV` | `production` |

Health check: `GET /health`

### Flutter Release APK

1. **Generate keystore** (once):
```bash
keytool -genkey -v -keystore release-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias bluff-master-release
```

2. **Create `android/key.properties`** from the example:
```
storePassword=YOUR_PASSWORD
keyPassword=YOUR_PASSWORD
keyAlias=bluff-master-release
storeFile=../release-keystore.jks
```

3. **Register SHA fingerprints** in Firebase Console (see [FIREBASE_SETUP.md](bluff_master/FIREBASE_SETUP.md))

4. **Build**:
```bash
cd bluff_master
flutter clean
flutter pub get
flutter build apk --release --dart-define=SERVER_URL=https://your-backend.example.com
flutter build appbundle --release --dart-define=SERVER_URL=https://your-backend.example.com
```

Output:
- APK: `build/app/outputs/flutter-apk/app-release.apk`
- AAB: `build/app/outputs/bundle/release/app-release.aab`

---

## Firebase Configuration

See [bluff_master/FIREBASE_SETUP.md](bluff_master/FIREBASE_SETUP.md) for detailed steps.

**Critical**: Google Sign-In on Android requires SHA-1/SHA-256 fingerprints added to Firebase Console, then re-download `google-services.json`.

---

## Environment Variables Summary

### Server `.env`
```
PORT=3000
MONGODB_URI=mongodb+srv://...
CLIENT_ORIGIN=*
NODE_ENV=production
```

### Flutter build args
```
--dart-define=SERVER_URL=https://your-backend.example.com
```

---

## Test Matrix

### Authentication
- [ ] Cold start → splash → auth gate
- [ ] Email register + login
- [ ] Google Sign-In
- [ ] Anonymous (Guest) login
- [ ] Logout → back to login

### Multiplayer (2+ devices)
- [ ] Create room → room code shown
- [ ] Join room with code
- [ ] Toggle ready
- [ ] Host starts game (≥2 players)
- [ ] Word reveal phase
- [ ] Clue phase (submit clue)
- [ ] Voting phase (vote for imposter)
- [ ] Results shown
- [ ] Auto-reset to lobby after 10s
- [ ] Back to Lobby button works

### Edge Cases
- [ ] Player disconnects during lobby
- [ ] Host disconnects → new host assigned
- [ ] Invalid room code
- [ ] Room full (>10)
- [ ] Join after game started
- [ ] Duplicate vote ignored

### Backend APIs
- [ ] `GET /health` → `{ok: true, mongo: true}`
- [ ] `GET /api/leaderboard` → top 20 players
- [ ] `GET /api/recent` → recent 20 games
- [ ] `GET /api/history/:uid` → user's games
- [ ] `DELETE /api/history/:id/:uid` → removes entry
