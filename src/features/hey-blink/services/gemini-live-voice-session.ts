import { GoogleGenAI, type LiveCallbacks, type LiveConnectConfig, type LiveServerMessage } from '@google/genai';
import { DualChannelAudioMeter } from '../audio/audio-meter';
import {
  CapturedAudioChunk,
  MicrophoneCapture,
  MicrophoneCaptureError,
} from '../audio/microphone-capture';
import { GEMINI_INPUT_MIME_TYPE } from '../audio/pcm-encoder';
import { StreamingAudioPlayer } from '../audio/streaming-audio-player';
import {
  buildGeminiLiveConnectConfig,
  DEFAULT_GEMINI_LIVE_API_VERSION,
} from './gemini-live-config';
import {
  LiveSessionTokenClient,
  LiveSessionTokenError,
  LiveSessionTokenResponse,
} from './live-session-token-client';
import {
  IVoiceSession,
  IVoiceSessionDiagnostics,
  TransientDebugTranscript,
  VoiceAudioLevels,
  VoiceAudioListener,
  VoiceSessionError,
  VoiceSessionErrorCode,
  VoiceSessionMetrics,
  VoiceSessionSnapshot,
  VoiceSessionStartOptions,
  VoiceSessionState,
  VoiceStateChangeEvent,
  VoiceStateListener,
} from './voice-session.interface';
import {
  canInterruptVoiceState,
  isActiveVoiceState,
  VoiceStateMachine,
} from './voice-state-machine';

/**
 * Thin transport interface wrapping `@google/genai`'s live `Session` so unit tests
 * can inject deterministic fake transports without making paid live API calls.
 */
export interface IGeminiLiveTransport {
  sendRealtimeInput(params: {
    audio?: { data: string; mimeType: string };
    audioStreamEnd?: boolean;
  }): void;
  sendClientContent(params: { turns?: unknown[]; turnComplete?: boolean }): void;
  close(): void;
}

export interface GeminiLiveConnectParams {
  token: LiveSessionTokenResponse;
  config: LiveConnectConfig;
  callbacks: LiveCallbacks;
}

export type GeminiLiveTransportFactory = (
  params: GeminiLiveConnectParams
) => Promise<IGeminiLiveTransport>;

export interface IMicrophoneAdapter {
  start(options?: { deviceId?: string; muted?: boolean }): Promise<void>;
  setMuted(muted: boolean): void;
  resumeIfSuspended(): Promise<void>;
  stop(): void;
  getStartupLatencyMs(): number | null;
  getDroppedChunks(): number;
}

export interface IAudioPlayerAdapter {
  initialize(): Promise<void>;
  resume(): Promise<void>;
  enqueueBase64Pcm(base64Data: string, mimeType?: string, generationId?: number): boolean;
  markTurnComplete(generationId?: number): void;
  flush(): number;
  dispose(): void;
  getGenerationId(): number;
  getIsPlaying(): boolean;
  getStats(): {
    underrunCount: number;
    droppedChunks: number;
    firstAudioToPlaybackMs: number | null;
    lastInterruptionToSilenceMs: number | null;
  };
}

export interface GeminiLiveVoiceSessionOptions {
  tokenClient: LiveSessionTokenClient;
  /** Optional custom transport factory (defaults to official `@google/genai` SDK) */
  createTransport?: GeminiLiveTransportFactory;
  /** Optional custom microphone capture factory for deterministic testing */
  createMicrophone?: (callbacks: {
    onChunk: (chunk: CapturedAudioChunk) => void;
    onLevel: (rms: number) => void;
    onDeviceDisconnected: (reason: string) => void;
  }) => IMicrophoneAdapter;
  /** Optional custom streaming audio player factory for deterministic testing */
  createPlayer?: (callbacks: {
    onLevel: (rms: number, isPlaying: boolean) => void;
    onPlaybackStart: (generationId: number, latencyMs: number | null) => void;
    onPlaybackDrain: (generationId: number) => void;
  }) => IAudioPlayerAdapter;
  /** Brief interruption visual cue duration before returning to listening (ms) */
  interruptedDurationMs?: number;
  /** Graceful fade-out duration before returning to idle (ms) */
  endingDurationMs?: number;
  /** Max bounded automatic reconnect attempts for recoverable network drops */
  maxReconnectAttempts?: number;
  /** Base exponential backoff delay (ms) */
  reconnectBaseDelayMs?: number;
  /** Enable transient dev-only debug transcription (off by default) */
  debugTranscriptionEnabled?: boolean;
}

const MAX_DEBUG_TRANSCRIPTS = 30;
const LOCAL_SPEECH_THRESHOLD = 0.085;
const LOCAL_PAUSE_TO_THINKING_MS = 750;

