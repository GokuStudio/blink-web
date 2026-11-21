import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InsightsApp } from '@/features/insights/elevated/InsightsApp';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import type { DeviceTelemetry } from '@/shared/contracts';
import { INITIAL_DEVICE_STATE } from '@/shared/contracts';

function renderWithService(service: MockRealtimeService, initialRoute = '/insights') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/insights"
          element={<InsightsApp realtimeService={service} roomCode="TEST-ROOM-01" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Blink Elevated Stage 2A: Live Firebase Realtime Data Integration', () => {
  let mockService: MockRealtimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = new MockRealtimeService();
  });

  it('1. Live telemetry mapping: maps telemetry fields to HomeView gauges and cards', async () => {
    renderWithService(mockService);

    // Initial connection sets up MockRealtimeService connected state
    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    const liveTelemetry: DeviceTelemetry = {
      eventId: 'evt-001',
      schemaVersion: 1,
      timestamp: now,
      isSimulated: false,
      deviceId: 'blink-device-01',
      blinkCount: 780,
      sessionDurationSeconds: 245, // 04:05
      currentBlinkRatePerMinute: 18,
      averageBlinkRatePerMinute: 17.5,
      eyeFatigueScore: 18,
      eyeHealthScore: 82,
      eyeAspectRatio: { left: 0.32, right: 0.33 },
    };

    await act(async () => {
      await mockService.publishTelemetry(liveTelemetry);
    });

    // Verify 1. Monitoring Time: 245s -> 04:05
    await waitFor(() => {
      expect(screen.getByText('04:05')).toBeInTheDocument();
    });

    // Verify 2. Total Blinks: 780
    expect(screen.getByText('780')).toBeInTheDocument();

    // Verify 3. Blinks / Min: 18
    expect(screen.getByText('18')).toBeInTheDocument();

    // Verify 4. Average Rate: 17.5
    expect(screen.getByText('17.5')).toBeInTheDocument();

    // Verify 5. Mode is LIVE because isSimulated is false and data is fresh
    expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
  });

  it('2. Simulation labeling: displays DEMO badge when isSimulated is true', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    const demoTelemetry: DeviceTelemetry = {
      eventId: 'evt-demo',
      schemaVersion: 1,
      timestamp: now,
      isSimulated: true,
      deviceId: 'blink-demo-device',
      blinkCount: 520,
      sessionDurationSeconds: 120,
      currentBlinkRatePerMinute: 16,
      averageBlinkRatePerMinute: 15.8,
      eyeFatigueScore: 25,
      eyeHealthScore: 75,
      eyeAspectRatio: { left: 0.35, right: 0.35 },
    };

    await act(async () => {
      await mockService.publishTelemetry(demoTelemetry);
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
    });
  });

  it('3. Valid zero rate (Condition A / 30s Stare): highlights stare fatigue alert', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    // Condition A: real camera session, face detected, duration >= 30s, rate 0, fatigue >= 78
    const stareTelemetry: DeviceTelemetry = {
      eventId: 'evt-stare',
      schemaVersion: 1,
      timestamp: now,
      isSimulated: false,
      deviceId: 'blink-device-01',
      blinkCount: 200,
      sessionDurationSeconds: 45,
      currentBlinkRatePerMinute: 0,
      averageBlinkRatePerMinute: 14.2,
      eyeFatigueScore: 78,
      eyeHealthScore: 22,
      eyeAspectRatio: { left: 0.34, right: 0.34 },
    };

    await act(async () => {
      await mockService.publishTelemetry(stareTelemetry);
    });

    await waitFor(() => {
      expect(screen.getByText(/Stare detected \(0 BPM\) · Fatigue alert/i)).toBeInTheDocument();
    });

    // Gauge should remain LIVE and display alert
    expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
    expect(screen.getByText(/Time for a quiet horizon break/i)).toBeInTheDocument();
  });

  it('4. Face-loss behavior (Condition B): suspends observation when face is lost', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    // Condition B: real camera session, but eyeAspectRatio is omitted/undefined (face away)
    const faceLossTelemetry: DeviceTelemetry = {
      eventId: 'evt-faceloss',
      schemaVersion: 1,
      timestamp: now,
      isSimulated: false,
      deviceId: 'blink-device-01',
      blinkCount: 200,
      sessionDurationSeconds: 45, // frozen duration
      currentBlinkRatePerMinute: 0,
      averageBlinkRatePerMinute: 14.2,
      eyeFatigueScore: 0, // suspended evaluation
      eyeHealthScore: 0,
      // eyeAspectRatio is explicitly undefined
    };

    await act(async () => {
      await mockService.publishTelemetry(faceLossTelemetry);
    });

    await waitFor(() => {
      expect(screen.getByText(/Face not detected · Tracking paused/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Looking away from screen/i)).toBeInTheDocument();
  });

  it('5. Offline state: marks mode OFFLINE when device disconnects from presence', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    // Trigger disconnect on mockService
    await act(async () => {
      await mockService.disconnect();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('OFFLINE');
    });

    expect(screen.getAllByText(/Desk Node 01 offline/i).length).toBeGreaterThanOrEqual(1);
  });

  it('6. Data staleness: marks telemetry stale when timestamp is older than 3500ms', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    // Telemetry timestamp is 4000ms in the past
    const staleTelemetry: DeviceTelemetry = {
      eventId: 'evt-stale',
      schemaVersion: 1,
      timestamp: now - 4000,
      isSimulated: false,
      deviceId: 'blink-device-01',
      blinkCount: 150,
      sessionDurationSeconds: 60,
      currentBlinkRatePerMinute: 15,
      averageBlinkRatePerMinute: 15.0,
      eyeFatigueScore: 20,
      eyeHealthScore: 80,
      eyeAspectRatio: { left: 0.35, right: 0.35 },
    };

    await act(async () => {
      await mockService.publishTelemetry(staleTelemetry);
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('OFFLINE');
      expect(screen.getAllByText(/Telemetry stale \(>3\.5s\)/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('7. Device state subscription: reflects monitoring mode changes', async () => {
    renderWithService(mockService);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    const now = Date.now();
    await act(async () => {
      await mockService.publishTelemetry({
        eventId: 'evt-active-test',
        schemaVersion: 1,
        timestamp: now,
        isSimulated: true,
        deviceId: 'blink-device-01',
        blinkCount: 100,
        sessionDurationSeconds: 120,
        currentBlinkRatePerMinute: 16,
        averageBlinkRatePerMinute: 16,
        eyeFatigueScore: 18,
        eyeHealthScore: 82,
        eyeAspectRatio: { left: 0.35, right: 0.35 },
      });
      await mockService.publishDeviceState({
        ...INITIAL_DEVICE_STATE,
        monitoring: {
          ...INITIAL_DEVICE_STATE.monitoring,
          mode: 'active',
          sessionDurationSeconds: 120,
        },
      });
    });

    // Top bar and monitoring indicators reflect Active state
    await waitFor(() => {
      expect(screen.getAllByText(/Active/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('8. Subscription cleanup: unmounts cleanly without throwing or leaking listeners', () => {
    const disconnectSpy = vi.spyOn(mockService, 'disconnect');
    const { unmount } = renderWithService(mockService);

    expect(disconnectSpy).not.toHaveBeenCalled();

    unmount();

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('9. Integrated-demo device presence: recognizes integrated-demo role as online device', async () => {
    const service = new MockRealtimeService();
    service.setMockUid('user-demo-integrated');

    renderWithService(service);

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toBeInTheDocument();
    });

    // Publish telemetry
    await act(async () => {
      await service.publishTelemetry({
        eventId: 'evt-int-demo',
        schemaVersion: 1,
        timestamp: Date.now(),
        isSimulated: true,
        deviceId: 'blink-integrated-01',
        blinkCount: 120,
        sessionDurationSeconds: 60,
        currentBlinkRatePerMinute: 17,
        averageBlinkRatePerMinute: 17,
        eyeFatigueScore: 15,
        eyeHealthScore: 85,
        eyeAspectRatio: { left: 0.35, right: 0.35 },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('DEMO');
    });
  });

  it('10. Live RTDB Emulator end-to-end integration: publishes telemetry to Firebase and updates UI', async () => {
    const { initializeApp, deleteApp } = await import('firebase/app');
    const { getAuth, signInAnonymously, connectAuthEmulator } = await import('firebase/auth');
    const { getDatabase, connectDatabaseEmulator } = await import('firebase/database');
    const { firebaseConfig } = await import('@/shared/firebase/config');
    const { FirebaseRealtimeService } = await import('@/shared/realtime/services/firebase-realtime.service');
    const { FirebaseRoomService } = await import('@/shared/realtime/services/firebase-room.service');

    const app = initializeApp(firebaseConfig, `elevated-live-test-${Date.now()}`);
    const auth = getAuth(app);
    const rtdb = getDatabase(app);

    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);

    await signInAnonymously(auth);
    const testRoomCode = `LIVE-TEST-${Date.now().toString(36).toUpperCase()}`;

    // Create room with Device role
    const roomService = new FirebaseRoomService(rtdb, auth);
    await roomService.createRoom({
      roomCode: testRoomCode,
      role: 'blink-device',
    });

    // Realtime service for device publisher
    const deviceRealtime = new FirebaseRealtimeService(rtdb, auth);
    await deviceRealtime.connect(testRoomCode);

    // Realtime service for elevated companion
    const companionRealtime = new FirebaseRealtimeService(rtdb, auth);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route
            path="/insights"
            element={
              <InsightsApp
                realtimeService={companionRealtime}
                roomCode={testRoomCode}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Publish live camera-style telemetry (isSimulated: false)
    const now = Date.now();
    await act(async () => {
      await deviceRealtime.publishTelemetry({
        eventId: `telem-${now}`,
        schemaVersion: 1,
        timestamp: now,
        isSimulated: false,
        deviceId: 'real-camera-node',
        blinkCount: 42,
        sessionDurationSeconds: 150,
        currentBlinkRatePerMinute: 16.5,
        averageBlinkRatePerMinute: 16.8,
        eyeFatigueScore: 18,
        eyeHealthScore: 82,
        eyeAspectRatio: { left: 0.31, right: 0.32 },
      });
    });

    // Verify LIVE mode badge in UI from emulator
    await waitFor(
      () => {
        expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
      },
      { timeout: 4000 }
    );

    // Verify live session time
    expect(screen.getByText('02:30')).toBeInTheDocument();
    // Verify live blink count
    expect(screen.getByText('42')).toBeInTheDocument();

    unmount();
    await deviceRealtime.disconnect();
    await deleteApp(app);
  });
});
