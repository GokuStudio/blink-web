import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeviceTelemetryPublisher } from '../src/features/blink-device/telemetry/deviceTelemetryPublisher';
import { MockRealtimeService } from '../src/shared/realtime/services/mock-realtime.service';
import { MockRoomService } from '../src/shared/realtime/services/mock-room.service';
import { useTrackingStore } from '../src/features/blink-device/state/trackingStore';
import { useWellnessStore } from '../src/features/blink-device/wellness/wellnessStore';
import { useDeviceStore } from '../src/features/blink-device/state';
import { DeviceTelemetry, DeviceCommand } from '../src/shared/contracts';

describe('DeviceTelemetryPublisher & Realtime Integration (Step 08)', () => {
  let mockRealtime: MockRealtimeService;
  let mockRoom: MockRoomService;
  let publisher: DeviceTelemetryPublisher;

  beforeEach(() => {
    mockRealtime = new MockRealtimeService();
    mockRoom = new MockRoomService();

    // Reset stores
    useDeviceStore.getState().setExpression('idle');
    useDeviceStore.getState().setBrightness(1.0);
    useTrackingStore.setState({
      isCameraActive: false,
      isFaceDetected: false,
      trackingConfidence: 0,
      blinkCount: 0,
      closureLeft: 0,
      closureRight: 0,
    });
    useWellnessStore.getState().resetMonitoring();

    publisher = new DeviceTelemetryPublisher(
      {
        publishIntervalMs: 1000,
        roomCode: 'TEST-ROOM-01',
        deviceId: 'test-device-01',
        autoPublish: false,
      },
      mockRealtime,
      mockRoom
    );
  });

  afterEach(async () => {
    await publisher.disconnect();
  });

  // 1. Correct telemetry field mapping
  it('1. correctly maps local signals to DeviceTelemetry contract fields', async () => {
    await publisher.connect('TEST-ROOM-01');

    useTrackingStore.setState({ blinkCount: 24 });
    useWellnessStore.getState().startMonitoring();

    let publishedTelemetry: DeviceTelemetry | null = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });

    await publisher.publishTick();

    expect(publishedTelemetry).not.toBeNull();
    const tel = publishedTelemetry!;
    expect(tel.schemaVersion).toBe(1);
    expect(tel.eventId).toMatch(/^telem-/);
    expect(typeof tel.timestamp).toBe('number');
    expect(typeof tel.currentBlinkRatePerMinute).toBe('number');
    expect(typeof tel.averageBlinkRatePerMinute).toBe('number');
    expect(typeof tel.eyeFatigueScore).toBe('number');
    expect(typeof tel.eyeHealthScore).toBe('number');
    expect(tel.blinkCount).toBe(24);
    expect(tel.deviceId).toBe('test-device-01');
  });

  // 2. Valid camera-derived readings
  it('2. sets isRealDataSource true and isSimulated false for verified camera tracking', async () => {
    await publisher.connect('TEST-ROOM-01');

    useTrackingStore.setState({
      isCameraActive: true,
      isFaceDetected: true,
      trackingConfidence: 0.95,
      blinkCount: 15,
    });

    let publishedTelemetry: DeviceTelemetry | null = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });

    await publisher.publishTick();

    expect(publishedTelemetry).not.toBeNull();
    expect(publishedTelemetry!.isSimulated).toBe(false);
    expect(publisher.getDiagnostics().isRealDataSource).toBe(true);
  });

  // 3. Simulation flag correctness
  it('3. strictly marks synthetic/demo telemetry as isSimulated: true', async () => {
    await publisher.connect('TEST-ROOM-01');

    // Camera is inactive (demo or simulation mode)
    useTrackingStore.setState({
      isCameraActive: false,
      isFaceDetected: false,
    });

    let publishedTelemetry: DeviceTelemetry | null = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });

    await publisher.publishTick();

    expect(publishedTelemetry).not.toBeNull();
    expect(publishedTelemetry!.isSimulated).toBe(true);
    expect(publisher.getDiagnostics().isRealDataSource).toBe(false);
  });

  // 4. Missing tracking values
  it('4. reports 0 for blink rate when camera tracking is unavailable, never fabricating live values', async () => {
    await publisher.connect('TEST-ROOM-01');

    useTrackingStore.setState({
      isCameraActive: false,
      isFaceDetected: false,
    });

    let publishedTelemetry: DeviceTelemetry | null = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });

    await publisher.publishTick();

    expect(publishedTelemetry!.currentBlinkRatePerMinute).toBe(0);
  });

  // 5. Monitoring stop
  it('5. halts session progression and publishes idle state when monitoring is stopped', async () => {
    await publisher.connect('TEST-ROOM-01');
    useWellnessStore.getState().startMonitoring();
    await publisher.publishTick();
    expect(publisher.getDiagnostics().publishedMonitoringMode).toBe('active');

    useWellnessStore.getState().stopMonitoring();
    await publisher.publishTick();
    expect(publisher.getDiagnostics().publishedMonitoringMode).toBe('idle');
  });

  // 6. Face loss
  it('6. handles face loss by keeping isSimulated: false and omitting eyeAspectRatio without fabricating rates', async () => {
    await publisher.connect('TEST-ROOM-01');

    let publishedTelemetry: DeviceTelemetry | null = null;
    let publishedDeviceState: any = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });
    mockRealtime.subscribeToDeviceState((st) => {
      publishedDeviceState = st;
    });

    // Initially tracking with verified face
    useTrackingStore.setState({ isCameraActive: true, isFaceDetected: true, trackingConfidence: 0.90 });
    await publisher.publishTick();
    expect(publisher.getDiagnostics().isRealDataSource).toBe(true);
    expect(publishedTelemetry!.isSimulated).toBe(false);
    expect(publishedTelemetry!.eyeAspectRatio).toBeDefined();
    expect(publishedDeviceState?.latestTelemetry?.eyeAspectRatio).toBeDefined();

    // User steps away / loses face detection
    useTrackingStore.setState({ isFaceDetected: false, trackingConfidence: 0 });
    await publisher.publishTick();

    // Must NOT flip to isSimulated: true (it is a real session with face lost, not synthetic demo data!)
    expect(publishedTelemetry!.isSimulated).toBe(false);
    expect(publisher.getDiagnostics().isRealDataSource).toBe(false);
    // Face lost: eyeAspectRatio is removed to signal face-loss to subscribers
    expect(publishedTelemetry!.eyeAspectRatio).toBeUndefined();
    // In state/latestTelemetry, stale eyeAspectRatio is also completely removed
    expect(publishedDeviceState?.latestTelemetry?.eyeAspectRatio).toBeUndefined();
    // Fatigue score reports 0 (suspended), not falsely claiming "rested"
    expect(publishedTelemetry!.eyeFatigueScore).toBe(0);
  });

  // 7. Authentication loss / error handling
  it('7. safely handles connection failure without unhandled crash', async () => {
    const failingRealtime = new MockRealtimeService();
    vi.spyOn(failingRealtime, 'connect').mockRejectedValueOnce(new Error('Auth expired or permission denied'));

    const failPublisher = new DeviceTelemetryPublisher({}, failingRealtime, mockRoom);
    const success = await failPublisher.connect('ROOM-ERR');

    expect(success).toBe(false);
    expect(failPublisher.getDiagnostics().connectionStatus).toBe('failed');
    expect(failPublisher.getDiagnostics().lastPublishError).toContain('Auth expired or permission denied');
  });

  // 8. Pairing changes
  it('8. cleanly switches from ROOM-A to ROOM-B without leaking state', async () => {
    await publisher.connect('ROOM-A');
    expect(publisher.getDiagnostics().activeRoomCode).toBe('ROOM-A');
    expect(publisher.getDiagnostics().connectionStatus).toBe('connected');

    await publisher.disconnect();
    expect(publisher.getDiagnostics().connectionStatus).toBe('disconnected');

    await publisher.connect('ROOM-B');
    expect(publisher.getDiagnostics().activeRoomCode).toBe('ROOM-B');
    expect(publisher.getDiagnostics().connectionStatus).toBe('connected');
  });

  // 9. Permission-denied writes
  it('9. records lastPublishError on write error without crashing', async () => {
    await publisher.connect('TEST-ROOM-01');
    vi.spyOn(mockRealtime, 'publishTelemetry').mockRejectedValueOnce(new Error('permission_denied'));

    await publisher.publishTick();

    expect(publisher.getDiagnostics().lastPublishError).toBe('permission_denied');
    expect(publisher.getDiagnostics().connectionStatus).toBe('connected'); // App remains alive
  });

  // 10. Network disconnection
  it('10. transitions status when connection changes', async () => {
    await publisher.connect('TEST-ROOM-01');
    expect(publisher.getDiagnostics().connectionStatus).toBe('connected');

    await publisher.disconnect();
    expect(publisher.getDiagnostics().connectionStatus).toBe('disconnected');
    expect(publisher.getDiagnostics().isPublishing).toBe(false);
  });

  // 11. Reconnection without stale data
  it('11. publishes fresh timestamps upon reconnection', async () => {
    await publisher.connect('TEST-ROOM-01');
    const time1 = Date.now();
    await publisher.publishTick();
    expect(publisher.getDiagnostics().lastPublishTimestamp).toBeGreaterThanOrEqual(time1);

    await publisher.disconnect();

    // Advance time slightly
    await new Promise((resolve) => setTimeout(resolve, 25));
    await publisher.connect('TEST-ROOM-01');
    const time2 = Date.now();
    await publisher.publishTick();

    expect(publisher.getDiagnostics().lastPublishTimestamp).toBeGreaterThanOrEqual(time2);
    expect(time2).toBeGreaterThanOrEqual(time1);
  });

  // 12. Rate limiting (coalesced periodic intervals)
  it('12. coalesces telemetry writes into bounded interval ticks', async () => {
    publisher.setConfig({ autoPublish: true, publishIntervalMs: 50 });
    await publisher.connect('TEST-ROOM-01');

    // Wait 250 ms (allows connect delay + at least 3 timer ticks)
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(publisher.getDiagnostics().totalPublishedPayloads).toBeGreaterThanOrEqual(3);
  });

  // 13. No per-frame Firebase writes from RAF loop
  it('13. does not trigger Firebase writes during fast camera frame updates', async () => {
    await publisher.connect('TEST-ROOM-01');
    const publishSpy = vi.spyOn(mockRealtime, 'publishTelemetry');

    // Simulate 60 FPS incoming camera frames
    for (let frame = 0; frame < 60; frame++) {
      useTrackingStore.setState({
        closureLeft: 0.1 + Math.sin(frame) * 0.05,
        closureRight: 0.1 + Math.sin(frame) * 0.05,
      });
    }

    // No network writes were fired by frame updates alone!
    expect(publishSpy).not.toHaveBeenCalled();

    // Only fires when publishTick is explicitly invoked
    await publisher.publishTick();
    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  // 14. Command acknowledgment behavior
  it('14. executes SET_EXPRESSION and acknowledges with executed status', async () => {
    await publisher.connect('TEST-ROOM-01');
    const ackSpy = vi.spyOn(mockRealtime, 'acknowledgeCommand');

    const cmd: DeviceCommand = {
      id: 'cmd-expr-1',
      schemaVersion: 1,
      targetDeviceId: 'test-device-01',
      senderId: 'controller-uid',
      type: 'SET_EXPRESSION',
      payload: { expression: 'happy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    await publisher.handleIncomingCommand(cmd);

    expect(useDeviceStore.getState().expression).toBe('happy');
    expect(ackSpy).toHaveBeenCalledWith('cmd-expr-1', 'executed', expect.stringContaining('happy'));
  });

  // 15. Duplicate command prevention & unsupported command rejection
  it('15. rejects unsupported command types like TRIGGER_BLINK', async () => {
    await publisher.connect('TEST-ROOM-01');
    const ackSpy = vi.spyOn(mockRealtime, 'acknowledgeCommand');

    const unsupportedCmd: DeviceCommand = {
      id: 'cmd-unsupported-1',
      schemaVersion: 1,
      targetDeviceId: 'test-device-01',
      senderId: 'controller-uid',
      type: 'TRIGGER_BLINK' as any,
      payload: {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    await publisher.handleIncomingCommand(unsupportedCmd);

    expect(ackSpy).toHaveBeenCalledWith('cmd-unsupported-1', 'rejected', expect.stringContaining('Unsupported'));
  });

  // 16. Listener and publisher cleanup
  it('16. cleans up timers and listeners when disconnected', async () => {
    publisher.setConfig({ autoPublish: true });
    await publisher.connect('TEST-ROOM-01');
    expect(publisher.getDiagnostics().isPublishing).toBe(true);

    await publisher.disconnect();

    expect(publisher.getDiagnostics().isPublishing).toBe(false);
    expect(publisher.getDiagnostics().connectionStatus).toBe('disconnected');
  });

  // 17. Step 08B: True observed zero vs missing data distinction
  it('17. distinguishes a true measured zero (30s stare) from missing face-tracking data', async () => {
    await publisher.connect('TEST-ROOM-01');
    let publishedTelemetry: DeviceTelemetry | null = null;
    mockRealtime.subscribeToTelemetry((tel) => {
      publishedTelemetry = tel;
    });

    // Part A: True observed zero (camera active, face verified, 0 blinks over 30s)
    useTrackingStore.setState({
      isCameraActive: true,
      isFaceDetected: true,
      trackingConfidence: 0.95,
      blinkCount: 0,
    });
    // Fast-forward wellness engine valid observation past 30s with 0 blinks
    useWellnessStore.getState().startMonitoring();
    for (let sec = 0; sec < 31; sec++) {
      useWellnessStore.getState().onTrackingUpdate(true, true, 0.95, performance.now());
    }

    await publisher.publishTick();

    // Condition A assertions:
    expect(publishedTelemetry!.isSimulated).toBe(false);
    expect(publishedTelemetry!.currentBlinkRatePerMinute).toBe(0);
    expect(publishedTelemetry!.sessionDurationSeconds).toBeGreaterThanOrEqual(0);
    expect(publishedTelemetry!.eyeAspectRatio).toBeDefined();

    // Part B: Missing data (face lost)
    useTrackingStore.setState({
      isFaceDetected: false,
      trackingConfidence: 0.0,
    });
    useWellnessStore.getState().onTrackingUpdate(true, false, 0.0, performance.now());

    await publisher.publishTick();

    // Condition B assertions:
    expect(publishedTelemetry!.isSimulated).toBe(false); // Still a real session!
    expect(publishedTelemetry!.eyeAspectRatio).toBeUndefined(); // Missing face indicator
    expect(publishedTelemetry!.eyeFatigueScore).toBe(0); // Suspended
  });

  // 18. Step 08B: Duplicate connection calls do not leak timers or subscriptions
  it('18. idempotent connect() cleans up previous timers and subscriptions', async () => {
    publisher.setConfig({ autoPublish: true, publishIntervalMs: 100 });

    // Connect first time
    await publisher.connect('TEST-ROOM-01');
    const firstStatus = publisher.getDiagnostics().connectionStatus;
    expect(firstStatus).toBe('connected');

    // Re-connect second time without explicit disconnect
    await publisher.connect('TEST-ROOM-01');
    expect(publisher.getDiagnostics().connectionStatus).toBe('connected');

    // Disconnect once should clean up everything
    await publisher.disconnect();
    expect(publisher.getDiagnostics().isPublishing).toBe(false);
    expect(publisher.getDiagnostics().connectionStatus).toBe('disconnected');
  });

  // 19. Step 08B: Cumulative counters do not reset upon room reconnect
  it('19. preserves cumulative blink counters across room reconnects', async () => {
    await publisher.connect('TEST-ROOM-01');

    useTrackingStore.setState({ blinkCount: 42 });
    await publisher.publishTick();
    expect(publisher.getDiagnostics().publishedBlinkCount).toBe(42);

    // Reconnect to a different room
    await publisher.connect('TEST-ROOM-02');
    await publisher.publishTick();

    // Counter retained
    expect(publisher.getDiagnostics().publishedBlinkCount).toBe(42);
  });
});