/**
 * Default production transport using the official `@google/genai` JavaScript SDK
 * authenticated solely via short-lived ephemeral tokens from our trusted backend.
 */
async function defaultGeminiLiveTransportFactory(
  params: GeminiLiveConnectParams
): Promise<IGeminiLiveTransport> {
  const ai = new GoogleGenAI({
    apiKey: params.token.ephemeralToken,
    httpOptions: {
      apiVersion: params.token.apiVersion || DEFAULT_GEMINI_LIVE_API_VERSION,
    },
  });

  const session = await ai.live.connect({
    model: params.token.model,
    config: params.config,
    callbacks: params.callbacks,
  });

  return {
    sendRealtimeInput: (input) => session.sendRealtimeInput(input),
    sendClientContent: (content) =>
      session.sendClientContent(content as Parameters<typeof session.sendClientContent>[0]),
    close: () => session.close(),
  };
}

function isTerminalCloseCode(code?: number, reason?: string): boolean {
  const lower = (reason || '').toLowerCase();
  if (
    lower.includes('api key') ||
    lower.includes('unauthenticated') ||
    lower.includes('permission') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('not found') ||
    lower.includes('invalid argument')
  ) {
    return true;
  }
  // 1008 Policy Violation / 1003 Unsupported Data / 1002 Protocol Error are non-recoverable
  return code === 1008 || code === 1003 || code === 1002;
}

/**
 * Production Gemini Live realtime voice adapter implementing H1's `IVoiceSession`.
 *
 * - Full-duplex 16 kHz PCM capture -> Gemini Live -> 24 kHz streamed PCM playback
 * - Strictly independent input and output audio channels driving H1's visualizer
 * - Native barge-in + manual interrupt with generation-ID playback cancellation
 * - Session resumption (`sessionResumptionUpdate` + `goAway`) with bounded backoff
 * - Zero React dependencies and zero per-frame React state updates
 */
export class GeminiLiveVoiceSession implements IVoiceSession, IVoiceSessionDiagnostics {
  public readonly providerId = 'gemini-live';
  public readonly isSimulated = false;
  public readonly supportsDiagnostics = true as const;

  private readonly tokenClient: LiveSessionTokenClient;
  private readonly createTransport: GeminiLiveTransportFactory;
  private readonly createMicrophone: NonNullable<GeminiLiveVoiceSessionOptions['createMicrophone']>;
  private readonly createPlayer: NonNullable<GeminiLiveVoiceSessionOptions['createPlayer']>;
  private readonly interruptedDurationMs: number;
  private readonly endingDurationMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;

  private readonly fsm = new VoiceStateMachine('idle');
  private readonly meter = new DualChannelAudioMeter();
  private readonly stateListeners = new Set<VoiceStateListener>();
  private readonly audioListeners = new Set<VoiceAudioListener>();
  private readonly userTranscriptListeners = new Set<(text: string, isFinal: boolean) => void>();

  private transport: IGeminiLiveTransport | null = null;
  private microphone: IMicrophoneAdapter | null = null;
  private player: IAudioPlayerAdapter | null = null;

  private sessionId: string | null = null;
  private activeModel: string | null = null;
  private startedAt: number | null = null;
  private isMuted = false;
  private error: VoiceSessionError | null = null;
  private isDisposed = false;
  private isIntentionalClose = false;
  private lifecycleSeq = 0;

  private selectedAudioDeviceId: string | undefined;
  private activePlaybackGenId = 0;
  private serverTurnCompleteForGen = false;
  private resumptionHandle: string | null = null;
  private reconnectAttempts = 0;
  private reconnectStartedAtMs: number | null = null;
  private lastConnectedToken: LiveSessionTokenResponse | null = null;

  private interruptedTimer: ReturnType<typeof setTimeout> | null = null;
  private endingTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private localPauseTimer: ReturnType<typeof setTimeout> | null = null;

  // Speech & latency measurement timestamps
  private activationStartedAtMs: number | null = null;
  private lastUserSpeechDetectedAtMs: number | null = null;
  private lastUserSpeechEndAtMs: number | null = null;
  private awaitingFirstAudioForTurn = false;
  private userSpokeSinceLastTurn = false;

  private rawInputRms = 0;
  private rawOutputRms = 0;
  private latestLevels: VoiceAudioLevels = {
    inputLevel: 0,
    outputLevel: 0,
    timestamp: performance.now(),
    isSimulated: false,
  };

  private metrics: VoiceSessionMetrics = {
    model: null,
    activationToReadyMs: null,
    micStartupMs: null,
    lastCaptureToSendMs: null,
    endOfSpeechToFirstAudioMs: null,
    firstAudioToPlaybackMs: null,
    interruptionToSilenceMs: null,
    reconnectionDurationMs: null,
    underrunCount: 0,
    droppedChunks: 0,
    reconnectAttempts: 0,
    hasResumptionHandle: false,
  };

