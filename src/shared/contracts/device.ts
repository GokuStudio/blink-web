import { ExpressionState, DEFAULT_EXPRESSION_STATE, BlinkExpressionType } from './expressions';
import { MonitoringState, DEFAULT_MONITORING_STATE } from './monitoring';
import { NudgeConfig, DEFAULT_NUDGE_CONFIG } from './nudge';
import { DeviceTelemetry, DEFAULT_TELEMETRY } from './telemetry';
import { ConnectionStatus } from './connection';

/**
 * Blink Device Overall State Contract.
 * Version: 1.0.0
 */

export interface DeviceState {
  schemaVersion: number;
  revision: number; // Incremented on state changes for conflict resolution
  deviceId: string;
  deviceName: string;
  status: ConnectionStatus;
  batteryLevel?: number;
  brightness: number; // 0.0 to 1.0
  expression: ExpressionState;
  monitoring: MonitoringState;
  nudgeConfig: NudgeConfig;
  latestTelemetry: DeviceTelemetry;
  updatedAt: number;
}

export const INITIAL_DEVICE_STATE: DeviceState = {
  schemaVersion: 1,
  revision: 1,
  deviceId: 'blink-device-01',
  deviceName: 'Blink Companion',
  status: 'disconnected',
  brightness: 1.0,
  expression: DEFAULT_EXPRESSION_STATE,
  monitoring: DEFAULT_MONITORING_STATE,
  nudgeConfig: DEFAULT_NUDGE_CONFIG,
  latestTelemetry: DEFAULT_TELEMETRY,
  updatedAt: Date.now(),
};

/**
 * Idempotent Device Commands sent from Companion/Insights to Blink Device
 */
export type DeviceCommandType =
  | 'SET_EXPRESSION'
  | 'TRIGGER_NUDGE'
  | 'START_MONITORING'
  | 'STOP_MONITORING'
  | 'UPDATE_CONFIG'
  | 'RESET_STATE'
  | 'SET_BRIGHTNESS';

export type CommandExecutionStatus =
  | 'pending'
  | 'received'
  | 'executed'
  | 'rejected'
  | 'expired'
  | 'timed_out';

export interface CommandAcknowledgment {
  commandId: string;
  status: CommandExecutionStatus;
  acknowledgedAt: number;
  acknowledgedBy: string;
  resultMessage?: string;
}

export interface DeviceCommand<TPayload = unknown> {
  id: string; // Unique command UUID for idempotency
  schemaVersion: number;
  targetDeviceId: string;
  senderId: string;
  type: DeviceCommandType;
  payload: TPayload;
  createdAt: number;
  expiresAt: number; // Command expiration to avoid delayed execution
  status?: CommandExecutionStatus;
  acknowledged?: boolean;
  acknowledgedAt?: number;
  acknowledgment?: CommandAcknowledgment;
}

export interface SetExpressionPayload {
  expression: BlinkExpressionType;
  durationSeconds?: number;
}

export interface UpdateNudgeConfigPayload {
  config: Partial<NudgeConfig>;
}
