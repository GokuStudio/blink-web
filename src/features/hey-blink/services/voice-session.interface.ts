/**
 * Hey Blink — Realtime Voice Session Contracts (Phase H1)
 *
 * Provider-agnostic abstraction designed to support:
 * - MockVoiceSession (Phase H1 — deterministic & interactive simulation)
 * - GeminiLiveVoiceSession (Phase H2 — realtime bidirectional audio over Gemini Live)
 *
 * Also defines the integration boundary for mounting Hey Blink inside a future
 * shared DeviceExperienceController (Companion Eyes <-> Conversation Mode).
 */

export type VoiceSessionState =
  | 'idle'
  | 'entering'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | 'ending';

export type VoiceSessionErrorCode =
  | 'MICROPHONE_PERMISSION_DENIED'
  | 'NETWORK_UNAVAILABLE'
  | 'AUDIO_DEVICE_ERROR'
  | 'SESSION_INIT_FAILED'
  | 'PROVIDER_DISCONNECTED'
  | 'UNKNOWN_ERROR';

export interface VoiceSessionError {
  code: VoiceSessionErrorCode;
  message: string;
  recoverable: boolean;
  timestamp: number;
}

/**
 * Independent input (user) and output (assistant) normalized audio channels.
 * Sampled at high frequency (up to 60 FPS) via subscriptions or synchronous reads
 * without forcing React component tree re-renders.
 */
export interface VoiceAudioLevels {
  /** Incoming user / microphone amplitude, normalized 0..1 */
  inputLevel: number;
  /** Outgoing assistant speech amplitude, normalized 0..1 */
  outputLevel: number;
  /** Monotonic timestamp (ms) */
  timestamp: number;
  /** Explicitly separates simulated telemetry from live microphone/AI audio */
  isSimulated: boolean;
}

export interface VoiceSessionSnapshot {
  sessionId: string | null;
  providerId: string;
  isSimulated: boolean;
  state: VoiceSessionState;
  previousState: VoiceSessionState | null;
  isMuted: boolean;
  error: VoiceSessionError | null;
  startedAt: number | null;
  lastTransitionAt: number;
  transitionCount: number;
}

export interface VoiceStateChangeEvent {
  previousState: VoiceSessionState;
  nextState: VoiceSessionState;
  snapshot: VoiceSessionSnapshot;
  reason?: string;
}

export interface VoiceSessionStartOptions {
  /** Optional room or device correlation ID for future multi-device integration */
  deviceId?: string;
  /** Optional browser audio input deviceId (e.g. specific USB microphone) */
  audioInputDeviceId?: string;
  /** Start muted if user prefers silent observation */
  initialMuted?: boolean;
}

export type VoiceProviderKind = 'mock' | 'gemini-live';

/**
 * Runtime performance and reliability telemetry collected during a session.
 * Surfaced only in dev diagnostics; never triggers per-frame React re-renders.
 */
export interface VoiceSessionMetrics {
  model: string | null;
  activationToReadyMs: number | null;
  micStartupMs: number | null;
  lastCaptureToSendMs: number | null;
  endOfSpeechToFirstAudioMs: number | null;
  firstAudioToPlaybackMs: number | null;
  interruptionToSilenceMs: number | null;
  reconnectionDurationMs: number | null;
  underrunCount: number;
  droppedChunks: number;
  reconnectAttempts: number;
  hasResumptionHandle: boolean;
}

/**
 * Transient debug-only transcription fragment (never shown in production fullscreen UI,
 * never persisted to Firebase or localStorage).
 */
export interface TransientDebugTranscript {
  id: string;
  speaker: 'user' | 'blink';
  text: string;
  timestamp: number;
}

export interface IVoiceSessionDiagnostics {
  readonly supportsDiagnostics: true;
  getMetrics(): VoiceSessionMetrics;
  getDebugTranscripts(): readonly TransientDebugTranscript[];
  setDebugTranscriptionEnabled(enabled: boolean): void;
  isDebugTranscriptionEnabled(): boolean;
}

export function hasVoiceDiagnostics(
  session: IVoiceSession | null | undefined
): session is IVoiceSession & IVoiceSessionDiagnostics {
  return Boolean(
    session &&
      'supportsDiagnostics' in session &&
      (session as Partial<IVoiceSessionDiagnostics>).supportsDiagnostics === true
  );
}

