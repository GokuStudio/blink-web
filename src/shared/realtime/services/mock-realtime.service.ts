import { IRealtimeService } from '../interfaces/realtime-service.interface';
import { DeviceState, DeviceCommand, ConnectionStatus, INITIAL_DEVICE_STATE } from '@/shared/contracts';

/**
 * Mock Realtime Service for W0 foundation and offline testing.
 */
export class MockRealtimeService implements IRealtimeService {
  private status: ConnectionStatus = 'disconnected';
  private currentState: DeviceState = { ...INITIAL_DEVICE_STATE };
  private listeners: Set<(state: DeviceState) => void> = new Set();

  async connect(roomCode: string, _clientId: string): Promise<boolean> {
    this.status = 'connecting';
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.status = 'connected';
    this.currentState = {
      ...this.currentState,
      status: 'connected',
      deviceName: `Blink [${roomCode}]`,
      updatedAt: Date.now(),
    };
    this.notify();
    return true;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.currentState = {
      ...this.currentState,
      status: 'disconnected',
      updatedAt: Date.now(),
    };
    this.notify();
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  subscribeToDeviceState(callback: (state: DeviceState) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentState);
    return () => this.listeners.delete(callback);
  }

  async sendCommand(command: DeviceCommand): Promise<boolean> {
    // Process known commands in memory
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
      this.notify();
    }
    return true;
  }

  async updateDeviceState(partialState: Partial<DeviceState>): Promise<void> {
    this.currentState = {
      ...this.currentState,
      ...partialState,
      revision: this.currentState.revision + 1,
      updatedAt: Date.now(),
    };
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.currentState));
  }
}
