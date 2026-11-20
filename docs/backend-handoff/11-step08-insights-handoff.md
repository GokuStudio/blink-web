# 11 — Developer 2 Integration Handoff: Real Device Telemetry & Commands (Step 08 & 08B)

This document provides Developer 2 (`src/features/insights/`) with the precise source-derived specifications for consuming live camera-derived eye tracking metrics and dispatching remote commands to Blink Device over Firebase Realtime Database.

---

## 1. Realtime Database Path Mapping

All interactions operate under `/rooms/$roomId/` using standard room pairing (`BLINK-DEMO` or active pairing code):

| RTDB Path | Direction | Authoritative Writer | Purpose / Invariants |
| :--- | :--- | :--- | :--- |
| `/rooms/$roomId/telemetry` | Device ➔ Insights | `blink-device` | Latest coalesced telemetry snapshot (~1s). Overwrites with current stream values. |
| `/rooms/$roomId/state` | Device ➔ Insights | `blink-device` | Authoritative device display state (`expression`, `monitoring`, `brightness`). |
| `/rooms/$roomId/presence/$uid` | Bidirectional | Current authenticated client | Socket heartbeat & connection state (`connected`, `disconnected`, `stale`). |
| `/rooms/$roomId/commands/$cmdId` | Insights ➔ Device | `companion-insights` | Remote commands dispatched from Insights controllers. |
| `/rooms/$roomId/commands/$cmdId/acknowledgment` | Device ➔ Insights | `blink-device` | Command acknowledgment (`executed`, `rejected`, `expired`). |

---

## 2. Telemetry Interface & Field Specifications

Device writes adhere strictly to `DeviceTelemetry` (`src/shared/contracts/telemetry.ts`):

```typescript
export interface DeviceTelemetry {
  eventId: string;                  // Unique event UUID: "telem-<timestamp>-<hash>"
  schemaVersion: number;            // Currently 1
  timestamp: number;                // Wall-clock epoch milliseconds (Date.now())
  isSimulated: boolean;             // false = Real camera session; true = Synthetic demo session
  deviceId?: string;                // e.g. "blink-device-01"
  blinkCount?: number;              // Cumulative bilateral blinks detected in active session
  sessionDurationSeconds?: number;  // Valid tracked observation seconds (cumulative)
  
  // Real-Time Blink Rates
  currentBlinkRatePerMinute: number;// 60s rolling rate in BPM (0 when observing or face lost)
  averageBlinkRatePerMinute: number;// Session cumulative average BPM (requires >= 30s observation)
  
  // Composite Ergonomic Health Scores (0-100 demo scale, non-clinical)
  eyeFatigueScore: number;          // 0-100 (15 healthy, 55 warning, 78 eligible, 90 nudging, 0 suspended/idle)
  eyeHealthScore: number;           // 100 - eyeFatigueScore (0 when suspended/idle)
  
  // Real-Time Face Presence Indicator
  eyeAspectRatio?: {
    left: number;                   // Measured eye openness (0.0 to 1.0)
    right: number;                  // Measured eye openness (0.0 to 1.0)
  };
}
```

---

## 3. Telemetry State Representation Matrix (Step 08B Audit)

Subscribers must distinguish between true observed zeros, missing data, inactivity, and synthetic simulation:

| State Condition | `isSimulated` | `currentBlinkRatePerMinute` | `sessionDurationSeconds` | `eyeAspectRatio` | `eyeFatigueScore` | `monitoring.mode` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Valid Observation with Measured Zero (30s Stare)** | `false` | `0` | $\ge 30$ (incrementing) | `{ left, right }` (defined) | `78` or `90` (alert active) | `'active'` |
| **B. Camera Active, Face Temporarily Lost** | `false` | `0` | Frozen at last valid sec | `undefined` (omitted) | `0` (suspended) | `'active'` |
| **C. Camera Permission Denied / Error** | `false` | `0` | `0` | `undefined` (omitted) | `0` | `'idle'` |
| **D. Monitoring Intentionally Stopped** | `false` | `0` | Frozen | `undefined` (omitted) | `0` | `'idle'` |
| **E. Synthetic / Demo Telemetry** | `true` | $\sim 18$ | Increments simulated | `{ left, right }` | $15\text{--}90$ | `'active'` |
| **F. Network Disconnected (Local Tracking Active)** | Local `false` | Local rate | Increments locally | Local `{ left, right }` | Local score | Local `'active'` |

