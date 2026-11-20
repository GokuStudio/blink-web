# 09 — Security, Timing & Data Validity

This document outlines the security rules, concurrency controls, timing invariants, and lifecycle behaviors enforced in `database.rules.json` and the Firebase client services.

---

## 1. Security Rules Runtime Enforcement

Firebase Realtime Database security rules operate on a **strict, closed-by-default model**:
- Root-level read and write are completely forbidden:
  ```json
  ".read": false,
  ".write": false
  ```
- All access is gated under `/rooms/$roomId`.

### A. Room Read Authorization
```json
".read": "auth != null && data.child('members').child(auth.uid).exists()"
```
- Only authenticated users who have an existing member record inside `/rooms/$roomId/members/$uid` can read room state, telemetry, commands, or presence.
- Unauthenticated requests or requests from third-party authenticated users who are not room members are rejected with `Permission denied`.

### B. Atomic Invitation Redemption & Anti-Tampering
Security rules enforce bi-directional mutual coupling to prevent race conditions or membership forgery:
1. **Writing a member record** requires that an unconsumed, unexpired invitation is atomically marked `consumed: true` with `consumedBy: auth.uid` in the exact same update operation.
2. **Consuming an invitation** requires that the member record is created in the same write.
3. Concurrent redemption attempts by two users fail atomically for the loser with `Permission denied`.
4. Role escalation is blocked: a user cannot escalate their role to `blink-device` when redeeming a `companion-insights` invitation.

---

## 2. Command Lifecycle & Deduplication

### A. Expiration & Staleness
- Controller must provide `expiresAt` (typically `now + 10,000ms`).
- Security rules enforce: `newData.child('expiresAt').val() > now && newData.child('createdAt').val() <= now + 5000`.
- The device skips any command where `expiresAt <= Date.now()` and publishes an `'expired'` acknowledgment.

### B. Deduplication
- Because Firebase listeners (`onChildAdded`, `onValue`) may re-trigger upon socket reconnection, `FirebaseRealtimeService` maintains an in-memory `Set<string>` of processed command IDs (`this.processedCommandIds`).
- Duplicate command deliveries are filtered out and will not be executed twice.

### C. Acknowledgment Conformance
- When the device writes an acknowledgment (`acknowledgeCommand`), security rules enforce immutability:
  ```json
  "newData.child('senderId').val() === data.child('senderId').val() && newData.child('id').val() === data.child('id').val() && newData.child('type').val() === data.child('type').val()"
  ```
- Neither client can alter the original command parameters during acknowledgment.

---

## 3. Presence & Disconnection Lifecycle

### A. Multi-Connection Tracking
- A user may have multiple open browser tabs or windows connected to the same room.
- Each tab generates a unique `connectionId`: `conn_<random>_<timestamp>`.
- The user is considered **online** (`status: 'connected'`) as long as at least one connection node exists under `/rooms/$roomCode/presence/$uid/connections`.
- When one tab closes, only its individual connection node is removed; the user remains online if other tabs are active.

### B. Heartbeat & Disconnect Triggers
- Client registers server-side triggers using Firebase `onDisconnect`:
  ```typescript
  await onDisconnect(myConnRef).remove();
  await onDisconnect(lastSeenRef).set(serverTimestamp());
  ```
- If the browser crashes, computer sleeps, or cellular data is cut, Firebase servers automatically delete the connection node and write the `lastSeen` timestamp.

---

## 4. State Revision Control

To prevent race conditions between controller commands and local device updates:
- Every device state write updates `revision` (+1).
- Security rule validates:
  ```json
  "(!data.exists() || newData.child('revision').val() > data.child('revision').val())"
  ```
- An outdated state payload written with a lower or equal revision number is rejected by RTDB.

---

## 5. Telemetry Invariants & Disclaimer

1. **Mandatory Simulation Tag**:
   - Security rule: `newData.child('isSimulated').val() === true`.
   - Any write to `/telemetry` lacking `isSimulated: true` is rejected by the server.
2. **Medical Disclaimer**:
   - Blink Web is an ergonomics and habit-coaching tool.
   - All eye-strain scores, blink rates, and fatigue metrics are simulated or heuristic approximations.
   - **Never represent simulated or heuristic metrics as clinical medical diagnoses.**
