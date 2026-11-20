import { ref, set, get, update, onValue, off, Database, DatabaseReference } from 'firebase/database';
import { Auth } from 'firebase/auth';
import { IRoomService, CreateRoomOptions, CreateInviteOptions, JoinRoomOptions } from '../interfaces/room-service.interface';
import { DemoRoom, RoomInvitation, RoomMember, INITIAL_DEVICE_STATE } from '@/shared/contracts';
import { getFirebaseServices } from '@/shared/firebase/client';

export class FirebaseRoomService implements IRoomService {
  private rtdb: Database | null = null;
  private auth: Auth | null = null;

  constructor(rtdb?: Database, auth?: Auth) {
    if (rtdb && auth) {
      this.rtdb = rtdb;
      this.auth = auth;
    }
  }

  private getServices(): { rtdb: Database; auth: Auth } {
    if (this.rtdb && this.auth) {
      return { rtdb: this.rtdb, auth: this.auth };
    }

    const services = getFirebaseServices();
    if (!services.isReady || !services.rtdb || !services.auth) {
      throw new Error(
        '[FirebaseRoomService] Firebase is not initialized or running in offline mode. Realtime room operations require a connected Firebase instance.'
      );
    }

    this.rtdb = services.rtdb;
    this.auth = services.auth;
    return { rtdb: this.rtdb, auth: this.auth };
  }

  private ensureRealAuthUser(auth: Auth): string {
    const user = auth.currentUser;
    if (!user || !user.uid || user.uid.startsWith('mock-')) {
      throw new Error(
        '[FirebaseRoomService] Real authenticated user identity required. Mock guest credentials are not authorized for room operations.'
      );
    }
    return user.uid;
  }

  async createRoom(options: CreateRoomOptions): Promise<DemoRoom> {
    const { rtdb, auth } = this.getServices();
    const uid = this.ensureRealAuthUser(auth);

    const now = Date.now();
    const expiresInMs = options.expiresInMs ?? 24 * 60 * 60 * 1000;
    const role = options.role ?? 'blink-device';

    const creatorMember: RoomMember = {
      uid,
      role,
      joinedAt: now,
      status: 'connected',
    };

    const roomData: DemoRoom = {
      roomCode: options.roomCode,
      schemaVersion: 1,
      createdAt: now,
      createdBy: uid,
      expiresAt: now + expiresInMs,
      status: 'active',
      deviceState: { ...INITIAL_DEVICE_STATE, deviceName: `Blink [${options.roomCode}]`, updatedAt: now },
      members: {
        [uid]: creatorMember,
      },
      invitations: {},
    };

    if (options.generateInitialInvite !== false) {
      const initialInviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;
      roomData.invitations = {
        [initialInviteCode]: {
          id: initialInviteCode,
          roomId: options.roomCode,
          role: 'companion-insights',
          createdAt: now,
          expiresAt: now + 10 * 60 * 1000, // 10 min TTL
          consumed: false,
          consumedBy: null,
          consumedAt: null,
        },
      };
    }

    const roomRef = ref(rtdb, `rooms/${options.roomCode}`);
    await set(roomRef, roomData);

    return roomData;
  }

  async createInvitation(options: CreateInviteOptions): Promise<RoomInvitation> {
    const { rtdb, auth } = this.getServices();
    this.ensureRealAuthUser(auth);

    const now = Date.now();
    const expiresInMs = options.expiresInMs ?? 10 * 60 * 1000; // 10 minutes default
    const role = options.role ?? 'companion-insights';
    const inviteCode = `PAIR-${Math.floor(1000 + Math.random() * 9000)}`;

    const invitation: RoomInvitation = {
      id: inviteCode,
      roomId: options.roomCode,
      role,
      createdAt: now,
      expiresAt: now + expiresInMs,
      consumed: false,
      consumedBy: null,
      consumedAt: null,
    };

    const inviteRef = ref(rtdb, `rooms/${options.roomCode}/invitations/${inviteCode}`);
    await set(inviteRef, invitation);

    return invitation;
  }

