import { ConnectionStatus, DeviceRole } from './connection';
import { DeviceState } from './device';

/**
 * Demo Room & Multi-device pairing contracts.
 * Version: 1.1.0
 */

export interface RoomMember {
  uid: string;
  role: DeviceRole;
  joinedAt: number;
  lastActiveAt?: number;
  status: ConnectionStatus;
  userAgent?: string;
  inviteCode?: string;
}

export interface RoomInvitation {
  id: string; // Invite code / token, e.g. 'PAIR-4921'
  roomId: string;
  role: DeviceRole;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
  consumedBy?: string | null;
  consumedAt?: number | null;
}

export interface DemoRoom {
  roomCode: string; // E.g. 'BLINK-4821'
  schemaVersion: number;
  createdAt: number;
  createdBy: string;
  expiresAt: number; // Demo sessions expire after 24h
  deviceState: DeviceState;
  members: Record<string, RoomMember>;
  invitations?: Record<string, RoomInvitation>;
}
