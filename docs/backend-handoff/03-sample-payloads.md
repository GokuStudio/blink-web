# 03 — Valid Sample Payloads & Schemas

This catalog provides realistic, schema-valid payloads across all 26 operational categories in Blink Web.

### Standard Test Identity Keys
- **Room Code**: `BLINK-DEMO-001`
- **Device UID (Phone A)**: `sample-device-uid`
- **Device Hardware ID**: `sample-blink-device`
- **Controller UID (Phone B)**: `sample-controller-uid`
- **Pairing Invitation Code**: `PAIR-4921`
- **Timestamp Base**: `1795185000000` (Epoch milliseconds)

---

## Payload Categories 1–4: Room & Pairing

### 1. Room Created (Persisted RTDB Root Node: `/rooms/BLINK-DEMO-001`)
*Data Model: Literal Persisted Firebase Node*
```json
{
  "roomCode": "BLINK-DEMO-001",
  "schemaVersion": 1,
  "createdAt": 1795185000000,
  "createdBy": "sample-device-uid",
  "expiresAt": 1795271400000,
  "status": "active",
  "deviceState": {
    "schemaVersion": 1,
    "revision": 1,
    "deviceId": "sample-blink-device",
    "deviceName": "Blink [BLINK-DEMO-001]",
    "status": "connected",
    "brightness": 1.0,
    "expression": {
      "current": "idle",
      "targetExpression": "idle",
      "transitionProgress": 1.0,
      "intensity": 1.0,
      "gaze": { "x": 0, "y": 0 },
      "isBlinking": false,
      "blinkFrequencyPerMin": 18,
      "lastChangedAt": 1795185000000
    },
    "monitoring": {
      "mode": "idle",
      "sessionDurationSeconds": 0,
      "totalBlinksDetected": 0,
      "isSimulated": true,
      "sampleIntervalMs": 1000,
      "lastSampleTimestamp": 1795185000000
    },
    "nudgeConfig": {
      "enabled": true,
      "intervalMinutes": 20,
      "thresholdLowBlinkRate": 12,
      "soundEnabled": false,
      "hapticEnabled": true,
      "autoDismissSeconds": 5
    },
    "latestTelemetry": {
      "eventId": "telemetry-init",
      "schemaVersion": 1,
      "timestamp": 1795185000000,
      "isSimulated": true,
      "currentBlinkRatePerMinute": 16,
      "averageBlinkRatePerMinute": 18,
      "eyeFatigueScore": 18,
      "eyeHealthScore": 92
    },
    "updatedAt": 1795185000000
  },
  "members": {
    "sample-device-uid": {
      "uid": "sample-device-uid",
      "role": "blink-device",
      "joinedAt": 1795185000000,
      "status": "connected"
    }
  },
  "invitations": {
    "PAIR-4921": {
      "id": "PAIR-4921",
      "roomId": "BLINK-DEMO-001",
      "role": "companion-insights",
      "createdAt": 1795185000000,
      "expiresAt": 1795185600000,
      "consumed": false,
      "consumedBy": null,
      "consumedAt": null
    }
  }
}
```

### 2. Pairing Invitation Generated (`/rooms/BLINK-DEMO-001/invitations/PAIR-4921`)
*Data Model: Literal Persisted Firebase Node*
```json
{
  "id": "PAIR-4921",
  "roomId": "BLINK-DEMO-001",
  "role": "companion-insights",
  "createdAt": 1795185000000,
  "expiresAt": 1795185600000,
  "consumed": false,
  "consumedBy": null,
  "consumedAt": null
}
```

### 3. Controller Joins Room (Atomic Multi-Path Update Payload to RTDB Root `/`)
*Data Model: Atomic Update Command*
```json
{
  "rooms/BLINK-DEMO-001/members/sample-controller-uid": {
    "uid": "sample-controller-uid",
    "role": "companion-insights",
    "inviteCode": "PAIR-4921",
    "joinedAt": 1795185060000,
    "status": "connected"
  },
  "rooms/BLINK-DEMO-001/invitations/PAIR-4921/consumed": true,
  "rooms/BLINK-DEMO-001/invitations/PAIR-4921/consumedBy": "sample-controller-uid",
  "rooms/BLINK-DEMO-001/invitations/PAIR-4921/consumedAt": 1795185060000
}
```

### 4. Room Membership Map (`/rooms/BLINK-DEMO-001/members`)
*Data Model: TypeScript Service Return: `Record<string, RoomMember>`*
```json
{
  "sample-device-uid": {
    "uid": "sample-device-uid",
    "role": "blink-device",
    "joinedAt": 1795185000000,
    "status": "connected"
  },
  "sample-controller-uid": {
    "uid": "sample-controller-uid",
    "role": "companion-insights",
    "inviteCode": "PAIR-4921",
    "joinedAt": 1795185060000,
    "status": "connected"
  }
}
```

