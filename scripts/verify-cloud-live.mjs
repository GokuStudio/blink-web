// scripts/verify-cloud-live.mjs
// F3C Live Cloud Verification Script for Blink Web
// Tests live Firebase Auth & Realtime Database on blink-web-demo-32e0e

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  onChildAdded,
  off,
} from 'firebase/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load and parse .env.local
const envPath = path.join(rootDir, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env.local not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    envVars[key] = val;
  }
}

const firebaseConfig = {
  apiKey: envVars.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID,
  databaseURL: envVars.VITE_FIREBASE_DATABASE_URL,
};

function mask(str, show = 4) {
  if (!str) return 'none';
  if (str.length <= show * 2) return '***';
  return `${str.slice(0, show)}...${str.slice(-show)}`;
}

function isPermissionDenied(err) {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('permission denied') || msg.includes('permission_denied');
}

console.log('====================================================');
console.log('BLINK WEB — F3C LIVE CLOUD VERIFICATION');
console.log('====================================================');
console.log(`Target Project ID: ${firebaseConfig.projectId}`);
console.log(`Database URL:      ${firebaseConfig.databaseURL}`);
console.log(`Auth Domain:       ${firebaseConfig.authDomain}`);
console.log(`API Key (masked):  ${mask(firebaseConfig.apiKey, 6)}`);
console.log('====================================================\n');

const results = {
  step1_auth: false,
  step2_createRoom: false,
  step3_createInvite: false,
  step4_joinRoom: false,
  step5_6_sendCommand: false,
  step7_8_acknowledgeCommand: false,
  step9_10_telemetrySync: false,
  step11_12_unauthorizedRejection: false,
  step13_duplicateExpiredRejection: false,
  step14_roomClosedByOwner: false,
  step14_roomCleanedUp: false,
  roomCode: '',
};

