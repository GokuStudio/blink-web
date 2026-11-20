/**
 * Connection and presence state contracts for Blink Web.
 * Version: 1.1.0
 */

export const CONTRACT_VERSION = 2;

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'stale';

export type DeviceRole = 'blink-device' | 'companion-insights' | 'integrated-demo';

export interface PresenceConnection {
  connectedAt: number;
  userAgent?: string;
}

export interface UserPresence {
  uid: string;
  role: DeviceRole;
  status: ConnectionStatus;
  lastSeen: number; // Unix timestamp ms
  connections?: Record<string, PresenceConnection>;
}

export interface PresenceHeartbeat {
  clientId: string;
  role: DeviceRole;
  status: ConnectionStatus;
  lastSeenAt: number; // Unix timestamp ms
  metadata?: {
    browser?: string;
    os?: string;
    isPwa?: boolean;
    batteryLevel?: number;
  };
}

export interface ReconnectPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  reconnectTimeoutMs: number;
}