---

## Payload Categories 5–7: Presence & Connection Lifecycle

### 5. Device Online (`/rooms/BLINK-DEMO-001/presence/sample-device-uid`)
*Data Model: Literal Persisted Node*
```json
{
  "uid": "sample-device-uid",
  "role": "blink-device",
  "status": "connected",
  "lastSeen": 1795185000000,
  "connections": {
    "conn_device_tab_01": {
      "connectedAt": 1795185000000,
      "userAgent": "Mozilla/5.0 BlinkDevice/1.0"
    }
  }
}
```

### 6. Device Offline (`/rooms/BLINK-DEMO-001/presence/sample-device-uid`)
*Data Model: Derived State after onDisconnect clears connection node*
```json
{
  "uid": "sample-device-uid",
  "role": "blink-device",
  "status": "disconnected",
  "lastSeen": 1795185120000,
  "connections": {}
}
```

### 7. Reconnecting Presence State
*Data Model: Realtime Service Runtime Event (`onConnectionStatusChange`)*
```json
{
  "status": "reconnecting",
  "retryAttempt": 1,
  "isRecoverable": true,
  "lastConnectedTimestamp": 1795185000000
}
```

---

## Payload Categories 8–10: Device State & Monitoring

### 8. Initial Device State (`/rooms/BLINK-DEMO-001/state`)
*Data Model: Literal Persisted Node*
```json
{
  "schemaVersion": 1,
  "revision": 1,
  "deviceId": "sample-blink-device",
  "deviceName": "Blink [BLINK-DEMO-001]",
  "status": "connected",
  "brightness": 1.0,
  "expression": {
    "current": "idle",
    "targetExpression": "idle",
    "transitionProgress": 1.0,
    "intensity": 1.0,
    "gaze": { "x": 0, "y": 0 },
    "isBlinking": false,
    "blinkFrequencyPerMin": 18,
    "lastChangedAt": 1795185000000
  },
  "monitoring": {
    "mode": "idle",
    "sessionDurationSeconds": 0,
    "totalBlinksDetected": 0,
    "isSimulated": true,
    "sampleIntervalMs": 1000,
    "lastSampleTimestamp": 1795185000000
  },
  "nudgeConfig": {
    "enabled": true,
    "intervalMinutes": 20,
    "thresholdLowBlinkRate": 12,
    "soundEnabled": false,
    "hapticEnabled": true,
    "autoDismissSeconds": 5
  },
  "latestTelemetry": {
    "eventId": "telemetry-init",
    "schemaVersion": 1,
    "timestamp": 1795185000000,
    "isSimulated": true,
    "currentBlinkRatePerMinute": 16,
    "averageBlinkRatePerMinute": 18,
    "eyeFatigueScore": 18,
    "eyeHealthScore": 92
  },
  "updatedAt": 1795185000000
}
```

### 9. Device State After Expression Change (`/rooms/BLINK-DEMO-001/state`)
*Data Model: Incremented Revision (Revision: 2)*
```json
{
  "schemaVersion": 1,
  "revision": 2,
  "deviceId": "sample-blink-device",
  "deviceName": "Blink [BLINK-DEMO-001]",
  "status": "connected",
  "brightness": 1.0,
  "expression": {
    "current": "happy",
    "targetExpression": "happy",
    "transitionProgress": 1.0,
    "intensity": 1.0,
    "gaze": { "x": 0.2, "y": -0.1 },
    "isBlinking": false,
    "blinkFrequencyPerMin": 18,
    "lastChangedAt": 1795185065000
  },
  "monitoring": {
    "mode": "idle",
    "sessionDurationSeconds": 0,
    "totalBlinksDetected": 0,
    "isSimulated": true,
    "sampleIntervalMs": 1000,
    "lastSampleTimestamp": 1795185065000
  },
  "nudgeConfig": {
    "enabled": true,
    "intervalMinutes": 20,
    "thresholdLowBlinkRate": 12,
    "soundEnabled": false,
    "hapticEnabled": true,
    "autoDismissSeconds": 5
  },
  "latestTelemetry": {
    "eventId": "telemetry-init",
    "schemaVersion": 1,
    "timestamp": 1795185000000,
    "isSimulated": true,
    "currentBlinkRatePerMinute": 16,
    "averageBlinkRatePerMinute": 18,
    "eyeFatigueScore": 18,
    "eyeHealthScore": 92
  },
  "updatedAt": 1795185065000
}
```

