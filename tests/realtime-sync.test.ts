import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, Auth } from 'firebase/auth';
import { getDatabase, ref, set, get, connectDatabaseEmulator, Database } from 'firebase/database';
import { firebaseConfig } from '@/shared/firebase/config';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import {
  DeviceCommand,
  DeviceTelemetry,
  DEFAULT_TELEMETRY,
  INITIAL_DEVICE_STATE,
  CommandAcknowledgment,
} from '@/shared/contracts';

interface TestClient {
  app: FirebaseApp;
  auth: Auth;
  rtdb: Database;
  uid: string;
}

describe('F2B: Live Command & Telemetry Synchronization (Emulator-Backed)', () => {
  let clientA: TestClient; // Device (Creator)
  let clientB: TestClient; // Controller (Companion Insights)
  let clientC: TestClient; // Unauthorized / Attacker

  let roomServiceA: FirebaseRoomService;
  let roomServiceB: FirebaseRoomService;
  let realtimeA: FirebaseRealtimeService;
  let realtimeB: FirebaseRealtimeService;
  let realtimeC: FirebaseRealtimeService;

  const roomCode = `SYNC-${Date.now().toString(36).toUpperCase()}`;
  let inviteCode = '';

  beforeAll(async () => {
    // Client A setup (Device)
    const appA = initializeApp(firebaseConfig, `sync-app-A-${Date.now()}`);
    const authA = getAuth(appA);
    const rtdbA = getDatabase(appA);
    connectAuthEmulator(authA, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbA, '127.0.0.1', 9000);
    const credA = await signInAnonymously(authA);
    clientA = { app: appA, auth: authA, rtdb: rtdbA, uid: credA.user.uid };

    // Client B setup (Controller)
    const appB = initializeApp(firebaseConfig, `sync-app-B-${Date.now()}`);
    const authB = getAuth(appB);
    const rtdbB = getDatabase(appB);
    connectAuthEmulator(authB, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbB, '127.0.0.1', 9000);
    const credB = await signInAnonymously(authB);
    clientB = { app: appB, auth: authB, rtdb: rtdbB, uid: credB.user.uid };

    // Client C setup (Attacker)
    const appC = initializeApp(firebaseConfig, `sync-app-C-${Date.now()}`);
    const authC = getAuth(appC);
    const rtdbC = getDatabase(appC);
    connectAuthEmulator(authC, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdbC, '127.0.0.1', 9000);
    const credC = await signInAnonymously(authC);
    clientC = { app: appC, auth: authC, rtdb: rtdbC, uid: credC.user.uid };

    // Instantiate Services
    roomServiceA = new FirebaseRoomService(clientA.rtdb, clientA.auth);
    roomServiceB = new FirebaseRoomService(clientB.rtdb, clientB.auth);

    realtimeA = new FirebaseRealtimeService(clientA.rtdb, clientA.auth);
    realtimeB = new FirebaseRealtimeService(clientB.rtdb, clientB.auth);
    realtimeC = new FirebaseRealtimeService(clientC.rtdb, clientC.auth);

    // 1. A creates room
    const room = await roomServiceA.createRoom({ roomCode, role: 'blink-device' });
    inviteCode = Object.keys(room.invitations || {})[0];

    // 2. B joins room with invite
    await roomServiceB.joinRoomWithInvite({ roomCode, inviteCode });

    // 3. Both connect realtime services to room
    await realtimeA.connect(roomCode);
    await realtimeB.connect(roomCode);
    await realtimeC.connect(roomCode);
  });

  afterAll(async () => {
    await realtimeA.disconnect();
    await realtimeB.disconnect();
    await realtimeC.disconnect();
    await Promise.all([
      deleteApp(clientA.app),
      deleteApp(clientB.app),
      deleteApp(clientC.app),
    ]);
  });

  // Case 1, 2, 3, 4: Command dispatch & Acknowledgment loop
  it('enables controller to send SET_EXPRESSION, device receives, executes, and controller receives acknowledgment', async () => {
    const cmdId = `cmd-expr-${Date.now()}`;
    const command: DeviceCommand = {
      id: cmdId,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      type: 'SET_EXPRESSION',
      payload: { expression: 'happy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    let receivedByDevice: DeviceCommand | null = null;
    let ackReceivedByController: CommandAcknowledgment | null = null;

    // Device listens for incoming commands
    const unsubDevice = realtimeA.subscribeToCommands(async (receivedCmd) => {
      receivedByDevice = receivedCmd;
      // Device simulates execution and acknowledges
      await realtimeA.acknowledgeCommand(receivedCmd.id, 'executed', 'Happy expression activated');
    });

    // Controller listens for command acknowledgment
    const unsubController = realtimeB.subscribeToCommandStatus(cmdId, (ack) => {
      ackReceivedByController = ack;
    });

    // Controller dispatches command
    await realtimeB.sendCommand(command);

    // Wait for loopback completion
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Verify Device received command (Case 1 & 2)
    expect(receivedByDevice).not.toBeNull();
    const devCmd = receivedByDevice as unknown as DeviceCommand;
    expect(devCmd.id).toBe(cmdId);
    expect(devCmd.type).toBe('SET_EXPRESSION');
    expect(devCmd.senderId).toBe(clientB.uid);

    // Verify Controller received acknowledgment (Case 3 & 4)
    expect(ackReceivedByController).not.toBeNull();
    const ctrlAck = ackReceivedByController as unknown as CommandAcknowledgment;
    expect(ctrlAck.status).toBe('executed');
    expect(ctrlAck.commandId).toBe(cmdId);
    expect(ctrlAck.acknowledgedBy).toBe(clientA.uid);
    expect(ctrlAck.resultMessage).toBe('Happy expression activated');

    unsubDevice();
    unsubController();
  });

  // Case 5: Device telemetry appears in controller subscription
  it('synchronizes device telemetry to controller subscription with isSimulated: true', async () => {
    let receivedTelemetry: DeviceTelemetry | null = null;

    const unsub = realtimeB.subscribeToTelemetry((t) => {
      receivedTelemetry = t;
    });

    const sampleTelemetry: DeviceTelemetry = {
      ...DEFAULT_TELEMETRY,
      eventId: `telem-${Date.now()}`,
      timestamp: Date.now(),
      isSimulated: true,
      currentBlinkRatePerMinute: 19,
      averageBlinkRatePerMinute: 16,
      blinkCount: 55,
      sessionDurationSeconds: 180,
    };

    await realtimeA.publishTelemetry(sampleTelemetry);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedTelemetry).not.toBeNull();
    const telem = receivedTelemetry as unknown as DeviceTelemetry;
    expect(telem.currentBlinkRatePerMinute).toBe(19);
    expect(telem.isSimulated).toBe(true);
    expect(telem.blinkCount).toBe(55);

    unsub();
  });

  // Case 6: Unauthorized user cannot read another room
  it('prohibits unauthorized user from reading room telemetry or commands', async () => {
    await expect(get(ref(clientC.rtdb, `rooms/${roomCode}/telemetry`))).rejects.toThrow(
      /permission_denied|permission denied/i
    );
    await expect(get(ref(clientC.rtdb, `rooms/${roomCode}/commands`))).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  // Case 7: Unauthorized user cannot write telemetry
  it('prohibits unauthorized user or controller from writing telemetry', async () => {
    // Client C (Attacker)
    await expect(
      realtimeC.publishTelemetry({
        ...DEFAULT_TELEMETRY,
        isSimulated: true,
        currentBlinkRatePerMinute: 20,
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);

    // Client B (Controller - only device can publish telemetry)
    await expect(
      realtimeB.publishTelemetry({
        ...DEFAULT_TELEMETRY,
        isSimulated: true,
        currentBlinkRatePerMinute: 20,
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 8: Viewer cannot send commands (only companion-insights / integrated-demo)
  it('prohibits users without companion-insights role from sending commands', async () => {
    const cmd: DeviceCommand = {
      id: `cmd-unauth-${Date.now()}`,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientC.uid,
      type: 'SET_EXPRESSION',
      payload: { expression: 'sleepy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    await expect(realtimeC.sendCommand(cmd)).rejects.toThrow(
      /permission_denied|permission denied/i
    );
  });

  // Case 9: Controller cannot impersonate device to write state
  it('prohibits controller from impersonating device to write device state', async () => {
    await expect(
      realtimeB.publishDeviceState({
        ...INITIAL_DEVICE_STATE,
        revision: 99,
        updatedAt: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 10: Duplicate command does not execute twice
  it('deduplicates command deliveries so command is not executed twice', async () => {
    let executionCount = 0;
    const testCmdId = `cmd-dedup-${Date.now()}`;

    const unsub = realtimeA.subscribeToCommands(async (cmd) => {
      executionCount++;
      await realtimeA.acknowledgeCommand(cmd.id, 'executed', 'Deduplicated test ack');
    });

    const command: DeviceCommand = {
      id: testCmdId,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      type: 'TRIGGER_NUDGE',
      payload: {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    // Send command once
    await realtimeB.sendCommand(command);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(executionCount).toBe(1);

    // Controller attempting to overwrite already sent command is rejected by RTDB rules
    await expect(realtimeB.sendCommand(command)).rejects.toThrow(
      /permission_denied|permission denied/i
    );

    expect(executionCount).toBe(1);
    unsub();
  });

  // Case 11: Expired command is not executed
  it('does not execute expired commands', async () => {
    let executed = false;
    const expiredCmdId = `cmd-expired-${Date.now()}`;

    const unsub = realtimeA.subscribeToCommands(() => {
      executed = true;
    });

    // Expired command with expiresAt in the past
    // Direct set at database to simulate expired backlog
    const expiredCommand: DeviceCommand = {
      id: expiredCmdId,
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: clientB.uid,
      type: 'START_MONITORING',
      payload: {},
      createdAt: Date.now() - 5000,
      expiresAt: Date.now() - 1000, // Expired 1 second ago!
    };

    // Rule rejects creating with expiresAt <= now, validating rule-level defense
    await expect(realtimeB.sendCommand(expiredCommand)).rejects.toThrow(
      /permission_denied|permission denied/i
    );

    expect(executed).toBe(false);
    unsub();
  });

  // Case 12: Outdated state revision is rejected
  it('rejects outdated state revision to prevent concurrency conflicts', async () => {
    // Publish revision 2
    await realtimeA.publishDeviceState({
      ...INITIAL_DEVICE_STATE,
      revision: 2,
      updatedAt: Date.now(),
    });

    // Attempt to publish outdated revision 1 (lower than current 2)
    await expect(
      set(ref(clientA.rtdb, `rooms/${roomCode}/state`), {
        ...INITIAL_DEVICE_STATE,
        revision: 1,
        updatedAt: Date.now(),
      })
    ).rejects.toThrow(/permission_denied|permission denied/i);
  });

  // Case 13: Subscriptions clean up correctly
  it('cleans up subscription listeners properly when unsubscribed', async () => {
    let callCount = 0;
    const unsub = realtimeB.subscribeToTelemetry(() => {
      callCount++;
    });

    // Wait for initial value callback to fire if any
    await new Promise((resolve) => setTimeout(resolve, 100));
    const baseline = callCount;

    await realtimeA.publishTelemetry({
      ...DEFAULT_TELEMETRY,
      currentBlinkRatePerMinute: 24,
      isSimulated: true,
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(callCount).toBe(baseline + 1);

    // Unsubscribe
    unsub();

    await realtimeA.publishTelemetry({
      ...DEFAULT_TELEMETRY,
      currentBlinkRatePerMinute: 26,
      isSimulated: true,
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    // Must remain baseline + 1 after cleanup
    expect(callCount).toBe(baseline + 1);
  });

  // Case 14: Reconnection does not replay already executed commands
  it('does not replay already acknowledged commands upon reconnection', async () => {
    let commandReceived = false;

    // Disconnect and reconnect realtimeA
    await realtimeA.disconnect();
    await realtimeA.connect(roomCode);

    const unsub = realtimeA.subscribeToCommands(() => {
      commandReceived = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    // Existing acknowledged commands from earlier tests should not replay
    expect(commandReceived).toBe(false);

    unsub();
  });
});
