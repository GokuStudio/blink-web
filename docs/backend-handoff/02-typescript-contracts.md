# 02 — Complete TypeScript Data Contracts

All contracts reside in `src/shared/contracts/` and are re-exported via `src/shared/contracts/index.ts`. These contracts are locked and represent the single source of truth for Blink Web.

---

## 1. Connection & Presence Contracts (`src/shared/contracts/connection.ts`)

### `ConnectionStatus`
```typescript
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'stale';
```
- **Source**: `src/shared/contracts/connection.ts` (Lines 8–14)
- **Status**: Implemented & active in runtime.
- **Description**: Lifecycle connection status used across both Device and Controller sessions.
- **Valid Values**:
  - `'disconnected'`: Client has closed connection or has not yet initiated connection.
  - `'connecting'`: Initial handshake underway.
  - `'connected'`: Active connection confirmed via `.info/connected` snapshot.
  - `'reconnecting'`: Temporary socket break; client attempting automated recovery.
  - `'failed'`: Terminal network error or permission rejection.
  - `'stale'`: Client has no active connection nodes and `lastSeen` was >30,000 ms ago.

---

### `DeviceRole`
```typescript
export type DeviceRole = 'blink-device' | 'companion-insights' | 'integrated-demo';
```
- **Source**: `src/shared/contracts/connection.ts` (Line 16)
- **Status**: Implemented & actively validated in security rules.
- **Valid Values**:
  - `'blink-device'`: Virtual eye character client.
  - `'companion-insights'`: Dashboard controller client.
  - `'integrated-demo'`: Dual-role client for single-screen testing.

---

### `PresenceConnection`
```typescript
export interface PresenceConnection {
  connectedAt: number;
  userAgent?: string;
}
```
- **Source**: `src/shared/contracts/connection.ts` (Lines 18–21)
- **Status**: Implemented & active in RTDB.
- **Properties**:
  - `connectedAt` (Required, `number`): Unix timestamp in milliseconds when this tab/socket connected.
  - `userAgent` (Optional, `string`): Client navigator user agent string.

---

### `UserPresence`
```typescript
export interface UserPresence {
  uid: string;
  role: DeviceRole;
  status: ConnectionStatus;
  lastSeen: number; // Unix timestamp ms
  connections?: Record<string, PresenceConnection>;
}
```
- **Source**: `src/shared/contracts/connection.ts` (Lines 23–29)
- **Status**: Implemented & active in runtime.
- **Properties**:
  - `uid` (Required, `string`): Firebase Auth User ID.
  - `role` (Required, `DeviceRole`): Role assigned during room creation or invite redemption.
  - `status` (Required, `ConnectionStatus`): Derived connection status (`connected` if `connections` count > 0; `stale` if inactive > 30s; otherwise `disconnected`).
  - `lastSeen` (Required, `number`): Unix timestamp in milliseconds, automatically updated via `onDisconnect(lastSeenRef).set(serverTimestamp())`.
  - `connections` (Optional, `Record<string, PresenceConnection>`): Map of active connection IDs (`conn_<id>`). Removed on disconnect via Firebase `onDisconnect().remove()`.

---

### `PresenceHeartbeat` & `ReconnectPolicy`
```typescript
export interface PresenceHeartbeat {
  clientId: string;
  role: DeviceRole;
  status: ConnectionStatus;
  lastSeenAt: number;
  metadata?: {
    browser?: string;
    os?: string;
    isPwa?: boolean;
    batteryLevel?: number;
  };
}

export interface ReconnectPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  reconnectTimeoutMs: number;
}
```
- **Source**: `src/shared/contracts/connection.ts` (Lines 31–49)
- **Status**: Planned / contract only. Runtime presence currently uses `UserPresence` and RTDB `.info/connected`.

---

## 2. Character & Expression Contracts (`src/shared/contracts/expressions.ts`)

