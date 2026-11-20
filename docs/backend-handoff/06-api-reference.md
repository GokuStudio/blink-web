# 06 — Complete Backend API Reference

This document provides exhaustive, accurate reference documentation for all public APIs in `src/shared/firebase/` and `src/shared/realtime/`.

---

## 1. Authentication APIs

### `useAuth()` Hook
- **Import**: `import { useAuth } from '@/shared/hooks/useAuth';`
- **Signature**: `useAuth(): AuthContextValue`
- **Return Type**:
  ```typescript
  interface AuthContextValue {
    user: AuthUser | null;
    userId: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    signInAnonymous: () => Promise<AuthUser>;
    signOut: () => Promise<void>;
  }
  ```
- **Context Provider**: Requires `<AuthProvider autoSignIn={true}>` wrapped at application root.
- **Side Effects**: Automatically signs in on mount if `autoSignIn` is `true`. Subscribes to Firebase Auth state changes.
- **Cleanup**: Handled automatically on unmount.
- **Environment**: Works across Cloud, Emulator, and Offline Mock modes.

---

### Low-Level Auth Service Functions (`src/shared/firebase/auth.ts`)

#### `signInAnonymous(options?: { useEmulators?: boolean }): Promise<AuthUser>`
- **Import**: `import { signInAnonymous } from '@/shared/firebase';`
- **Sync/Async**: Asynchronous.
- **Auth Required**: None (initiates anonymous session).
- **Errors**: In cloud mode (`isProductionFirebaseEnabled && !useEmulators`), throws `FirebaseError` on network failure. In dev/offline mode, falls back to mock user (`mock-anon-...`).
- **Return**: `AuthUser { uid: string, isAnonymous: boolean, displayName?: string | null }`.

#### `signOutUser(): Promise<void>`
- **Import**: `import { signOutUser } from '@/shared/firebase';`
- **Sync/Async**: Asynchronous.
- **Side Effects**: Clears Firebase token, resets current user to `null`, notifies listeners.

#### `onAuthUserChanged(callback: (user: AuthUser | null) => void): Unsubscribe`
- **Import**: `import { onAuthUserChanged } from '@/shared/firebase';`
- **Return**: Unsubscribe function `() => void`. Must be called in `useEffect` cleanup.

#### `getCurrentAuthUser(options?: { useEmulators?: boolean }): AuthUser | null`
- **Import**: `import { getCurrentAuthUser } from '@/shared/firebase';`
- **Sync/Async**: Synchronous getter.

---

## 2. Room Service API (`IRoomService`)

Implementations:
- `FirebaseRoomService` in `src/shared/realtime/services/firebase-room.service.ts`
- `MockRoomService` in `src/shared/realtime/services/mock-room.service.ts`

### `createRoom(options: CreateRoomOptions): Promise<DemoRoom>`
- **Signature**: `createRoom(options: CreateRoomOptions): Promise<DemoRoom>`
- **Options**:
  ```typescript
  interface CreateRoomOptions {
    roomCode: string;
    role?: DeviceRole; // default 'blink-device'
    expiresInMs?: number; // default 24h (86,400,000 ms)
    generateInitialInvite?: boolean; // default true
  }
  ```
- **Auth Required**: Authenticated user (`auth != null`, non-mock in cloud).
- **Authorized Role**: Device / Room creator (`blink-device` or `integrated-demo`).
- **Side Effects**: Writes `/rooms/$roomCode` with initial device state and member record. Optionally generates `PAIR-XXXX` invite.
- **Errors**: Throws if unauthenticated or room already exists.

---

### `createInvitation(options: CreateInviteOptions): Promise<RoomInvitation>`
- **Signature**: `createInvitation(options: CreateInviteOptions): Promise<RoomInvitation>`
- **Options**:
  ```typescript
  interface CreateInviteOptions {
    roomCode: string;
    role?: DeviceRole; // default 'companion-insights'
    expiresInMs?: number; // default 10 min (600,000 ms)
  }
  ```
