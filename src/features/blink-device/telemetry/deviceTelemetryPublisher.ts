/**
 * Device Telemetry Publisher & Realtime Command Coordinator
 * 
 * Invariants:
 * 1. Wall-clock timestamps for cloud records (Date.now()); local monotonic clocks are never leaked.
 * 2. Zero Firebase writes from the WebGL RAF loop; writes are bounded to ~1s coalesced interval.
 * 3. Real camera telemetry is tagged isSimulated: false; synthetic demo is tagged isSimulated: true.
 * 4. Tracking unavailability or face loss produces zero/null readings, never fabricated live data.
 * 5. Incoming commands are strictly validated, deduplicated, and acknowledged (executed / rejected).
 * 6. Decoupled from direct Firebase SDK manipulation via IRealtimeService abstraction.
 */

import {
  IRealtimeService,
  IRoomService,
} from '@/shared/realtime';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import {
  DeviceTelemetry,
  DeviceCommand,
  DeviceState,
  BlinkExpressionType,
  ConnectionStatus,
  SetExpressionPayload,
  UpdateNudgeConfigPayload,
} from '@/shared/contracts';
import { useDeviceStore } from '../state';
import { useTrackingStore } from '../state/trackingStore';
import { useWellnessStore } from '../wellness/wellnessStore';
import { usePersonalityStore } from '../personality';
import {
  DevicePublisherConfig,
  PublisherDiagnostics,
  DEFAULT_PUBLISHER_CONFIG,
  INITIAL_PUBLISHER_DIAGNOSTICS,
} from './types';

export class DeviceTelemetryPublisher {
  private config: DevicePublisherConfig;
  private realtimeService: IRealtimeService;
  private roomService: IRoomService;
  private diagnostics: PublisherDiagnostics;

  private publishTimer: NodeJS.Timeout | null = null;
  private commandUnsubscribe: (() => void) | null = null;
  private statusUnsubscribe: (() => void) | null = null;
  private expressionReturnTimer: NodeJS.Timeout | null = null;

  // Rate limiting / writes tracking: timestamps of writes in the last 60 seconds
  private writeTimestamps: number[] = [];

  // Change tracking for device state updates
  private lastPublishedExpression: BlinkExpressionType | null = null;
  private lastPublishedMode: string | null = null;
  private lastPublishedBrightness: number | null = null;
  private lastPublishedFaceVerified: boolean | null = null;
  private stateRevision = 1;

  private diagnosticsListeners: Set<(diag: PublisherDiagnostics) => void> = new Set();

  constructor(
    config: Partial<DevicePublisherConfig> = {},
    realtimeService?: IRealtimeService,
    roomService?: IRoomService
  ) {
    this.config = { ...DEFAULT_PUBLISHER_CONFIG, ...config };
    this.realtimeService = realtimeService || new FirebaseRealtimeService();
    this.roomService = roomService || new FirebaseRoomService();
    this.diagnostics = { ...INITIAL_PUBLISHER_DIAGNOSTICS };
  }

  public getConfig(): DevicePublisherConfig {
    return { ...this.config };
  }