  // Optional dev-only transient transcripts (never persisted, never shown in production UI)
  private debugTranscriptionEnabled: boolean;
  private debugTranscripts: TransientDebugTranscript[] = [];
  private transcriptSeq = 0;

  constructor(options: GeminiLiveVoiceSessionOptions) {
    this.tokenClient = options.tokenClient;
    this.createTransport = options.createTransport ?? defaultGeminiLiveTransportFactory;
    this.createMicrophone =
      options.createMicrophone ?? ((callbacks) => new MicrophoneCapture(callbacks));
    this.createPlayer =
      options.createPlayer ?? ((callbacks) => new StreamingAudioPlayer(callbacks));
    this.interruptedDurationMs = options.interruptedDurationMs ?? 180;
    this.endingDurationMs = options.endingDurationMs ?? 420;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1000;
    this.debugTranscriptionEnabled = Boolean(options.debugTranscriptionEnabled);
  }

  public getSnapshot(): VoiceSessionSnapshot {
    return {
      sessionId: this.sessionId,
      providerId: this.providerId,
      isSimulated: this.isSimulated,
      state: this.fsm.getState(),
      previousState: this.fsm.getPreviousState(),
      isMuted: this.isMuted,
      error: this.error,
      startedAt: this.startedAt,
      lastTransitionAt: this.fsm.getLastTransitionAt(),
      transitionCount: this.fsm.getTransitionCount(),
    };
  }

  public getAudioLevels(): VoiceAudioLevels {
    return this.latestLevels;
  }

  public getMetrics(): VoiceSessionMetrics {
    const playerStats = this.player?.getStats();
    const micDropped = this.microphone?.getDroppedChunks() ?? 0;
    return {
      ...this.metrics,
      model: this.activeModel,
      micStartupMs: this.microphone?.getStartupLatencyMs() ?? this.metrics.micStartupMs,
      firstAudioToPlaybackMs:
        playerStats?.firstAudioToPlaybackMs ?? this.metrics.firstAudioToPlaybackMs,
      interruptionToSilenceMs:
        playerStats?.lastInterruptionToSilenceMs ?? this.metrics.interruptionToSilenceMs,
      underrunCount: playerStats?.underrunCount ?? this.metrics.underrunCount,
      droppedChunks: micDropped + (playerStats?.droppedChunks ?? 0),
      reconnectAttempts: this.reconnectAttempts,
      hasResumptionHandle: Boolean(this.resumptionHandle),
    };
  }

  public getDebugTranscripts(): readonly TransientDebugTranscript[] {
    return this.debugTranscripts;
  }

  public setDebugTranscriptionEnabled(enabled: boolean): void {
    this.debugTranscriptionEnabled = enabled;
    if (!enabled) {
      this.debugTranscripts = [];
    }
  }

  public isDebugTranscriptionEnabled(): boolean {
    return this.debugTranscriptionEnabled;
  }

  /**
   * Starts a genuine full-duplex Gemini Live session:
   * 1. Enters `entering` state immediately on tap.
   * 2. Unlocks playback AudioContext & starts AudioWorklet microphone capture inside user gesture.
   * 3. Fetches a short-lived ephemeral token from the trusted backend.
   * 4. Opens the Gemini Live WebSocket session and transitions to `listening` on setup completion.
   */
  public async start(options?: VoiceSessionStartOptions): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    // Prevent simultaneous competing sessions
    if (isActiveVoiceState(current) || current === 'ending') {
      return;
    }

    const seq = ++this.lifecycleSeq;
    this.clearTimers();
    this.isIntentionalClose = false;
    this.error = null;
    this.isMuted = Boolean(options?.initialMuted);
    this.selectedAudioDeviceId = options?.audioInputDeviceId;
    this.startedAt = Date.now();
    this.activationStartedAtMs = performance.now();
    this.reconnectAttempts = 0;
    this.resumptionHandle = null;
    this.debugTranscripts = [];
    this.userSpokeSinceLastTurn = false;
    this.awaitingFirstAudioForTurn = false;
    this.meter.reset();
    this.rawInputRms = 0;
    this.rawOutputRms = 0;

    this.transitionTo('entering', 'user_started_live_session');

