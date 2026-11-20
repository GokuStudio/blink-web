import { IRealtimeService } from '../interfaces/realtime-service.interface';
import {
  DeviceState,
  DeviceCommand,
  DeviceTelemetry,
  ConnectionStatus,
  CommandAcknowledgment,
  CommandExecutionStatus,
  UserPresence,
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
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private presenceMap: Record<string, UserPresence> = {};
  private presenceListeners: Set<(map: Record<string, UserPresence>) => void> = new Set();
  private mockUid: string = 'mock-user-001';

  setMockUid(uid: string) {
    this.mockUid = uid;
  }

  onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  async connect(roomCode: string, clientId?: string): Promise<boolean> {
    this.status = 'connecting';
    this.notifyStatus();
    await new Promise((resolve) => setTimeout(resolve, 30));
    this.status = 'connected';
    this.notifyStatus();

    this.currentState = {
      ...this.currentState,
      status: 'connected',
      deviceName: `Blink [${roomCode}]`,
      updatedAt: Date.now(),
    };
    this.notifyState();

    const connId = clientId || `conn_${Date.now()}`;
    this.presenceMap[this.mockUid] = {
      uid: this.mockUid,
      role: 'blink-device',
      status: 'connected',
      lastSeen: Date.now(),
      connections: {
        [connId]: {
          connectedAt: Date.now(),
          userAgent: 'MockAgent',
        },
      },
    };
    this.notifyPresence();
    return true;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.notifyStatus();

    this.currentState = {
      ...this.currentState,
      status: 'disconnected',
      updatedAt: Date.now(),
    };
    this.notifyState();

    if (this.presenceMap[this.mockUid]) {
      this.presenceMap[this.mockUid].status = 'disconnected';
      this.presenceMap[this.mockUid].connections = {};
      this.presenceMap[this.mockUid].lastSeen = Date.now();
      this.notifyPresence();
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  subscribeToPresence(callback: (presenceMap: Record<string, UserPresence>) => void): () => void {
    this.presenceListeners.add(callback);
    callback(this.presenceMap);
    return () => this.presenceListeners.delete(callback);
  }

  async getUserPresence(uid: string): Promise<UserPresence | null> {
    return this.presenceMap[uid] || null;
  }

  async isDeviceOnline(_deviceUid?: string): Promise<boolean> {
    return this.status === 'connected';
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

  async sendCommand(command: DeviceCommand, _options?: { timeoutMs?: number }): Promise<boolean> {
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
      acknowledgedBy: this.mockUid,
      resultMessage,
    };

    const listeners = this.ackListeners.get(commandId);
    if (listeners) {
      listeners.forEach((cb) => cb(ack));
    }
  }

  subscribeToCommandStatus(
    commandId: string,
    callback: (ack: CommandAcknowledgment) => void,
    timeoutMs?: number
  ): () => void {
    if (!this.ackListeners.has(commandId)) {
      this.ackListeners.set(commandId, new Set());
    }
    this.ackListeners.get(commandId)!.add(callback);

    let timer: any = null;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        callback({
          commandId,
          status: 'timed_out',
          acknowledgedAt: Date.now(),
          acknowledgedBy: 'system',
          resultMessage: `Command timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    }

    return () => {
      if (timer) clearTimeout(timer);
      this.ackListeners.get(commandId)?.delete(callback);
    };
  }

  private notifyState() {
    this.stateListeners.forEach((listener) => listener(this.currentState));
  }

  private notifyStatus() {
    this.statusListeners.forEach((listener) => listener(this.status));
  }

  private notifyPresence() {
    this.presenceListeners.forEach((listener) => listener(this.presenceMap));
  }
}
