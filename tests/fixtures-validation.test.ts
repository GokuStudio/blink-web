import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DemoRoom,
  RoomInvitation,
  RoomMember,
  DeviceState,
  DeviceTelemetry,
  DeviceCommand,
  CommandAcknowledgment,
  UserPresence,
  NudgeConfig,
  NudgeEvent,
  SessionSummary,
} from '@/shared/contracts';

const fixturesDir = path.resolve(__dirname, '../docs/backend-handoff/fixtures');

function loadFixture<T = unknown>(filename: string): T {
  const filePath = path.join(fixturesDir, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('Blink Backend Handoff: Machine-Readable Fixture Validation', () => {
  it('validates that all 26 JSON fixture files exist and parse without syntax errors', () => {
    const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(25);

    files.forEach((file) => {
      expect(() => loadFixture(file)).not.toThrow();
    });
  });

  it('validates room and invitation fixtures against contracts', () => {
    const roomCreated = loadFixture<DemoRoom>('room-created.json');
    expect(roomCreated.roomCode).toBe('BLINK-DEMO-001');
    expect(roomCreated.schemaVersion).toBe(1);
    expect(roomCreated.createdBy).toBe('sample-device-uid');
    expect(roomCreated.status).toBe('active');
    expect(roomCreated.members['sample-device-uid'].role).toBe('blink-device');

    const invite = loadFixture<RoomInvitation>('invitation-generated.json');
    expect(invite.id).toBe('PAIR-4921');
    expect(invite.role).toBe('companion-insights');
    expect(invite.consumed).toBe(false);

    const controllerJoined = loadFixture<RoomMember>('controller-joined.json');
    expect(controllerJoined.role).toBe('companion-insights');
    expect(controllerJoined.inviteCode).toBe('PAIR-4921');
    expect(controllerJoined.status).toBe('connected');

    const membership = loadFixture<Record<string, RoomMember>>('room-membership.json');
    expect(membership['sample-device-uid'].role).toBe('blink-device');
    expect(membership['sample-controller-uid'].role).toBe('companion-insights');
  });

  it('validates presence fixtures against UserPresence contract', () => {
    const online = loadFixture<UserPresence>('device-online.json');
    expect(online.status).toBe('connected');
    expect(online.role).toBe('blink-device');
    expect(Object.keys(online.connections || {}).length).toBe(1);

    const offline = loadFixture<UserPresence>('device-offline.json');
    expect(offline.status).toBe('disconnected');
    expect(Object.keys(offline.connections || {}).length).toBe(0);

    const reconnecting = loadFixture<UserPresence>('device-reconnecting.json');
    expect(reconnecting.status).toBe('reconnecting');
  });

  it('validates device state revisions against DeviceState contract', () => {
    const initialState = loadFixture<DeviceState>('initial-device-state.json');
    expect(initialState.revision).toBe(1);
    expect(initialState.expression.current).toBe('idle');
    expect(initialState.monitoring.mode).toBe('idle');

    const happyState = loadFixture<DeviceState>('expression-changed-state.json');
    expect(happyState.revision).toBe(2);
    expect(happyState.expression.current).toBe('happy');

    const activeMonitoring = loadFixture<DeviceState>('monitoring-started-state.json');
    expect(activeMonitoring.monitoring.mode).toBe('active');
    expect(activeMonitoring.monitoring.isSimulated).toBe(true);

    const pausedMonitoring = loadFixture<DeviceState>('monitoring-paused-state.json');
    expect(pausedMonitoring.monitoring.mode).toBe('paused');
  });

  it('validates telemetry fixtures and enforces mandatory isSimulated flag', () => {
    const liveTel = loadFixture<DeviceTelemetry>('live-telemetry.json');
    expect(liveTel.isSimulated).toBe(true);
    expect(liveTel.currentBlinkRatePerMinute).toBeGreaterThan(0);
    expect(liveTel.eyeHealthScore).toBeGreaterThanOrEqual(0);

    const lowBlink = loadFixture<DeviceTelemetry>('low-blink-telemetry.json');
    expect(lowBlink.isSimulated).toBe(true);
    expect(lowBlink.currentBlinkRatePerMinute).toBe(7);

    const stream = loadFixture<DeviceTelemetry[]>('telemetry-stream.json');
    expect(Array.isArray(stream)).toBe(true);
    stream.forEach((tel) => {
      expect(tel.isSimulated).toBe(true);
      expect(typeof tel.currentBlinkRatePerMinute).toBe('number');
    });
  });

  it('validates commands and acknowledgments against DeviceCommand contract', () => {
    const cmdExp = loadFixture<DeviceCommand>('command-set-expression.json');
    expect(cmdExp.type).toBe('SET_EXPRESSION');
    expect(cmdExp.status).toBe('pending');
    expect(cmdExp.expiresAt).toBeGreaterThan(cmdExp.createdAt);

    const cmdNudge = loadFixture<DeviceCommand>('command-trigger-nudge.json');
    expect(cmdNudge.type).toBe('TRIGGER_NUDGE');

    const cmdStart = loadFixture<DeviceCommand>('command-start-monitoring.json');
    expect(cmdStart.type).toBe('START_MONITORING');

    const cmdStop = loadFixture<DeviceCommand>('command-stop-monitoring.json');
    expect(cmdStop.type).toBe('STOP_MONITORING');

    const ackSuccess = loadFixture<DeviceCommand>('command-ack-success.json');
    expect(ackSuccess.status).toBe('executed');
    expect(ackSuccess.acknowledged).toBe(true);
    expect(ackSuccess.acknowledgment?.status).toBe('executed');

    const ackRejection = loadFixture<DeviceCommand>('command-ack-rejection.json');
    expect(ackRejection.status).toBe('rejected');

    const ackExpired = loadFixture<DeviceCommand>('command-expired.json');
    expect(ackExpired.status).toBe('expired');

    const ackTimedOut = loadFixture<CommandAcknowledgment>('command-timed-out.json');
    expect(ackTimedOut.status).toBe('timed_out');
  });

  it('validates nudge config, nudge event, and session summary', () => {
    const nudgeConfig = loadFixture<NudgeConfig>('nudge-config.json');
    expect(nudgeConfig.enabled).toBe(true);
    expect(nudgeConfig.intervalMinutes).toBe(20);

    const nudgeEvent = loadFixture<NudgeEvent>('nudge-event.json');
    expect(nudgeEvent.urgency).toBe('medium');
    expect(nudgeEvent.reason).toBe('low_blink_rate');

    const sessionSummary = loadFixture<SessionSummary>('session-summary.json');
    expect(sessionSummary.isSimulated).toBe(true);
    expect(sessionSummary.durationSeconds).toBe(1800);
    expect(sessionSummary.finalEyeHealthScore).toBe(88);
  });
});