export type VoiceStateListener = (event: VoiceStateChangeEvent) => void;
export type VoiceAudioListener = (levels: VoiceAudioLevels) => void;

/**
 * Core Voice Session Interface.
 * UI components and hooks must depend ONLY on this abstraction, never directly
 * on MockVoiceSession or a concrete transport implementation.
 */
export interface IVoiceSession {
  readonly providerId: string;
  readonly isSimulated: boolean;

  /** Synchronous snapshot of current lifecycle state */
  getSnapshot(): VoiceSessionSnapshot;

  /** Zero-allocation synchronous read of latest independent audio channels */
  getAudioLevels(): VoiceAudioLevels;

  /** Begin a new voice conversation session */
  start(options?: VoiceSessionStartOptions): Promise<void>;

  /** Gracefully terminate the active session and release resources */
  end(): Promise<void>;

  /** Recover from an error state and re-enter the session */
  retry(): Promise<void>;

  /** Immediately interrupt assistant playback/processing and return to listening */
  interrupt(): void;

  /** Mute or unmute user input channel */
  setMuted(muted: boolean): void;

  /** Toggle mute state and return the resulting muted boolean */
  toggleMute(): boolean;

  /** Inform the session when page visibility changes (background/foreground) */
  handleVisibilityChange(isVisible: boolean): void;

  /** Subscribe to lifecycle state transitions */
  subscribeState(listener: VoiceStateListener): () => void;

  /** Subscribe to high-frequency audio level frames */
  subscribeAudio(listener: VoiceAudioListener): () => void;

  /** Release all timers, listeners, and audio streams immediately */
  dispose(): void;
}

/**
 * Optional dev-only testing capabilities exposed by simulated providers.
 * Checked via runtime type guard so production UI stays provider-agnostic.
 */
export interface IMockVoiceSessionControls {
  readonly supportsDevControls: true;
  setAutoCycle(enabled: boolean): void;
  isAutoCycleEnabled(): boolean;
  triggerStateForDev(targetState: VoiceSessionState): void;
  triggerSimulatedError(code: VoiceSessionErrorCode): void;
  triggerSimulatedSpeechBurst(durationMs?: number): void;
}

export function hasMockVoiceControls(
  session: IVoiceSession | null | undefined
): session is IVoiceSession & IMockVoiceSessionControls {
  return Boolean(
    session &&
      'supportsDevControls' in session &&
      (session as Partial<IMockVoiceSessionControls>).supportsDevControls === true
  );
}

/**
 * Future Integration Contract: DeviceExperienceController
 *
 * Documents how HeyBlinkScreen will mount inside the shared Blink Device
 * display when transitioning between Companion Mode (expressive WebGL eyes)
 * and Conversation Mode (fullscreen fluid voice presence).
 *
 * Planned transition sequence (Phase H2+):
 * 1. Acknowledge user's voice trigger
 * 2. Soften eye shapes (onPrepareConversationTransition)
 * 3. Diffuse eye cyan illumination
 * 4. Merge glow into Hey Blink voice gradient (onConversationActive)
 * 5. Conduct realtime conversation
 * 6. Fade voice gradient & return gracefully to eyes (onConversationEnding -> onReturnToCompanionEyes)
 */
export type DeviceExperienceMode = 'companion-eyes' | 'voice-conversation';

export interface DeviceExperienceTransitionHooks {
  onPrepareConversationTransition?: () => Promise<void> | void;
  onConversationActive?: () => void;
  onConversationEnding?: () => void;
  onReturnToCompanionEyes?: () => void;
}

export interface DeviceExperienceVoiceMountProps {
  /** When true, hides standalone route navigation chrome for embedded device display */
  embedded?: boolean;
  /** Lifecycle callbacks for coordinating eye-to-gradient morphs in DeviceExperienceController */
  transitionHooks?: DeviceExperienceTransitionHooks;
  /** Optional custom session provider (defaults to MockVoiceSession in Phase H1) */
  createSession?: () => IVoiceSession;
  /** Override whether dev-only testing controls may be shown */
  enableDevPanel?: boolean;
}
