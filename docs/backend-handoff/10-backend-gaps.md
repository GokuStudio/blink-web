# 10 — Screen-to-Data Mapping & Backend Gaps

This document provides Developer 2 with an exhaustive audit of Insights screens, classifying every UI element by its backend readiness, identifying exact source fields, and highlighting missing backend capabilities.

---

## 1. Readiness Classification Legend

- **[A] READY**: Supported directly by the implemented Firebase Realtime Database and service APIs.
- **[B] MOCK**: Supported by existing mock services (`MockRealtimeService`, `MockRoomService`).
- **[C] DERIVED**: Can be calculated or accumulated client-side from available live data streams.
- **[D] MISSING**: Backend fields, collections, or service methods are not yet implemented.
- **[E] LOCAL**: Self-contained client-side state managed entirely inside Insights.

---

## 2. Screen-by-Screen Data Mapping Matrix

### TODAY Screen (Live Monitoring & Quick Stats)

| UI Element | Status | Source Field / API | Mapping & Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Device Connected Status** | **[A] READY** | `realtime.subscribeToPresence()` | Check if member with role `'blink-device'` has active connection. |
| **Current Blink Rate** | **[A] READY** | `telemetry.currentBlinkRatePerMinute` | Rendered on the primary radial gauge / number card (bpm). |
| **Cumulative Blink Count** | **[A] READY** | `telemetry.blinkCount` or `state.monitoring.totalBlinksDetected` | Total blinks counted in the active session. |
| **Active Session Duration** | **[A] READY** | `state.monitoring.sessionDurationSeconds` | Elapsed time counter. Ticking derived from `sessionStartedAt`. |
| **Monitoring Mode (Active/Paused)** | **[A] READY** | `state.monitoring.mode` | `'idle' \| 'active' \| 'paused'`. Controls Play/Pause button state. |
| **Recent Nudge Alert** | **[C] DERIVED** | `state.expression.current === 'nudging'` | Detected when character enters `'nudging'` expression state. |
| **Live Activity Chart** | **[C] DERIVED** | Accumulating `DeviceTelemetry` | Accumulate incoming telemetry in a 60-sample sliding window array in client store. |

---

### INSIGHTS Screen (Historical Analytics & Trends)

| UI Element | Status | Source Field / API | Mapping & Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Blink Rate Trends (Hours)** | **[C] DERIVED** | Local session accumulator | Graph accumulated during current active session. |
| **Monitoring History (Days/Weeks)** | **[D] MISSING** | Firestore `/sessions/{sessionId}` | **Missing**: Firestore session writes not implemented. Use mock fixtures (`session-summary.json`). |
| **Daily, Weekly, Monthly Comparisons** | **[D] MISSING** | Aggregated Firestore queries | **Missing**: No historical database aggregation. Must use mock data or local storage. |
| **Break Consistency Score** | **[C] DERIVED** | `telemetry.eyeHealthScore` | Currently provided as a live composite score (0–100) on telemetry. |
| **Session Summaries List** | **[D] MISSING** | Firestore `getDocs(collection('sessions'))` | **Missing**: Historical summary documents. Developer 2 should render from local store or mock. |

---

### FOCUS Screen (Focus Sessions & Break Timers)

| UI Element | Status | Source Field / API | Mapping & Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Focus Timer** | **[E] LOCAL** | Client-side timer state | Pomodoro/focus countdown timer can be tracked in Insights component state. |
| **Start / Pause Monitoring** | **[A] READY** | `realtime.sendCommand({ type: 'START_MONITORING' })` | Dispatches command; device simulator updates `monitoring.mode`. |
| **Break Schedule (e.g. 20-20-20)** | **[A] READY** | `state.nudgeConfig.intervalMinutes` | Sourced from device nudge configuration (default: 20 min). |
| **Nudge Sensitivity Settings** | **[A] READY** | `realtime.sendCommand({ type: 'UPDATE_CONFIG' })` | Dispatches payload `{ config: { thresholdLowBlinkRate: 14 } }`. |

---

### DEVICE Screen (Pairing & Expression Controls)

| UI Element | Status | Source Field / API | Mapping & Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Pairing & Invite Code Input** | **[A] READY** | `roomService.joinRoomWithInvite()` | Redeems 4-digit code (`PAIR-XXXX`) and attaches controller to room. |
| **Current Expression Display** | **[A] READY** | `state.expression.current` | Shows `'idle'`, `'happy'`, `'sleepy'`, `'alert'`, etc. |
| **Device Online / Battery Status** | **[A] READY** | `state.batteryLevel`, `presence` | Battery percentage (0–100) and socket connection status. |
| **Expression Control Buttons** | **[A] READY** | `realtime.sendCommand({ type: 'SET_EXPRESSION' })` | Payload `{ expression: 'happy', durationSeconds: 5 }`. |
| **Test Nudge Button** | **[A] READY** | `realtime.sendCommand({ type: 'TRIGGER_NUDGE' })` | Payload `{ urgency: 'medium', reason: 'manual_test' }`. |
| **Command Feedback / Ack Toast** | **[A] READY** | `realtime.subscribeToCommandStatus()` | Displays toast when device acknowledges execution. |

---

### SETTINGS Screen (Preferences & Customization)

| UI Element | Status | Source Field / API | Mapping & Implementation Strategy |
| :--- | :--- | :--- | :--- |
| **Device Brightness Slider** | **[A] READY** | `realtime.sendCommand({ type: 'SET_BRIGHTNESS' })` | Payload `{ brightness: 0.8 }` (0.0 to 1.0). |
| **Nudge Sound & Haptic Toggles** | **[A] READY** | `realtime.sendCommand({ type: 'UPDATE_CONFIG' })` | Updates `nudgeConfig.soundEnabled`, `hapticEnabled`. |
| **Auto-Dismiss Timeout** | **[A] READY** | `state.nudgeConfig.autoDismissSeconds` | Configures alert timeout (default 5 seconds). |
| **Quiet Hours / Do Not Disturb** | **[D] MISSING** | None in `NudgeConfig` | **Missing**: `quietHours` not defined in `NudgeConfig` contract. Manage in Insights local state. |
| **Data Privacy / Simulation Mode** | **[A] READY** | `telemetry.isSimulated` | Invariant display: badges all data as simulated ergonomics data. |

---

## 3. Explicit Summary of Missing Backend Functionality

Developer 2 should be aware of the following backend limitations when designing Insights:

1. **No Firestore Session Persistence**:
   - The backend does not automatically write completed sessions to Firestore when a room closes. Historical trends cannot be queried from Firestore without additional backend work.
2. **Transient Telemetry (No Server-Side History)**:
   - `/rooms/$roomCode/telemetry` is a single latest-value object, not a historical list. Insights must accumulate incoming points in client memory to render time-series charts.
3. **No `TRIGGER_BLINK` Command**:
   - The contract defines `TRIGGER_NUDGE`, but does not have a separate `TRIGGER_BLINK` command. Use `TRIGGER_NUDGE` for testing alerts.
4. **No `PAUSE_MONITORING` Command Type**:
   - The contract defines `START_MONITORING` and `STOP_MONITORING`. To pause, dispatch `STOP_MONITORING` and retain the accumulated duration in Insights UI state.
5. **No Quiet Hours in `NudgeConfig`**:
   - `NudgeConfig` contains `enabled`, `intervalMinutes`, `thresholdLowBlinkRate`, `soundEnabled`, `hapticEnabled`, `autoDismissSeconds`, and `customMessage`. Quiet hours scheduling is currently an Insights client-side responsibility.
