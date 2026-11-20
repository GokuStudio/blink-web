# Blink Web — Firebase Architecture & Setup

## 1. Project Configuration

- **Proposed Firebase Project ID**: `blink-web-demo`
- **Region**: Default multi-region or closest regional database.
- **Services Used**:
  1. **Firebase Authentication**: Anonymous auth for low-friction demo access + custom tokens.
  2. **Realtime Database**: Ephemeral rooms, device presence, real-time command routing, and live telemetry.
  3. **Cloud Firestore**: Persistent session summaries and historical activity.
  4. **Firebase Hosting**: Production web distribution and PWA hosting.
  5. **Firebase Local Emulator Suite**: Offline development and test verification.

---

## 2. Local Emulator Suite Setup

The project is pre-configured with secure-by-default emulator ports in `firebase.json`:

| Service | Emulator Port | Local URL |
| :--- | :--- | :--- |
| **Auth** | `9099` | `http://localhost:9099` |
| **Realtime Database** | `9000` | `http://localhost:9000` |
| **Cloud Firestore** | `8080` | `http://localhost:8080` |
| **Hosting** | `5000` | `http://localhost:5000` |
| **Emulator UI** | `4000` | `http://localhost:4000` |

### Starting Emulators
```bash
# Start Firebase emulators (requires Java installed on developer machine)
firebase emulators:start
```

Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env` to automatically route all frontend client calls to these local ports.

---

## 3. Security Rules Architecture

### Realtime Database (`database.rules.json`)
- **Default Deny**: Root `.read: false`, `.write: false`.
- **Rooms Access**: Unauthenticated public writes are blocked. Users must authenticate before joining or writing to a demo room.
- **Schema Validation**: Requires `revision` and `updatedAt` on state updates; requires `id`, `type`, and `createdAt` on commands.

### Cloud Firestore (`firestore.rules`)
- **Default Deny**: All unspecified documents are blocked.
- **User Records**: Only authenticated owners can read/write their user documents (`request.auth.uid == userId`).
- **Session Records**: Authenticated users can write session summaries tagged with their `userId`.

---

## 4. Production Deployment Safety
- **No Production Secrets in Git**: `.env` and `.env.*` are excluded by `.gitignore`.
- **No Service Accounts**: No Google Service Account JSON keys are bundled in the frontend client.
- **Production Resources**: Do NOT run `firebase deploy` until explicit team and lead approval.