    try {
      // 1. Initialize streaming audio player inside the user gesture to satisfy autoplay rules
      const player = this.createPlayer({
        onLevel: (rms) => this.handleOutputLevel(rms),
        onPlaybackStart: (genId, latencyMs) => this.handlePlaybackStart(genId, latencyMs),
        onPlaybackDrain: (genId) => this.handlePlaybackDrain(genId),
      });
      this.player = player;
      await player.initialize();
      this.activePlaybackGenId = player.getGenerationId();

      if (this.isStaleLifecycle(seq)) {
        this.teardownResources();
        return;
      }

      // 2. Start AudioWorklet microphone capture (16 kHz mono 16-bit PCM)
      const mic = this.createMicrophone({
        onChunk: (chunk) => this.handleCapturedMicChunk(chunk),
        onLevel: (rms) => this.handleInputLevel(rms),
        onDeviceDisconnected: (reason) => {
          this.failSession('AUDIO_DEVICE_ERROR', reason, true);
        },
      });
      this.microphone = mic;
      await mic.start({
        deviceId: this.selectedAudioDeviceId,
        muted: this.isMuted,
      });
      this.metrics.micStartupMs = mic.getStartupLatencyMs();

      if (this.isStaleLifecycle(seq)) {
        this.teardownResources();
        return;
      }

      // 3. Mint ephemeral token & connect to Gemini Live
      await this.connectToGeminiLive(seq, false);
    } catch (err) {
      if (this.isStaleLifecycle(seq)) {
        this.teardownResources();
        return;
      }
      this.handleFatalStartError(err);
    }
  }

  public async end(): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (current === 'idle' || current === 'ending') {
      return;
    }

    // Invalidate any in-flight start/reconnect promises immediately
    this.lifecycleSeq += 1;
    this.isIntentionalClose = true;
    this.clearTimers();

    // Immediately stop mic capture & flush speaker output
    this.teardownResources();
    this.meter.reset();
    this.rawInputRms = 0;
    this.rawOutputRms = 0;
    this.emitAudioFrame();

    this.transitionTo('ending', 'user_ended_session');

    return new Promise<void>((resolve) => {
      this.endingTimer = setTimeout(() => {
        this.endingTimer = null;
        if (this.isDisposed) {
          resolve();
          return;
        }
        this.sessionId = null;
        this.startedAt = null;
        this.error = null;
        this.isMuted = false;
        this.resumptionHandle = null;
        if (this.fsm.getState() === 'ending') {
          this.transitionTo('idle', 'session_closed');
        }
        resolve();
      }, this.endingDurationMs);
    });
  }

  public async retry(): Promise<void> {
    if (this.isDisposed) return;
    const current = this.fsm.getState();
    if (current !== 'error' && current !== 'idle') {
      return;
    }
    this.error = null;
    await this.start({
      audioInputDeviceId: this.selectedAudioDeviceId,
      initialMuted: this.isMuted,
    });
  }

  /**
   * Manual interruption control (preserves H1 instant barge-in).
   * Flushes local playback queue immediately, invalidates stale generation IDs,
   * notifies Gemini Live to cancel active generation, and returns to listening.
   */
  public interrupt(): void {
    if (this.isDisposed) return;
    const current = this.fsm.getState();
    if (!canInterruptVoiceState(current)) {
      return;
    }

    this.performImmediateInterruption('manual_interrupt', true);
  }

  /**
   * Actual microphone mute: halts PCM transmission in AudioWorklet + track.enabled,
   * zeroes input meter, and signals `audioStreamEnd: true` to flush server VAD cleanly.
   */
  public setMuted(muted: boolean): void {
    if (this.isDisposed || this.isMuted === muted) return;
    this.isMuted = muted;
    this.microphone?.setMuted(muted);

    if (muted) {
      this.rawInputRms = 0;
      this.meter.suppressInput();
      this.emitAudioFrame();
      this.clearLocalPauseTimer();
      try {
        this.transport?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // Transport may be reconnecting
      }
    }

    const current = this.fsm.getState();
    const snapshot = this.getSnapshot();
    const event: VoiceStateChangeEvent = {
      previousState: current,
      nextState: current,
      snapshot,
      reason: muted ? 'muted' : 'unmuted',
    };
    this.stateListeners.forEach((listener) => listener(event));
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public handleVisibilityChange(isVisible: boolean): void {
    if (this.isDisposed) return;
    if (isVisible && isActiveVoiceState(this.fsm.getState())) {
      void this.microphone?.resumeIfSuspended();
      void this.player?.resume();
    }
  }

  public subscribeState(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeAudio(listener: VoiceAudioListener): () => void {
    this.audioListeners.add(listener);
    return () => {
      this.audioListeners.delete(listener);
    };
  }

  /**
   * Transient in-memory user speech transcript stream used internally by
   * HandsFreeConversationController's ConversationEndDetector (never persisted).
   */
  public subscribeUserTranscript(listener: (text: string, isFinal: boolean) => void): () => void {
    this.userTranscriptListeners.add(listener);
    return () => {
      this.userTranscriptListeners.delete(listener);
    };
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.isIntentionalClose = true;
    this.lifecycleSeq += 1;
    this.clearTimers();
    this.teardownResources();
    this.meter.reset();
    this.stateListeners.clear();
    this.audioListeners.clear();
    this.userTranscriptListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Gemini Live Connection, Reconnection & Event Handling
  // ---------------------------------------------------------------------------

  private async connectToGeminiLive(seq: number, isResuming: boolean): Promise<void> {
    const token = await this.tokenClient.requestToken({
      resuming: isResuming,
      sessionId: this.sessionId,
    });

    if (this.isStaleLifecycle(seq)) return;

    this.lastConnectedToken = token;
    this.activeModel = token.model;
    this.metrics.model = token.model;

    const config = buildGeminiLiveConnectConfig({
      model: token.model,
      voiceName: token.voiceName,
      resumptionHandle: isResuming ? this.resumptionHandle : null,
      enableDebugTranscription: this.debugTranscriptionEnabled,
      constraintsLockedByToken: token.constraintsLocked,
    });

    const hadResumptionHandle = Boolean(isResuming && this.resumptionHandle);
    let setupResolved = false;

    const transport = await this.createTransport({
      token,
      config,
      callbacks: {
        onopen: () => {
          if (this.isStaleLifecycle(seq)) return;
          // Wait for setupComplete before transitioning; fallback ready if transport omits it
        },
        onmessage: (message: LiveServerMessage) => {
          if (this.isStaleLifecycle(seq)) return;
          this.handleServerMessage(message, seq, hadResumptionHandle, () => {
            setupResolved = true;
          });
        },
        onerror: (event: ErrorEvent) => {
          if (this.isStaleLifecycle(seq) || this.isIntentionalClose) return;
          const msg = event?.message || 'Realtime connection error occurred.';
          // onclose typically follows onerror; let onclose coordinate reconnect unless socket already gone
          if (!this.transport) {
            this.failSession('NETWORK_UNAVAILABLE', msg, true);
          }
        },
        onclose: (event: CloseEvent) => {
          if (this.isStaleLifecycle(seq) || this.isIntentionalClose) return;
          this.handleUnexpectedClose(seq, event?.code, event?.reason, setupResolved);
        },
      },
    });

    if (this.isStaleLifecycle(seq)) {
      try {
        transport.close();
      } catch {
        // Ignore
      }
      return;
    }

    this.transport = transport;
  }

  private handleServerMessage(
    message: LiveServerMessage,
    seq: number,
    resumedWithHandle: boolean,
    markSetupComplete: () => void
  ): void {
    // 1. Setup Complete -> session ready to listen
    if (message.setupComplete) {
      markSetupComplete();
      this.sessionId =
        message.setupComplete.sessionId ||
        this.sessionId ||
        `gemini-live-${Date.now().toString(36)}`;

      if (this.activationStartedAtMs !== null) {
        this.metrics.activationToReadyMs =
          Math.round((performance.now() - this.activationStartedAtMs) * 10) / 10;
        this.activationStartedAtMs = null;
      }

      if (this.reconnectStartedAtMs !== null) {
        this.metrics.reconnectionDurationMs =
          Math.round((performance.now() - this.reconnectStartedAtMs) * 10) / 10;
        this.reconnectStartedAtMs = null;
      }

      this.reconnectAttempts = 0;

      if (this.fsm.getState() === 'entering') {
        const reason =
          resumedWithHandle
            ? 'session_resumed'
            : this.metrics.reconnectionDurationMs !== null
              ? 'reconnected_fresh_context'
              : 'setup_complete';
        this.transitionTo('listening', reason);
      }
    }

    // 2. Session Resumption Handle updates
    if (message.sessionResumptionUpdate) {
      const { newHandle, resumable } = message.sessionResumptionUpdate;
      if (resumable && newHandle) {
        this.resumptionHandle = newHandle;
        this.metrics.hasResumptionHandle = true;
      } else if (resumable === false) {
        this.metrics.hasResumptionHandle = Boolean(this.resumptionHandle);
      }
    }

    // 3. Proactive GoAway warning -> reconnect gracefully before forced disconnect
    if (message.goAway) {
      if (this.resumptionHandle && !this.reconnectTimer) {
        this.scheduleGracefulReconnect(seq, 250);
      }
    }

    // 4. Server Voice Activity signals
    if (message.voiceActivity?.voiceActivityType) {
      const activityType = String(message.voiceActivity.voiceActivityType);
      if (activityType === 'ACTIVITY_END') {
        this.lastUserSpeechEndAtMs = performance.now();
        this.awaitingFirstAudioForTurn = true;
        this.clearLocalPauseTimer();
        if (this.fsm.getState() === 'listening') {
          this.transitionTo('thinking', 'server_vad_activity_end');
        }
      } else if (activityType === 'ACTIVITY_START') {
        this.lastUserSpeechDetectedAtMs = performance.now();
        this.userSpokeSinceLastTurn = true;
      }
    }

    // 5. Server Content (audio chunks, interruption, turnComplete, interactionStatus, debug transcripts)
    const content = message.serverContent;
    if (!content) return;

    // 5a. Server-detected Barge-In Interruption (highest priority!)
    if (content.interrupted) {
      this.performImmediateInterruption('server_barge_in', false);
      return;
    }

    // 5b. Transient user transcripts for natural end-intent detection + optional dev-only debug log
    if (content.interimInputTranscription?.text) {
      this.userTranscriptListeners.forEach((listener) =>
        listener(content.interimInputTranscription!.text!, false)
      );
    }
    if (content.inputTranscription?.text) {
      this.userTranscriptListeners.forEach((listener) =>
        listener(content.inputTranscription!.text!, true)
      );
    }

    if (this.debugTranscriptionEnabled) {
      if (content.inputTranscription?.text) {
        this.appendDebugTranscript('user', content.inputTranscription.text);
      }
      if (content.outputTranscription?.text) {
        this.appendDebugTranscript('blink', content.outputTranscription.text);
      }
    }

    // 5c. Interaction Status updates (e.g. Gemini 3.1 Flash Live IN_PROGRESS / IDLE)
    if (content.interactionStatus === 'IN_PROGRESS') {
      if (this.fsm.getState() === 'listening' && !this.player?.getIsPlaying()) {
        this.transitionTo('thinking', 'interaction_in_progress');
      }
    }

    // 5d. Model Audio Turn parts
    const parts = content.modelTurn?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
      for (const part of parts) {
        const inline = part?.inlineData;
        if (inline?.data && (!inline.mimeType || inline.mimeType.toLowerCase().startsWith('audio/'))) {
          if (this.awaitingFirstAudioForTurn && this.lastUserSpeechEndAtMs !== null) {
            this.metrics.endOfSpeechToFirstAudioMs =
              Math.round((performance.now() - this.lastUserSpeechEndAtMs) * 10) / 10;
            this.awaitingFirstAudioForTurn = false;
          }
          this.serverTurnCompleteForGen = false;
          this.clearLocalPauseTimer();

          // If player is initialized, enqueue audio tagged with active generation ID
          const enqueued = this.player?.enqueueBase64Pcm(
            inline.data,
            inline.mimeType,
            this.activePlaybackGenId
          );

          // If audio is enqueued and we're in listening/thinking, allow playback-start callback
          // (or immediate transition if mocked player starts synchronously) to enter `speaking`
          if (enqueued && this.player?.getIsPlaying()) {
            this.enterSpeakingIfAllowed('audio_chunk_playing');
          }
        }
      }
    }

    // 5e. Generation Complete / Turn Complete
    if (content.turnComplete || content.generationComplete) {
      this.serverTurnCompleteForGen = true;
      this.userSpokeSinceLastTurn = false;
      this.awaitingFirstAudioForTurn = false;
      this.player?.markTurnComplete(this.activePlaybackGenId);

      // If no audio is currently playing (e.g., silent turn or already drained), return to listening
      if (!this.player?.getIsPlaying()) {
        const state = this.fsm.getState();
        if (state === 'speaking' || state === 'thinking') {
          this.transitionTo('listening', 'turn_complete_no_pending_audio');
        }
      }
    }
  }

  private performImmediateInterruption(reason: string, notifyServer: boolean): void {
    this.clearLocalPauseTimer();
    if (this.interruptedTimer !== null) {
      clearTimeout(this.interruptedTimer);
      this.interruptedTimer = null;
    }

    // 1. Immediately silence playback, drop queued chunks, and invalidate stale generation IDs
    if (this.player) {
      this.activePlaybackGenId = this.player.flush();
    } else {
      this.activePlaybackGenId += 1;
    }
    this.serverTurnCompleteForGen = false;
    this.awaitingFirstAudioForTurn = false;

    // 2. Immediately zero output audio energy so speaking animation stops without lag
    this.rawOutputRms = 0;
    this.meter.suppressOutput();
    this.emitAudioFrame();

    // 3. For manual UI Interrupt, signal server to cancel current generation cleanly
    if (notifyServer && this.transport) {
      try {
        this.transport.sendClientContent({ turns: [], turnComplete: false });
      } catch {
        // Ignore if transport is already closing
      }
    }

    // 4. Transition through FSM: speaking/thinking -> interrupted -> listening
    const current = this.fsm.getState();
    if (canInterruptVoiceState(current)) {
      this.transitionTo('interrupted', reason);
      const seq = this.lifecycleSeq;
      this.interruptedTimer = setTimeout(() => {
        this.interruptedTimer = null;
        if (this.isDisposed || this.isStaleLifecycle(seq)) return;
        if (this.fsm.getState() === 'interrupted') {
          this.transitionTo('listening', 'interruption_complete');
        }
      }, this.interruptedDurationMs);
    }
  }

  private handleCapturedMicChunk(chunk: CapturedAudioChunk): void {
    if (this.isDisposed || this.isMuted) return;

    // Track local speech activity for responsive `listening -> thinking` feedback
    const current = this.fsm.getState();
    if (current === 'listening') {
      if (chunk.rms >= LOCAL_SPEECH_THRESHOLD) {
        this.lastUserSpeechDetectedAtMs = chunk.capturedAtMs;
        this.userSpokeSinceLastTurn = true;
        this.clearLocalPauseTimer();
      } else if (
        this.userSpokeSinceLastTurn &&
        this.lastUserSpeechDetectedAtMs !== null &&
        this.localPauseTimer === null
      ) {
        this.localPauseTimer = setTimeout(() => {
          this.localPauseTimer = null;
          if (this.isDisposed || this.isMuted) return;
          if (this.fsm.getState() === 'listening' && this.userSpokeSinceLastTurn) {
            this.lastUserSpeechEndAtMs = performance.now();
            this.awaitingFirstAudioForTurn = true;
            this.transitionTo('thinking', 'user_speech_pause');
          }
        }, LOCAL_PAUSE_TO_THINKING_MS);
      }
    }

    // Stream 16 kHz mono 16-bit PCM chunk to Gemini Live only once session is ready
    if (this.transport && current !== 'entering' && current !== 'idle' && current !== 'ending' && current !== 'error') {
      try {
        this.transport.sendRealtimeInput({
          audio: {
            data: chunk.base64,
            mimeType: GEMINI_INPUT_MIME_TYPE,
          },
        });
        this.metrics.lastCaptureToSendMs =
          Math.round((performance.now() - chunk.capturedAtMs) * 10) / 10;
      } catch {
        // Socket may be closing or reconnecting
      }
    }
  }

  private handleInputLevel(rms: number): void {
    this.rawInputRms = this.isMuted ? 0 : rms;
    this.emitAudioFrame();
  }

  private handleOutputLevel(rms: number): void {
    this.rawOutputRms = rms;
    this.emitAudioFrame();
  }

  private handlePlaybackStart(generationId: number, latencyMs: number | null): void {
    if (generationId !== this.activePlaybackGenId || this.isDisposed) return;
    if (latencyMs !== null) {
      this.metrics.firstAudioToPlaybackMs = latencyMs;
    }
    this.enterSpeakingIfAllowed('audio_playback_started');
  }

  private handlePlaybackDrain(generationId: number): void {
    if (generationId !== this.activePlaybackGenId || this.isDisposed) return;
    this.rawOutputRms = 0;
    this.meter.suppressOutput();
    this.emitAudioFrame();

    if (this.serverTurnCompleteForGen && this.fsm.getState() === 'speaking') {
      this.transitionTo('listening', 'playback_drained');
    }
  }

  private enterSpeakingIfAllowed(reason: string): void {
    const current = this.fsm.getState();
    if (current === 'listening' || current === 'thinking') {
      this.transitionTo('speaking', reason);
    }
  }

  private handleUnexpectedClose(
    seq: number,
    code?: number,
    reason?: string,
    wasReady = false
  ): void {
    this.transport = null;

    // Always flush playback on disconnect so stale audio never replays after reconnect
    if (this.player) {
      this.activePlaybackGenId = this.player.flush();
    }
    this.rawOutputRms = 0;
    this.meter.suppressOutput();
    this.emitAudioFrame();

    // Terminal failures (auth, policy, quota, invalid model) must NOT retry blindly
    if (isTerminalCloseCode(code, reason)) {
      this.failSession(
        'PROVIDER_DISCONNECTED',
        reason || 'Live voice session closed by provider. Check model availability and credentials.',
        false
      );
      return;
    }

    // If token expired during a long session or network blipped while active, try bounded reconnect
    if (wasReady && this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts);
      this.scheduleGracefulReconnect(seq, delay);
      return;
    }

    this.failSession(
      'NETWORK_UNAVAILABLE',
      reason || 'Live voice connection closed unexpectedly. Tap Try Again to reconnect.',
      true
    );
  }

  private scheduleGracefulReconnect(seq: number, delayMs: number): void {
    if (this.reconnectTimer !== null || this.isDisposed || this.isStaleLifecycle(seq)) return;

    this.reconnectAttempts += 1;
    this.reconnectStartedAtMs = performance.now();

    // Close existing transport cleanly if triggered proactively by goAway
    if (this.transport) {
      const old = this.transport;
      this.transport = null;
      try {
        old.close();
      } catch {
        // Ignore
      }
    }

    // Flush playback to prevent stale audio replay across reconnect
    if (this.player) {
      this.activePlaybackGenId = this.player.flush();
    }

    // If we have no valid resumption handle, inform the user cleanly rather than
    // silently pretending conversation context survived a full drop.
    if (!this.resumptionHandle && this.lastConnectedToken && this.fsm.getState() !== 'entering') {
      this.failSession(
        'PROVIDER_DISCONNECTED',
        'Connection dropped and conversation context could not be resumed. Tap Try Again to start a fresh session.',
        true
      );
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isDisposed || this.isStaleLifecycle(seq)) return;

      void this.connectToGeminiLive(seq, true).catch((err) => {
        if (this.isStaleLifecycle(seq)) return;
        if (err instanceof LiveSessionTokenError && !err.recoverable) {
          this.failSession(err.code, err.message, false);
          return;
        }
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const nextDelay = this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts);
          this.scheduleGracefulReconnect(seq, nextDelay);
        } else {
          this.failSession(
            'NETWORK_UNAVAILABLE',
            'Unable to reconnect to Gemini Live after multiple attempts.',
            true
          );
        }
      });
    }, delayMs);
  }

  private handleFatalStartError(err: unknown): void {
    this.teardownResources();
    if (err instanceof MicrophoneCaptureError) {
      this.failSession(err.code, err.message, true);
      return;
    }
    if (err instanceof LiveSessionTokenError) {
      this.failSession(err.code, err.message, err.recoverable);
      return;
    }
    const message =
      err instanceof Error
        ? err.message
        : 'Unable to start the Gemini Live voice session.';
    this.failSession('SESSION_INIT_FAILED', message, true);
  }

  private failSession(code: VoiceSessionErrorCode, message: string, recoverable: boolean): void {
    this.clearTimers();
    this.teardownResources();
    this.meter.reset();
    this.rawInputRms = 0;
    this.rawOutputRms = 0;
    this.emitAudioFrame();

    this.error = {
      code,
      message,
      recoverable,
      timestamp: Date.now(),
    };

    const current = this.fsm.getState();
    if (current === 'ending') {
      this.transitionTo('idle', 'settle_before_error');
    }
    if (this.fsm.getState() !== 'error') {
      this.transitionTo('error', `error:${code}`);
    } else {
      const snapshot = this.getSnapshot();
      this.stateListeners.forEach((listener) =>
        listener({
          previousState: 'error',
          nextState: 'error',
          snapshot,
          reason: `error:${code}`,
        })
      );
    }
  }

  private emitAudioFrame(): void {
    const now = performance.now();
    const smoothed = this.meter.step(this.rawInputRms, this.rawOutputRms, now);
    const frame: VoiceAudioLevels = {
      inputLevel: smoothed.input,
      outputLevel: smoothed.output,
      timestamp: now,
      isSimulated: false,
    };
    this.latestLevels = frame;
    this.audioListeners.forEach((listener) => listener(frame));
  }

  private transitionTo(next: VoiceSessionState, reason?: string): void {
    const previousState = this.fsm.getState();
    this.fsm.transition(next, reason);
    const snapshot = this.getSnapshot();
    const event: VoiceStateChangeEvent = {
      previousState,
      nextState: next,
      snapshot,
      reason,
    };
    this.stateListeners.forEach((listener) => listener(event));
  }

  private appendDebugTranscript(speaker: 'user' | 'blink', text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = this.debugTranscripts[this.debugTranscripts.length - 1];
    // Prevent accidental duplicate fragments
    if (last && last.speaker === speaker && last.text === trimmed) {
      return;
    }
    this.transcriptSeq += 1;
    this.debugTranscripts = [
      ...this.debugTranscripts.slice(-(MAX_DEBUG_TRANSCRIPTS - 1)),
      {
        id: `tr-${this.transcriptSeq}`,
        speaker,
        text: trimmed,
        timestamp: Date.now(),
      },
    ];
  }

  private teardownResources(): void {
    if (this.microphone) {
      try {
        this.microphone.stop();
      } catch {
        // Ignore
      }
      this.microphone = null;
    }

    if (this.transport) {
      const active = this.transport;
      this.transport = null;
      try {
        active.close();
      } catch {
        // Ignore
      }
    }

    if (this.player) {
      try {
        this.player.dispose();
      } catch {
        // Ignore
      }
      this.player = null;
    }
  }

  private clearLocalPauseTimer(): void {
    if (this.localPauseTimer !== null) {
      clearTimeout(this.localPauseTimer);
      this.localPauseTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearLocalPauseTimer();
    if (this.interruptedTimer !== null) {
      clearTimeout(this.interruptedTimer);
      this.interruptedTimer = null;
    }
    if (this.endingTimer !== null) {
      clearTimeout(this.endingTimer);
      this.endingTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private isStaleLifecycle(seq: number): boolean {
    return this.isDisposed || seq !== this.lifecycleSeq;
  }
}