async function runVerification() {
  const ts = Date.now().toString(36).toUpperCase();
  const roomCode = `CLOUD-TEST-${ts}`;
  results.roomCode = roomCode;

  console.log(`Dedicated Test Room Identifier: ${roomCode}\n`);

  // Initialize independent Firebase apps for three clients
  const appA = initializeApp(firebaseConfig, `cloud-device-${ts}`);
  const authA = getAuth(appA);
  const rtdbA = getDatabase(appA);

  const appB = initializeApp(firebaseConfig, `cloud-controller-${ts}`);
  const authB = getAuth(appB);
  const rtdbB = getDatabase(appB);

  const appC = initializeApp(firebaseConfig, `cloud-unauthorized-${ts}`);
  const authC = getAuth(appC);
  const rtdbC = getDatabase(appC);

  let userA, userB, userC;

  try {
    // ----------------------------------------------------
    // STEP 1: Authenticate two independent anonymous users
    // ----------------------------------------------------
    console.log('[Step 1] Authenticating independent anonymous users...');
    const credA = await signInAnonymously(authA);
    userA = credA.user;
    const credB = await signInAnonymously(authB);
    userB = credB.user;

    if (!userA.uid || !userB.uid || userA.uid === userB.uid) {
      throw new Error(`Auth failed: UIDs not unique or missing. userA=${userA.uid}, userB=${userB.uid}`);
    }
    console.log(`  ✓ Client A (Device) UID:     ${mask(userA.uid, 6)}`);
    console.log(`  ✓ Client B (Controller) UID: ${mask(userB.uid, 6)}`);
    results.step1_auth = true;

    // ----------------------------------------------------
    // STEP 2: Create a temporary Blink test room
    // ----------------------------------------------------
    console.log('\n[Step 2] Creating temporary cloud test room (Client A)...');
    const now = Date.now();
    const roomData = {
      roomCode,
      schemaVersion: 1,
      createdAt: now,
      createdBy: userA.uid,
      expiresAt: now + 3600000, // 1 hour
      status: 'active',
      deviceState: {
        connected: true,
        batteryLevel: 98,
        isBlinking: false,
        currentExpression: 'neutral',
        brightness: 80,
        soundEnabled: true,
        revision: 1,
        updatedAt: now,
        deviceName: `Blink [${roomCode}]`,
      },
      members: {
        [userA.uid]: {
          uid: userA.uid,
          role: 'blink-device',
          joinedAt: now,
          status: 'connected',
        },
      },
    };

    await set(ref(rtdbA, `rooms/${roomCode}`), roomData);
    console.log(`  ✓ Room '${roomCode}' created successfully by owner ${mask(userA.uid, 6)}`);
    results.step2_createRoom = true;

    // ----------------------------------------------------
    // STEP 3: Generate a valid controller invitation
    // ----------------------------------------------------
    console.log('\n[Step 3] Generating controller invitation (Client A)...');
    const inviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;
    const inviteData = {
      id: inviteCode,
      roomId: roomCode,
      role: 'companion-insights',
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000, // 10 minutes
      consumed: false,
      consumedBy: null,
      consumedAt: null,
    };

    await set(ref(rtdbA, `rooms/${roomCode}/invitations/${inviteCode}`), inviteData);
    console.log(`  ✓ Invitation '${mask(inviteCode, 4)}' created for role 'companion-insights'`);
    results.step3_createInvite = true;

    // ----------------------------------------------------
    // STEP 4: Join room from second authenticated client (Client B)
    // ----------------------------------------------------
    console.log('\n[Step 4] Joining room via atomic multi-path update (Client B)...');
    const joinTime = Date.now();
    const joinUpdates = {};
    joinUpdates[`rooms/${roomCode}/members/${userB.uid}`] = {
      uid: userB.uid,
      role: 'companion-insights',
      inviteCode: inviteCode,
      joinedAt: joinTime,
      status: 'connected',
    };
    joinUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumed`] = true;
    joinUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumedBy`] = userB.uid;
    joinUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumedAt`] = joinTime;

    await update(ref(rtdbB), joinUpdates);

    // Verify membership record readable by Client B
    const memberSnap = await get(ref(rtdbB, `rooms/${roomCode}/members/${userB.uid}`));
    if (!memberSnap.exists() || memberSnap.val().role !== 'companion-insights') {
      throw new Error('Join verification failed: member record not found or role mismatch');
    }
    console.log(`  ✓ Client B joined room '${roomCode}' successfully as 'companion-insights'`);
    results.step4_joinRoom = true;

    // ----------------------------------------------------
    // STEP 5 & 6: Send SET_EXPRESSION command and verify device receipt
    // ----------------------------------------------------
    console.log('\n[Step 5 & 6] Sending SET_EXPRESSION command & verifying device receipt...');
    const cmdId = `cmd-${Date.now()}`;
    const commandPayload = {
      id: cmdId,
      type: 'SET_EXPRESSION',
      payload: { expression: 'happy', durationMs: 4000 },
      targetDeviceId: userA.uid,
      senderId: userB.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      status: 'pending',
    };

    // Client A sets up listener for commands
    const commandReceivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off(ref(rtdbA, `rooms/${roomCode}/commands`));
        reject(new Error('Timeout waiting for command on Client A'));
      }, 10000);

      onChildAdded(ref(rtdbA, `rooms/${roomCode}/commands`), (snap) => {
        if (snap.exists() && snap.val().id === cmdId) {
          clearTimeout(timeout);
          off(ref(rtdbA, `rooms/${roomCode}/commands`));
          resolve(snap.val());
        }
      });
    });

    // Client B sends command
    await set(ref(rtdbB, `rooms/${roomCode}/commands/${cmdId}`), commandPayload);
    console.log(`  ✓ Command '${cmdId}' (SET_EXPRESSION: happy) dispatched by Client B`);

    const receivedCommand = await commandReceivedPromise;
    if (receivedCommand.type !== 'SET_EXPRESSION' || receivedCommand.payload?.expression !== 'happy') {
      throw new Error(`Command payload mismatch: ${JSON.stringify(receivedCommand)}`);
    }
    console.log(`  ✓ Device (Client A) received command '${cmdId}' in real time`);
    results.step5_6_sendCommand = true;

    // ----------------------------------------------------
    // STEP 7 & 8: Publish execution acknowledgment & verify controller receipt
    // ----------------------------------------------------
    console.log('\n[Step 7 & 8] Publishing acknowledgment & verifying controller receipt...');
    const ackReceivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off(ref(rtdbB, `rooms/${roomCode}/commands/${cmdId}`));
        reject(new Error('Timeout waiting for command acknowledgment on Client B'));
      }, 10000);

      onValue(ref(rtdbB, `rooms/${roomCode}/commands/${cmdId}`), (snap) => {
        if (snap.exists() && snap.val().status === 'executed') {
          clearTimeout(timeout);
          off(ref(rtdbB, `rooms/${roomCode}/commands/${cmdId}`));
          resolve(snap.val());
        }
      });
    });

    // Client A executes command and updates status + device state
    const ackTime = Date.now();
    await update(ref(rtdbA, `rooms/${roomCode}/commands/${cmdId}`), {
      status: 'executed',
      acknowledged: true,
      executedAt: ackTime,
      result: 'Expression set to happy',
    });

    await set(ref(rtdbA, `rooms/${roomCode}/state`), {
      connected: true,
      batteryLevel: 98,
      isBlinking: false,
      currentExpression: 'happy',
      brightness: 80,
      soundEnabled: true,
      revision: 2,
      updatedAt: ackTime,
      deviceName: `Blink [${roomCode}]`,
    });

    const receivedAck = await ackReceivedPromise;
    console.log(`  ✓ Controller (Client B) received acknowledgment: status='${receivedAck.status}'`);

    // Verify state update visible to Client B
    const stateSnap = await get(ref(rtdbB, `rooms/${roomCode}/state`));
    if (stateSnap.val().currentExpression !== 'happy' || stateSnap.val().revision !== 2) {
      throw new Error('Device state was not updated correctly');
    }
    console.log(`  ✓ Device state revision 2 ('happy') confirmed by Client B`);
    results.step7_8_acknowledgeCommand = true;

    // ----------------------------------------------------
    // STEP 9 & 10: Publish simulated telemetry & verify real-time controller receipt
    // ----------------------------------------------------
    console.log('\n[Step 9 & 10] Publishing simulated telemetry & verifying real-time receipt...');
    const telemetryReceivedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off(ref(rtdbB, `rooms/${roomCode}/telemetry`));
        reject(new Error('Timeout waiting for telemetry on Client B'));
      }, 10000);

      onValue(ref(rtdbB, `rooms/${roomCode}/telemetry`), (snap) => {
        if (snap.exists() && snap.val().currentBlinkRatePerMinute === 18) {
          clearTimeout(timeout);
          off(ref(rtdbB, `rooms/${roomCode}/telemetry`));
          resolve(snap.val());
        }
      });
    });

    const telemetryData = {
      timestamp: Date.now(),
      isSimulated: true,
      currentBlinkRatePerMinute: 18,
      averageBlinkDurationMs: 142,
      drowsinessScore: 0.05,
      fatigueLevel: 'low',
      eyeStrainRisk: 'low',
      lightingCondition: 'optimal',
      sessionDurationMinutes: 15,
    };

    await set(ref(rtdbA, `rooms/${roomCode}/telemetry`), telemetryData);
    console.log('  ✓ Client A published simulated telemetry (isSimulated: true, rate: 18 bpm)');

    const receivedTelemetry = await telemetryReceivedPromise;
    if (!receivedTelemetry.isSimulated || receivedTelemetry.currentBlinkRatePerMinute !== 18) {
      throw new Error(`Telemetry validation failed: ${JSON.stringify(receivedTelemetry)}`);
    }
    console.log('  ✓ Controller (Client B) received telemetry stream in real time');
    results.step9_10_telemetrySync = true;

    // ----------------------------------------------------
    // STEP 11 & 12: Authenticate third unauthorized user & verify rejection
    // ----------------------------------------------------
    console.log('\n[Step 11 & 12] Authenticating unauthorized user & verifying permission rejection...');
    const credC = await signInAnonymously(authC);
    userC = credC.user;
    console.log(`  ✓ Client C (Unauthorized) UID: ${mask(userC.uid, 6)}`);

    // Attempt 1: Unauthorized room read
    let readRejected = false;
    try {
      await get(ref(rtdbC, `rooms/${roomCode}`));
    } catch (err) {
      readRejected = isPermissionDenied(err);
    }
    if (!readRejected) throw new Error('Security violation: Unauthorized user could read room data');
    console.log('  ✓ Unauthorized read on /rooms rejected with Permission denied');

    // Attempt 2: Unauthorized command write
    let cmdWriteRejected = false;
    try {
      await set(ref(rtdbC, `rooms/${roomCode}/commands/attack-cmd`), {
        id: 'attack-cmd',
        type: 'SET_EXPRESSION',
        senderId: userC.uid,
        targetDeviceId: userA.uid,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        status: 'pending',
      });
    } catch (err) {
      cmdWriteRejected = isPermissionDenied(err);
    }
    if (!cmdWriteRejected) throw new Error('Security violation: Unauthorized user could write command');
    console.log('  ✓ Unauthorized write on /commands rejected with Permission denied');

    // Attempt 3: Unauthorized state write
    let stateWriteRejected = false;
    try {
      await set(ref(rtdbC, `rooms/${roomCode}/state`), {
        currentExpression: 'angry',
        revision: 99,
        updatedAt: Date.now(),
      });
    } catch (err) {
      stateWriteRejected = isPermissionDenied(err);
    }
    if (!stateWriteRejected) throw new Error('Security violation: Unauthorized user could write state');
    console.log('  ✓ Unauthorized write on /state rejected with Permission denied');

    // Attempt 4: Unauthorized membership forgery
    let memberWriteRejected = false;
    try {
      await set(ref(rtdbC, `rooms/${roomCode}/members/${userC.uid}`), {
        uid: userC.uid,
        role: 'companion-insights',
        joinedAt: Date.now(),
        status: 'connected',
      });
    } catch (err) {
      memberWriteRejected = isPermissionDenied(err);
    }
    if (!memberWriteRejected) throw new Error('Security violation: Unauthorized user could forge membership');
    console.log('  ✓ Unauthorized direct membership write rejected with Permission denied');

    results.step11_12_unauthorizedRejection = true;

    // ----------------------------------------------------
    // STEP 13: Test duplicate or expired invitation rejection
    // ----------------------------------------------------
    console.log('\n[Step 13] Testing duplicate and expired invitation rejection...');

    // 13a: Attempt to redeem already consumed invite
    let duplicateRejected = false;
    try {
      const dupUpdates = {};
      dupUpdates[`rooms/${roomCode}/members/${userC.uid}`] = {
        uid: userC.uid,
        role: 'companion-insights',
        inviteCode: inviteCode,
        joinedAt: Date.now(),
        status: 'connected',
      };
      dupUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumed`] = true;
      dupUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumedBy`] = userC.uid;
      dupUpdates[`rooms/${roomCode}/invitations/${inviteCode}/consumedAt`] = Date.now();
      await update(ref(rtdbC), dupUpdates);
    } catch (err) {
      duplicateRejected = isPermissionDenied(err);
    }
    if (!duplicateRejected) throw new Error('Security violation: Re-redemption of consumed invite succeeded');
    console.log('  ✓ Re-redemption of consumed invitation rejected with Permission denied');

    // 13b: Test expired invitation rejection
    const expInviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;
    await set(ref(rtdbA, `rooms/${roomCode}/invitations/${expInviteCode}`), {
      id: expInviteCode,
      roomId: roomCode,
      role: 'companion-insights',
      createdAt: Date.now(),
      expiresAt: Date.now() + 1500, // expires in 1.5s
      consumed: false,
      consumedBy: null,
      consumedAt: null,
    });
    console.log(`  ✓ Short-lived invitation '${mask(expInviteCode, 4)}' created (expires in 1.5s)`);

    console.log('  ... Waiting 2.5s for invitation expiration ...');
    await new Promise((r) => setTimeout(r, 2500));

    let expiredRejected = false;
    try {
      const expUpdates = {};
      expUpdates[`rooms/${roomCode}/members/${userC.uid}`] = {
        uid: userC.uid,
        role: 'companion-insights',
        inviteCode: expInviteCode,
        joinedAt: Date.now(),
        status: 'connected',
      };
      expUpdates[`rooms/${roomCode}/invitations/${expInviteCode}/consumed`] = true;
      expUpdates[`rooms/${roomCode}/invitations/${expInviteCode}/consumedBy`] = userC.uid;
      expUpdates[`rooms/${roomCode}/invitations/${expInviteCode}/consumedAt`] = Date.now();
      await update(ref(rtdbC), expUpdates);
    } catch (err) {
      expiredRejected = isPermissionDenied(err);
    }
    if (!expiredRejected) throw new Error('Security violation: Expired invitation redemption succeeded');
    console.log('  ✓ Expired invitation redemption rejected with Permission denied');

    results.step13_duplicateExpiredRejection = true;

    // ----------------------------------------------------
    // STEP 14: Client-side room closure by owner & admin cleanup
    // ----------------------------------------------------
    console.log('\n[Step 14] Testing authorized room closure by owner & cloud cleanup...');
    const closeTime = Date.now();
    await update(ref(rtdbA, `rooms/${roomCode}`), {
      status: 'closed',
      closedAt: closeTime,
      closedBy: userA.uid,
    });

    const closedSnap = await get(ref(rtdbA, `rooms/${roomCode}/status`));
    if (closedSnap.val() !== 'closed') {
      throw new Error('Room status was not updated to closed');
    }
    console.log(`  ✓ Room '${roomCode}' marked as 'closed' by owner`);

    // Verify commands rejected after closure
    let postCloseCmdRejected = false;
    try {
      await set(ref(rtdbB, `rooms/${roomCode}/commands/cmd-post-close`), {
        id: 'cmd-post-close',
        type: 'SET_EXPRESSION',
        senderId: userB.uid,
        targetDeviceId: userA.uid,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        status: 'pending',
      });
    } catch (err) {
      postCloseCmdRejected = isPermissionDenied(err);
    }
    if (!postCloseCmdRejected) throw new Error('Security violation: Command accepted on closed room');
    console.log('  ✓ Commands rejected after room closure with Permission denied');
    results.step14_roomClosedByOwner = true;

    // Administrative removal of temporary room to leave 0 bytes on cloud
    console.log(`\n  ... Removing cloud test room '/rooms/${roomCode}' via administrative CLI ...`);
    const removeCmd = `npx firebase-tools database:remove /rooms/${roomCode} --project blink-cloud --instance blink-web-demo-32e0e-default-rtdb --force`;
    execSync(removeCmd, { stdio: 'pipe' });
    console.log(`  ✓ Cloud test room '/rooms/${roomCode}' completely removed from Realtime Database`);
    results.step14_roomCleanedUp = true;
  } finally {
    // ----------------------------------------------------
    // TEARDOWN
    // ----------------------------------------------------
    console.log('\n[Teardown] Cleaning up client sessions and active listeners...');
    try {
      off(ref(rtdbA, `rooms/${roomCode}`));
      off(ref(rtdbB, `rooms/${roomCode}`));
      off(ref(rtdbC, `rooms/${roomCode}`));
    } catch {}

    if (userA) await signOut(authA).catch(() => {});
    if (userB) await signOut(authB).catch(() => {});
    if (userC) await signOut(authC).catch(() => {});

    await deleteApp(appA).catch(() => {});
    await deleteApp(appB).catch(() => {});
    await deleteApp(appC).catch(() => {});
    console.log('  ✓ Client sessions detached and signed out cleanly');
  }

  console.log('\n====================================================');
  console.log('LIVE VERIFICATION SCRIPT EXECUTION FINISHED');
  console.log('====================================================');
}

runVerification()
  .then(() => {
    console.log('\n>>> ALL 14 F3C CLOUD LIVE VERIFICATION STEPS PASSED SUCCESSFULLY! <<<\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ CLOUD LIVE VERIFICATION FAILED:');
    console.error(err);
    process.exit(1);
  });
