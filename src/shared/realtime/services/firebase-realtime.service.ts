import {
  ref,
  set,
  get,
  onValue,
  onChildAdded,
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
  INITIAL_DEVICE_STATE,
} from '@/shared/contracts';
import { getFirebaseServices } from '@/shared/firebase/client';

export class FirebaseRealtimeService implements IRealtimeService {
  private rtdb: Database | null = null;
  private auth: Auth | null = null;
  private roomCode: string | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private processedCommandIds: Set<string> = new Set();
  private activeSubscriptions: Array<() => void> = [];

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

  async connect(roomCode: string, _clientId?: string): Promise<boolean> {
    this.ensureAuthUid();
    this.roomCode = roomCode;
    this.connectionStatus = 'connected';
    return true;
  }

  async disconnect(): Promise<void> {
    this.activeSubscriptions.forEach((cleanup) => cleanup());
    this.activeSubscriptions = [];
    this.processedCommandIds.clear();
    this.roomCode = null;
    this.connectionStatus = 'disconnected';
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
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

    // Listen to child additions under /commands
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

        // Already acknowledged commands (replays on reconnection)
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

  async sendCommand(command: DeviceCommand): Promise<boolean> {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    const uid = this.ensureAuthUid();

    const now = Date.now();
    const commandPayload: DeviceCommand = {
      ...command,
      senderId: uid,
      createdAt: now,
      expiresAt: command.expiresAt || now + 10000, // 10s default TTL
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
    callback: (ack: CommandAcknowledgment) => void
  ): () => void {
    const { rtdb } = this.getServices();
    const roomCode = this.ensureConnectedRoom();
    this.ensureAuthUid();

    const ackRef: DatabaseReference = ref(rtdb, `rooms/${roomCode}/commands/${commandId}`);
    const unsubscribe = onValue(
      ackRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const cmd = snapshot.val() as DeviceCommand;
        if (cmd.acknowledgment) {
          callback(cmd.acknowledgment);
        } else if (cmd.status && cmd.status !== 'pending') {
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

    this.activeSubscriptions.push(unsubscribe);
    return unsubscribe;
  }
}
