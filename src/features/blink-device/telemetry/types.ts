import { ConnectionStatus, MonitoringMode, BlinkExpressionType } from '@/shared/contracts';

export interface DevicePublisherConfig {
  publishIntervalMs: number; // Coalesced interval between routine writes (default: 1000ms)
  roomCode: string;          // Target pairing room code (default: 'BLINK-DEMO')
  deviceId: string;          // Unique device identifier
  role: 'blink-device' | 'integrated-demo';
  autoPublish: boolean;      // Whether publishing loop starts automatically on connect
}

export const DEFAULT_PUBLISHER_CONFIG: DevicePublisherConfig = {
  publishIntervalMs: 1000,
  roomCode: 'BLINK-DEMO',
  deviceId: 'blink-device-01',
  role: 'blink-device',
  autoPublish: true,
};

export interface PublisherDiagnostics {
  connectionStatus: ConnectionStatus;
  activeRoomCode: string | null;
  isPublishing: boolean;
  lastPublishTimestamp: number | null;
  lastPublishError: string | null;
  publishedBlinkCount: number;
  publishedBlinkRate: number;
  publishedMonitoringMode: MonitoringMode;
  publishedExpression: BlinkExpressionType;
  isRealDataSource: boolean;
  writesPerMinute: number;
  totalPublishedPayloads: number;
  lastAcknowledgedCommand: string | null;
}

export const INITIAL_PUBLISHER_DIAGNOSTICS: PublisherDiagnostics = {
  connectionStatus: 'disconnected',
  activeRoomCode: null,
  isPublishing: false,
  lastPublishTimestamp: null,
  lastPublishError: null,
  publishedBlinkCount: 0,
  publishedBlinkRate: 0,
  publishedMonitoringMode: 'idle',
  publishedExpression: 'idle',
  isRealDataSource: false,
  writesPerMinute: 0,
  totalPublishedPayloads: 0,
  lastAcknowledgedCommand: null,
};