  public setConfig(partial: Partial<DevicePublisherConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public getDiagnostics(): PublisherDiagnostics {
    return { ...this.diagnostics };
  }

  public onDiagnosticsChange(callback: (diag: PublisherDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(callback);
    callback(this.diagnostics);
    return () => this.diagnosticsListeners.delete(callback);
  }

  private updateDiagnostics(partial: Partial<PublisherDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...partial };
    this.diagnosticsListeners.forEach((listener) => listener(this.diagnostics));
  }

  /**
   * Connect to room, establish device presence, start listening to commands,
   * and begin bounded telemetry publication loop.
   */
  public async connect(targetRoomCode?: string): Promise<boolean> {
    // If already connected or timer running, cleanly teardown first to prevent duplicate loops or listener leaks
    if (this.commandUnsubscribe || this.statusUnsubscribe || this.publishTimer) {
      await this.disconnect();
    }

    const roomCode = targetRoomCode || this.config.roomCode;
    this.updateDiagnostics({
      activeRoomCode: roomCode,
      connectionStatus: 'connecting',
      lastPublishError: null,
    });

    try {
      // 1. Ensure room exists as creator if it does not yet exist
      try {
        const room = await this.roomService.getRoom(roomCode);
        if (!room) {
          await this.roomService.createRoom({
            roomCode,
            role: this.config.role,
          });
        }
      } catch {
        // In mock mode or if room already created, continue to connect
      }

      // 2. Connect realtime service
      const connected = await this.realtimeService.connect(roomCode);
      if (!connected) {
        this.updateDiagnostics({ connectionStatus: 'failed', lastPublishError: 'Failed to connect to room' });
        return false;
      }

      // 3. Listen to connection status changes
      this.statusUnsubscribe = this.realtimeService.onConnectionStatusChange((status: ConnectionStatus) => {
        this.updateDiagnostics({ connectionStatus: status });
      });

      // 4. Subscribe to incoming remote commands
      this.commandUnsubscribe = this.realtimeService.subscribeToCommands((cmd) => {
        this.handleIncomingCommand(cmd).catch((err) => {
          console.warn('[DeviceTelemetryPublisher] Command handling error:', err);
        });
      });

      // 5. Start bounded telemetry publishing loop
      if (this.config.autoPublish) {
        this.startPublishing();
      }

      this.updateDiagnostics({
        connectionStatus: 'connected',
        activeRoomCode: roomCode,
      });

      return true;
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateDiagnostics({
        connectionStatus: 'failed',
        lastPublishError: errorMsg,
      });
      return false;
    }
  }

  /**
   * Disconnect publisher, cleanup subscriptions and timers.
   */
  public async disconnect(): Promise<void> {
    this.stopPublishing();

    if (this.expressionReturnTimer) {
      clearTimeout(this.expressionReturnTimer);
      this.expressionReturnTimer = null;
    }

    if (this.commandUnsubscribe) {
      this.commandUnsubscribe();
      this.commandUnsubscribe = null;
    }

    if (this.statusUnsubscribe) {
      this.statusUnsubscribe();
      this.statusUnsubscribe = null;
    }

    try {
      await this.realtimeService.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    this.updateDiagnostics({
      connectionStatus: 'disconnected',
      isPublishing: false,
    });
  }

  /**
   * Starts the periodic coalesced telemetry loop.
   */
  public startPublishing(): void {
    if (this.publishTimer) return;

    this.updateDiagnostics({ isPublishing: true });
    this.publishTimer = setInterval(() => {
      this.publishTick().catch((err) => {
        this.updateDiagnostics({
          lastPublishError: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.publishIntervalMs);
  }

  /**
   * Stops the telemetry publishing loop.
   */
  public stopPublishing(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = null;
    }
    this.updateDiagnostics({ isPublishing: false });
  }

  /**
   * Coalesced publication tick executed once every publishIntervalMs (~1000ms).
   * Reads current local state and publishes DeviceTelemetry and updated DeviceState.
   */
  public async publishTick(): Promise<void> {
    if (this.realtimeService.getConnectionStatus() !== 'connected') {
      return;
    }

    const now = Date.now();
    const trackingState = useTrackingStore.getState();
    const wellnessMetrics = useWellnessStore.getState().metrics;
    const deviceState = useDeviceStore.getState();

    // Data Source Verification & Correctness (Step 08B Audit)
    // A camera session is real if camera acquisition is active.
    // Momentary face-loss during a real session must NOT be labeled simulated data!
    const isCameraTrackingSession = trackingState.isCameraActive;
    const isFaceVerified = isCameraTrackingSession && trackingState.isFaceDetected && trackingState.trackingConfidence >= 0.70;

    // isSimulated is true ONLY for synthetic/demo drivers, not real camera feeds with lost tracking
    const isSimulated = !isCameraTrackingSession;
    const isRealDataSource = isFaceVerified;

    const blinkCount = trackingState.blinkCount;
    // Session duration accumulates ONLY valid face tracking time
    const sessionDurationSeconds = Math.max(0, Math.floor(wellnessMetrics.validObservationDurationMs / 1000));

    // Rate calculations:
    // Requires >= 30s observation baseline; otherwise 0 (baseline establishing window)
    let currentRate = 0;
    let avgRate = 0;

    if (isRealDataSource || isSimulated) {
      currentRate = wellnessMetrics.rollingBlinkRateBpm !== null ? wellnessMetrics.rollingBlinkRateBpm : 0;
      // Denominator is valid tracked minutes (sessionDurationSeconds / 60)
      if (sessionDurationSeconds >= 30) {
        avgRate = blinkCount / (sessionDurationSeconds / 60);
      } else {
        avgRate = currentRate;
      }
    } else {
      // Real camera session, but face is temporarily lost:
      // Current rate is not measurable; session duration does not increment
      currentRate = 0;
      avgRate = sessionDurationSeconds >= 30 ? blinkCount / (sessionDurationSeconds / 60) : 0;
    }

    // Fatigue and Health scores (0-100 demo scale, non-clinical prototype heuristics)
    // When tracking is suspended (face lost) or idle, report 0 (unavailable) rather than false "rested" scores
    let eyeFatigueScore = 0;
    let eyeHealthScore = 0;

    if (wellnessMetrics.state === 'nudging') {
      eyeFatigueScore = 90;
      eyeHealthScore = 10;
    } else if (wellnessMetrics.state === 'nudge_eligible') {
      eyeFatigueScore = 78;
      eyeHealthScore = 22;
    } else if (wellnessMetrics.state === 'warning') {
      eyeFatigueScore = 55;
      eyeHealthScore = 45;
    } else if (wellnessMetrics.state === 'healthy') {
      eyeFatigueScore = 15;
      eyeHealthScore = 85;
    } else if (wellnessMetrics.state === 'observing') {
      eyeFatigueScore = 20;
      eyeHealthScore = 80;
    } else {
      // 'suspended' (face lost) or 'idle' -> 0 (explicitly indicating no active observation)
      eyeFatigueScore = 0;
      eyeHealthScore = 0;
    }

    // Optional eyeAspectRatio signals whether face is actively tracked right now:
    // Populated when face is verified; undefined when face is lost or tracking inactive
    const eyeAspectRatio = isFaceVerified
      ? {
          left: Math.round(Math.max(0, 1.0 - trackingState.closureLeft) * 100) / 100,
          right: Math.round(Math.max(0, 1.0 - trackingState.closureRight) * 100) / 100,
        }
      : undefined;

    const telemetryPayload: DeviceTelemetry = {
      eventId: `telem-${now}-${Math.random().toString(36).substring(2, 7)}`,
      schemaVersion: 1,
      timestamp: now,
      isSimulated,
      deviceId: this.config.deviceId,
      blinkCount,
      sessionDurationSeconds,
      currentBlinkRatePerMinute: Math.round(currentRate * 10) / 10,
      averageBlinkRatePerMinute: Math.round(avgRate * 10) / 10,
      eyeFatigueScore,
      eyeHealthScore,
      ...(eyeAspectRatio ? { eyeAspectRatio } : {}),
    };

    try {
      // 1. Publish latest telemetry stream node (/rooms/$roomId/telemetry)
      await this.realtimeService.publishTelemetry(telemetryPayload);

      // 2. Publish device state if changed (/rooms/$roomId/state)
      const stateHasChanged =
        this.lastPublishedExpression !== deviceState.expression ||
        this.lastPublishedMode !== wellnessMetrics.mode ||
        this.lastPublishedBrightness !== deviceState.brightness ||
        this.lastPublishedFaceVerified !== isFaceVerified;

      if (stateHasChanged) {
        this.stateRevision++;
        this.lastPublishedExpression = deviceState.expression;
        this.lastPublishedMode = wellnessMetrics.mode;
        this.lastPublishedBrightness = deviceState.brightness;
        this.lastPublishedFaceVerified = isFaceVerified;

        const partialDeviceState: Partial<DeviceState> = {
          deviceId: this.config.deviceId,
          status: 'connected',
          brightness: deviceState.brightness,
          expression: {
            current: deviceState.expression,
            targetExpression: deviceState.expression,
            transitionProgress: 1.0,
            intensity: 1.0,
            gaze: { x: 0, y: 0 },
            isBlinking: deviceState.isBlinking,
            blinkFrequencyPerMin: Math.round(currentRate),
            lastChangedAt: now,
          },
          monitoring: {
            mode: wellnessMetrics.mode,
            sessionDurationSeconds,
            totalBlinksDetected: blinkCount,
            isSimulated,
            sampleIntervalMs: this.config.publishIntervalMs,
            lastSampleTimestamp: now,
          },
          latestTelemetry: telemetryPayload,
          revision: this.stateRevision,
          updatedAt: now,
        };

        await this.realtimeService.updateDeviceState(partialDeviceState);
      }

      // Update writes tracking and diagnostics
      this.recordWrite(now);
      this.updateDiagnostics({
        lastPublishTimestamp: now,
        publishedBlinkCount: blinkCount,
        publishedBlinkRate: Math.round(currentRate * 10) / 10,
        publishedMonitoringMode: wellnessMetrics.mode,
        publishedExpression: deviceState.expression,
        isRealDataSource,
        totalPublishedPayloads: this.diagnostics.totalPublishedPayloads + 1,
        lastPublishError: null,
      });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateDiagnostics({ lastPublishError: errorMsg });
    }
  }

  /**
   * Tracks rolling writes per minute.
   */
  private recordWrite(now: number): void {
    this.writeTimestamps.push(now);
    const cutoff = now - 60000;
    while (this.writeTimestamps.length > 0 && this.writeTimestamps[0] < cutoff) {
      this.writeTimestamps.shift();
    }
    this.updateDiagnostics({ writesPerMinute: this.writeTimestamps.length });
  }

  /**
   * Processes incoming remote commands dispatched by Companion Insights.
   */
  public async handleIncomingCommand(command: DeviceCommand): Promise<void> {
    const { id, type, payload } = command;

    try {
      switch (type) {
        case 'SET_EXPRESSION': {
          const exprPayload = payload as SetExpressionPayload;
          if (!exprPayload || !exprPayload.expression) {
            await this.realtimeService.acknowledgeCommand(id, 'rejected', 'Missing expression payload');
            return;
          }

          const validExpressions: BlinkExpressionType[] = [
            'idle',
            'happy',
            'sleepy',
            'alert',
            'thinking',
            'listening',
            'speaking',
            'nudging',
            'offline',
            'error',
          ];

          if (!validExpressions.includes(exprPayload.expression)) {
            await this.realtimeService.acknowledgeCommand(
              id,
              'rejected',
              `Invalid expression: ${exprPayload.expression}`
            );
            return;
          }

          usePersonalityStore.getState().onRemoteCommand(exprPayload.expression, exprPayload.durationSeconds);

          await this.realtimeService.acknowledgeCommand(id, 'executed', `Expression set to ${exprPayload.expression}`);
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        case 'TRIGGER_NUDGE': {
          const currentExpr = useDeviceStore.getState().expression;
          if (currentExpr === 'nudging') {
            await this.realtimeService.acknowledgeCommand(id, 'executed', 'Device is already nudging');
            return;
          }

          useWellnessStore.getState().triggerManualNudge();
          await this.realtimeService.acknowledgeCommand(id, 'executed', 'Manual nudge triggered');
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        case 'START_MONITORING': {
          useWellnessStore.getState().startMonitoring();
          await this.realtimeService.acknowledgeCommand(id, 'executed', 'Monitoring started');
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        case 'STOP_MONITORING': {
          useWellnessStore.getState().stopMonitoring();
          await this.realtimeService.acknowledgeCommand(id, 'executed', 'Monitoring stopped');
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        case 'SET_BRIGHTNESS': {
          const { brightness } = (payload as { brightness: number }) || {};
          if (typeof brightness !== 'number' || brightness < 0.0 || brightness > 1.0) {
            await this.realtimeService.acknowledgeCommand(
              id,
              'rejected',
              'Brightness must be a number between 0.0 and 1.0'
            );
            return;
          }

          useDeviceStore.getState().setBrightness(brightness);
          await this.realtimeService.acknowledgeCommand(id, 'executed', `Brightness set to ${brightness}`);
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        case 'UPDATE_CONFIG': {
          const { config: nudgeConfig } = (payload as UpdateNudgeConfigPayload) || {};
          if (nudgeConfig) {
            useWellnessStore.getState().updateConfig({
              lowBlinkRateThresholdBpm: nudgeConfig.thresholdLowBlinkRate,
              nudgeCooldownMs: nudgeConfig.autoDismissSeconds ? nudgeConfig.autoDismissSeconds * 1000 : undefined,
            });
          }
          await this.realtimeService.acknowledgeCommand(id, 'executed', 'Configuration updated');
          this.updateDiagnostics({ lastAcknowledgedCommand: `${type} (${id.slice(0, 8)})` });
          break;
        }

        default: {
          // Reject unsupported commands (Requirement 6: do not introduce TRIGGER_BLINK or PAUSE_MONITORING)
          await this.realtimeService.acknowledgeCommand(id, 'rejected', `Unsupported command type: ${type}`);
          break;
        }
      }
    } catch (err: any) {
      await this.realtimeService.acknowledgeCommand(
        id,
        'rejected',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
