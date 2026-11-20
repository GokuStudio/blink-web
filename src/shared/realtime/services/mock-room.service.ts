import { IRoomService, CreateRoomOptions, CreateInviteOptions, JoinRoomOptions } from '../interfaces/room-service.interface';
import { DemoRoom, RoomInvitation, RoomMember, INITIAL_DEVICE_STATE } from '@/shared/contracts';

/**
 * In-memory Mock Room Service for offline development and testing.
 * Clearly separated from real Firebase authorization.
 */
export class MockRoomService implements IRoomService {
  private rooms: Map<string, DemoRoom> = new Map();
  private mockUid: string = 'mock-user-001';
  private listeners: Map<string, Set<(room: DemoRoom | null) => void>> = new Map();
  private memberListeners: Map<string, Set<(members: Record<string, RoomMember>) => void>> = new Map();

  setMockUid(uid: string) {
    this.mockUid = uid;
  }

  async createRoom(options: CreateRoomOptions): Promise<DemoRoom> {
    const now = Date.now();
    const expiresInMs = options.expiresInMs ?? 24 * 60 * 60 * 1000;
    const role = options.role ?? 'blink-device';

    const creatorMember: RoomMember = {
      uid: this.mockUid,
      role,
      joinedAt: now,
      status: 'connected',
    };

    const initialInviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;
    const room: DemoRoom = {
      roomCode: options.roomCode,
      schemaVersion: 1,
      createdAt: now,
      createdBy: this.mockUid,
      expiresAt: now + expiresInMs,
      deviceState: { ...INITIAL_DEVICE_STATE, deviceName: `Blink [${options.roomCode}]`, updatedAt: now },
      members: {
        [this.mockUid]: creatorMember,
      },
      invitations: {
        [initialInviteCode]: {
          id: initialInviteCode,
          roomId: options.roomCode,
          role: 'companion-insights',
          createdAt: now,
          expiresAt: now + 10 * 60 * 1000,
          consumed: false,
          consumedBy: null,
          consumedAt: null,
        },
      },
    };

    this.rooms.set(options.roomCode, room);
    this.notifyRoom(options.roomCode);
    return room;
  }

  async createInvitation(options: CreateInviteOptions): Promise<RoomInvitation> {
    const room = this.rooms.get(options.roomCode);
    if (!room) {
      throw new Error(`[MockRoomService] Room ${options.roomCode} not found.`);
    }

    const now = Date.now();
    const expiresInMs = options.expiresInMs ?? 10 * 60 * 1000;
    const inviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;

    const invite: RoomInvitation = {
      id: inviteCode,
      roomId: options.roomCode,
      role: options.role ?? 'companion-insights',
      createdAt: now,
      expiresAt: now + expiresInMs,
      consumed: false,
      consumedBy: null,
      consumedAt: null,
    };

    room.invitations = room.invitations || {};
    room.invitations[inviteCode] = invite;
    this.notifyRoom(options.roomCode);
    return invite;
  }

  async joinRoomWithInvite(options: JoinRoomOptions): Promise<RoomMember> {
    const room = this.rooms.get(options.roomCode);
    if (!room) {
      throw new Error(`[MockRoomService] Room ${options.roomCode} not found.`);
    }

    const invite = room.invitations?.[options.inviteCode];
    if (!invite) {
      throw new Error(`[MockRoomService] Invitation ${options.inviteCode} not found.`);
    }

    if (invite.consumed) {
      throw new Error(`[MockRoomService] Invitation ${options.inviteCode} is already consumed.`);
    }

    if (invite.expiresAt <= Date.now()) {
      throw new Error(`[MockRoomService] Invitation ${options.inviteCode} has expired.`);
    }

    const now = Date.now();
    const newMember: RoomMember = {
      uid: this.mockUid,
      role: invite.role,
      inviteCode: options.inviteCode,
      joinedAt: now,
      status: 'connected',
    };

    invite.consumed = true;
    invite.consumedBy = this.mockUid;
    invite.consumedAt = now;

    room.members[this.mockUid] = newMember;
    this.notifyRoom(options.roomCode);
    return newMember;
  }

  async getRoom(roomCode: string): Promise<DemoRoom | null> {
    return this.rooms.get(roomCode) || null;
  }

  async getInvitation(roomCode: string, inviteCode: string): Promise<RoomInvitation | null> {
    const room = this.rooms.get(roomCode);
    return room?.invitations?.[inviteCode] || null;
  }

  subscribeToRoom(roomCode: string, callback: (room: DemoRoom | null) => void): () => void {
    if (!this.listeners.has(roomCode)) {
      this.listeners.set(roomCode, new Set());
    }
    this.listeners.get(roomCode)!.add(callback);
    callback(this.rooms.get(roomCode) || null);

    return () => {
      this.listeners.get(roomCode)?.delete(callback);
    };
  }

  subscribeToMembers(roomCode: string, callback: (members: Record<string, RoomMember>) => void): () => void {
    if (!this.memberListeners.has(roomCode)) {
      this.memberListeners.set(roomCode, new Set());
    }
    this.memberListeners.get(roomCode)!.add(callback);
    callback(this.rooms.get(roomCode)?.members || {});

    return () => {
      this.memberListeners.get(roomCode)?.delete(callback);
    };
  }

  async leaveRoom(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (room && room.members[this.mockUid]) {
      room.members[this.mockUid].status = 'disconnected';
      this.notifyRoom(roomCode);
    }
  }

  private notifyRoom(roomCode: string) {
    const room = this.rooms.get(roomCode) || null;
    this.listeners.get(roomCode)?.forEach((cb) => cb(room));
    if (room) {
      this.memberListeners.get(roomCode)?.forEach((cb) => cb(room.members));
    }
  }
}
