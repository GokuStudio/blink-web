import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DemoPage } from '@/pages/DemoPage';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import { MockRoomService } from '@/shared/realtime/services/mock-room.service';
import { DeviceTelemetryPublisher } from '@/features/blink-device/telemetry/deviceTelemetryPublisher';
import { useDeviceStore } from '@/features/blink-device/state';
import { useTrackingStore } from '@/features/blink-device/state/trackingStore';
import { useWellnessStore } from '@/features/blink-device/wellness/wellnessStore';
import { usePersonalityStore } from '@/features/blink-device/personality';
import {
  useDiagnosticStore,
  sanitizeDiagnosticText,
  classifyCameraError,
} from '@/features/demo/diagnostics/diagnosticStore';

function renderIntegratedDemo(service: MockRealtimeService, initialRoute = '/demo?room=STAGE-2A1') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/demo" element={<DemoPage realtimeService={service} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Blink Stage 2A.1 — Integrated Experience & Live Demo Reliability', () => {
  let sharedService: MockRealtimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    sharedService = new MockRealtimeService();
    sharedService.setMockUid('integrated-test-user');

    useDiagnosticStore.getState().resetStore();
    useDeviceStore.getState().setExpression('idle');
    useDeviceStore.getState().resetMaterialParams();
    useWellnessStore.getState().resetMonitoring();
    usePersonalityStore.getState().stopEngine();
    usePersonalityStore.getState().resetOwnership();
    useTrackingStore.setState({
      permissionState: 'idle',
      isCameraActive: false,
      isModelLoaded: false,
      isModelLoading: false,
      modelError: null,
      cameraError: null,
      isFaceDetected: false,
      trackingConfidence: 0,
      blinkCount: 0,
      leftWinkCount: 0,
      rightWinkCount: 0,
      closureLeft: 0,
      closureRight: 0,
    });
  });

  afterEach(() => {
    usePersonalityStore.getState().stopEngine();
    useDiagnosticStore.getState().resetStore();
  });

  it('1. renders Blink Device and Elevated Insights side-by-side with shared room and no false LIVE badge', async () => {
    renderIntegratedDemo(sharedService);

    expect(screen.getByTestId('demo-integrated-stage')).toBeInTheDocument();
    expect(screen.getByTestId('device-shell-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('eye-webgl-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('insights-elevated-app')).toBeInTheDocument();

    // Shared room badge reflects URL room param
    expect(screen.getByTestId('room-session-trigger')).toHaveTextContent('STAGE-2A1');

    // Camera is off -> Elevated must NOT falsely report LIVE; stage must report Ready (not Offline)
    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
      expect(screen.getByTestId('stage-state-badge')).toHaveTextContent(/Ready/i);
    });
  });

  it('2. keeps Elevated interactive while Device remains mounted in DOM', async () => {
    renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    // Navigate Elevated tabs: Rhythm -> Node -> Blink
    fireEvent.click(screen.getByRole('button', { name: /Rhythm/i }));
    expect(await screen.findByText(/Eye Rhythm/i)).toBeInTheDocument();
    expect(screen.getByTestId('device-shell-desktop')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Node/i }));
    expect(await screen.findByText(/Blink Desk Node 01/i)).toBeInTheDocument();
    expect(screen.getByTestId('device-shell-desktop')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Blink$/i }));
    expect(await screen.findByText(/Session rhythm/i)).toBeInTheDocument();
  });

  it('3. propagates real camera telemetry through shared room to Elevated LIVE mode and updates blink count immediately', async () => {
    renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
    });

    // Simulate active real camera with face lock and confirmed bilateral blinks during <30s baseline window
    await act(async () => {
      useWellnessStore.getState().startMonitoring();
      useTrackingStore.setState({
        permissionState: 'granted',
        isCameraActive: true,
        isModelLoaded: true,
        isFaceDetected: true,
        trackingConfidence: 0.96,
        blinkCount: 4,
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
      },
      { timeout: 2500 }
    );

    // Total Blinks reflects confirmed blinks immediately while BPM acquires 30s baseline
    expect(screen.getByTestId('metric-total-blinks')).toHaveTextContent('4');
    expect(screen.getByTestId('stage-state-badge')).toHaveTextContent(/Live/i);
  });

  it('4. detects face loss, transitions stage to TRACKING_LOST, and auto-resolves Issue Center warning when face returns', async () => {
    renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    // Active camera + face detected
    await act(async () => {
      useTrackingStore.setState({
        permissionState: 'granted',
        isCameraActive: true,
        isModelLoaded: true,
        isFaceDetected: true,
        trackingConfidence: 0.95,
      });
    });

    // Face leaves frame
    await act(async () => {
      useTrackingStore.setState({
        isFaceDetected: false,
        trackingConfidence: 0,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('stage-state-badge')).toHaveTextContent(/Tracking Lost/i);
      expect(
        useDiagnosticStore.getState().activeIssues.some((i) => i.code === 'FACE_OUT_OF_FRAME')
      ).toBe(true);
    });

    // Face returns -> issue auto-resolves into session history
    await act(async () => {
      useTrackingStore.setState({
        isFaceDetected: true,
        trackingConfidence: 0.94,
      });
    });

    await waitFor(() => {
      expect(
        useDiagnosticStore.getState().activeIssues.some((i) => i.code === 'FACE_OUT_OF_FRAME')
      ).toBe(false);
      expect(
        useDiagnosticStore.getState().resolvedHistory.some((i) => i.code === 'FACE_OUT_OF_FRAME')
      ).toBe(true);
    });
  });

  it('5. Issue Center deduplicates errors, sanitizes secrets, opens/closes via Escape, and recovers cleanly', async () => {
    // Unit verification of sanitization & error classification
    const dirty = 'Auth error AIzaSyD-1234567890abcdef12345 at https://secret.firebaseio.com/key\n    at foo (bar.ts:12)';
    const clean = sanitizeDiagnosticText(dirty);
    expect(clean).not.toContain('AIzaSyD');
    expect(clean).not.toContain('https://secret');
    expect(clean).not.toContain('bar.ts:12');

    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('CAMERA_PERMISSION_DENIED');
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('CAMERA_NOT_FOUND');
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('CAMERA_IN_USE');

    renderIntegratedDemo(sharedService);

    // Report duplicate camera permission error -> must deduplicate to a single entry
    await act(async () => {
      useDiagnosticStore.getState().reportIssue('CAMERA_PERMISSION_DENIED');
      useDiagnosticStore.getState().reportIssue('CAMERA_PERMISSION_DENIED');
    });

    const deniedIssues = useDiagnosticStore
      .getState()
      .activeIssues.filter((i) => i.code === 'CAMERA_PERMISSION_DENIED');
    expect(deniedIssues).toHaveLength(1);

    // Trigger badge displays attention count
    expect(screen.getByTestId('issue-center-badge')).toHaveTextContent('1');

    // Click to open popover
    fireEvent.click(screen.getByTestId('issue-center-trigger'));
    expect(await screen.findByTestId('issue-center-popover')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-issue-CAMERA_PERMISSION_DENIED')).toBeInTheDocument();

    // Escape closes popover
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('issue-center-popover')).not.toBeInTheDocument();
    });

    // Resolving clears active error badge
    await act(async () => {
      useDiagnosticStore.getState().resolveIssue('CAMERA_PERMISSION_DENIED');
    });
    expect(screen.queryByTestId('issue-center-badge')).not.toBeInTheDocument();
  });

  it('6. Explore Blink guide enforces honest observation-backed status, previews expressions/nudges, and tests offline recovery', async () => {
    renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
    });

    // Open Explore Blink guide
    fireEvent.click(screen.getByTestId('explore-blink-trigger'));
    expect(await screen.findByTestId('explore-blink-panel')).toBeInTheDocument();

    // Step 2 (Enable camera) must NOT be Passed before camera is granted
    expect(screen.getByTestId('guide-step-2')).toHaveTextContent(/Not started/i);

    // Step 11: Expression preview updates DeviceStore via PersonalityStore ownership
    fireEvent.click(screen.getByTestId('guide-expr-happy'));
    expect(useDeviceStore.getState().expression).toBe('happy');
    expect(usePersonalityStore.getState().owner).toBe('user');

    fireEvent.click(screen.getByTestId('guide-expr-thinking'));
    expect(useDeviceStore.getState().expression).toBe('thinking');
    await waitFor(() => {
      expect(screen.getByTestId('guide-step-11')).toHaveTextContent(/Passed/i);
    });

    // Step 10: Safe nudge preview triggers nudging without changing production thresholds
    const thresholdBefore = useWellnessStore.getState().config.noBlinkNudgeThresholdMs;
    fireEvent.click(screen.getByTestId('guide-trigger-nudge-btn'));
    expect(useDeviceStore.getState().expression).toBe('nudging');
    expect(useWellnessStore.getState().config.noBlinkNudgeThresholdMs).toBe(thresholdBefore);

    // Simulate nudge choreography finishing -> Step 10 transitions to Passed
    await act(async () => {
      useWellnessStore.getState().onNudgeFinished();
      useDeviceStore.getState().setExpression('idle');
    });
    await waitFor(() => {
      expect(screen.getByTestId('guide-step-10')).toHaveTextContent(/Passed/i);
    });

    // Step 12: Disconnect and recover cycle
    fireEvent.click(screen.getByTestId('guide-disconnect-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('OFFLINE');
    });

    fireEvent.click(screen.getByTestId('guide-reconnect-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).not.toHaveTextContent('OFFLINE');
      expect(screen.getByTestId('guide-step-12')).toHaveTextContent(/Passed/i);
    });
  });

  it('7. responsive pane switcher toggles visibility without unmounting Device or Elevated', async () => {
    renderIntegratedDemo(sharedService);

    const deviceEl = screen.getByTestId('device-shell-desktop');
    const elevatedEl = screen.getByTestId('insights-elevated-app');

    // Switch to Device pane on compact layout
    fireEvent.click(screen.getByTestId('pane-switch-device'));
    expect(screen.getByTestId('device-shell-desktop')).toBe(deviceEl);
    expect(screen.getByTestId('insights-elevated-app')).toBe(elevatedEl);

    // Switch back to Companion pane — exact same DOM instances remain mounted
    fireEvent.click(screen.getByTestId('pane-switch-companion'));
    expect(screen.getByTestId('device-shell-desktop')).toBe(deviceEl);
    expect(screen.getByTestId('insights-elevated-app')).toBe(elevatedEl);
  });

  it('8. cleans up personality engine and realtime subscriptions cleanly on unmount', async () => {
    const disconnectSpy = vi.spyOn(sharedService, 'disconnect');
    const { unmount } = renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(usePersonalityStore.getState().isRunning).toBe(true);
    });

    unmount();

    expect(usePersonalityStore.getState().isRunning).toBe(false);
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('9. creates new fail-closed Firebase room when getRoom denies, and fails closed if createRoom is also denied', async () => {
    const mockRealtime = new MockRealtimeService();
    const mockRoom = new MockRoomService();

    vi.spyOn(mockRoom, 'getRoom').mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    const createRoomSpy = vi.spyOn(mockRoom, 'createRoom');

    const publisher = new DeviceTelemetryPublisher(
      { roomCode: 'NEW-CLOUD-ROOM', role: 'integrated-demo', autoPublish: false },
      mockRealtime,
      mockRoom
    );

    const ok = await publisher.connect('NEW-CLOUD-ROOM');
    expect(ok).toBe(true);
    expect(createRoomSpy).toHaveBeenCalledWith({
      roomCode: 'NEW-CLOUD-ROOM',
      role: 'integrated-demo',
    });
    await publisher.disconnect();

    // Unauthorized access to an existing room owned by another user must fail closed
    vi.spyOn(mockRoom, 'getRoom').mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    vi.spyOn(mockRoom, 'createRoom').mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    const unauthorizedOk = await publisher.connect('OTHER-USER-ROOM');
    expect(unauthorizedOk).toBe(false);
    expect(publisher.getDiagnostics().connectionStatus).toBe('failed');
    expect(publisher.getDiagnostics().lastPublishError).toContain('PERMISSION_DENIED');
  });

  it('10. detects stale telemetry (>3.5s) and unexpected camera stream interruption in Issue Center', async () => {
    renderIntegratedDemo(sharedService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
    });

    // Publish stale telemetry (> 3500ms old)
    await act(async () => {
      await sharedService.publishTelemetry({
        eventId: 'evt-stale-gate',
        schemaVersion: 1,
        timestamp: Date.now() - 5000,
        isSimulated: false,
        deviceId: 'blink-integrated-01',
        blinkCount: 12,
        sessionDurationSeconds: 60,
        currentBlinkRatePerMinute: 16,
        averageBlinkRatePerMinute: 16,
        eyeFatigueScore: 15,
        eyeHealthScore: 85,
        eyeAspectRatio: { left: 0.35, right: 0.35 },
      });
    });

    await waitFor(() => {
      expect(
        useDiagnosticStore.getState().activeIssues.some((i) => i.code === 'TELEMETRY_STALE')
      ).toBe(true);
    });

    // Simulate active camera then unexpected track drop (not user disableCamera)
    await act(async () => {
      useTrackingStore.setState({
        permissionState: 'granted',
        isCameraActive: true,
        isModelLoaded: true,
        isFaceDetected: true,
      });
    });

    await act(async () => {
      useTrackingStore.setState({
        permissionState: 'idle',
        isCameraActive: false,
        isFaceDetected: false,
      });
    });

    await waitFor(() => {
      expect(
        useDiagnosticStore.getState().activeIssues.some((i) => i.code === 'CAMERA_STREAM_INTERRUPTED')
      ).toBe(true);
    });
  });
});