### `BlinkExpressionType`
```typescript
export type BlinkExpressionType =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'alert'
  | 'thinking'
  | 'listening'
  | 'speaking'
  | 'nudging'
  | 'offline'
  | 'error';
```
- **Source**: `src/shared/contracts/expressions.ts` (Lines 6–16)
- **Status**: Implemented in Device and Insights interfaces.
- **Description**: Supported 2D/WebGL facial animation expressions for the Blink eyes character.

---

### `GazeTarget` & `ExpressionState`
```typescript
export interface GazeTarget {
  x: number; // Normalized -1.0 to 1.0
  y: number; // Normalized -1.0 to 1.0
}

export interface ExpressionState {
  current: BlinkExpressionType;
  targetExpression: BlinkExpressionType;
  transitionProgress: number; // 0.0 to 1.0
  intensity: number; // 0.0 to 1.0
  gaze: GazeTarget;
  isBlinking: boolean;
  blinkFrequencyPerMin: number;
  lastChangedAt: number; // Unix timestamp ms
}
```
- **Source**: `src/shared/contracts/expressions.ts` (Lines 18–32)
- **Status**: Implemented in Device WebGL renderer; transmitted via `DeviceState.expression`.
- **Default Value**: `DEFAULT_EXPRESSION_STATE` (`current: 'idle'`, `targetExpression: 'idle'`, `transitionProgress: 1.0`, `intensity: 1.0`, `gaze: {x: 0, y: 0}`, `isBlinking: false`, `blinkFrequencyPerMin: 18`).

---

## 3. Monitoring Contracts (`src/shared/contracts/monitoring.ts`)

### `MonitoringMode` & `MonitoringState`
```typescript
export type MonitoringMode = 'idle' | 'active' | 'paused' | 'calibrating';

export interface MonitoringState {
  mode: MonitoringMode;
  sessionStartedAt?: number; // Unix timestamp ms
  sessionDurationSeconds: number; // Elapsed monitoring duration in seconds
  totalBlinksDetected: number; // Cumulative blinks counted in current session
  isSimulated: boolean; // MANDATORY: true for simulated sensor telemetry
  sampleIntervalMs: number; // Sampling interval in ms (default 1000)
  lastSampleTimestamp: number; // Unix timestamp ms
}
```
- **Source**: `src/shared/contracts/monitoring.ts` (Lines 6–16)
- **Status**: Implemented & active in `DeviceState.monitoring`.
- **Default Value**: `DEFAULT_MONITORING_STATE` (`mode: 'idle'`, `sessionDurationSeconds: 0`, `totalBlinksDetected: 0`, `isSimulated: true`, `sampleIntervalMs: 1000`).

---

## 4. Nudge & Alert Contracts (`src/shared/contracts/nudge.ts`)

### `NudgeUrgency` & `NudgeConfig`
```typescript
export type NudgeUrgency = 'low' | 'medium' | 'high';

export interface NudgeConfig {
  enabled: boolean;
  intervalMinutes: number; // Cadence interval in minutes (default 20)
  thresholdLowBlinkRate: number; // Blinks per minute threshold trigger (default 12)
  soundEnabled: boolean;
  hapticEnabled: boolean;
  autoDismissSeconds: number; // Timeout before nudge clears (default 5)
  customMessage?: string;
}
```
- **Source**: `src/shared/contracts/nudge.ts` (Lines 6–16)
- **Status**: Implemented & active in `DeviceState.nudgeConfig`.
- **Default Value**: `DEFAULT_NUDGE_CONFIG` (`enabled: true`, `intervalMinutes: 20`, `thresholdLowBlinkRate: 12`, `soundEnabled: false`, `hapticEnabled: true`, `autoDismissSeconds: 5`).

---

### `NudgeEvent`
```typescript
export interface NudgeEvent {
  id: string; // UUID / stable event ID
  schemaVersion: number;
  timestamp: number; // Unix timestamp ms
  urgency: NudgeUrgency;
  reason: 'prolonged_stare' | 'low_blink_rate' | 'break_reminder' | 'manual_test';
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: number;
}
```
- **Source**: `src/shared/contracts/nudge.ts` (Lines 27–36)
- **Status**: Implemented in mock simulator; planned for historical Firestore logging.