### 10. Monitoring Started (`/rooms/BLINK-DEMO-001/state/monitoring`)
*Data Model: Subtree Update*
```json
{
  "mode": "active",
  "sessionStartedAt": 1795185100000,
  "sessionDurationSeconds": 120,
  "totalBlinksDetected": 34,
  "isSimulated": true,
  "sampleIntervalMs": 1000,
  "lastSampleTimestamp": 1795185220000
}
```

---

## Payload Categories 11–13: Eye-Health Telemetry

### 11. Live Blink Telemetry (`/rooms/BLINK-DEMO-001/telemetry`)
*Data Model: Literal Persisted Latest-Value Node*
```json
{
  "eventId": "tel-live-001",
  "schemaVersion": 1,
  "timestamp": 1795185200000,
  "isSimulated": true,
  "deviceId": "sample-blink-device",
  "blinkCount": 42,
  "sessionDurationSeconds": 150,
  "currentBlinkRatePerMinute": 18,
  "averageBlinkRatePerMinute": 17,
  "eyeFatigueScore": 14,
  "eyeHealthScore": 94,
  "screenDistanceCm": 55,
  "ambientLightLux": 420
}
```

### 12. Low-Blink-Rate Telemetry (Triggering Nudge Condition)
*Data Model: Persisted Node (Rate < 12 bpm)*
```json
{
  "eventId": "tel-lowblink-002",
  "schemaVersion": 1,
  "timestamp": 1795185300000,
  "isSimulated": true,
  "deviceId": "sample-blink-device",
  "blinkCount": 46,
  "sessionDurationSeconds": 250,
  "currentBlinkRatePerMinute": 7,
  "averageBlinkRatePerMinute": 12,
  "eyeFatigueScore": 68,
  "eyeHealthScore": 58,
  "screenDistanceCm": 48,
  "ambientLightLux": 210
}
```

### 13. Simulated Telemetry Stream (Chronological Sequence)
*Data Model: Derived Array of Sliding Window Telemetry Events*
```json
[
  {
    "eventId": "tel-stream-101",
    "schemaVersion": 1,
    "timestamp": 1795185200000,
    "isSimulated": true,
    "deviceId": "sample-blink-device",
    "blinkCount": 20,
    "sessionDurationSeconds": 60,
    "currentBlinkRatePerMinute": 18,
    "averageBlinkRatePerMinute": 18,
    "eyeFatigueScore": 10,
    "eyeHealthScore": 96
  },
  {
    "eventId": "tel-stream-102",
    "schemaVersion": 1,
    "timestamp": 1795185260000,
    "isSimulated": true,
    "deviceId": "sample-blink-device",
    "blinkCount": 38,
    "sessionDurationSeconds": 120,
    "currentBlinkRatePerMinute": 16,
    "averageBlinkRatePerMinute": 17,
    "eyeFatigueScore": 15,
    "eyeHealthScore": 93
  },
  {
    "eventId": "tel-stream-103",
    "schemaVersion": 1,
    "timestamp": 1795185320000,
    "isSimulated": true,
    "deviceId": "sample-blink-device",
    "blinkCount": 47,
    "sessionDurationSeconds": 180,
    "currentBlinkRatePerMinute": 9,
    "averageBlinkRatePerMinute": 14,
    "eyeFatigueScore": 48,
    "eyeHealthScore": 72
  }
]
```

---

## Payload Categories 14–21: Commands & Acknowledgments

### 14. SET_EXPRESSION Command (`/rooms/BLINK-DEMO-001/commands/cmd-exp-001`)
*Data Model: Dispatched Command from Insights*
```json
{
  "id": "cmd-exp-001",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "SET_EXPRESSION",
  "payload": {
    "expression": "happy",
    "durationSeconds": 5
  },
  "createdAt": 1795185060000,
  "expiresAt": 1795185120000,
  "status": "pending"
}
```

### 15 & 16. TRIGGER_NUDGE Command (`/rooms/BLINK-DEMO-001/commands/cmd-nudge-002`)
*Note: TRIGGER_BLINK is not a defined `DeviceCommandType`; `TRIGGER_NUDGE` is the implemented command.*
```json
{
  "id": "cmd-nudge-002",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "TRIGGER_NUDGE",
  "payload": {
    "urgency": "medium",
    "reason": "low_blink_rate"
  },
  "createdAt": 1795185080000,
  "expiresAt": 1795185140000,
  "status": "pending"
}
```

### 17. START_MONITORING Command (`/rooms/BLINK-DEMO-001/commands/cmd-start-003`)
```json
{
  "id": "cmd-start-003",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "START_MONITORING",
  "payload": {},
  "createdAt": 1795185100000,
  "expiresAt": 1795185160000,
  "status": "pending"
}
```

