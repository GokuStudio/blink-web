# Blink Web — Backend Data Structure & API Handoff

Welcome to the comprehensive technical backend handoff for **Blink Insights** (`src/features/insights/`).

This documentation package has been reverse-engineered directly from the production-ready, verified Firebase backend on `main` (commit milestone **F3C: Live Cloud Verification**).

---

## 🎯 Purpose for Developer 2 (Insights)

As Developer 2, you own the companion dashboard, telemetry analytics, focus sessions, device controls, and pairing experience in `src/features/insights/`.

This handoff is designed to provide you with **100% of the schemas, realtime paths, API methods, security invariants, sample fixtures, and React integration examples** needed to implement Insights without modifying the backend or guessing any payload structure.

---

## 📚 Document Index

| Document | Topic & Scope |
| :--- | :--- |
| **[01-architecture.md](./01-architecture.md)** | System overview, dual-interface topology (Device vs Insights), environment modes, cloud vs emulator. |
| **[02-typescript-contracts.md](./02-typescript-contracts.md)** | Exhaustive extraction of all 17+ TypeScript contracts in `src/shared/contracts/`, property tables, units, and validation rules. |
| **[03-sample-payloads.md](./03-sample-payloads.md)** | 26 category-by-category realistic JSON payloads with consistent sample identity keys (`BLINK-DEMO-001`, `sample-device-uid`, `sample-controller-uid`). |
| **[04-rtdb-schema.md](./04-rtdb-schema.md)** | Realtime Database node-by-node hierarchy, read/write security matrix, subscription models, deduplication, and conflict revision. |
| **[05-firestore-schema.md](./05-firestore-schema.md)** | Firestore status, why session persistence is currently not implemented, and the proposed production schema. |
| **[06-api-reference.md](./06-api-reference.md)** | Exhaustive API signatures for Auth, `IRoomService` / `FirebaseRoomService`, and `IRealtimeService` / `FirebaseRealtimeService`. |
| **[07-integration-workflows.md](./07-integration-workflows.md)** | 8 step-by-step end-to-end data flows with sequence diagrams, error cases, and UI responsibilities. |
| **[08-insights-integration.md](./08-insights-integration.md)** | Compilable React hook architectures (`useBlinkConnection`, `useBlinkTelemetry`, `useBlinkDeviceState`, `useBlinkCommands`, `useBlinkPresence`). |
| **[09-security-and-lifecycle.md](./09-security-and-lifecycle.md)** | Security rules runtime enforcement, atomic multi-path updates, command expiry, presence tracking, and cleanup. |
| **[10-backend-gaps.md](./10-backend-gaps.md)** | Screen-by-screen readiness audit (Today, Insights, Focus, Device, Settings) and explicit list of missing backend fields. |

---

## 📦 Machine-Readable Fixture Package

Located under `docs/backend-handoff/fixtures/`:
- `room-created.json` — Initial room creation payload with device owner
- `invitation-generated.json` — Ephemeral 10-minute pairing invite
- `controller-joined.json` — Redeemed membership record
- `room-membership.json` — Multi-member room roster
- `device-online.json` / `device-offline.json` / `device-reconnecting.json` — Presence states
- `initial-device-state.json` / `expression-changed-state.json` — Device state revisions
- `monitoring-started-state.json` / `monitoring-paused-state.json` — Active/paused sessions
- `live-telemetry.json` / `low-blink-telemetry.json` / `telemetry-stream.json` — Telemetry models
- `command-set-expression.json` / `command-trigger-nudge.json` — Command payloads
- `command-ack-success.json` / `command-ack-rejection.json` / `command-expired.json` — Acknowledgment states
- `nudge-config.json` / `nudge-event.json` — Nudge schemas
- `session-summary.json` — Historical session schema
- `room-closed.json` — Closed room lifecycle

---

## ⚡ Quick Start for Developer 2

1. **Wrap your component tree in `AuthProvider`**:
   ```tsx
   import { AuthProvider } from '@/shared/hooks/useAuth';
   <AuthProvider autoSignIn={true}>
     <InsightsApp />
   </AuthProvider>
   ```
2. **Access authenticated state with `useAuth()`**:
   ```tsx
   import { useAuth } from '@/shared/hooks/useAuth';
   const { userId, isAuthenticated } = useAuth();
   ```
3. **Redeem pairing invite via `FirebaseRoomService`**:
   ```tsx
   import { FirebaseRoomService } from '@/shared/realtime';
   const roomService = new FirebaseRoomService();
   await roomService.joinRoomWithInvite({ roomCode: 'BLINK-1234', inviteCode: 'PAIR-5678' });
   ```
4. **Connect to Realtime Database via `FirebaseRealtimeService`**:
   ```tsx
   import { FirebaseRealtimeService } from '@/shared/realtime';
   const realtime = new FirebaseRealtimeService();
   await realtime.connect('BLINK-1234');
   realtime.subscribeToTelemetry((tel) => console.log('Blink rate:', tel.currentBlinkRatePerMinute));
   ```