---

## 5. Live Telemetry Contract (`src/shared/contracts/telemetry.ts`)

### `DeviceTelemetry`
```typescript
export interface DeviceTelemetry {
  eventId: string; // Stable UUID
  schemaVersion: number; // 1
  timestamp: number; // Unix timestamp ms
  isSimulated: boolean; // MANDATORY: Explicit separation between simulated and real measurements
  deviceId?: string;
  blinkCount?: number;
  sessionDurationSeconds?: number;
  
  // Blink metrics
  currentBlinkRatePerMinute: number; // Instantaneous rate over 60s sliding window
  averageBlinkRatePerMinute: number; // Session cumulative average rate
  
  // Health & Fatigue scores (0-100 demo scale)
  eyeFatigueScore: number; // 0 = rested, 100 = severely fatigued
  eyeHealthScore: number; // 100 = optimal, 0 = poor
  
  // Detailed tracking markers (for future camera-based ML)
  eyeAspectRatio?: {
    left: number;
    right: number;
  };
  screenDistanceCm?: number;
  ambientLightLux?: number;
}
```
- **Source**: `src/shared/contracts/telemetry.ts` (Lines 6–30)
- **Status**: Implemented & actively streamed over `rooms/$roomId/telemetry`.
- **Safety Enforcement**: Realtime Database security rules strictly validate:
  ```json
  "newData.child('isSimulated').val() === true && newData.hasChildren(['timestamp', 'isSimulated', 'currentBlinkRatePerMinute'])"
  ```
- **Default Value**: `DEFAULT_TELEMETRY` (`eventId: 'telemetry-init'`, `schemaVersion: 1`, `isSimulated: true`, `currentBlinkRatePerMinute: 16`, `averageBlinkRatePerMinute: 18`, `eyeFatigueScore: 18`, `eyeHealthScore: 92`).

---

## 6. Device State & Command Contracts (`src/shared/contracts/device.ts`)

### `DeviceState`
```typescript
export interface DeviceState {
  schemaVersion: number;
  revision: number; // Incremented on state changes for conflict resolution
  deviceId: string;
  deviceName: string;
  status: ConnectionStatus;
  batteryLevel?: number; // 0 to 100 percentage
  brightness: number; // 0.0 to 1.0 normalized
  expression: ExpressionState;
  monitoring: MonitoringState;
  nudgeConfig: NudgeConfig;
  latestTelemetry: DeviceTelemetry;
  updatedAt: number; // Unix timestamp ms
}
```
- **Source**: `src/shared/contracts/device.ts` (Lines 12–25)
- **Status**: Implemented & stored at `rooms/$roomId/state`.
- **Security Rule**: Enforces revision strictly monotonically increasing (`newData.child('revision').val() > data.child('revision').val()`).

---

### `DeviceCommandType` & `CommandExecutionStatus`
```typescript
export type DeviceCommandType =
  | 'SET_EXPRESSION'
  | 'TRIGGER_NUDGE'
  | 'START_MONITORING'
  | 'STOP_MONITORING'
  | 'UPDATE_CONFIG'
  | 'RESET_STATE'
  | 'SET_BRIGHTNESS';

export type CommandExecutionStatus =
  | 'pending'
  | 'received'
  | 'executed'
  | 'rejected'
  | 'expired'
  | 'timed_out';
```
- **Source**: `src/shared/contracts/device.ts` (Lines 44–59)
- **Status**: Implemented in Realtime command pipeline.

---

### `CommandAcknowledgment`
```typescript
export interface CommandAcknowledgment {
  commandId: string;
  status: CommandExecutionStatus;
  acknowledgedAt: number; // Unix timestamp ms
  acknowledgedBy: string; // Device UID
  resultMessage?: string;
}
```
- **Source**: `src/shared/contracts/device.ts` (Lines 61–67)
- **Status**: Implemented & attached to `rooms/$roomId/commands/$commandId`.

