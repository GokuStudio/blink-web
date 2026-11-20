import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, Auth } from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  connectDatabaseEmulator,
  Database,
} from 'firebase/database';
import { firebaseConfig } from '@/shared/firebase/config';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { INITIAL_DEVICE_STATE } from '@/shared/contracts';

interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  rtdb: Database;
  uid: string;
}

describe('F3B: Pre-Deployment Adversarial Room Pairing Security Tests (Emulator-Backed)', () => {
  let clientA: TestClient; // Device / Room Creator
  let clientB: TestClient; // Legitimate Controller Invitee
  let clientC: TestClient; // Concurrent Invitee / Attacker
  let clientD: TestClient; // Malicious User

  let roomServiceA: FirebaseRoomService;
  let roomServiceB: FirebaseRoomService;
  let roomServiceC: FirebaseRoomService;

  const roomCode = `ADV-${Date.now().toString(36).toUpperCase()}`;
  let validInviteCode = '';

  beforeAll(async () => {
    // 1. Client A (Creator / Device)
    const appA = initializeApp(firebaseConfig, `test-adv-A-${Date.now()}`);
    const authA = getAuth(appA);
    const rtdbA = getDatabase(appA);
    connectAuthEmulator(authA, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbA, '127.0.0.1', 9000);
    const credA = await signInAnonymously(authA);
    clientA = { app: appA, auth: authA, rtdb: rtdbA, uid: credA.user.uid };

    // 2. Client B (Legitimate Controller)
    const appB = initializeApp(firebaseConfig, `test-adv-B-${Date.now()}`);
    const authB = getAuth(appB);
    const rtdbB = getDatabase(appB);
    connectAuthEmulator(authB, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbB, '127.0.0.1', 9000);
    const credB = await signInAnonymously(authB);
    clientB = { app: appB, auth: authB, rtdb: rtdbB, uid: credB.user.uid };

    // 3. Client C (Concurrent Attacker)
    const appC = initializeApp(firebaseConfig, `test-adv-C-${Date.now()}`);
    const authC = getAuth(appC);
    const rtdbC = getDatabase(appC);
    connectAuthEmulator(authC, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbC, '127.0.0.1', 9000);
    const credC = await signInAnonymously(authC);
    clientC = { app: appC, auth: authC, rtdb: rtdbC, uid: credC.user.uid };

    // 4. Client D (Malicious Attacker)
    const appD = initializeApp(firebaseConfig, `test-adv-D-${Date.now()}`);
    const authD = getAuth(appD);
    const rtdbD = getDatabase(appD);
    connectAuthEmulator(authD, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbD, '127.0.0.1', 9000);
    const credD = await signInAnonymously(authD);
    clientD = { app: appD, auth: authD, rtdb: rtdbD, uid: credD.user.uid };

    roomServiceA = new FirebaseRoomService(clientA.rtdb, clientA.auth);
    roomServiceB = new FirebaseRoomService(clientB.rtdb, clientB.auth);
    roomServiceC = new FirebaseRoomService(clientC.rtdb, clientC.auth);

    const room = await roomServiceA.createRoom({ roomCode, role: 'blink-device' });
    validInviteCode = Object.keys(room.invitations || {})[0];
  });

  afterAll(async () => {
    await Promise.all([
      deleteApp(clientA.app),
      deleteApp(clientB.app),
      deleteApp(clientC.app),
      deleteApp(clientD.app),
    ]);
  });

  // Test 1: Two different users redeeming the same invitation concurrently
  it('handles concurrent redemption of the same invitation by two different users (only one succeeds)', async () => {
    // Generate a fresh invite for the race condition test
    const raceInvite = await roomServiceA.createInvitation({ roomCode, role: 'companion-insights' });

    // Client B and Client C both attempt to join concurrently with the same invite
    const results = await Promise.allSettled([
      roomServiceB.joinRoomWithInvite({ roomCode, inviteCode: raceInvite.id }),
      roomServiceC.joinRoomWithInvite({ roomCode, inviteCode: raceInvite.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed, and exactly one must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify the invitation is now consumed
    const inviteSnap = await get(ref(clientA.rtdb, `rooms/${roomCode}/invitations/${raceInvite.id}`));
    expect(inviteSnap.val().consumed).toBe(true);
  });

  // Test 2: Reuse after successful redemption
  it('rejects reuse of an invitation after it has already been consumed', async () => {
    // Client D attempts to join using the initial validInviteCode that will be redeemed by Client B
    await roomServiceB.joinRoomWithInvite({ roomCode, inviteCode: validInviteCode });

    // Client D attempts to redeem the same invitation
    await expect(
      roomServiceC.joinRoomWithInvite({ roomCode, inviteCode: validInviteCode })
    ).rejects.toThrow(/already been consumed|permission_denied|permission denied/i);
  });

  // Test 3: Expired invitation
  it('rejects redemption of an expired invitation', async () => {
    await expect(
      roomServiceC.joinRoomWithInvite({ roomCode, inviteCode: 'EXPIRED-INVITE' })
    ).rejects.toThrow(/does not exist|expired|permission_denied|permission denied/i);
  });

  // Test 4: Forged controller membership
  it('rejects forged controller membership without a valid unconsumed invitation', async () => {
    // Client D attempts to directly write to members without an inviteCode
    await expect(
      set(ref(clientD.rtdb, `rooms/${roomCode}/members/${clientD.uid}`), {
        uid: clientD.uid,
        role: 'companion-insights',
        joinedAt: Date.now(),
        status: 'connected',
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Client D attempts to directly write to members with a fabricated inviteCode
    await expect(
      set(ref(clientD.rtdb, `rooms/${roomCode}/members/${clientD.uid}`), {
        uid: clientD.uid,
        role: 'companion-insights',
        inviteCode: 'FABRICATED-INVITE-9999',
        joinedAt: Date.now(),
        status: 'connected',
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Test 5: Forged owner/device membership
  it('rejects privilege escalation to blink-device or integrated-demo when invited as companion-insights', async () => {
    const invite = await roomServiceA.createInvitation({ roomCode, role: 'companion-insights' });

    // Client D attempts multi-path join claiming role 'blink-device' instead of invited 'companion-insights'
    const forgedUpdates: Record<string, any> = {};
    forgedUpdates[`rooms/${roomCode}/members/${clientD.uid}`] = {
      uid: clientD.uid,
      role: 'blink-device', // Forged role!
      inviteCode: invite.id,
      joinedAt: Date.now(),
      status: 'connected',
    };
    forgedUpdates[`rooms/${roomCode}/invitations/${invite.id}/consumed`] = true;
    forgedUpdates[`rooms/${roomCode}/invitations/${invite.id}/consumedBy`] = clientD.uid;
    forgedUpdates[`rooms/${roomCode}/invitations/${invite.id}/consumedAt`] = Date.now();

    await expect(update(ref(clientD.rtdb), forgedUpdates)).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  // Test 6: Membership write without invitation consumption
  it('rejects membership creation if the invitation is NOT atomically consumed in the same write', async () => {
    const invite = await roomServiceA.createInvitation({ roomCode, role: 'companion-insights' });

    // Attacker D attempts to write ONLY to members without marking the invitation consumed
    await expect(
      set(ref(clientD.rtdb, `rooms/${roomCode}/members/${clientD.uid}`), {
        uid: clientD.uid,
        role: 'companion-insights',
        inviteCode: invite.id,
        joinedAt: Date.now(),
        status: 'connected',
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Test 7: Invitation consumption without authorized membership creation
  it('rejects consuming an invitation without simultaneously creating a membership record', async () => {
    const invite = await roomServiceA.createInvitation({ roomCode, role: 'companion-insights' });

    // Attacker D attempts to mark the invitation consumed without adding themselves to members
    await expect(
      update(ref(clientD.rtdb, `rooms/${roomCode}/invitations/${invite.id}`), {
        consumed: true,
        consumedBy: clientD.uid,
        consumedAt: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Test 8: Unauthorized room creation or ownership change
  it('rejects unauthorized room creation or tampering with room ownership', async () => {
    // Attacker D tries to create room claiming createdBy is Client A
    const forgedRoom = {
      roomCode: `FORGED-${Date.now()}`,
      schemaVersion: 1,
      createdAt: Date.now(),
      createdBy: clientA.uid, // Impersonating Client A
      expiresAt: Date.now() + 86400000,
      status: 'active',
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

    await expect(set(ref(clientD.rtdb, `rooms/${forgedRoom.roomCode}`), forgedRoom)).rejects.toThrow(
      /permission_denied|permission denied/i
    );

    // Attacker D attempts to change createdBy of an existing room
    await expect(
      set(ref(clientD.rtdb, `rooms/${roomCode}/createdBy`), clientD.uid)
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });
});
