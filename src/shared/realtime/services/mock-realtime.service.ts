import { IRealtimeService } from '../interfaces/realtime-service.interface';
import {
  DeviceState,
  DeviceCommand,
  DeviceTelemetry,
  ConnectionStatus,
  CommandAcknowledgment,
  CommandExecutionStatus,
  INITIAL_DEVICE_STATE,
  DEFAULT_TELEMETRY,
} from '@/shared/contracts';

/**
 * Mock Realtime Service for offline testing and baseline verification.
 */
export class MockRealtimeService implements IRealtimeService {
  private status: ConnectionStatus = 'disconnected';
  private currentState: DeviceState = { ...INITIAL_DEVICE_STATE };
  private currentTelemetry: DeviceTelemetry = { ...DEFAULT_TELEMETRY };
  private stateListeners: Set<(state: DeviceState) => void> = new Set();
  private telemetryListeners: Set<(telemetry: DeviceTelemetry) => void> = new Set();
  private commandListeners: Set<(command: DeviceCommand) => void> = new Set();
  private ackListeners: Map<string, Set<(ack: CommandAcknowledgment) => void>> = new Map();

  async connect(roomCode: string, _clientId?: string): Promise<boolean> {
    this.status = 'connecting';
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.status = 'connected';
    this.currentState = {
      ...this.currentState,
      status: 'connected',
      deviceName: `Blink [${roomCode}]`,
      updatedAt: Date.now(),
    };
    this.notifyState();
    return true;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.currentState = {
      ...this.currentState,
      status: 'disconnected',
      updatedAt: Date.now(),
    };
    this.notifyState();
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  subscribeToDeviceState(callback: (state: DeviceState) => void): () => void {
    this.stateListeners.add(callback);
    callback(this.currentState);
    return () => this.stateListeners.delete(callback);
  }

  async publishDeviceState(state: DeviceState): Promise<void> {
    this.currentState = {
      ...state,
      revision: Math.max(state.revision, this.currentState.revision + 1),
      updatedAt: Date.now(),
    };
    this.notifyState();
  }

  async updateDeviceState(partialState: Partial<DeviceState>): Promise<void> {
    this.currentState = {
      ...this.currentState,
      ...partialState,
      revision: this.currentState.revision + 1,
      updatedAt: Date.now(),
    };
    this.notifyState();
  }

  subscribeToTelemetry(callback: (telemetry: DeviceTelemetry) => void): () => void {
    this.telemetryListeners.add(callback);
    callback(this.currentTelemetry);
    return () => this.telemetryListeners.delete(callback);
  }

  async publishTelemetry(telemetry: DeviceTelemetry): Promise<void> {
    this.currentTelemetry = {
      ...telemetry,
      isSimulated: true,
      timestamp: Date.now(),
    };
    this.telemetryListeners.forEach((listener) => listener(this.currentTelemetry));
  }

  subscribeToCommands(callback: (command: DeviceCommand) => void): () => void {
    this.commandListeners.add(callback);
    return () => this.commandListeners.delete(callback);
  }

  async sendCommand(command: DeviceCommand): Promise<boolean> {
    if (command.type === 'SET_EXPRESSION') {
      const payload = command.payload as { expression: string };
      this.currentState = {
        ...this.currentState,
        revision: this.currentState.revision + 1,
        expression: {
          ...this.currentState.expression,
          current: payload.expression as any,
          targetExpression: payload.expression as any,
          lastChangedAt: Date.now(),
        },
        updatedAt: Date.now(),
      };
      this.notifyState();
    }

    this.commandListeners.forEach((listener) => listener(command));
    return true;
  }

  async acknowledgeCommand(
    commandId: string,
    status: CommandExecutionStatus,
    resultMessage?: string
  ): Promise<void> {
    const ack: CommandAcknowledgment = {
      commandId,
      status,
      acknowledgedAt: Date.now(),
      acknowledgedBy: 'mock-device-id',
      resultMessage,
    };

    const listeners = this.ackListeners.get(commandId);
    if (listeners) {
      listeners.forEach((cb) => cb(ack));
    }
  }

  subscribeToCommandStatus(
    commandId: string,
    callback: (ack: CommandAcknowledgment) => void
  ): () => void {
    if (!this.ackListeners.has(commandId)) {
      this.ackListeners.set(commandId, new Set());
    }
    this.ackListeners.get(commandId)!.add(callback);

    return () => {
      this.ackListeners.get(commandId)?.delete(callback);
    };
  }

  private notifyState() {
    this.stateListeners.forEach((listener) => listener(this.currentState));
  }
}