---

### `DeviceCommand<TPayload>`
```typescript
export interface DeviceCommand<TPayload = unknown> {
  id: string; // Unique command UUID for idempotency
  schemaVersion: number; // 1
  targetDeviceId: string; // Device UID
  senderId: string; // Controller UID
  type: DeviceCommandType;
  payload: TPayload;
  createdAt: number; // Unix timestamp ms (must be <= now + 5000)
  expiresAt: number; // Command expiration (must be > now)
  status?: CommandExecutionStatus;
  acknowledged?: boolean;
  acknowledgedAt?: number;
  acknowledgment?: CommandAcknowledgment;
}
```
- **Source**: `src/shared/contracts/device.ts` (Lines 69–82)
- **Status**: Implemented & stored at `rooms/$roomId/commands/$commandId`.

---

### Specialized Command Payloads
```typescript
export interface SetExpressionPayload {
  expression: BlinkExpressionType;
  durationSeconds?: number;
}

export interface UpdateNudgeConfigPayload {
  config: Partial<NudgeConfig>;
}
```
- **Source**: `src/shared/contracts/device.ts` (Lines 84–91)
- **Status**: Implemented.

---

## 7. Room & Pairing Contracts (`src/shared/contracts/room.ts`)

### `RoomStatus` & `RoomMember`
```typescript
export type RoomStatus = 'active' | 'expired' | 'closed';

export interface RoomMember {
  uid: string;
  role: DeviceRole;
  joinedAt: number; // Unix timestamp ms
  lastActiveAt?: number;
  status: ConnectionStatus;
  userAgent?: string;
  inviteCode?: string; // Invitation code used to join
}
```
- **Source**: `src/shared/contracts/room.ts` (Lines 9–19)
- **Status**: Implemented & stored at `rooms/$roomId/members/$uid`.

---

### `RoomInvitation`
```typescript
export interface RoomInvitation {
  id: string; // e.g. 'PAIR-4921'
  roomId: string; // e.g. 'BLINK-DEMO-001'
  role: DeviceRole; // Typically 'companion-insights'
  createdAt: number;
  expiresAt: number; // Default TTL: 10 minutes
  consumed: boolean;
  consumedBy?: string | null;
  consumedAt?: number | null;
}
```
- **Source**: `src/shared/contracts/room.ts` (Lines 21–30)
- **Status**: Implemented & stored at `rooms/$roomId/invitations/$inviteCode`.

---

### `DemoRoom`
```typescript
export interface DemoRoom {
  roomCode: string; // e.g. 'BLINK-DEMO-001'
  schemaVersion: number; // 1
  createdAt: number;
  createdBy: string; // Device UID
  expiresAt: number; // Default: 24h from creation
  status?: RoomStatus;
  closedAt?: number | null;
  closedBy?: string | null;
  deviceState: DeviceState;
  members: Record<string, RoomMember>;
  invitations?: Record<string, RoomInvitation>;
}
```
- **Source**: `src/shared/contracts/room.ts` (Lines 32–44)
- **Status**: Implemented & stored at `rooms/$roomId`.

---

## 8. Historical Session Summary Contract (`src/shared/contracts/session.ts`)

```typescript
export interface SessionSummary {
  sessionId: string;
  userId: string;
  schemaVersion: number;
  isSimulated: boolean;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  averageBlinksPerMinute: number;
  lowestBlinkRate: number;
  highestBlinkRate: number;
  totalNudgesDelivered: number;
  totalNudgesAcknowledged: number;
  finalEyeHealthScore: number;
  notes?: string;
}
```
- **Source**: `src/shared/contracts/session.ts` (Lines 6–21)
- **Status**: Defined in contracts and locked down in `firestore.rules`; runtime Firestore service is **not yet implemented**.
