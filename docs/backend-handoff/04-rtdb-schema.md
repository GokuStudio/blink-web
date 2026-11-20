# 04 — Actual Firebase Realtime Database Structure

This document details the exact JSON tree, node contracts, security rule enforcement, and ownership matrices implemented in `database.rules.json` and `src/shared/realtime/services/`.

---

## 1. Complete Implemented RTDB Hierarchy

```
rooms/
  $roomId/                                <- Room root: BLINK-DEMO-001
    roomCode: string
    schemaVersion: number                 <- 1
    createdAt: number                     <- Epoch ms
    createdBy: string                     <- Creator UID (blink-device)
    expiresAt: number                     <- Default: now + 24 hours
    status: "active" | "closed"
    closedAt?: number
    closedBy?: string
    │
    ├── members/
    │     $uid/                           <- User ID of member
    │       uid: string
    │       role: "blink-device" | "companion-insights" | "integrated-demo"
    │       joinedAt: number
    │       status: "connected" | "disconnected"
    │       inviteCode?: string           <- Code redeemed to join
    │       lastActiveAt?: number
    │       userAgent?: string
    │
    ├── invitations/
    │     $inviteCode/                    <- PAIR-XXXX (4-digit random)
    │       id: string                    <- Matches $inviteCode
    │       roomId: string
    │       role: "companion-insights"
    │       createdAt: number
    │       expiresAt: number             <- Default: now + 10 minutes
    │       consumed: boolean
    │       consumedBy: string | null
    │       consumedAt: number | null
    │
    ├── presence/
    │     $uid/                           <- User ID of client
    │       uid: string
    │       role: DeviceRole
    │       status: ConnectionStatus
    │       lastSeen: number              <- Epoch ms / serverTimestamp()
    │       connections/
    │         $connectionId/              <- conn_<random>_<timestamp>
    │           connectedAt: number
    │           userAgent?: string
    │
    ├── state/                            <- Authoritative Device State
    │     schemaVersion: number           <- 1
    │     revision: number                <- Monotonically increasing integer
    │     deviceId: string
    │     deviceName: string
    │     status: ConnectionStatus
    │     brightness: number              <- 0.0 to 1.0
    │     expression: ExpressionState     <- Current animation target & gaze
    │     monitoring: MonitoringState     <- Blinks detected, duration, mode
    │     nudgeConfig: NudgeConfig        <- Alert intervals & thresholds
    │     latestTelemetry: DeviceTelemetry
    │     updatedAt: number               <- Epoch ms
    │
    ├── telemetry/                        <- Latest Telemetry Stream Node
    │     eventId: string
    │     schemaVersion: number
    │     timestamp: number
    │     isSimulated: boolean            <- MANDATORY: true
    │     currentBlinkRatePerMinute: number
    │     averageBlinkRatePerMinute: number
    │     eyeFatigueScore: number
    │     eyeHealthScore: number
    │     deviceId?: string
    │     blinkCount?: number
    │     sessionDurationSeconds?: number
    │
    └── commands/
          $commandId/                     <- cmd-<timestamp> / UUID
            id: string                    <- Matches $commandId
            schemaVersion: number
            type: DeviceCommandType
            targetDeviceId: string        <- Device UID
            senderId: string              <- Controller UID
            payload: object
            createdAt: number             <- Must be <= now + 5000ms
            expiresAt: number             <- Must be > now
            status: "pending" | "executed" | "rejected" | "expired" | "timed_out"
            acknowledged?: boolean
            acknowledgedAt?: number
            acknowledgment?: CommandAcknowledgment
```

---

## 2. Realtime Access & Security Matrix

| RTDB Node Path | Authorized Writer | Authorized Reader | Value Type | Security Rule Invariant | Insights UI Consumer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/rooms/$roomId` | `blink-device` creator | Room members only | `DemoRoom` object | Only on room creation (`!data.exists() && newData.child('createdBy').val() === auth.uid`) | Pairing Screen / Device Header |
| `/rooms/$roomId/status` | Room creator (`createdBy`) | Room members only | `"active" \| "closed"` | Only creator can close active room (`newData.val() === 'closed'`) | App Header / Connection Banner |
| `/rooms/$roomId/members/$uid` | Authenticated user (`$uid`) | Room members only | `RoomMember` | Atomic invite redemption requirement; role immutable once joined | Device Status / Participant List |
| `/rooms/$roomId/invitations/$inviteCode` | `blink-device` (create); invitee (consume) | Members OR unconsumed invite | `RoomInvitation` | Mutual coupling: consuming requires creating member record atomically | Pairing Screen / QR Generator |
| `/rooms/$roomId/presence/$uid` | Authenticated user (`$uid`) | Room members only | `UserPresence` | User can only write own presence; validated role must match membership | Device Status Indicator |
| `/rooms/$roomId/state` | `blink-device` only | Room members only | `DeviceState` | `newData.child('revision').val() > data.child('revision').val()` | Expression Control / Device Settings |
| `/rooms/$roomId/telemetry` | `blink-device` only | Room members only | `DeviceTelemetry` | `newData.child('isSimulated').val() === true` | Today Screen / Live Gauge / Activity |
| `/rooms/$roomId/commands/$cmdId` (create) | `companion-insights` only | Room members only | `DeviceCommand` | `newData.child('senderId').val() === auth.uid && newData.child('expiresAt').val() > now` | Expression Buttons / Focus Controls |
| `/rooms/$roomId/commands/$cmdId` (ack) | `blink-device` only | Room members only | `DeviceCommand` | Immutable command fields; device updates status and acknowledgment | Command Feedback / Toast System |

---

## 3. Node Specification & Lifecycle Behavior

### `/rooms/$roomId/invitations/$inviteCode`
- **Writer**: `FirebaseRoomService.createInvitation`
- **Reader**: `FirebaseRoomService.getInvitation`, `joinRoomWithInvite`
- **TTL**: 10 minutes (`now + 600,000 ms`).
- **Security Invariant**: Atomic mutual coupling. Security rules require that marking `consumed: true` is accompanied in the same multi-path write by creating `/members/$uid` with `inviteCode: $inviteCode`.

### `/rooms/$roomId/presence/$uid/connections/$connectionId`
- **Writer**: `FirebaseRealtimeService.connect`
- **Lifecycle**: Temporary connection leaf.
- **Teardown**: Registered with `onDisconnect(myConnRef).remove()` and `onDisconnect(lastSeenRef).set(serverTimestamp())`.
- **Cleanup**: Node is deleted automatically by Firebase servers when the tab is closed, socket drops, or browser refreshes.

### `/rooms/$roomId/state`
- **Model**: Authoritative latest-state document.
- **Revision Control**: Device increments `revision` by +1 on every update. Security rules reject writes where `newData.revision <= data.revision` to prevent out-of-order overwrite.

### `/rooms/$roomId/telemetry`
- **Model**: Latest-value stream.
- **Retention**: Transient. Each write overwrites the single `/telemetry` object. Insights consumes the live stream by listening to `onValue`. Historical retention requires accumulating samples in client memory or persisting to Firestore.

### `/rooms/$roomId/commands/$commandId`
- **Deduplication**: Device tracks processed command IDs in a `Set<string>`.
- **Expiration**: Commands with `expiresAt <= Date.now()` are skipped or marked `expired`.
