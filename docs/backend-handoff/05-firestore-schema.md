# 05 — Cloud Firestore Architecture & Proposed Schema

---

> [!IMPORTANT]
> **Firestore historical session persistence is not implemented.**
> While Firestore SDK initialization and security rules exist in the repository, no runtime service currently writes to or queries Firestore collections. All live communication operates entirely through the Firebase Realtime Database.

---

## 1. Current Codebase Status

1. **Contracts**:
   - `SessionSummary` is defined in `src/shared/contracts/session.ts`.
2. **Security Rules (`firestore.rules`)**:
   - Rules are implemented and deployed for two collection patterns:
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if false;
         }
         match /users/{userId} {
           allow read, write: if request.auth != null && request.auth.uid == userId;
         }
         match /sessions/{sessionId} {
           allow read: if request.auth != null;
           allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
           allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
         }
       }
     }
     ```
3. **SDK Client (`src/shared/firebase/client.ts`)**:
   - `firestore = getFirestore(app);` is initialized and exposed via `getFirebaseServices().firestore`.
4. **Implementation Gap**:
   - There are **no service methods**, repositories, or hooks that persist completed monitoring sessions, aggregate daily blink counts, or store historical analytics in Firestore.
   - The Insights screen (history, charts, trends) currently relies on mock/derived data or client-side in-memory accumulation.

---

## 2. Proposed Production Schema (Future Architecture)

When Developer 2 or the backend team implements historical session persistence, the following architecture is designed to integrate cleanly with the existing contracts:

### Collection: `/sessions/{sessionId}`

- **Document ID Format**: `sess_<timestamp>_<random6>` (e.g. `sess_1795185100000_a8x9j2`).
- **Owner Authorization**: Document field `userId` must match `request.auth.uid` per `firestore.rules`.
- **Field Definitions**:

| Field Name | Type | Unit / Format | Description |
| :--- | :--- | :--- | :--- |
| `sessionId` | `string` | UUID / Prefixed string | Unique session identifier |
| `userId` | `string` | Firebase Auth UID | User ID of the session owner |
| `schemaVersion` | `number` | Integer (`1`) | Schema version |
| `isSimulated` | `boolean` | `true \| false` | Must be `true` for all simulated sessions |
| `startedAt` | `number` | Epoch ms (or Timestamp) | Session start timestamp |
| `endedAt` | `number` | Epoch ms (or Timestamp) | Session end timestamp |
| `durationSeconds` | `number` | Seconds | Total active monitoring time |
| `averageBlinksPerMinute` | `number` | Decimal (bpm) | Cumulative session average |
| `lowestBlinkRate` | `number` | Integer (bpm) | Lowest recorded 60s window |
| `highestBlinkRate` | `number` | Integer (bpm) | Highest recorded 60s window |
| `totalNudgesDelivered` | `number` | Integer | Total alerts sent |
| `totalNudgesAcknowledged` | `number` | Integer | Total alerts confirmed |
| `finalEyeHealthScore` | `number` | 0–100 scale | Composite session score |
| `notes` | `string` (optional) | Free text | User annotations |

### Sample Document Payload

```json
{
  "sessionId": "sess_1795185100000_a8x9j2",
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
  "notes": "Focused work session; responded to 2 nudge reminders"
}
```

---

## 3. Query & Index Requirements for Insights

To support the **Insights Dashboard** time-range views (Today, Week, Month), the following composite Firestore indexes will be required:

1. **User Sessions by Date**:
   - Collection: `sessions`
   - Fields: `userId` (ASC), `startedAt` (DESC)
   - Use: Rendering the history list and chronological trend charts.
2. **User Daily Aggregation Query**:
   ```typescript
   import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
   
   const q = query(
     collection(firestore, 'sessions'),
     where('userId', '==', currentUid),
     where('startedAt', '>=', startOfDayMs),
     orderBy('startedAt', 'desc')
   );
   const snapshot = await getDocs(q);
   const sessions = snapshot.docs.map(doc => doc.data() as SessionSummary);
   ```

---

## 4. Workaround for Developer 2 During MVP

Until Firestore session writes are implemented, Developer 2 should:
1. **Accumulate live telemetry in client state**:
   - Store incoming `DeviceTelemetry` points in a local array/store (e.g. Zustand) to render the real-time activity chart.
2. **Use Mock Fixtures for Historical Analytics**:
   - Import `docs/backend-handoff/fixtures/session-summary.json` to populate the historical trends, comparison graphs, and session history cards.
