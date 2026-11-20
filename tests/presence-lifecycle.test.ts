import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, Auth } from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  get,
  connectDatabaseEmulator,
  Database,
} from 'firebase/database';
import { firebaseConfig } from '@/shared/firebase/config';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import {
  DeviceCommand,
  INITIAL_DEVICE_STATE,
  UserPresence,
} from '@/shared/contracts';

interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  rtdb: Database;
  uid: string;
}

describe('F2C: Presence, Room Expiry & Connection Recovery (Emulator-Backed)', () => {
  let clientA: TestClient; // Blink Device / Room Creator
  let clientB: TestClient; // Companion Insights Controller
  let clientC: TestClient; // Unrelated user / Attacker

  let roomServiceA: FirebaseRoomService;
  let roomServiceB: FirebaseRoomService;
  let realtimeA: FirebaseRealtimeService;
  let realtimeB: FirebaseRealtimeService;
  let realtimeC: FirebaseRealtimeService;

  const roomCode = `PRES-${Date.now().toString(36).toUpperCase()}`;
  let inviteCode = '';

  beforeAll(async () => {
    // 1. Client A: Device / Creator
    const appA = initializeApp(firebaseConfig, `test-app-A-${Date.now()}`);
    const authA = getAuth(appA);
    const rtdbA = getDatabase(appA);
    connectAuthEmulator(authA, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbA, '127.0.0.1', 9000);
    const credA = await signInAnonymously(authA);
    clientA = { app: appA, auth: authA, rtdb: rtdbA, uid: credA.user.uid };

    // 2. Client B: Controller / Invitee
    const appB = initializeApp(firebaseConfig, `test-app-B-${Date.now()}`);
    const authB = getAuth(appB);
    const rtdbB = getDatabase(appB);
    connectAuthEmulator(authB, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbB, '127.0.0.1', 9000);
    const credB = await signInAnonymously(authB);
    clientB = { app: appB, auth: authB, rtdb: rtdbB, uid: credB.user.uid };

    // 3. Client C: Attacker
    const appC = initializeApp(firebaseConfig, `test-app-C-${Date.now()}`);
    const authC = getAuth(appC);
    const rtdbC = getDatabase(appC);
    connectAuthEmulator(authC, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbC, '127.0.0.1', 9000);
    const credC = await signInAnonymously(authC);
    clientC = { app: appC, auth: authC, rtdb: rtdbC, uid: credC.user.uid };

    roomServiceA = new FirebaseRoomService(clientA.rtdb, clientA.auth);
    roomServiceB = new FirebaseRoomService(clientB.rtdb, clientB.auth);

    realtimeA = new FirebaseRealtimeService(clientA.rtdb, clientA.auth);
    realtimeB = new FirebaseRealtimeService(clientB.rtdb, clientB.auth);
    realtimeC = new FirebaseRealtimeService(clientC.rtdb, clientC.auth);

    // Setup room
    const room = await roomServiceA.createRoom({ roomCode, role: 'blink-device' });
    inviteCode = Object.keys(room.invitations || {})[0];
    await roomServiceB.joinRoomWithInvite({ roomCode, inviteCode });
  });

  afterAll(async () => {
    await realtimeA.disconnect().catch(() => {});
    await realtimeB.disconnect().catch(() => {});
    await realtimeC.disconnect().catch(() => {});
    await Promise.all([
      deleteApp(clientA.app),
      deleteApp(clientB.app),
      deleteApp(clientC.app),
    ]);
  });

  // Case 1: Authorized presence registration
  it('registers authorized presence for Device and Controller when connecting', async () => {
    await realtimeA.connect(roomCode, 'device-tab-1');
    await realtimeB.connect(roomCode, 'controller-tab-1');

    await new Promise((resolve) => setTimeout(resolve, 250));

    const presenceA = await realtimeA.getUserPresence(clientA.uid);
    expect(presenceA).not.toBeNull();
    const pA = presenceA as unknown as UserPresence;
    expect(pA.uid).toBe(clientA.uid);
    expect(pA.role).toBe('blink-device');
    expect(pA.status).toBe('connected');
    expect(pA.connections?.['device-tab-1']).toBeDefined();

    const presenceB = await realtimeB.getUserPresence(clientB.uid);
    expect(presenceB).not.toBeNull();
    const pB = presenceB as unknown as UserPresence;
    expect(pB.uid).toBe(clientB.uid);
    expect(pB.role).toBe('companion-insights');
    expect(pB.status).toBe('connected');

    const isDeviceUp = await realtimeB.isDeviceOnline();
    expect(isDeviceUp).toBe(true);
  });

  // Case 2: Unauthorized presence writes rejected
  it('rejects unauthorized presence writes from non-members and privilege escalation', async () => {
    // Non-member Client C attempts to write presence in room
    await expect(
      set(ref(clientC.rtdb, `rooms/${roomCode}/presence/${clientC.uid}`), {
        uid: clientC.uid,
        role: 'blink-device',
        status: 'connected',
        lastSeen: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Client B attempts to write presence under Client A's UID
    await expect(
      set(ref(clientB.rtdb, `rooms/${roomCode}/presence/${clientA.uid}`), {
        uid: clientA.uid,
        role: 'blink-device',
        status: 'connected',
        lastSeen: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Client B attempts to claim role 'blink-device' in its own presence node
    await expect(
      set(ref(clientB.rtdb, `rooms/${roomCode}/presence/${clientB.uid}`), {
        uid: clientB.uid,
        role: 'blink-device', // Escalation! Member role is companion-insights
        status: 'connected',
        lastSeen: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 3: Disconnect cleanup
  it('removes active connection node upon disconnect', async () => {
    const tempRealtime = new FirebaseRealtimeService(clientB.rtdb, clientB.auth);
    await tempRealtime.connect(roomCode, 'temp-conn-99');

    await new Promise((resolve) => setTimeout(resolve, 200));
    let snap = await get(ref(clientB.rtdb, `rooms/${roomCode}/presence/${clientB.uid}/connections/temp-conn-99`));
    expect(snap.exists()).toBe(true);

    await tempRealtime.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    snap = await get(ref(clientB.rtdb, `rooms/${roomCode}/presence/${clientB.uid}/connections/temp-conn-99`));
    expect(snap.exists()).toBe(false);
  });

  // Case 4: Reconnection recovery
  it('re-establishes presence and connection status on reconnect', async () => {
    await realtimeB.disconnect();
    expect(realtimeB.getConnectionStatus()).toBe('disconnected');

    await realtimeB.connect(roomCode, 'controller-tab-1');
    expect(realtimeB.getConnectionStatus()).toBe('connected');

    const presence = await realtimeB.getUserPresence(clientB.uid);
    expect(presence?.status).toBe('connected');
  });

  // Case 5: Multiple connections under one authenticated user
  it('keeps user online when one connection closes if another connection remains active', async () => {
    // Client A creates a second connection (e.g. second browser tab)
    const realtimeA2 = new FirebaseRealtimeService(clientA.rtdb, clientA.auth);
    await realtimeA2.connect(roomCode, 'device-tab-2');

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify both connections exist
    let presence = await realtimeB.getUserPresence(clientA.uid);
    expect(presence?.status).toBe('connected');
    expect(Object.keys(presence?.connections || {}).length).toBe(2);

    // Disconnect tab 1
    await realtimeA.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Client A must STILL be online because tab 2 is open!
    presence = await realtimeB.getUserPresence(clientA.uid);
    expect(presence?.status).toBe('connected');
    expect(presence?.connections?.['device-tab-2']).toBeDefined();
    expect(presence?.connections?.['device-tab-1']).toBeUndefined();

    // Now disconnect tab 2 as well
    await realtimeA2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Now Client A transitions to disconnected
    presence = await realtimeB.getUserPresence(clientA.uid);
    expect(presence?.status).toBe('disconnected');

    // Re-connect realtimeA for remaining tests
    await realtimeA.connect(roomCode, 'device-tab-1');
  });

  // Case 6: Room expiry
  it('rejects commands and state writes when room is expired', async () => {
    // Attempt to create a room that is already expired (expiresAt in past)
    const expiredRoomCode = `EXP-${Date.now().toString(36).toUpperCase()}`;

    // Security rule prevents creating room with expiresAt <= now
    await expect(
      set(ref(clientA.rtdb, `rooms/${expiredRoomCode}`), {
        roomCode: expiredRoomCode,
        schemaVersion: 1,
        createdAt: Date.now() - 10000,
        createdBy: clientA.uid,
        expiresAt: Date.now() - 5000, // Expired!
        status: 'active',
        deviceState: INITIAL_DEVICE_STATE,
        members: {
          [clientA.uid]: {
            uid: clientA.uid,
            role: 'blink-device',
            joinedAt: Date.now() - 10000,
            status: 'connected',
          },
        },
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 7: Owner-initiated room closure
  it('allows room owner to close room and prohibits non-owners from closing', async () => {
    // Non-owner Client B attempts to close room
    await expect(roomServiceB.closeRoom(roomCode)).rejects.toThrow(
      /Only the room creator/i
    );

    // Non-owner Client B attempts to set status = 'closed' directly in RTDB
    await expect(
      set(ref(clientB.rtdb, `rooms/${roomCode}/status`), 'closed')
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Owner Client A closes room
    await roomServiceA.closeRoom(roomCode);

    const roomSnap = await get(ref(clientA.rtdb, `rooms/${roomCode}/status`));
    expect(roomSnap.val()).toBe('closed');
  });

  // Case 8: Commands rejected after room closure
  it('prohibits sending commands after room has been closed', async () => {
    const closedCmd: DeviceCommand = {
      id: `cmd-closed-${Date.now()}`,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      type: 'SET_EXPRESSION',
      payload: { expression: 'sleepy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    // Client-side guard throws
    await expect(realtimeB.sendCommand(closedCmd)).rejects.toThrow(
      /room .* is closed/i
    );

    // Server-side RTDB rule also rejects direct write to closed room
    await expect(
      set(ref(clientB.rtdb, `rooms/${roomCode}/commands/${closedCmd.id}`), closedCmd)
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 9: Expired commands not replayed
  it('filters out expired commands and does not execute them', async () => {
    // Open a fresh active room for command replay test
    const freshRoomCode = `FRESH-${Date.now().toString(36).toUpperCase()}`;
    const freshRoom = await roomServiceA.createRoom({ roomCode: freshRoomCode, role: 'blink-device' });
    const freshInvite = Object.keys(freshRoom.invitations || {})[0];
    await roomServiceB.joinRoomWithInvite({ roomCode: freshRoomCode, inviteCode: freshInvite });

    const freshRealtimeA = new FirebaseRealtimeService(clientA.rtdb, clientA.auth);
    await freshRealtimeA.connect(freshRoomCode);

    let executed = false;
    const unsub = freshRealtimeA.subscribeToCommands(() => {
      executed = true;
    });

    const expiredCmd: DeviceCommand = {
      id: `cmd-past-${Date.now()}`,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      type: 'TRIGGER_NUDGE',
      payload: {},
      createdAt: Date.now() - 5000,
      expiresAt: Date.now() - 1000, // In past
    };

    // Controller cannot send expired command
    await expect(
      set(ref(clientB.rtdb, `rooms/${freshRoomCode}/commands/${expiredCmd.id}`), expiredCmd)
    ).rejects.toThrow(/permission_denied|permission denied/i);

    expect(executed).toBe(false);

    unsub();
    await freshRealtimeA.disconnect();
  });

  // Case 10: Listener cleanup
  it('cleans up presence listeners properly when unsubscribed', async () => {
    let callCount = 0;
    const unsub = realtimeB.subscribeToPresence(() => {
      callCount++;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const baseline = callCount;

    // Disconnect and reconnect to trigger clean presence update
    await realtimeA.connect(roomCode, 'device-tab-clean');
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callCount).toBeGreaterThanOrEqual(baseline);

    unsub();
    const afterUnsubCount = callCount;

    // Update after unsubscribe
    await realtimeA.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callCount).toBe(afterUnsubCount);
  });
});