- **Authorized Role**: Room member with `blink-device` or `integrated-demo`.
- **Side Effects**: Writes node `/rooms/$roomCode/invitations/$inviteCode`.
- **Return**: `RoomInvitation` object containing generated 4-digit invite code (`PAIR-XXXX`).

---

### `joinRoomWithInvite(options: JoinRoomOptions): Promise<RoomMember>`
- **Signature**: `joinRoomWithInvite(options: JoinRoomOptions): Promise<RoomMember>`
- **Options**:
  ```typescript
  interface JoinRoomOptions {
    roomCode: string;
    inviteCode: string;
  }
  ```
- **Auth Required**: Authenticated user (`auth.uid`).
- **Target Role for Insights**: Joins as `companion-insights`.
- **Side Effects**: Executes atomic multi-path update:
  - Creates `/rooms/$roomCode/members/$uid`.
  - Sets `/rooms/$roomCode/invitations/$inviteCode/consumed` to `true`.
  - Sets `consumedBy: $uid` and `consumedAt: now`.
- **Errors**:
  - Throws `'Invitation does not exist'` if inviteCode is invalid.
  - Throws `'Invitation has already been consumed'` if already used.
  - Throws `'Invitation has expired'` if `expiresAt <= Date.now()`.
  - Throws `Permission denied` if atomic coupling rules fail.

---

### `getRoom(roomCode: string): Promise<DemoRoom | null>`
- **Signature**: `getRoom(roomCode: string): Promise<DemoRoom | null>`
- **Authorized Role**: Only authenticated members of the room can read room data.

---

### `getInvitation(roomCode: string, inviteCode: string): Promise<RoomInvitation | null>`
- **Signature**: `getInvitation(roomCode: string, inviteCode: string): Promise<RoomInvitation | null>`
- **Authorization**: Open to any authenticated user if the invitation is unconsumed and unexpired.

---

### `subscribeToRoom(roomCode: string, callback: (room: DemoRoom | null) => void): () => void`
- **Signature**: Returns unsubscribe cleanup function.
- **Side Effects**: Attaches `onValue` listener on `/rooms/$roomCode`.

---

### `subscribeToMembers(roomCode: string, callback: (members: Record<string, RoomMember>) => void): () => void`
- **Signature**: Returns unsubscribe cleanup function.
- **Side Effects**: Attaches `onValue` listener on `/rooms/$roomCode/members`.

---

### `leaveRoom(roomCode: string): Promise<void>`
- **Signature**: Sets own member status to `'disconnected'` at `/rooms/$roomCode/members/$uid/status`.

---

### `closeRoom(roomCode: string): Promise<void>`
- **Signature**: Sets `/rooms/$roomCode/status` to `'closed'`, `closedAt: now`, and `closedBy: uid`.
- **Authorized Role**: Only the room creator (`createdBy`) can close the room.

---

## 3. Realtime Service API (`IRealtimeService`)

Implementations:
- `FirebaseRealtimeService` in `src/shared/realtime/services/firebase-realtime.service.ts`
- `MockRealtimeService` in `src/shared/realtime/services/mock-realtime.service.ts`

### `connect(roomCode: string, clientId?: string): Promise<boolean>`
- **Signature**: `connect(roomCode: string, clientId?: string): Promise<boolean>`
- **Auth Required**: Authenticated user (`ensureAuthUid()`).
- **Side Effects**:
  - Sets connection status to `'connecting'`.
  - Registers active connection under `/rooms/$roomCode/presence/$uid/connections/$connectionId`.
  - Configures `onDisconnect(connRef).remove()`.
  - Configures `onDisconnect(lastSeenRef).set(serverTimestamp())`.
  - Updates `/rooms/$roomCode/presence/$uid` with `status: 'connected'` and `lastSeen: now`.
  - Awaits initial `.info/connected` confirmation and transitions status to `'connected'`.
- **Return**: `Promise<boolean>` resolving `true` when connection is established.

---

