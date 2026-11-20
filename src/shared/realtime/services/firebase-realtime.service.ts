import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onChildAdded,
  onDisconnect,
  serverTimestamp,
  Database,
  DatabaseReference,
} from 'firebase/database';
import { Auth } from 'firebase/auth';
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
} from '@/shared/contracts';
import { getFirebaseServices } from '@/shared/firebase/client';

export class FirebaseRealtimeService implements IRealtimeService {
  private rtdb: Database | null = null;
  private auth: Auth | null = null;
  private roomCode: string | null = null;
  private connectionId: string | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private processedCommandIds: Set<string> = new Set();
  private activeSubscriptions: Array<() => void> = [];
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private userRole: 'blink-device' | 'companion-insights' | 'integrated-demo' = 'companion-insights';

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
        '[FirebaseRealtimeService] Firebase is not initialized or running in offline mode. Realtime synchronization requires a connected Firebase instance.'
      );
    }

    this.rtdb = services.rtdb;
    this.auth = services.auth;
    return { rtdb: this.rtdb, auth: this.auth };
  }

  private ensureAuthUid(): string {
    const { auth } = this.getServices();
    const user = auth.currentUser;
    if (!user || !user.uid || user.uid.startsWith('mock-')) {
      throw new Error(
        '[FirebaseRealtimeService] Real authenticated user required for realtime room operations. Mock guest credentials are not authorized.'
      );
    }
    return user.uid;
  }

  private ensureConnectedRoom(): string {
    if (!this.roomCode) {
      throw new Error('[FirebaseRealtimeService] Not connected to any room. Call connect(roomCode) first.');
    }
    return this.roomCode;
  }

  private updateConnectionStatus(newStatus: ConnectionStatus) {
    if (this.connectionStatus !== newStatus) {
      this.connectionStatus = newStatus;
      this.statusListeners.forEach((listener) => listener(newStatus));
    }
  }

  onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionStatus);
    return () => this.statusListeners.delete(callback);
  }

  async connect(roomCode: string, clientId?: string): Promise<boolean> {
    const { rtdb } = this.getServices();
    const uid = this.ensureAuthUid();

    this.roomCode = roomCode;
    this.connectionId = clientId || `conn_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
    this.updateConnectionStatus('connecting');

    // Fetch user's registered role in the room
    try {
      const memberRef = ref(rtdb, `rooms/${roomCode}/members/${uid}`);
      const memberSnap = await get(memberRef);
      if (memberSnap.exists()) {
        this.userRole = memberSnap.child('role').val() || 'companion-insights';
      }
    } catch {
      // Keep default role if not yet read
    }

    const connectedRef = ref(rtdb, '.info/connected');
    const myConnRef = ref(rtdb, `rooms/${roomCode}/presence/${uid}/connections/${this.connectionId}`);
    const lastSeenRef = ref(rtdb, `rooms/${roomCode}/presence/${uid}/lastSeen`);
    const userPresenceRef = ref(rtdb, `rooms/${roomCode}/presence/${uid}`);

    return new Promise<boolean>((resolve) => {
      let hasResolved = false;

      const unsubConnected = onValue(connectedRef, async (snap) => {
        if (snap.val() === true) {
          try {
            // Setup onDisconnect triggers
            await onDisconnect(myConnRef).remove();
            await onDisconnect(lastSeenRef).set(serverTimestamp());

            // Register active connection
            const now = Date.now();
            await set(myConnRef, {
              connectedAt: now,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test',
            });

            // Update user presence root
            await update(userPresenceRef, {
              uid,
              role: this.userRole,
              status: 'connected',
              lastSeen: now,
            });

            this.updateConnectionStatus('connected');
          } catch {
            this.updateConnectionStatus('connected');
          }

          if (!hasResolved) {
            hasResolved = true;
            resolve(true);
          }
        } else {
          if (this.connectionStatus === 'connected') {
            this.updateConnectionStatus('reconnecting');
          }
        }
      });

      this.activeSubscriptions.push(unsubConnected);

      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          this.updateConnectionStatus('connected');
          resolve(true);
        }
      }, 250);
    });
  }

  async disconnect(): Promise<void> {
    if (this.rtdb && this.roomCode && this.connectionId) {
      const uid = this.auth?.currentUser?.uid;
      if (uid) {
        try {
          const myConnRef = ref(this.rtdb, `rooms/${this.roomCode}/presence/${uid}/connections/${this.connectionId}`);
          const lastSeenRef = ref(this.rtdb, `rooms/${this.roomCode}/presence/${uid}/lastSeen`);

          await onDisconnect(myConnRef).cancel();
          await remove(myConnRef);
          await set(lastSeenRef, Date.now());
        } catch {
          // Ignore teardown errors
        }
      }
    }

    this.activeSubscriptions.forEach((cleanup) => cleanup());
    this.activeSubscriptions = [];
    this.processedCommandIds.clear();
    this.roomCode = null;
    this.connectionId = null;
    this.updateConnectionStatus('disconnected');
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  subscribeToPresence(callback: (presenceMap: Record<string, UserPresence>) => void): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const presenceRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/presence`);
    const unsubscribe = onValue(
      presenceRef,
      (snapshot) => {
        const presenceMap: Record<string, UserPresence> = {};
        if (snapshot.exists()) {
          const val = snapshot.val();
          const now = Date.now();
          Object.keys(val).forEach((uid) => {
            const userRaw = val[uid];
            const connections = userRaw.connections || {};
            const isOnline = Object.keys(connections).length > 0;
            const lastSeen = userRaw.lastSeen || 0;
            const isStale = !isOnline && now - lastSeen > 30000;
            const status: ConnectionStatus = isOnline ? 'connected' : (isStale ? 'stale' : 'disconnected');

            presenceMap[uid] = {
              uid,
              role: userRaw.role || 'companion-insights',
              status,
              lastSeen,
              connections,
            };
          });
        }
        callback(presenceMap);
      },
      (error) => {
        console.warn(`[FirebaseRealtimeService] Presence subscription error for room ${roomCode}:`, error);
      }
    );

    this.activeSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  async getUserPresence(uid: string): Promise<UserPresence | null> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const userRef = ref(rtdb, `rooms/${roomCode}/presence/${uid}`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) return null;

    const raw = snapshot.val();
    const connections = raw.connections || {};
    const isOnline = Object.keys(connections).length > 0;
    const lastSeen = raw.lastSeen || 0;
    const isStale = !isOnline && Date.now() - lastSeen > 30000;
    const status: ConnectionStatus = isOnline ? 'connected' : (isStale ? 'stale' : 'disconnected');

    return {
      uid,
      role: raw.role || 'companion-insights',
      status,
      lastSeen,
      connections,
    };
  }

  async isDeviceOnline(deviceUid?: string): Promise<boolean> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    if (deviceUid) {
      const presence = await this.getUserPresence(deviceUid);
      return presence?.status === 'connected';
    }

    const presenceRef = ref(rtdb, `rooms/${roomCode}/presence`);
    const snapshot = await get(presenceRef);
    if (!snapshot.exists()) return false;

    const val = snapshot.val();
    for (const uid of Object.keys(val)) {
      const user = val[uid];
      if (user.role === 'blink-device' || user.role === 'integrated-demo') {
        const conns = user.connections || {};
        if (Object.keys(conns).length > 0) return true;
      }
    }
    return false;
  }

  subscribeToDeviceState(callback: (state: DeviceState) => void): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const stateRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/state`);
    const unsubscribe = onValue(
      stateRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val() as DeviceState);
        } else {
          callback(INITIAL_DEVICE_STATE);
        }
      },
      (error) => {
        console.warn(`[FirebaseRealtimeService] State subscription error for room ${roomCode}:`, error);
      }
    );

    this.activeSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  async publishDeviceState(state: DeviceState): Promise<void> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const stateRef = ref(rtdb, `rooms/${roomCode}/state`);
    await set(stateRef, {
      ...state,
      updatedAt: Date.now(),
    });
  }

  async updateDeviceState(partialState: Partial<DeviceState>): Promise<void> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const stateRef = ref(rtdb, `rooms/${roomCode}/state`);
    const snapshot = await get(stateRef);
    const current = snapshot.exists() ? (snapshot.val() as DeviceState) : INITIAL_DEVICE_STATE;

    const nextState: DeviceState = {
      ...current,
      ...partialState,
      revision: (current.revision || 0) + 1,
      updatedAt: Date.now(),
    };

    await set(stateRef, nextState);
  }

  subscribeToTelemetry(callback: (telemetry: DeviceTelemetry) => void): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const telemetryRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/telemetry`);
    const unsubscribe = onValue(
      telemetryRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.val() as DeviceTelemetry);
        }
      },
      (error) => {
        console.warn(`[FirebaseRealtimeService] Telemetry subscription error for room ${roomCode}:`, error);
      }
    );

    this.activeSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  async publishTelemetry(telemetry: DeviceTelemetry): Promise<void> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const telemetryRef = ref(rtdb, `rooms/${roomCode}/telemetry`);
    await set(telemetryRef, {
      ...telemetry,
      isSimulated: true,
      timestamp: Date.now(),
    });
  }

  subscribeToCommands(callback: (command: DeviceCommand) => void): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const commandsRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/commands`);

    const unsubscribe = onChildAdded(
      commandsRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const command = snapshot.val() as DeviceCommand;

        // Deduplication: prevent processing duplicate deliveries
        if (this.processedCommandIds.has(command.id)) {
          return;
        }

        // Expiration check: skip already expired commands
        if (command.expiresAt && command.expiresAt <= Date.now()) {
          this.processedCommandIds.add(command.id);
          this.acknowledgeCommand(command.id, 'expired', 'Command expired before processing').catch(() => {});
          return;
        }

        // Skip already acknowledged commands
        if (command.acknowledged || (command.status && command.status !== 'pending')) {
          this.processedCommandIds.add(command.id);
          return;
        }

        this.processedCommandIds.add(command.id);
        callback(command);
      },
      (error) => {
        console.warn(`[FirebaseRealtimeService] Commands subscription error for room ${roomCode}:`, error);
      }
    );

    this.activeSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  async sendCommand(command: DeviceCommand, options?: { timeoutMs?: number }): Promise<boolean> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    const uid = this.ensureAuthUid();

    // Verify room is active and not expired
    const roomRef = ref(rtdb, `rooms/${roomCode}`);
    const roomSnap = await get(roomRef);
    if (roomSnap.exists()) {
      const room = roomSnap.val();
      if (room.status === 'closed') {
        throw new Error(`[FirebaseRealtimeService] Cannot send command: room ${roomCode} is closed.`);
      }
      if (room.expiresAt && room.expiresAt <= Date.now()) {
        throw new Error(`[FirebaseRealtimeService] Cannot send command: room ${roomCode} has expired.`);
      }
    }

    const now = Date.now();
    const timeout = options?.timeoutMs || 10000;
    const commandPayload: DeviceCommand = {
      ...command,
      senderId: uid,
      createdAt: now,
      expiresAt: command.expiresAt || now + timeout,
      status: 'pending',
    };

    const cmdRef = ref(rtdb, `rooms/${roomCode}/commands/${command.id}`);
    await set(cmdRef, commandPayload);
    return true;
  }

  async acknowledgeCommand(
    commandId: string,
    status: CommandExecutionStatus,
    resultMessage?: string
  ): Promise<void> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    const uid = this.ensureAuthUid();

    const now = Date.now();
    const acknowledgment: CommandAcknowledgment = {
      commandId,
      status,
      acknowledgedAt: now,
      acknowledgedBy: uid,
      resultMessage: resultMessage || undefined,
    };

    const cmdRef = ref(rtdb, `rooms/${roomCode}/commands/${commandId}`);
    const snapshot = await get(cmdRef);
    if (!snapshot.exists()) {
      throw new Error(`[FirebaseRealtimeService] Command ${commandId} does not exist to acknowledge.`);
    }

    const existingCmd = snapshot.val() as DeviceCommand;

    // Preserving all immutable command fields for security rule conformance
    const updatedCommand: DeviceCommand = {
      ...existingCmd,
      status,
      acknowledged: true,
      acknowledgedAt: now,
      acknowledgment,
    };

    await set(cmdRef, updatedCommand);
  }

  subscribeToCommandStatus(
    commandId: string,
    callback: (ack: CommandAcknowledgment) => void,
    timeoutMs?: number
  ): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    let isCompleted = false;
    let timer: any = null;

    const ackRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/commands/${commandId}`);
    const unsubscribe = onValue(
      ackRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const cmd = snapshot.val() as DeviceCommand;
        if (cmd.acknowledgment) {
          isCompleted = true;
          if (timer) clearTimeout(timer);
          callback(cmd.acknowledgment);
        } else if (cmd.status && cmd.status !== 'pending') {
          isCompleted = true;
          if (timer) clearTimeout(timer);
          callback({
            commandId,
            status: cmd.status,
            acknowledgedAt: cmd.acknowledgedAt || Date.now(),
            acknowledgedBy: 'unknown',
          });
        }
      },
      (error) => {
        console.warn(`[FirebaseRealtimeService] Command status subscription error for ${commandId}:`, error);
      }
    );

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!isCompleted) {
          callback({
            commandId,
            status: 'timed_out',
            acknowledgedAt: Date.now(),
            acknowledgedBy: 'system',
            resultMessage: `Command timed out after ${timeoutMs}ms`,
          });
        }
      }, timeoutMs);
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };

    this.activeSubscriptions.push(cleanup);
    return cleanup;
  }
}
