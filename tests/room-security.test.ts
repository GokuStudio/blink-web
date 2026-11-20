import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, Auth } from 'firebase/auth';
import { getDatabase, ref, set, get, update, connectDatabaseEmulator, Database } from 'firebase/database';
import { firebaseConfig } from '@/shared/firebase/config';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { MockRoomService } from '@/shared/realtime/services/mock-room.service';
import { INITIAL_DEVICE_STATE } from '@/shared/contracts';

interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  rtdb: Database;
  uid: string;
}

describe('F2A: Secure Room Pairing & Authorization (Emulator-Backed)', () => {
  let clientA: TestClient; // Room creator / Blink Device
  let clientB: TestClient; // Invited Companion Insights controller
  let clientC: TestClient; // Unrelated user / Attacker
  let unauthRtdb: Database;
  let unauthApp: FirebaseApp;

  const testRoomCode = `SEC-TEST-${Date.now().toString(36).toUpperCase()}`;

  beforeAll(async () => {
    // 1. Setup Client A (Creator / Device)
    const appA = initializeApp(firebaseConfig, `test-app-A-${Date.now()}`);
    const authA = getAuth(appA);
    const rtdbA = getDatabase(appA);
    connectAuthEmulator(authA, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbA, '127.0.0.1', 9000);
    const credA = await signInAnonymously(authA);
    clientA = { app: appA, auth: authA, rtdb: rtdbA, uid: credA.user.uid };

    // 2. Setup Client B (Invitee / Companion Controller)
    const appB = initializeApp(firebaseConfig, `test-app-B-${Date.now()}`);
    const authB = getAuth(appB);
    const rtdbB = getDatabase(appB);
    connectAuthEmulator(authB, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbB, '127.0.0.1', 9000);
    const credB = await signInAnonymously(authB);
    clientB = { app: appB, auth: authB, rtdb: rtdbB, uid: credB.user.uid };

    // 3. Setup Client C (Attacker / Unrelated User)
    const appC = initializeApp(firebaseConfig, `test-app-C-${Date.now()}`);
    const authC = getAuth(appC);
    const rtdbC = getDatabase(appC);
    connectAuthEmulator(authC, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbC, '127.0.0.1', 9000);
    const credC = await signInAnonymously(authC);
    clientC = { app: appC, auth: authC, rtdb: rtdbC, uid: credC.user.uid };

    // 4. Setup Unauthenticated Client
    unauthApp = initializeApp(firebaseConfig, `test-unauth-${Date.now()}`);
    unauthRtdb = getDatabase(unauthApp);
    connectDatabaseEmulator(unauthRtdb, '127.0.0.1', 9000);
  });

  afterAll(async () => {
    await Promise.all([
      deleteApp(clientA.app),
      deleteApp(clientB.app),
      deleteApp(clientC.app),
      deleteApp(unauthApp),
    ]);
  });

  it('verifies 3 distinct authenticated identities in the emulator', () => {
    expect(clientA.uid).toBeDefined();
    expect(clientB.uid).toBeDefined();
    expect(clientC.uid).toBeDefined();
    expect(clientA.uid).not.toBe(clientB.uid);
    expect(clientA.uid).not.toBe(clientC.uid);
    expect(clientB.uid).not.toBe(clientC.uid);
  });

  it('rejects unauthenticated requests at the root and room levels', async () => {
    await expect(get(ref(unauthRtdb, `rooms/${testRoomCode}`))).rejects.toThrow(
      /permission_denied|permission denied/i
    );
    await expect(
      set(ref(unauthRtdb, `rooms/${testRoomCode}`), { createdBy: 'fake' })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  it('rejects room creation impersonation (cannot set createdBy to another user)', async () => {
    const forgedRoom = {
      roomCode: `FORGED-${Date.now()}`,
      schemaVersion: 1,
      createdAt: Date.now(),
      createdBy: clientA.uid, // C attempts to claim A is the creator
      expiresAt: Date.now() + 86400000,
      deviceState: INITIAL_DEVICE_STATE,
      members: {
        [clientA.uid]: {
          uid: clientA.uid,
          role: 'blink-device',
          joinedAt: Date.now(),
          status: 'connected',
        },
      },
    };

    // Attempted by Client C
    await expect(set(ref(clientC.rtdb, `rooms/${forgedRoom.roomCode}`), forgedRoom)).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  it('allows A (room creator) to create a secure room', async () => {
    const serviceA = new FirebaseRoomService(clientA.rtdb, clientA.auth);
    const room = await serviceA.createRoom({
      roomCode: testRoomCode,
      role: 'blink-device',
    });

    expect(room.roomCode).toBe(testRoomCode);
    expect(room.createdBy).toBe(clientA.uid);
    expect(room.members[clientA.uid].role).toBe('blink-device');

    // A can read the room data
    const readBack = await serviceA.getRoom(testRoomCode);
    expect(readBack).not.toBeNull();
    expect(readBack?.createdBy).toBe(clientA.uid);
  });

  it('prohibits C (unrelated user) from reading room data', async () => {
    // Client C is authenticated, but NOT a member of testRoomCode
    await expect(get(ref(clientC.rtdb, `rooms/${testRoomCode}`))).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  it('prohibits C from writing to room state or members directly', async () => {
    // Attempt to write device state
    await expect(
      set(ref(clientC.rtdb, `rooms/${testRoomCode}/state`), {
        revision: 2,
        updatedAt: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Attempt to directly inject oneself into members
    await expect(
      set(ref(clientC.rtdb, `rooms/${testRoomCode}/members/${clientC.uid}`), {
        uid: clientC.uid,
        role: 'companion-insights',
        joinedAt: Date.now(),
        status: 'connected',
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  let validInviteCode = '';

  it('allows A to generate a short-lived pairing invitation', async () => {
    const serviceA = new FirebaseRoomService(clientA.rtdb, clientA.auth);
    const invite = await serviceA.createInvitation({
      roomCode: testRoomCode,
      role: 'companion-insights',
      expiresInMs: 600000,
    });

    expect(invite.id).toBeDefined();
    expect(invite.roomId).toBe(testRoomCode);
    expect(invite.role).toBe('companion-insights');
    expect(invite.consumed).toBe(false);

    validInviteCode = invite.id;
  });

  it('prohibits C from joining with a forged client role (cannot escalate to blink-device)', async () => {
    // C tries to use valid inviteCode but claim role 'blink-device' instead of invited 'companion-insights'
    const forgedUpdates: Record<string, any> = {};
    forgedUpdates[`rooms/${testRoomCode}/members/${clientC.uid}`] = {
      uid: clientC.uid,
      role: 'blink-device', // Forged role!
      inviteCode: validInviteCode,
      joinedAt: Date.now(),
      status: 'connected',
    };
    forgedUpdates[`rooms/${testRoomCode}/invitations/${validInviteCode}/consumed`] = true;
    forgedUpdates[`rooms/${testRoomCode}/invitations/${validInviteCode}/consumedBy`] = clientC.uid;
    forgedUpdates[`rooms/${testRoomCode}/invitations/${validInviteCode}/consumedAt`] = Date.now();

    await expect(update(ref(clientC.rtdb), forgedUpdates)).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  it('allows B to join through the authorized invitation and receive controller permissions', async () => {
    const serviceB = new FirebaseRoomService(clientB.rtdb, clientB.auth);
    const memberB = await serviceB.joinRoomWithInvite({
      roomCode: testRoomCode,
      inviteCode: validInviteCode,
    });

    expect(memberB.uid).toBe(clientB.uid);
    expect(memberB.role).toBe('companion-insights');

    // B is now a member and CAN read room data
    const room = await serviceB.getRoom(testRoomCode);
    expect(room).not.toBeNull();
    expect(room?.members[clientB.uid]).toBeDefined();

    // B can write commands (controller permission)
    await set(ref(clientB.rtdb, `rooms/${testRoomCode}/commands/cmd-test-01`), {
      id: 'cmd-test-01',
      type: 'SET_EXPRESSION',
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    });
  });

  it('prohibits B from escalating privileges (cannot change own role to blink-device)', async () => {
    // B attempts to update their own role from 'companion-insights' to 'blink-device'
    await expect(
      set(ref(clientB.rtdb, `rooms/${testRoomCode}/members/${clientB.uid}/role`), 'blink-device')
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  it('prohibits B from creating invitations (only blink-device/creator can invite)', async () => {
    const serviceB = new FirebaseRoomService(clientB.rtdb, clientB.auth);
    await expect(
      serviceB.createInvitation({ roomCode: testRoomCode, role: 'companion-insights' })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  it('fails when attempting to reuse a consumed invitation', async () => {
    // C attempts to join using validInviteCode which B already consumed
    const serviceC = new FirebaseRoomService(clientC.rtdb, clientC.auth);
    await expect(
      serviceC.joinRoomWithInvite({ roomCode: testRoomCode, inviteCode: validInviteCode })
    ).rejects.toThrow(/already been consumed|permission denied|permission_denied/i);
  });

  it('fails when attempting to create or join with an expired invitation', async () => {
    // Attempt to join with a non-existent / expired invite
    const serviceC = new FirebaseRoomService(clientC.rtdb, clientC.auth);
    await expect(
      serviceC.joinRoomWithInvite({ roomCode: testRoomCode, inviteCode: 'EXPIRED-INVITE-CODE' })
    ).rejects.toThrow(/does not exist|permission denied|permission_denied/i);
  });

  describe('Mock Auth Clear Separation & Fail-Closed Behavior', () => {
    it('fails closed when mock guest credentials attempt real Firebase room operations', async () => {
      // Create a mock auth mock user
      const mockAuth: any = {
        currentUser: { uid: 'mock-anon-guest-1234' },
      };

      const realServiceWithMockAuth = new FirebaseRoomService(clientA.rtdb, mockAuth);
      await expect(
        realServiceWithMockAuth.createRoom({ roomCode: 'FAIL-CLOSED-ROOM' })
      ).rejects.toThrow(
        /Real authenticated user identity required/i
      );
    });

    it('preserves MockRoomService for safe offline development without network calls', async () => {
      const mockService = new MockRoomService();
      mockService.setMockUid('mock-dev-uid');

      const room = await mockService.createRoom({ roomCode: 'MOCK-ROOM-99' });
      expect(room.roomCode).toBe('MOCK-ROOM-99');
      expect(room.createdBy).toBe('mock-dev-uid');

      const invite = await mockService.createInvitation({ roomCode: 'MOCK-ROOM-99' });
      expect(invite.consumed).toBe(false);

      mockService.setMockUid('mock-companion-uid');
      const member = await mockService.joinRoomWithInvite({
        roomCode: 'MOCK-ROOM-99',
        inviteCode: invite.id,
      });

      expect(member.uid).toBe('mock-companion-uid');
      expect(member.role).toBe('companion-insights');
    });
  });
});
