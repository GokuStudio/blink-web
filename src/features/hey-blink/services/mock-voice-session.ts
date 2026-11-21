import { DualChannelAudioMeter } from '../audio/audio-meter';
import {
  IMockVoiceSessionControls,
  IVoiceSession,
  VoiceAudioLevels,
  VoiceAudioListener,
  VoiceSessionError,
  VoiceSessionErrorCode,
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

export interface MockVoiceSessionOptions {
  /** Duration of the entering bloom before transitioning to listening (ms) */
  enteringDurationMs?: number;
  /** Duration of graceful fade-out before returning to idle (ms) */
  endingDurationMs?: number;
  /** Brief barge-in acknowledgment before resuming listening (ms) */
  interruptedDurationMs?: number;
  /** Automatic demo cycle durations when autoCycle is enabled */
  listeningCycleMs?: number;
  thinkingCycleMs?: number;
  speakingCycleMs?: number;
  /** Whether to automatically cycle listening -> thinking -> speaking -> listening */
  autoCycle?: boolean;
  /** Interval for synthetic audio synthesis ticks (ms); ~60Hz by default */
  audioTickMs?: number;
}

const DEFAULT_OPTIONS: Required<MockVoiceSessionOptions> = {
  enteringDurationMs: 650,
  endingDurationMs: 480,
  interruptedDurationMs: 280,
  listeningCycleMs: 4200,
  thinkingCycleMs: 2600,
  speakingCycleMs: 5200,
  autoCycle: true,
  audioTickMs: 16,
};

const ERROR_MESSAGES: Record<VoiceSessionErrorCode, string> = {
  MICROPHONE_PERMISSION_DENIED:
    'Microphone access was denied. Enable microphone permission to talk with Blink.',
  NETWORK_UNAVAILABLE:
    'Connection interrupted. Check your network and try reconnecting.',
  AUDIO_DEVICE_ERROR:
    'Unable to access an audio input device. Check your microphone settings.',
  SESSION_INIT_FAILED:
    'Could not initialize the voice session. Try starting again.',
  PROVIDER_DISCONNECTED:
    'The voice session disconnected unexpectedly.',
  UNKNOWN_ERROR:
    'Something went wrong with the voice session.',
};

let sessionSequence = 0;

/**
 * Generates an organic vocal amplitude contour (0..1) using layered low-frequency
 * syllables, phrase cadence, and micro-pauses so motion reads like natural speech
 * rather than synthetic white noise.
 */
function synthesizeVocalContour(
  elapsedSec: number,
  profile: 'listening-speech' | 'assistant-speaking'
): number {
  if (profile === 'listening-speech') {
    // Natural conversational user utterance with gentle cadence
    const phraseEnvelope = Math.max(0, Math.sin(elapsedSec * 1.45 + 0.3));
    const syllable =
      0.5 +
      0.32 * Math.sin(elapsedSec * 8.4) +
      0.18 * Math.sin(elapsedSec * 13.7 + 1.1);
    const microPause = Math.sin(elapsedSec * 2.9) > -0.65 ? 1 : 0.15;
    return Math.max(0, Math.min(0.88, phraseEnvelope * syllable * microPause * 0.92));
  }

  // Confident, articulate assistant voice with clear phrase arcs & pauses
  const phraseCycle = elapsedSec % 2.6;
  const breathGap = phraseCycle > 2.28 ? 0.08 : 1.0;
  const envelope = 0.42 + 0.58 * Math.pow(Math.sin((phraseCycle / 2.6) * Math.PI), 0.7);
  const cadence =
    0.58 +
    0.26 * Math.sin(elapsedSec * 9.8) +
    0.16 * Math.cos(elapsedSec * 15.2 + 0.6);
  return Math.max(0, Math.min(1, envelope * cadence * breathGap));
}

export class MockVoiceSession implements IVoiceSession, IMockVoiceSessionControls {
  public readonly providerId = 'mock-voice-session';
  public readonly isSimulated = true;
  public readonly supportsDevControls = true as const;

  private readonly options: Required<MockVoiceSessionOptions>;
  private readonly fsm: VoiceStateMachine;
  private readonly meter: DualChannelAudioMeter;

  private readonly stateListeners = new Set<VoiceStateListener>();
  private readonly audioListeners = new Set<VoiceAudioListener>();

  private sessionId: string | null = null;
  private startedAt: number | null = null;
  private isMuted = false;
  private error: VoiceSessionError | null = null;
  private autoCycle: boolean;
  private isDisposed = false;
  private isPageVisible = true;

  private audioIntervalId: ReturnType<typeof setInterval> | null = null;
  private pendingTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private speechBurstUntilMs = 0;
  private stateEnteredAtMs = performance.now();

  private latestLevels: VoiceAudioLevels = {
    inputLevel: 0,
    outputLevel: 0,
    timestamp: performance.now(),
    isSimulated: true,
  };

  constructor(options: MockVoiceSessionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.autoCycle = this.options.autoCycle;
    this.fsm = new VoiceStateMachine('idle');
    this.meter = new DualChannelAudioMeter();
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

  public async start(options?: VoiceSessionStartOptions): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    // Prevent simultaneous competing sessions
    if (isActiveVoiceState(current) || current === 'ending') {
      return;
    }

    this.clearPendingTimer();
    this.error = null;
    this.isMuted = Boolean(options?.initialMuted);
    sessionSequence += 1;
    this.sessionId = `mock-voice-${sessionSequence}-${Date.now().toString(36)}`;
    this.startedAt = Date.now();
    this.meter.reset();

    this.transitionTo('entering', 'user_started_session');
    this.startAudioLoop();

    return new Promise<void>((resolve) => {
      this.pendingTransitionTimer = setTimeout(() => {
        this.pendingTransitionTimer = null;
        if (this.isDisposed || this.fsm.getState() !== 'entering') {
          resolve();
          return;
        }
        this.transitionTo('listening', 'session_ready');
        this.scheduleAutoCycleFrom('listening');
        resolve();
      }, this.options.enteringDurationMs);
    });
  }

  public async end(): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (current === 'idle' || current === 'ending') {
      return;
    }

    this.clearPendingTimer();
    this.speechBurstUntilMs = 0;
    this.meter.suppressOutput();
    this.meter.suppressInput();
    this.emitZeroAudio();

    this.transitionTo('ending', 'user_ended_session');

    return new Promise<void>((resolve) => {
      this.pendingTransitionTimer = setTimeout(() => {
        this.pendingTransitionTimer = null;
        if (this.isDisposed) {
          resolve();
          return;
        }
        this.stopAudioLoop();
        this.meter.reset();
        this.emitZeroAudio();
        this.error = null;
        this.isMuted = false;
        this.sessionId = null;
        this.startedAt = null;
        if (this.fsm.getState() === 'ending') {
          this.transitionTo('idle', 'session_closed');
        }
        resolve();
      }, this.options.endingDurationMs);
    });
  }

  public async retry(): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (current !== 'error' && current !== 'idle') {
      return;
    }

    this.error = null;
    await this.start({ initialMuted: this.isMuted });
  }

  public interrupt(): void {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (!canInterruptVoiceState(current)) {
      return;
    }

    // Immediate suppression of outgoing assistant playback — never blocked by animations
    this.clearPendingTimer();
    this.meter.suppressOutput();
    this.publishAudioFrame(this.meter.getLevels().input, 0);

    this.transitionTo('interrupted', 'user_barge_in');

    this.pendingTransitionTimer = setTimeout(() => {
      this.pendingTransitionTimer = null;
      if (this.isDisposed || this.fsm.getState() !== 'interrupted') return;
      this.transitionTo('listening', 'interruption_recovered');
      // Give a subtle natural listening window after barge-in
      this.speechBurstUntilMs = performance.now() + 2000;
      this.scheduleAutoCycleFrom('listening');
    }, this.options.interruptedDurationMs);
  }

  public setMuted(muted: boolean): void {
    if (this.isDisposed || this.isMuted === muted) return;
    this.isMuted = muted;
    if (muted) {
      this.meter.suppressInput();
      this.publishAudioFrame(0, this.meter.getLevels().output);
    }
    // Notify state subscribers so UI reflects mute toggle without forcing state change
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
    if (this.isDisposed || this.isPageVisible === isVisible) return;
    this.isPageVisible = isVisible;

    if (!isVisible) {
      this.stopAudioLoop();
      this.meter.reset();
      this.emitZeroAudio();
    } else if (isActiveVoiceState(this.fsm.getState())) {
      this.startAudioLoop();
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

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.clearPendingTimer();
    this.stopAudioLoop();
    this.meter.reset();
    this.stateListeners.clear();
    this.audioListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Dev-only deterministic test controls (IMockVoiceSessionControls)
  // ---------------------------------------------------------------------------

  public setAutoCycle(enabled: boolean): void {
    this.autoCycle = enabled;
    if (!enabled) {
      // Cancel scheduled auto-cycle transitions without disturbing entering/ending/interrupted
      const state = this.fsm.getState();
      if (state === 'listening' || state === 'thinking' || state === 'speaking') {
        this.clearPendingTimer();
      }
    } else {
      const state = this.fsm.getState();
      if (state === 'listening' || state === 'thinking' || state === 'speaking') {
        this.scheduleAutoCycleFrom(state);
      }
    }
  }

  public isAutoCycleEnabled(): boolean {
    return this.autoCycle;
  }

  public triggerSimulatedSpeechBurst(durationMs = 2200): void {
    if (this.isDisposed || this.isMuted) return;
    if (this.fsm.getState() === 'listening') {
      this.speechBurstUntilMs = performance.now() + durationMs;
    }
  }

  public triggerSimulatedError(code: VoiceSessionErrorCode): void {
    if (this.isDisposed) return;
    this.clearPendingTimer();
    this.meter.reset();
    this.emitZeroAudio();

    const current = this.fsm.getState();
    // Ending must settle to idle before error can be entered
    if (current === 'ending') {
      this.transitionTo('idle', 'dev_settle_before_error');
    }

    this.error = {
      code,
      message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR,
      recoverable: true,
      timestamp: Date.now(),
    };

    if (this.fsm.getState() !== 'error') {
      this.transitionTo('error', `simulated_error:${code}`);
    } else {
      // Update error payload while already in error state
      const snapshot = this.getSnapshot();
      this.stateListeners.forEach((listener) =>
        listener({
          previousState: 'error',
          nextState: 'error',
          snapshot,
          reason: `simulated_error:${code}`,
        })
      );
    }
    this.stopAudioLoop();
  }

  /**
   * Moves the mock session to any target state strictly via legal state transitions,
   * never bypassing the state machine invariants.
   */
  public triggerStateForDev(targetState: VoiceSessionState): void {
    if (this.isDisposed) return;

    if (targetState === 'error') {
      this.triggerSimulatedError('NETWORK_UNAVAILABLE');
      return;
    }

    if (targetState === 'idle') {
      if (this.fsm.getState() === 'idle') return;
      this.clearPendingTimer();
      if (this.fsm.getState() === 'error') {
        this.error = null;
        this.sessionId = null;
        this.startedAt = null;
        this.transitionTo('idle', 'dev_reset_idle');
        this.stopAudioLoop();
        this.emitZeroAudio();
        return;
      }
      if (this.fsm.getState() !== 'ending') {
        this.transitionTo('ending', 'dev_end_to_idle');
      }
      this.stopAudioLoop();
      this.meter.reset();
      this.emitZeroAudio();
      this.error = null;
      this.sessionId = null;
      this.startedAt = null;
      this.transitionTo('idle', 'dev_reset_idle');
      return;
    }

    if (targetState === 'ending') {
      void this.end();
      return;
    }

    if (targetState === 'entering') {
      if (this.fsm.getState() !== 'idle' && this.fsm.getState() !== 'error') {
        this.triggerStateForDev('idle');
      }
      void this.start({ initialMuted: this.isMuted });
      return;
    }

    // For active conversation states (listening, thinking, speaking, interrupted),
    // ensure the session legally enters active mode first.
    this.clearPendingTimer();
    this.error = null;
    if (!this.sessionId) {
      sessionSequence += 1;
      this.sessionId = `mock-voice-dev-${sessionSequence}`;
      this.startedAt = Date.now();
    }

    const ensureListening = () => {
      const s = this.fsm.getState();
      if (s === 'ending') {
        this.transitionTo('idle', 'dev_settle');
      }
      if (this.fsm.getState() === 'idle' || this.fsm.getState() === 'error') {
        this.transitionTo('entering', 'dev_prepare');
      }
      if (this.fsm.getState() === 'entering') {
        this.transitionTo('listening', 'dev_ready');
      }
    };

    this.startAudioLoop();

    if (targetState === 'listening') {
      ensureListening();
      if (this.fsm.getState() !== 'listening') {
        this.meter.suppressOutput();
        this.transitionTo('listening', 'dev_trigger_listening');
      }
      this.speechBurstUntilMs = performance.now() + 2600;
      this.scheduleAutoCycleFrom('listening');
      return;
    }

    if (targetState === 'thinking') {
      ensureListening();
      if (this.fsm.getState() === 'interrupted') {
        this.transitionTo('listening', 'dev_prepare_thinking');
      }
      if (this.fsm.getState() !== 'thinking') {
        this.meter.reset();
        this.emitZeroAudio();
        this.transitionTo('thinking', 'dev_trigger_thinking');
      }
      this.scheduleAutoCycleFrom('thinking');
      return;
    }

    if (targetState === 'speaking') {
      ensureListening();
      if (this.fsm.getState() === 'interrupted') {
        this.transitionTo('listening', 'dev_prepare_speaking');
      }
      if (this.fsm.getState() !== 'speaking') {
        this.meter.suppressInput();
        this.transitionTo('speaking', 'dev_trigger_speaking');
      }
      this.scheduleAutoCycleFrom('speaking');
      return;
    }

    if (targetState === 'interrupted') {
      if (!canInterruptVoiceState(this.fsm.getState())) {
        ensureListening();
        if (this.fsm.getState() === 'listening') {
          this.transitionTo('speaking', 'dev_prepare_interrupt');
        }
      }
      this.interrupt();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal lifecycle & synthetic audio loop
  // ---------------------------------------------------------------------------

  private transitionTo(next: VoiceSessionState, reason?: string): void {
    const previousState = this.fsm.getState();
    this.fsm.transition(next, reason);
    this.stateEnteredAtMs = performance.now();

    const snapshot = this.getSnapshot();
    const event: VoiceStateChangeEvent = {
      previousState,
      nextState: next,
      snapshot,
      reason,
    };

    this.stateListeners.forEach((listener) => listener(event));
  }

  private scheduleAutoCycleFrom(state: 'listening' | 'thinking' | 'speaking'): void {
    if (!this.autoCycle || this.isDisposed) return;
    this.clearPendingTimer();

    if (state === 'listening') {
      // Simulate a natural user speech wave partway through listening
      if (!this.isMuted) {
        this.speechBurstUntilMs = performance.now() + Math.min(2800, this.options.listeningCycleMs * 0.72);
      }
      this.pendingTransitionTimer = setTimeout(() => {
        this.pendingTransitionTimer = null;
        if (this.isDisposed || !this.autoCycle || this.fsm.getState() !== 'listening') return;
        this.meter.reset();
        this.emitZeroAudio();
        this.transitionTo('thinking', 'auto_cycle_processing');
        this.scheduleAutoCycleFrom('thinking');
      }, this.options.listeningCycleMs);
      return;
    }

    if (state === 'thinking') {
      this.pendingTransitionTimer = setTimeout(() => {
        this.pendingTransitionTimer = null;
        if (this.isDisposed || !this.autoCycle || this.fsm.getState() !== 'thinking') return;
        this.transitionTo('speaking', 'auto_cycle_response');
        this.scheduleAutoCycleFrom('speaking');
      }, this.options.thinkingCycleMs);
      return;
    }

    if (state === 'speaking') {
      this.pendingTransitionTimer = setTimeout(() => {
        this.pendingTransitionTimer = null;
        if (this.isDisposed || !this.autoCycle || this.fsm.getState() !== 'speaking') return;
        this.meter.suppressOutput();
        this.transitionTo('listening', 'auto_cycle_turn_complete');
        this.scheduleAutoCycleFrom('listening');
      }, this.options.speakingCycleMs);
    }
  }

  private startAudioLoop(): void {
    if (this.audioIntervalId !== null || this.isDisposed || !this.isPageVisible) return;
    this.audioIntervalId = setInterval(() => {
      this.tickSyntheticAudio();
    }, this.options.audioTickMs);
  }

  private stopAudioLoop(): void {
    if (this.audioIntervalId !== null) {
      clearInterval(this.audioIntervalId);
      this.audioIntervalId = null;
    }
  }

  private clearPendingTimer(): void {
    if (this.pendingTransitionTimer !== null) {
      clearTimeout(this.pendingTransitionTimer);
      this.pendingTransitionTimer = null;
    }
  }

  private tickSyntheticAudio(): void {
    const now = performance.now();
    const state = this.fsm.getState();
    const elapsedSec = (now - this.stateEnteredAtMs) / 1000;

    let rawInput = 0;
    let rawOutput = 0;

    switch (state) {
      case 'entering': {
        // Gentle luminous swell on entry
        const progress = Math.min(1, (now - this.stateEnteredAtMs) / Math.max(1, this.options.enteringDurationMs));
        rawInput = Math.sin(progress * Math.PI) * 0.28;
        break;
      }
      case 'listening': {
        if (!this.isMuted) {
          if (now < this.speechBurstUntilMs) {
            rawInput = synthesizeVocalContour(elapsedSec, 'listening-speech');
          } else {
            // Subtle ambient microphone floor + occasional light room breath
            rawInput = 0.03 + 0.04 * (0.5 + 0.5 * Math.sin(elapsedSec * 1.9));
          }
        }
        rawOutput = 0;
        break;
      }
      case 'thinking': {
        // Deliberately do NOT simulate speech during thinking
        rawInput = 0;
        rawOutput = 0;
        break;
      }
      case 'speaking': {
        rawInput = 0;
        rawOutput = synthesizeVocalContour(elapsedSec, 'assistant-speaking');
        break;
      }
      case 'interrupted':
      case 'ending':
      case 'error':
      case 'idle':
      default: {
        rawInput = 0;
        rawOutput = 0;
        break;
      }
    }

    const smoothed = this.meter.step(rawInput, rawOutput, now);
    this.publishAudioFrame(smoothed.input, smoothed.output, now);
  }

  private publishAudioFrame(
    inputLevel: number,
    outputLevel: number,
    timestamp: number = performance.now()
  ): void {
    const frame: VoiceAudioLevels = {
      inputLevel,
      outputLevel,
      timestamp,
      isSimulated: true,
    };
    this.latestLevels = frame;
    this.audioListeners.forEach((listener) => listener(frame));
  }

  private emitZeroAudio(): void {
    this.publishAudioFrame(0, 0, performance.now());
  }
}
