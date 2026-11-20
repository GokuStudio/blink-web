import { DemoRoom, RoomInvitation, RoomMember } from '@/shared/contracts/room';
import { DeviceRole } from '@/shared/contracts/connection';

export interface CreateRoomOptions {
  roomCode: string;
  role?: DeviceRole; // default 'blink-device'
  expiresInMs?: number; // default 24h
  generateInitialInvite?: boolean; // default true
}

export interface CreateInviteOptions {
  roomCode: string;
  role?: DeviceRole; // default 'companion-insights'
  expiresInMs?: number; // default 10 minutes
}

export interface JoinRoomOptions {
  roomCode: string;
  inviteCode: string;
}

export interface IRoomService {
  createRoom(options: CreateRoomOptions): Promise<DemoRoom>;
  createInvitation(options: CreateInviteOptions): Promise<RoomInvitation>;
  joinRoomWithInvite(options: JoinRoomOptions): Promise<RoomMember>;
  getRoom(roomCode: string): Promise<DemoRoom | null>;
  getInvitation(roomCode: string, inviteCode: string): Promise<RoomInvitation | null>;
  subscribeToRoom(roomCode: string, callback: (room: DemoRoom | null) => void): () => void;
  subscribeToMembers(roomCode: string, callback: (members: Record<string, RoomMember>) => void): () => void;
  leaveRoom(roomCode: string): Promise<void>;
}
