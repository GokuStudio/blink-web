# 01 — System Architecture & Topology

## 1. System Overview

Blink is an AI Eye-Health Companion designed to prevent digital eye strain, encourage regular blinking, and provide actionable analytics for screen workers.

The system is split into two physically distinct user interfaces communicating asynchronously across the internet through Google Firebase:

```
┌─────────────────────────────────────────┐          ┌─────────────────────────────────────────┐
│        DEVICE INTERFACE (/device)       │          │       INSIGHTS DASHBOARD (/insights)    │
│            Owner: Developer 1           │          │            Owner: Developer 2           │
├─────────────────────────────────────────┤          ├─────────────────────────────────────────┤
│ • WebGL Expressive Eyes                 │          │ • Mobile & Desktop Analytics Dashboard  │
│ • Character State Machine               │          │ • Realtime Blink Rate Visualizer        │
│ • Local Monitoring Simulator            │          │ • Focus Sessions & Timer Controls       │
│ • Nudge Animation Player                │          │ • Character Expression Controller       │
│ • Telemetry Publisher                   │          │ • Device Pairing & Invitation Scanner   │
└────────────────────┬────────────────────┘          └────────────────────▲────────────────────┘
                     │                                                    │
                     │ Publishes Telemetry / State                        │ Subscribes to Telemetry
                     │ Listens for Commands                               │ Sends Commands
                     │ Acknowledges Execution                             │ Receives Acknowledgments
                     ▼                                                    │
┌─────────────────────────────────────────────────────────────────────────┴────────────────────┐
│                             FIREBASE REALTIME DATABASE (Singapore)                          │
│                                  blink-web-demo-32e0e                                       │
│                                                                                              │
│   rooms/$roomId/                                                                             │
│     ├── members/          <- Bi-directional atomic pairing & role assignment                │
│     ├── invitations/      <- 10-minute short-lived pairing tokens                            │
│     ├── presence/         <- Realtime multi-connection heartbeat & onDisconnect              │
│     ├── state/            <- Authoritative device status, expression & settings              │
│     ├── telemetry/        <- Latest-value eye-health metrics stream (isSimulated: true)     │
│     └── commands/         <- Idempotent dispatched commands & execution acknowledgments     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Strict Architectural Boundaries

1. **Feature Boundary Isolation**:
   - `src/features/blink-device/` is owned exclusively by Developer 1.
   - `src/features/insights/` is owned exclusively by Developer 2.
   - `src/shared/contracts/` is locked. Neither developer may unilaterally alter these TypeScript definitions.
2. **Physical Bezel Architecture**:
   - In desktop demo mode (`/demo`), the physical device bezel is rendered as a static 2D image asset on Layer 3 over the WebGL Canvas (Layer 2).
   - In mobile device mode (`/device`), the bezel is completely omitted.
   - The bezel is **never modeled in Three.js or 3D**.
3. **Simulated vs Real Data**:
   - All telemetry generated or mocked during development/demo must carry `isSimulated: true`.
   - Never represent simulated blink rates as medical diagnostic claims.

---

## 3. Client Role Topology

Firebase security rules strictly distinguish between three client roles defined in `src/shared/contracts/connection.ts`:

| Role | Primary User | RTDB Write Permissions | RTDB Read Permissions |
| :--- | :--- | :--- | :--- |
| `blink-device` | Virtual Eye Hardware / Phone A | `rooms/$roomId/state`<br>`rooms/$roomId/telemetry`<br>`rooms/$roomId/commands/$cmdId` (ack only)<br>`rooms/$roomId/invitations` (creation) | Complete room subtree |
| `companion-insights` | Controller / Phone B | `rooms/$roomId/commands/$cmdId` (dispatch)<br>`rooms/$roomId/presence/$uid`<br>`rooms/$roomId/members/$uid` (via invite redemption) | Complete room subtree |
| `integrated-demo` | Single-browser dev harness | Both device and controller write paths | Complete room subtree |

---

## 4. Runtime Environments

The backend is engineered with three interchangeable operational profiles managed in `src/config/env.ts` and `src/shared/firebase/config.ts`:

### A. Live Cloud Firebase (Target Project: `blink-web-demo-32e0e`)
- **Realtime Database**: `https://blink-web-demo-32e0e-default-rtdb.asia-southeast1.firebasedatabase.app` (Singapore / `asia-southeast1`).
- **Auth Domain**: `blink-web-demo-32e0e.firebaseapp.com`.
- **Security**: Closed-by-default security rules enforced by Google Cloud infrastructure.
- **Activation**: Set `.env.local`:
  ```bash
  VITE_USE_FIREBASE_EMULATORS=false
  VITE_ENABLE_PRODUCTION_FIREBASE=true
  ```

### B. Local Firebase Emulators (Development Default)
- **Auth Emulator**: `http://127.0.0.1:9099`
- **RTDB Emulator**: `http://127.0.0.1:9000?ns=blink-web-demo-32e0e-default-rtdb`
- **Firestore Emulator**: `http://127.0.0.1:8080`
- **UI Dashboard**: `http://127.0.0.1:4000`
- **Activation**: Run `npm run emulators` and set `.env.local`:
  ```bash
  VITE_USE_FIREBASE_EMULATORS=true
  VITE_ENABLE_PRODUCTION_FIREBASE=false
  ```

### C. In-Memory Mock Services (Offline Fallback)
- Implemented in `MockRoomService` and `MockRealtimeService`.
- Operates entirely in browser RAM without network connectivity or emulators.
- Allows Developer 2 to build the entire Insights UI even when completely offline.
