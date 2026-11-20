import { ConnectionStatus, DeviceRole } from './connection';
import { DeviceState } from './device';

/**
 * Demo Room & Multi-device pairing contracts.
 * Version: 1.0.0
 */

export interface RoomMember {
  uid: string;
  role: DeviceRole;
  joinedAt: number;
  lastActiveAt: number;
  status: ConnectionStatus;
  userAgent?: string;
}

export interface DemoRoom {
  roomCode: string; // E.g. 'BLINK-4821'
  schemaVersion: number;
  createdAt: number;
  createdBy: string;
  expiresAt: number; // Demo sessions expire after 24h
  deviceState: DeviceState;
  members: Record<string, RoomMember>;
}