### 18. STOP_MONITORING Command (`/rooms/BLINK-DEMO-001/commands/cmd-stop-004`)
*Note: Contract uses `STOP_MONITORING`; pause is handled in UI by retaining session duration.*
```json
{
  "id": "cmd-stop-004",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "STOP_MONITORING",
  "payload": {},
  "createdAt": 1795185400000,
  "expiresAt": 1795185460000,
  "status": "pending"
}
```

### 19. Command Acknowledgment Success (`/rooms/BLINK-DEMO-001/commands/cmd-exp-001`)
*Data Model: Acknowledged Command Payload*
```json
{
  "id": "cmd-exp-001",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "SET_EXPRESSION",
  "payload": {
    "expression": "happy",
    "durationSeconds": 5
  },
  "createdAt": 1795185060000,
  "expiresAt": 1795185120000,
  "status": "executed",
  "acknowledged": true,
  "acknowledgedAt": 1795185062000,
  "acknowledgment": {
    "commandId": "cmd-exp-001",
    "status": "executed",
    "acknowledgedAt": 1795185062000,
    "acknowledgedBy": "sample-device-uid",
    "resultMessage": "Expression set to happy"
  }
}
```

### 20. Command Acknowledgment Rejection (`/rooms/BLINK-DEMO-001/commands/cmd-exp-002`)
```json
{
  "id": "cmd-exp-002",
  "schemaVersion": 1,
  "targetDeviceId": "sample-device-uid",
  "senderId": "sample-controller-uid",
  "type": "SET_EXPRESSION",
  "payload": {
    "expression": "invalid-exp"
  },
  "createdAt": 1795185070000,
  "expiresAt": 1795185130000,
  "status": "rejected",
  "acknowledged": true,
  "acknowledgedAt": 1795185071000,
  "acknowledgment": {
    "commandId": "cmd-exp-002",
    "status": "rejected",
    "acknowledgedAt": 1795185071000,
    "acknowledgedBy": "sample-device-uid",
    "resultMessage": "Unsupported expression type"
  }
}
```

### 21. Command Expired & Timed-Out Representation
*Client-side synthetic acknowledgment generated by `subscribeToCommandStatus` upon timeout:*
```json
{
  "commandId": "cmd-exp-004",
  "status": "timed_out",
  "acknowledgedAt": 1795185110000,
  "acknowledgedBy": "system",
  "resultMessage": "Command timed out after 10000ms"
}
```

---

## Payload Categories 22–26: Nudge, Session & Room Lifecycle

### 22. Nudge Configuration (`/rooms/BLINK-DEMO-001/state/nudgeConfig`)
```json
{
  "enabled": true,
  "intervalMinutes": 20,
  "thresholdLowBlinkRate": 12,
  "soundEnabled": false,
  "hapticEnabled": true,
  "autoDismissSeconds": 5,
  "customMessage": "Time to rest your eyes for 20 seconds!"
}
```

### 23. Nudge Event Payload (`NudgeEvent`)
```json
{
  "id": "nudge-evt-001",
  "schemaVersion": 1,
  "timestamp": 1795185330000,
  "urgency": "medium",
  "reason": "low_blink_rate",
  "message": "Blink rate dropped to 7 bpm. Please take a 20-second break.",
  "acknowledged": true,
  "acknowledgedAt": 1795185334000
}
```

### 24. Completed Session Summary (`SessionSummary`)
*Data Model: Proposed Firestore Record for `/sessions/sess-summary-001`*
```json
{
  "sessionId": "sess-summary-001",
  "userId": "sample-controller-uid",
  "schemaVersion": 1,
  "isSimulated": true,
  "startedAt": 1795185100000,
  "endedAt": 1795186900000,
  "durationSeconds": 1800,
  "averageBlinksPerMinute": 16.5,
  "lowestBlinkRate": 7,
  "highestBlinkRate": 22,
  "totalNudgesDelivered": 2,
  "totalNudgesAcknowledged": 2,
  "finalEyeHealthScore": 88,
  "notes": "Good recovery following second nudge break"
}
```

### 25. Room Closed (`/rooms/BLINK-DEMO-001`)
*Data Model: Persisted Node After Owner Closure*
```json
{
  "roomCode": "BLINK-DEMO-001",
  "schemaVersion": 1,
  "createdAt": 1795185000000,
  "createdBy": "sample-device-uid",
  "expiresAt": 1795271400000,
  "status": "closed",
  "closedAt": 1795187000000,
  "closedBy": "sample-device-uid"
}
```
