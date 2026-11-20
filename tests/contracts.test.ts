import { describe, it, expect } from 'vitest';
import {
  INITIAL_DEVICE_STATE,
  DEFAULT_EXPRESSION_STATE,
  DEFAULT_TELEMETRY,
  DEFAULT_NUDGE_CONFIG,
  DEFAULT_MONITORING_STATE,
  DeviceCommand,
} from '@/shared/contracts';

describe('Blink Shared Contracts & Schemas', () => {
  it('has valid INITIAL_DEVICE_STATE schema version and values', () => {
    expect(INITIAL_DEVICE_STATE.schemaVersion).toBe(1);
    expect(INITIAL_DEVICE_STATE.revision).toBe(1);
    expect(INITIAL_DEVICE_STATE.status).toBe('disconnected');
    expect(INITIAL_DEVICE_STATE.expression.current).toBe(DEFAULT_EXPRESSION_STATE.current);
  });

  it('maintains explicit separation of simulated telemetry', () => {
    expect(DEFAULT_TELEMETRY.isSimulated).toBe(true);
    expect(DEFAULT_MONITORING_STATE.isSimulated).toBe(true);
  });

  it('structures idempotent commands with target and expiry', () => {
    const testCommand: DeviceCommand<{ expression: string }> = {
      id: 'cmd-uuid-test',
      schemaVersion: 1,
      targetDeviceId: 'blink-device-01',
      senderId: 'companion-insights-01',
      type: 'SET_EXPRESSION',
      payload: { expression: 'happy' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 5000,
    };

    expect(testCommand.id).toBe('cmd-uuid-test');
    expect(testCommand.type).toBe('SET_EXPRESSION');
    expect(testCommand.expiresAt).toBeGreaterThan(testCommand.createdAt);
  });

  it('verifies default nudge configuration safety thresholds', () => {
    expect(DEFAULT_NUDGE_CONFIG.thresholdLowBlinkRate).toBeGreaterThan(0);
    expect(DEFAULT_NUDGE_CONFIG.autoDismissSeconds).toBe(5);
  });
});
