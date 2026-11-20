import { describe, it, expect, beforeEach } from 'vitest';
import { env } from '@/config/env';
import { getFirebaseServices, resetFirebaseServicesForTesting } from '@/shared/firebase/client';
import { EMULATOR_PORTS, EMULATOR_HOST } from '@/shared/firebase/emulators';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import { DeviceState } from '@/shared/contracts';

describe('Firebase Configuration & Safety Contracts (F1A)', () => {
  beforeEach(() => {
    resetFirebaseServicesForTesting();
  });

  it('keeps production Firebase access disabled by default when unconfigured', () => {
    // Default environment without real credentials or emulators enabled
    expect(env.isProductionFirebaseEnabled).toBe(false);

    const services = getFirebaseServices();
    // Must not expose live production clients
    if (!env.useEmulators) {
      expect(services.isReady).toBe(false);
      expect(services.isEmulated).toBe(false);
      expect(services.app).toBeNull();
      expect(services.auth).toBeNull();
      expect(services.rtdb).toBeNull();
      expect(services.firestore).toBeNull();
    }
  });

  it('verifies emulator port mapping matches architecture specifications', () => {
    expect(EMULATOR_HOST).toBe('127.0.0.1');
    expect(EMULATOR_PORTS.auth).toBe(9099);
    expect(EMULATOR_PORTS.rtdb).toBe(9000);
    expect(EMULATOR_PORTS.firestore).toBe(8080);
    expect(EMULATOR_PORTS.ui).toBe(4000);
  });

  it('preserves the existing mock realtime service functionality', async () => {
    const mockService = new MockRealtimeService();
    expect(mockService.getConnectionStatus()).toBe('disconnected');

    const connected = await mockService.connect('TEST-ROOM', 'client-001');
    expect(connected).toBe(true);
    expect(mockService.getConnectionStatus()).toBe('connected');

    let receivedState: DeviceState | undefined;
    const unsubscribe = mockService.subscribeToDeviceState((state) => {
      receivedState = state;
    });

    expect(receivedState).toBeDefined();

    await mockService.sendCommand({
      id: 'cmd-test-1',
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: 'client-001',
      type: 'SET_EXPRESSION',
      payload: { expression: 'happy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 5000,
    });

    const currentState = receivedState as DeviceState | undefined;
    expect(currentState?.expression.current).toBe('happy');
    unsubscribe();
    await mockService.disconnect();
    expect(mockService.getConnectionStatus()).toBe('disconnected');
  });

  it('provides safe environment variable defaults without throwing', () => {
    expect(env.firebase.projectId).toBeDefined();
    expect(env.firebase.apiKey).toBeDefined();
    expect(env.defaultRoom).toBe('BLINK-DEMO');
  });
});
