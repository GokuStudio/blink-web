import {
  DeviceState,
  DeviceCommand,
  DeviceTelemetry,
  ConnectionStatus,
  CommandAcknowledgment,
  CommandExecutionStatus,
} from '@/shared/contracts';

/**
 * Clean boundary interface for Realtime communication.
 * Components interact through this service rather than direct Firebase SDK manipulation.
 */
export interface IRealtimeService {
  connect(roomCode: string, clientId?: string): Promise<boolean>;
  disconnect(): Promise<void>;
  getConnectionStatus(): ConnectionStatus;

  // Device State
  subscribeToDeviceState(callback: (state: DeviceState) => void): () => void;
  publishDeviceState(state: DeviceState): Promise<void>;
  updateDeviceState(partialState: Partial<DeviceState>): Promise<void>;

  // Telemetry
  subscribeToTelemetry(callback: (telemetry: DeviceTelemetry) => void): () => void;
  publishTelemetry(telemetry: DeviceTelemetry): Promise<void>;

  // Commands
  subscribeToCommands(callback: (command: DeviceCommand) => void): () => void;
  sendCommand(command: DeviceCommand): Promise<boolean>;
  acknowledgeCommand(commandId: string, status: CommandExecutionStatus, resultMessage?: string): Promise<void>;
  subscribeToCommandStatus(commandId: string, callback: (ack: CommandAcknowledgment) => void): () => void;
}