### `disconnect(): Promise<void>`
- **Signature**: `disconnect(): Promise<void>`
- **Side Effects**:
  - Removes active connection node `/connections/$connectionId`.
  - Updates `lastSeen` timestamp.
  - Cleans up and detaches all active Firebase listeners.
  - Clears command deduplication cache.
  - Transitions connection status to `'disconnected'`.

---

### `getConnectionStatus(): ConnectionStatus`
- **Signature**: Synchronous getter returning current status (`'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'stale'`).

---

### `onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void`
- **Signature**: Subscribes to status transitions. Immediately fires callback with current status. Returns unsubscribe function.

---

### `subscribeToTelemetry(callback: (telemetry: DeviceTelemetry) => void): () => void`
- **Signature**: Attaches `onValue` listener on `/rooms/$roomCode/telemetry`.
- **Callback Payload**: `DeviceTelemetry` object containing latest metrics.
- **Return**: Unsubscribe function.

---

### `publishTelemetry(telemetry: DeviceTelemetry): Promise<void>`
- **Authorized Role**: `blink-device` only (`companion-insights` will be rejected by rules).
- **Side Effects**: Overwrites `/rooms/$roomCode/telemetry` with `isSimulated: true` and current timestamp.

---

### `subscribeToDeviceState(callback: (state: DeviceState) => void): () => void`
- **Signature**: Attaches `onValue` listener on `/rooms/$roomCode/state`.
- **Callback Payload**: Current `DeviceState` (or `INITIAL_DEVICE_STATE` if empty).
- **Return**: Unsubscribe function.

---

### `publishDeviceState(state: DeviceState): Promise<void>`
- **Authorized Role**: `blink-device` only. Overwrites `/rooms/$roomCode/state`.

---

### `updateDeviceState(partialState: Partial<DeviceState>): Promise<void>`
- **Authorized Role**: `blink-device` only. Increments `revision` by +1 and merges `partialState`.

---

### `sendCommand(command: DeviceCommand, options?: { timeoutMs?: number }): Promise<boolean>`
- **Signature**: `sendCommand(command: DeviceCommand, options?: { timeoutMs?: number }): Promise<boolean>`
- **Authorized Role**: `companion-insights` or `integrated-demo`.
- **Arguments**:
  - `command`: `DeviceCommand` object (`id`, `type`, `payload`, `targetDeviceId`).
  - `options.timeoutMs`: Expiration duration in ms (default: `10000ms`).
- **Side Effects**: Injects command into `/rooms/$roomCode/commands/$command.id` with `senderId: uid`, `status: 'pending'`, `createdAt: now`, and `expiresAt: now + timeout`.
- **Return**: Resolves `true` when write completes.

---

### `subscribeToCommandStatus(commandId: string, callback: (ack: CommandAcknowledgment) => void, timeoutMs?: number): () => void`
- **Signature**: Listens on `/rooms/$roomCode/commands/$commandId` for device acknowledgment.
- **Callback Payload**: `CommandAcknowledgment` (`status: 'executed' | 'rejected' | 'expired' | 'timed_out'`).
- **Timeout**: If device does not acknowledge within `timeoutMs`, fires synthetic `'timed_out'` status.
- **Return**: Unsubscribe function.

---

### `acknowledgeCommand(commandId: string, status: CommandExecutionStatus, resultMessage?: string): Promise<void>`
- **Authorized Role**: `blink-device` only.
- **Side Effects**: Updates command with `status`, `acknowledged: true`, `acknowledgedAt: now`, and `acknowledgment` payload.

---

### `subscribeToPresence(callback: (presenceMap: Record<string, UserPresence>) => void): () => void`
- **Signature**: Listens on `/rooms/$roomCode/presence`.
- **Callback Payload**: Map of `UserPresence` records for all participants in the room.
- **Return**: Unsubscribe function.

---

### `isDeviceOnline(deviceUid?: string): Promise<boolean>`
- **Signature**: Inspects active connections for the room's device. Returns `true` if any connection is active.