### How to Distinguish Condition A (True Stare) from Condition B (Face Lost):
1. **`eyeAspectRatio`**: When face is detected and tracked, `eyeAspectRatio` is present (`{ left, right }`). When the user looks away or face is lost, `eyeAspectRatio` is completely omitted (`undefined`).
2. **`sessionDurationSeconds`**: Only increments when face is reliably verified ($\ge 70\%$ confidence). When face is lost, duration stops incrementing.
3. **`eyeFatigueScore`**: During a true stare, fatigue score escalates (`55` warning $\rightarrow$ `78` eligible $\rightarrow$ `90` nudging). During face loss, fatigue evaluation is suspended (`0`).

---

## 4. Denominator & Calculation Rules

1. **Current Blink Rate**:
   - Calculated over a 60-second circular buffer window: `(blinksInWindow / windowSeconds) * 60`.
   - Requires at least 30 seconds of valid observation time. Reports `0` during the first 30 seconds of baseline acquisition.
2. **Average Blink Rate**:
   - Calculated as: `blinkCount / (sessionDurationSeconds / 60)`.
   - Denominator strictly uses `sessionDurationSeconds` (valid face-tracked minutes only), completely excluding time spent looking away.
   - Requires $\ge 30$ seconds of observation to avoid initial small-denominator division spikes. Reports `0` before 30 seconds.
3. **Cumulative Counters**:
   - Cumulative bilateral `blinkCount` and valid `sessionDurationSeconds` are preserved across network reconnections and room switches.
4. **Data Freshness**:
   - Cloud records are written at ~1000ms intervals with wall-clock epoch timestamps (`Date.now()`). If `Date.now() - telemetry.timestamp > 3000ms`, subscribers should treat the stream as stale/offline.

---

## 5. Prototype Heuristics Clarification (Fatigue & Health Scores)

- `eyeFatigueScore` and `eyeHealthScore` are **non-clinical prototype heuristics** defined on a 0–100 demo scale in `src/shared/contracts/telemetry.ts`.
- They are derived directly from the deterministic stare timer and rolling blink rate thresholds of the local `WellnessEngine`.
- **They do not constitute medical diagnostic measurements** and must not be presented to users as clinical eye examinations.

---

## 6. Supported Commands & Acknowledgment Flow

Insights can dispatch commands to the device using `realtimeService.sendCommand(command)`:

### Supported Commands
1. **`SET_EXPRESSION`**:
   - Payload: `{ expression: "happy" | "sleepy" | "alert" | "thinking" | "listening" | "idle", durationSeconds?: 5 }`
   - Sets physical device expression. If `durationSeconds` is specified, device returns to previous expression automatically.
2. **`TRIGGER_NUDGE`**:
   - Payload: `{ urgency?: "low" | "medium" | "high", reason?: "manual_test" }`
   - Plays approved WebGL nudge choreography (red/blue pulse) and initiates 45-second cooldown.
3. **`START_MONITORING`**:
   - Starts active wellness observation and stare interval timer.
4. **`STOP_MONITORING`**:
   - Halts active observation and stare timers.
5. **`SET_BRIGHTNESS`**:
   - Payload: `{ brightness: 0.8 }` (0.0 to 1.0).
6. **`UPDATE_CONFIG`**:
   - Payload: `{ config: { thresholdLowBlinkRate: 14 } }`.

### Unsupported Commands (Rejected)
- `TRIGGER_BLINK`: **Rejected**. Do not send `TRIGGER_BLINK`; use `TRIGGER_NUDGE` for testing alerts.
- `PAUSE_MONITORING`: **Rejected**. Use `STOP_MONITORING` to halt session tracking.

---

## 7. Security Invariants & Validation

The Firebase RTDB security rules in `database.rules.json` enforce:
- `.read`: Authenticated members of the room only.
- `.write`: Authenticated users with role `'blink-device'` or `'integrated-demo'` in active, unexpired rooms.
- `.validate`: `newData.child('isSimulated').isBoolean() && newData.hasChildren(['timestamp', 'isSimulated', 'currentBlinkRatePerMinute'])`.
  - Non-boolean values (e.g. strings or numbers) are rejected with `permission_denied`.
  - Both `isSimulated: false` (real camera) and `isSimulated: true` (synthetic demo) pass rule validation.
