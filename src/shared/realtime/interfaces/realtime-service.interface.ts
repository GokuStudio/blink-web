import { DeviceState, DeviceCommand, ConnectionStatus } from '@/shared/contracts';

/**
 * Clean boundary interface for Realtime communication.
 * Components interact through this service rather than direct Firebase SDK manipulation.
 */
export interface IRealtimeService {
  connect(roomCode: string, clientId: string): Promise<boolean>;
  disconnect(): Promise<void>;
  getConnectionStatus(): ConnectionStatus;
  subscribeToDeviceState(callback: (state: DeviceState) => void): () => void;
  sendCommand(command: DeviceCommand): Promise<boolean>;
  updateDeviceState(partialState: Partial<DeviceState>): Promise<void>;
}