  async joinRoomWithInvite(options: JoinRoomOptions): Promise<RoomMember> {
    const { rtdb, auth } = this.getServices();
    const uid = this.ensureRealAuthUser(auth);

    // Read invitation metadata
    const inviteRef = ref(rtdb, `rooms/${options.roomCode}/invitations/${options.inviteCode}`);
    const snapshot = await get(inviteRef);

    if (!snapshot.exists()) {
      throw new Error(`[FirebaseRoomService] Invitation '${options.inviteCode}' does not exist.`);
    }

    const invite = snapshot.val() as RoomInvitation;

    if (invite.consumed) {
      throw new Error(`[FirebaseRoomService] Invitation '${options.inviteCode}' has already been consumed.`);
    }

    if (invite.expiresAt <= Date.now()) {
      throw new Error(`[FirebaseRoomService] Invitation '${options.inviteCode}' has expired.`);
    }

    const now = Date.now();
    const newMember: RoomMember = {
      uid,
      role: invite.role,
      inviteCode: options.inviteCode,
      joinedAt: now,
      status: 'connected',
    };

    // Atomic multi-path update
    const updates: Record<string, any> = {};
    updates[`rooms/${options.roomCode}/members/${uid}`] = newMember;
    updates[`rooms/${options.roomCode}/invitations/${options.inviteCode}/consumed`] = true;
    updates[`rooms/${options.roomCode}/invitations/${options.inviteCode}/consumedBy`] = uid;
    updates[`rooms/${options.roomCode}/invitations/${options.inviteCode}/consumedAt`] = now;

    await update(ref(rtdb), updates);

    return newMember;
  }

  async getRoom(roomCode: string): Promise<DemoRoom | null> {
    const { rtdb, auth } = this.getServices();
    this.ensureRealAuthUser(auth);

    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);

    return snapshot.exists() ? (snapshot.val() as DemoRoom) : null;
  }

  async getInvitation(roomCode: string, inviteCode: string): Promise<RoomInvitation | null> {
    const { rtdb, auth } = this.getServices();
    this.ensureRealAuthUser(auth);

    const inviteRef = ref(rtdb, `rooms/${roomCode}/invitations/${inviteCode}`);
    const snapshot = await get(inviteRef);

    return snapshot.exists() ? (snapshot.val() as RoomInvitation) : null;
  }

  subscribeToRoom(roomCode: string, callback: (room: DemoRoom | null) => void): () => void {
    const { rtdb, auth } = this.getServices();
    this.ensureRealAuthUser(auth);

    const roomRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}`);
    const listener = onValue(
      roomRef,
      (snapshot) => {
        callback(snapshot.exists() ? (snapshot.val() as DemoRoom) : null);
      },
      (error) => {
        console.warn(`[FirebaseRoomService] Room subscription error:`, error);
        callback(null);
      }
    );

    return () => off(roomRef, 'value', listener);
  }

  subscribeToMembers(roomCode: string, callback: (members: Record<string, RoomMember>) => void): () => void {
    const { rtdb, auth } = this.getServices();
    this.ensureRealAuthUser(auth);

    const membersRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/members`);
    const listener = onValue(
      membersRef,
      (snapshot) => {
        callback(snapshot.exists() ? (snapshot.val() as Record<string, RoomMember>) : {});
      },
      (error) => {
        console.warn(`[FirebaseRoomService] Members subscription error:`, error);
        callback({});
      }
    );

    return () => off(membersRef, 'value', listener);
  }

  async leaveRoom(roomCode: string): Promise<void> {
    const { rtdb, auth } = this.getServices();
    const uid = this.ensureRealAuthUser(auth);

    const memberStatusRef = ref(rtdb, `rooms/${roomCode}/members/${uid}/status`);
    await set(memberStatusRef, 'disconnected');
  }

  async closeRoom(roomCode: string): Promise<void> {
    const { rtdb, auth } = this.getServices();
    const uid = this.ensureRealAuthUser(auth);

    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`[FirebaseRoomService] Room '${roomCode}' does not exist.`);
    }

    const room = snapshot.val() as DemoRoom;
    if (room.createdBy !== uid) {
      throw new Error(`[FirebaseRoomService] Only the room creator (${room.createdBy}) can close this room.`);
    }

    const now = Date.now();
    const updates: Record<string, any> = {};
    updates[`rooms/${roomCode}/status`] = 'closed';
    updates[`rooms/${roomCode}/closedAt`] = now;
    updates[`rooms/${roomCode}/closedBy`] = uid;

    await update(ref(rtdb), updates);
  }
}
