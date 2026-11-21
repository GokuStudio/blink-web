import {
  AudioResourceManager,
  type AudioResourceOwner,
} from '../audio/audio-resource-manager';
import { MicrophoneCaptureError } from '../audio/microphone-capture';
import type {
  DeviceExperienceTransitionHooks,
  IVoiceSession,
  VoiceSessionState,
} from '../services/voice-session.interface';
import {
  WakeWordService,
} from '../wake-word/wake-word.service';
import type { WakeWordDetectionEvent, WakeWordEngineStatus } from '../wake-word/wake-word.interface';
import {
  ConversationEndDetector,
  type EndIntentEvaluation,
  type StructuredEndConversationSignal,
} from './conversation-end-detector';
import {
  HandsFreeActivationState,
  HandsFreeActivationStateMachine,
  isConversationOccupiedState,
} from './conversation-lifecycle';

export interface HandsFreeMetrics {
  wakeToConversationReadyMs: number | null;
  micHandoverDelayMs: number | null;
  wakeRearmDelayMs: number | null;
  conversationsCompleted: number;
  suppressedDuplicateWakes: number;
  rejectedEndFalsePositives: number;
}

export interface HandsFreeSnapshot {
  activationState: HandsFreeActivationState;
  previousActivationState: HandsFreeActivationState | null;
  userConsentEnabled: boolean;
  micOwner: AudioResourceOwner;
  wakeEngineId: string;
  wakeEngineStatus: WakeWordEngineStatus;
  wakePhrase: string;
  requiresUserGestureToResume: boolean;
  isLiveAudioTransmitting: boolean;
  statusMessage: string | null;
  lastError: string | null;
  lastWakeEvent: WakeWordDetectionEvent | null;
  lastEndEvaluation: EndIntentEvaluation | null;
  metrics: HandsFreeMetrics;
}

export type HandsFreeListener = (snapshot: HandsFreeSnapshot) => void;

export interface HandsFreeControllerOptions {
  audioManager: AudioResourceManager;
  wakeWordService: WakeWordService;
  /** Returns the currently active IVoiceSession instance */
  getVoiceSession: () => IVoiceSession | null;
  endDetector?: ConversationEndDetector;
  transitionHooks?: DeviceExperienceTransitionHooks;
  /** Brief wake-detected acknowledgment delay before starting conversation (ms; default 120 ms) */
  wakeAcknowledgeDelayMs?: number;
  /** Max bounded wait for Blink's natural farewell audio to finish before closing session (ms; default 3500 ms) */
  farewellTimeoutMs?: number;
  /** Optional inactivity timeout in ms — STRICTLY DISABLED (0) by default! */
  inactivityTimeoutMs?: number;
}

/**
 * Central Hands-Free Conversation Coordinator (Phase H2.5)
 *
 * Orchestrates:
 * - One-time user-authorized hands-free enablement
 * - Local-only on-device wake-word detection (zero cloud upload while passive)
 * - Atomic single-pipeline microphone handover via `AudioResourceManager`
 * - H1/H2 `IVoiceSession` start, turn-taking, barge-in, and teardown
 * - Two-layer natural conversation ending (`ConversationEndDetector`) + farewell choreography
 * - Graceful wake-word rearming after conversations & recoverable errors
 * - Hard privacy microphone disable & browser visibility/suspension handling
 */
export class HandsFreeConversationController {
  private readonly audioManager: AudioResourceManager;
  private readonly wakeWordService: WakeWordService;
  private readonly getVoiceSession: () => IVoiceSession | null;
  private readonly endDetector: ConversationEndDetector;
  private readonly transitionHooks?: DeviceExperienceTransitionHooks;
  private readonly wakeAcknowledgeDelayMs: number;
  private readonly farewellTimeoutMs: number;
  private readonly inactivityTimeoutMs: number;

  private readonly fsm = new HandsFreeActivationStateMachine('wake_unavailable');
  private readonly listeners = new Set<HandsFreeListener>();

  private userConsentEnabled = false;
  private requiresUserGestureToResume = false;
  private statusMessage: string | null = null;
  private lastError: string | null = null;
  private lastWakeEvent: WakeWordDetectionEvent | null = null;
  private lastEndEvaluation: EndIntentEvaluation | null = null;
  private selectedAudioDeviceId: string | undefined;

  private lastFinalUserTranscript: string | null = null;
  private lastFinalUserTranscriptAtMs: number | null = null;

  private activeSessionUnsub: (() => void) | null = null;
  private wakeSubUnsub: (() => void) | null = null;
  private wakeAckTimer: ReturnType<typeof setTimeout> | null = null;
  private farewellTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  private isDisposed = false;
  private operationSeq = 0;
  private wakeTriggeredAtMs: number | null = null;
  private endingLocked = false;
  private isLiveAudioTransmitting = false;

  private metrics: HandsFreeMetrics = {
    wakeToConversationReadyMs: null,
    micHandoverDelayMs: null,
    wakeRearmDelayMs: null,
    conversationsCompleted: 0,
    suppressedDuplicateWakes: 0,
    rejectedEndFalsePositives: 0,
  };

  constructor(options: HandsFreeControllerOptions) {
    this.audioManager = options.audioManager;
    this.wakeWordService = options.wakeWordService;
    this.getVoiceSession = options.getVoiceSession;
    this.endDetector = options.endDetector ?? new ConversationEndDetector();
    this.transitionHooks = options.transitionHooks;
    this.wakeAcknowledgeDelayMs = options.wakeAcknowledgeDelayMs ?? 120;
    this.farewellTimeoutMs = options.farewellTimeoutMs ?? 3500;
    // Optional inactivity timeout is strictly disabled by default (0)
    this.inactivityTimeoutMs = Math.max(0, options.inactivityTimeoutMs ?? 0);

    this.wakeSubUnsub = this.wakeWordService.subscribe((event) => {
      void this.handleWakeDetected(event);
    });
  }

  public getSnapshot(): HandsFreeSnapshot {
    return {
      activationState: this.fsm.getState(),
      previousActivationState: this.fsm.getPreviousState(),
      userConsentEnabled: this.userConsentEnabled,
      micOwner: this.audioManager.getOwner(),
      wakeEngineId: this.wakeWordService.getEngineId(),
      wakeEngineStatus: this.wakeWordService.getStatus(),
      wakePhrase: this.wakeWordService.getWakePhrase(),
      requiresUserGestureToResume: this.requiresUserGestureToResume,
      isLiveAudioTransmitting: this.isLiveAudioTransmitting,
      statusMessage: this.statusMessage,
      lastError: this.lastError,
      lastWakeEvent: this.lastWakeEvent,
      lastEndEvaluation: this.lastEndEvaluation,
      metrics: {
        ...this.metrics,
        suppressedDuplicateWakes:
          this.metrics.suppressedDuplicateWakes + this.wakeWordService.getSuppressedDuplicateCount(),
      },
    };
  }

  public subscribe(listener: HandsFreeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSelectedAudioDeviceId(deviceId?: string): void {
    this.selectedAudioDeviceId = deviceId;
  }

  /**
   * One-time browser-permitted user gesture to enable foreground hands-free mode.
   * Requests microphone permission, initializes the on-device wake-word detector,
   * and enters passive local listening (`wake_ready`) without opening any Gemini session.
   */
  public async enableHandsFree(options?: { deviceId?: string }): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (current === 'wake_initializing' || isConversationOccupiedState(current)) {
      return;
    }

    const seq = ++this.operationSeq;
    this.selectedAudioDeviceId = options?.deviceId ?? this.selectedAudioDeviceId;
    this.lastError = null;
    this.requiresUserGestureToResume = false;
    this.userConsentEnabled = true;

    if (current !== 'wake_ready') {
      this.transitionTo('wake_initializing', 'user_enabled_hands_free');
    }

    try {
      // 1. Initialize on-device wake-word engine first so we know whether a real model exists
      const initResult = await this.wakeWordService.initialize();
      if (this.isStale(seq)) return;

      if (!initResult.ready) {
        // Honest behavior: never pretend always-on detection is active without an on-device model!
        this.statusMessage =
          initResult.reason ??
          'On-device "Hey Blink" wake-word model is not installed yet.';
        this.audioManager.releaseAll();
        this.transitionTo('wake_unavailable', 'wake_model_unavailable');
        return;
      }

      // 2. Acquire the single shared microphone pipeline strictly for local wake-word frames
      await this.audioManager.acquireForWakeWord(
        {
          onChunk: (chunk) => {
            this.wakeWordService.feedPcmFrame(chunk.pcm, chunk.rms);
          },
          onDeviceDisconnected: (reason) => {
            this.handleHardwareMicDisconnect(reason);
          },
        },
        { deviceId: this.selectedAudioDeviceId }
      );

      if (this.isStale(seq)) {
        this.audioManager.releaseAll();
        return;
      }

      this.wakeWordService.resume();
      this.statusMessage = `Listening locally for "${this.wakeWordService.getWakePhrase()}"`;
      this.transitionTo('wake_ready', 'hands_free_ready');
    } catch (err) {
      if (this.isStale(seq)) return;
      this.audioManager.releaseAll();
      this.wakeWordService.suspend();

      if (err instanceof MicrophoneCaptureError && err.code === 'MICROPHONE_PERMISSION_DENIED') {
        this.userConsentEnabled = false;
        this.requiresUserGestureToResume = true;
      }

      this.lastError =
        err instanceof Error
          ? err.message
          : 'Unable to enable hands-free microphone listening.';
      this.statusMessage = null;
      this.transitionTo('error', 'enable_hands_free_failed');
    }
  }

  /**
   * Privacy-critical emergency / explicit microphone disable.
   * Immediately terminates any active conversation, stops all hardware microphone tracks,
   * wipes volatile pre-roll buffers, revokes passive consent, and NEVER reactivates silently.
   */
  public async disableHandsFree(reason = 'user_disabled_microphone'): Promise<void> {
    if (this.isDisposed) return;

    this.operationSeq += 1;
    this.userConsentEnabled = false;
    this.endingLocked = false;
    this.isLiveAudioTransmitting = false;
    this.clearTimers();
    this.detachSessionListener();

    this.wakeWordService.suspend();
    this.audioManager.revokeWakeWordOwnership();
    this.audioManager.releaseAll();

    const session = this.getVoiceSession();
    if (session) {
      const s = session.getSnapshot().state;
      if (s !== 'idle' && s !== 'ending') {
        try {
          await session.end();
        } catch {
          // Ensure hardware stays released even if session close errors
        }
      }
    }

    this.statusMessage = 'Microphone disabled. Hands-free listening is off.';
    this.lastError = null;
    if (this.fsm.getState() !== 'suspended') {
      this.transitionTo('suspended', reason);
    } else {
      this.emit();
    }
  }

  /**
   * Starts a conversation directly from the "Talk to Blink" button while keeping
   * ConversationEndDetector (natural voice ending) and farewell choreography active.
   */
  public async startConversationDirect(options?: {
    deviceId?: string;
    initialMuted?: boolean;
  }): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (isConversationOccupiedState(current)) {
      return;
    }

    const session = this.getVoiceSession();
    if (!session) return;

    const seq = ++this.operationSeq;
    this.clearTimers();
    this.selectedAudioDeviceId = options?.deviceId ?? this.selectedAudioDeviceId;
    this.lastError = null;
    this.statusMessage = null;
    this.endingLocked = false;
    this.lastFinalUserTranscript = null;
    this.lastFinalUserTranscriptAtMs = null;

    this.wakeWordService.suspend();
    if (this.audioManager.isCapturing()) {
      this.audioManager.releaseAll();
    }

    this.transitionTo('conversation_starting', 'user_tapped_talk_to_blink');

    try {
      await this.transitionHooks?.onPrepareConversationTransition?.();
      if (this.isStale(seq)) return;

      this.attachSessionListener(session, seq);

      await session.start({
        audioInputDeviceId: this.selectedAudioDeviceId,
        initialMuted: Boolean(options?.initialMuted),
      });

      if (this.isStale(seq)) return;
      this.syncFromVoiceSessionState(session.getSnapshot().state, seq);
    } catch (err) {
      if (this.isStale(seq)) return;
      this.handleConversationFailure(
        err instanceof Error ? err.message : 'Unable to start voice conversation.',
        seq
      );
    }
  }

  /**
   * Ends an active conversation manually (e.g. via End button or Esc) and returns
   * cleanly to idle or rearms local wake-word if hands-free was enabled.
   */
  public async endConversationDirect(): Promise<void> {
    if (this.isDisposed) return;

    const seq = ++this.operationSeq;
    this.clearTimers();
    this.detachSessionListener();
    this.isLiveAudioTransmitting = false;
    this.endingLocked = false;
    this.statusMessage = null;

    const current = this.fsm.getState();
    if (current === 'conversation_active' || current === 'conversation_starting') {
      this.transitionTo('conversation_ending', 'user_ended_conversation');
    }

    const session = this.getVoiceSession();
    if (session) {
      const s = session.getSnapshot().state;
      if (s !== 'idle' && s !== 'ending') {
        try {
          await session.end();
        } catch {
          // Proceed with cleanup
        }
      }
    }

    if (this.isStale(seq)) return;
    await this.rearmLocalWakeWord(seq, 'user_ended_conversation');
  }

  /**
   * Explicit dev/test wake trigger (never shown in production).
   */
  public triggerWakeForDev(): void {
    if (this.isDisposed) return;
    if (isConversationOccupiedState(this.fsm.getState())) {
      this.metrics.suppressedDuplicateWakes += 1;
      this.emit();
      return;
    }
    this.wakeWordService.triggerWakeForDev();
  }

  /**
   * Handles a detected "Hey Blink" wake event:
   * 1. Suppresses duplicate triggers while starting/active.
   * 2. Immediately acknowledges activation (`wake_detected`).
   * 3. Suspends local wake-word detector.
   * 4. Hands over microphone access cleanly & starts `IVoiceSession`.
   * 5. Enters `conversation_active` when session reaches `listening`.
   */
  public async handleWakeDetected(event: WakeWordDetectionEvent): Promise<void> {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    // Prevent duplicate activations during startup or active conversation
    if (isConversationOccupiedState(current) || current === 'suspended' || current === 'wake_initializing') {
      this.metrics.suppressedDuplicateWakes += 1;
      this.emit();
      return;
    }

    // Only accept simulated dev triggers when model is unavailable; real audio requires wake_ready
    if (current === 'wake_unavailable' && !event.isSimulatedTrigger) {
      return;
    }

    const session = this.getVoiceSession();
    if (!session) return;

    const seq = ++this.operationSeq;
    this.clearTimers();
    this.lastWakeEvent = event;
    this.lastError = null;
    this.endingLocked = false;
    this.lastFinalUserTranscript = null;
    this.lastFinalUserTranscriptAtMs = null;
    this.wakeTriggeredAtMs = event.detectedAtMs;

    // 1. Immediately suspend wake-word detection so Blink never self-triggers
    this.wakeWordService.suspend();

    // 2. Acknowledge activation visually
    this.statusMessage = null;
    this.transitionTo('wake_detected', 'wake_word_detected');

    // Brief visual acknowledgment window before entering conversation
    await new Promise<void>((resolve) => {
      this.wakeAckTimer = setTimeout(() => {
        this.wakeAckTimer = null;
        resolve();
      }, this.wakeAcknowledgeDelayMs);
    });

    if (this.isStale(seq) || this.fsm.getState() !== 'wake_detected') return;

    // 3. Coordinate DeviceExperienceController hook & start conversation
    this.transitionTo('conversation_starting', 'starting_voice_session');

    try {
      await this.transitionHooks?.onPrepareConversationTransition?.();
      if (this.isStale(seq)) return;

      // Measure handover delay when shared pipeline is active
      if (this.audioManager.isCapturing()) {
        const handoverStart = performance.now();
        // Release passive ownership before session acquires/uses mic so zero duplicate streams compete
        this.audioManager.releaseAll();
        this.metrics.micHandoverDelayMs =
          Math.round((performance.now() - handoverStart) * 10) / 10;
      }

      this.attachSessionListener(session, seq);

      await session.start({
        audioInputDeviceId: this.selectedAudioDeviceId,
        initialMuted: false,
      });

      if (this.isStale(seq)) return;

      // In case session reached listening synchronously inside start()
      this.syncFromVoiceSessionState(session.getSnapshot().state, seq);
    } catch (err) {
      if (this.isStale(seq)) return;
      this.handleConversationFailure(
        err instanceof Error ? err.message : 'Unable to start voice conversation.',
        seq
      );
    }
  }

  /**
   * Evaluates a user speech transcript through Layer A (`ConversationEndDetector`).
   * If a high-confidence closing utterance is detected, triggers natural ending choreography.
   */
  public evaluateUserTranscript(rawTranscript: string, isFinal: boolean): EndIntentEvaluation {
    if (isFinal && rawTranscript.trim()) {
      this.lastFinalUserTranscript = rawTranscript.trim();
      this.lastFinalUserTranscriptAtMs = Date.now();
      this.bumpInactivityTimer();
    }

    const result = this.endDetector.evaluateUserTranscript(rawTranscript, isFinal);
    this.lastEndEvaluation = result;

    if (this.fsm.getState() !== 'conversation_active' && this.fsm.getState() !== 'conversation_ending') {
      this.emit();
      return result;
    }

    // If user speaks a non-ending continuation while Blink is delivering a farewell,
    // cancel the pending close and return cleanly to active conversation!
    if (this.fsm.getState() === 'conversation_ending' && isFinal && !result.shouldEnd) {
      this.cancelPendingFarewellEnding();
      this.emit();
      return result;
    }

    if (result.shouldEnd && this.fsm.getState() === 'conversation_active' && !this.endingLocked) {
      void this.beginNaturalEnding(result);
    } else if (isFinal && !result.shouldEnd && result.rejectionReason && result.rejectionReason !== 'no_closing_match') {
      this.metrics.rejectedEndFalsePositives += 1;
      this.emit();
    }

    return result;
  }

  /**
   * Evaluates a Gemini-assisted structured `end_conversation` signal (Layer B).
   */
  public evaluateStructuredEndSignal(signal: StructuredEndConversationSignal): EndIntentEvaluation {
    const session = this.getVoiceSession();
    const result = this.endDetector.validateStructuredEndSignal(signal, {
      activeSessionId: session?.getSnapshot().sessionId ?? null,
      lastFinalUserTranscript: this.lastFinalUserTranscript,
      lastFinalUserTranscriptAtMs: this.lastFinalUserTranscriptAtMs,
    });
    this.lastEndEvaluation = result;

    if (result.shouldEnd && this.fsm.getState() === 'conversation_active' && !this.endingLocked) {
      void this.beginNaturalEnding(result);
    } else if (!result.shouldEnd) {
      this.metrics.rejectedEndFalsePositives += 1;
      this.emit();
    }

    return result;
  }

  /**
   * Handles browser tab visibility changes & background suspension honestly.
   */
  public handleVisibilityChange(isVisible: boolean): void {
    if (this.isDisposed) return;

    const current = this.fsm.getState();
    if (!isVisible) {
      // If passively listening in a background tab, release passive mic cleanly
      // so the browser does not leave an unexpected background capture open.
      if (current === 'wake_ready') {
        this.wakeWordService.suspend();
        this.audioManager.releaseAll();
        this.requiresUserGestureToResume = false;
        this.statusMessage = 'Hands-free paused while tab is in the background.';
        this.transitionTo('suspended', 'tab_hidden');
      }
      return;
    }

    // Tab returned to foreground
    if (current === 'suspended' && this.userConsentEnabled) {
      void this.rearmWakeWordAfterResume();
    } else if (isConversationOccupiedState(current)) {
      void this.audioManager.resumeIfSuspended();
    }
  }

  /**
   * Cleans up all subscriptions, timers, wake-word resources, and audio handles.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.operationSeq += 1;
    this.clearTimers();
    this.detachSessionListener();
    if (this.wakeSubUnsub) {
      this.wakeSubUnsub();
      this.wakeSubUnsub = null;
    }
    this.wakeWordService.dispose();
    this.audioManager.dispose();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Natural Ending Choreography & Wake Rearming
  // ---------------------------------------------------------------------------

  private async beginNaturalEnding(evaluation: EndIntentEvaluation): Promise<void> {
    if (this.isDisposed || this.endingLocked) return;
    if (this.fsm.getState() !== 'conversation_active') return;

    const seq = this.operationSeq;
    this.endingLocked = true;
    this.clearInactivityTimer();
    this.statusMessage = 'Wrapping up conversation';
    this.transitionTo('conversation_ending', `natural_end:${evaluation.matchedPattern ?? evaluation.layer}`);

    const session = this.getVoiceSession();
    const currentVoiceState = session?.getSnapshot().state;

    // Allow Blink's brief natural farewell (if currently speaking or preparing farewell)
    // to finish cleanly, bounded by `farewellTimeoutMs` so teardown never hangs.
    if (currentVoiceState === 'speaking' || currentVoiceState === 'thinking') {
      this.farewellTimer = setTimeout(() => {
        this.farewellTimer = null;
        if (!this.isStale(seq) && this.fsm.getState() === 'conversation_ending') {
          void this.finalizeConversationAndRearm(seq);
        }
      }, this.farewellTimeoutMs);
      return;
    }

    await this.finalizeConversationAndRearm(seq);
  }

  private cancelPendingFarewellEnding(): void {
    this.endingLocked = false;
    if (this.farewellTimer !== null) {
      clearTimeout(this.farewellTimer);
      this.farewellTimer = null;
    }
    if (this.fsm.getState() === 'conversation_ending') {
      this.statusMessage = null;
      this.transitionTo('conversation_active', 'farewell_interrupted_by_user');
      this.bumpInactivityTimer();
    }
  }

  private async finalizeConversationAndRearm(seq: number): Promise<void> {
    if (this.isStale(seq)) return;

    this.clearTimers();
    this.detachSessionListener();
    this.isLiveAudioTransmitting = false;

    const session = this.getVoiceSession();
    if (session) {
      const s = session.getSnapshot().state;
      if (s !== 'idle' && s !== 'ending') {
        try {
          await session.end();
        } catch {
          // Proceed with cleanup even if remote socket already closed
        }
      }
    }

    if (this.isStale(seq)) return;

    this.endingLocked = false;
    this.metrics.conversationsCompleted += 1;
    this.transitionHooks?.onConversationEnding?.();
    this.transitionHooks?.onReturnToCompanionEyes?.();

    await this.rearmLocalWakeWord(seq, 'conversation_completed');
  }

  private async rearmLocalWakeWord(seq: number, reason: string): Promise<void> {
    if (this.isStale(seq)) return;

    if (!this.userConsentEnabled) {
      this.audioManager.releaseAll();
      this.statusMessage = null;
      const target: HandsFreeActivationState =
        this.wakeWordService.getStatus() === 'ready' ? 'suspended' : 'wake_unavailable';
      if (this.fsm.getState() !== target) {
        this.transitionTo(target, 'consent_not_granted');
      } else {
        this.emit();
      }
      return;
    }

    if (this.wakeWordService.getStatus() !== 'ready') {
      this.audioManager.releaseAll();
      this.statusMessage =
        this.wakeWordService.getUnavailableReason() ??
        'On-device "Hey Blink" wake-word model is not installed yet.';
      if (this.fsm.getState() !== 'wake_unavailable') {
        this.transitionTo('wake_unavailable', 'wake_model_unavailable_on_rearm');
      }
      return;
    }

    const rearmStart = performance.now();
    this.transitionTo('wake_rearming', reason);

    try {
      await this.audioManager.acquireForWakeWord(
        {
          onChunk: (chunk) => {
            this.wakeWordService.feedPcmFrame(chunk.pcm, chunk.rms);
          },
          onDeviceDisconnected: (disconnectReason) => {
            this.handleHardwareMicDisconnect(disconnectReason);
          },
        },
        { deviceId: this.selectedAudioDeviceId }
      );

      if (this.isStale(seq)) {
        this.audioManager.releaseAll();
        return;
      }

      this.wakeWordService.resume();
      this.metrics.wakeRearmDelayMs = Math.round((performance.now() - rearmStart) * 10) / 10;
      this.statusMessage = `Listening locally for "${this.wakeWordService.getWakePhrase()}"`;
      this.transitionTo('wake_ready', 'wake_rearmed');
    } catch (err) {
      if (this.isStale(seq)) return;
      this.audioManager.releaseAll();
      this.wakeWordService.suspend();
      if (err instanceof MicrophoneCaptureError && err.code === 'MICROPHONE_PERMISSION_DENIED') {
        this.userConsentEnabled = false;
        this.requiresUserGestureToResume = true;
      }
      this.lastError =
        err instanceof Error ? err.message : 'Unable to rearm local wake-word listening.';
      this.transitionTo('error', 'wake_rearm_failed');
    }
  }

  private async rearmWakeWordAfterResume(): Promise<void> {
    const seq = this.operationSeq;
    try {
      await this.rearmLocalWakeWord(seq, 'tab_visible_resume');
    } catch {
      this.requiresUserGestureToResume = true;
      this.statusMessage = 'Tap to resume hands-free listening.';
      this.emit();
    }
  }

  // ---------------------------------------------------------------------------
  // Voice Session Synchronization & Error Handling
  // ---------------------------------------------------------------------------

  private attachSessionListener(session: IVoiceSession, seq: number): void {
    this.detachSessionListener();
    this.activeSessionUnsub = session.subscribeState((event) => {
      if (this.isStale(seq)) return;
      this.syncFromVoiceSessionState(event.nextState, seq, event.snapshot.error?.message);
    });
  }

  private detachSessionListener(): void {
    if (this.activeSessionUnsub) {
      this.activeSessionUnsub();
      this.activeSessionUnsub = null;
    }
  }

  private syncFromVoiceSessionState(
    voiceState: VoiceSessionState,
    seq: number,
    errorMessage?: string
  ): void {
    const activation = this.fsm.getState();

    // Active audio transmission indicator (privacy requirement, Section 8)
    const session = this.getVoiceSession();
    const isMuted = session?.getSnapshot().isMuted ?? false;
    this.isLiveAudioTransmitting =
      !isMuted &&
      (voiceState === 'listening' ||
        voiceState === 'thinking' ||
        voiceState === 'speaking' ||
        voiceState === 'interrupted');

    if (activation === 'conversation_starting' && voiceState === 'listening') {
      if (this.wakeTriggeredAtMs !== null) {
        this.metrics.wakeToConversationReadyMs = Math.max(
          0,
          Math.round((Date.now() - this.wakeTriggeredAtMs) * 10) / 10
        );
        this.wakeTriggeredAtMs = null;
      }
      this.transitionTo('conversation_active', 'voice_session_listening');
      this.bumpInactivityTimer();
      return;
    }

    // During natural ending choreography, once farewell speech finishes and voice returns
    // to listening (or idle), immediately complete teardown & rearm wake-word!
    if (activation === 'conversation_ending') {
      if (voiceState === 'listening' || voiceState === 'idle') {
        void this.finalizeConversationAndRearm(seq);
      } else if (voiceState === 'interrupted') {
        // User barged in during farewell -> cancel close and continue conversation!
        this.cancelPendingFarewellEnding();
      }
      return;
    }

    if (activation === 'conversation_active') {
      if (voiceState === 'listening' || voiceState === 'speaking') {
        this.bumpInactivityTimer();
      } else if (voiceState === 'idle') {
        // Session ended cleanly externally
        void this.finalizeConversationAndRearm(seq);
      } else if (voiceState === 'error') {
        this.handleConversationFailure(
          errorMessage || 'Voice conversation disconnected.',
          seq
        );
      } else {
        this.emit();
      }
      return;
    }

    if (activation === 'conversation_starting' && voiceState === 'error') {
      this.handleConversationFailure(
        errorMessage || 'Could not start voice conversation.',
        seq
      );
      return;
    }

    this.emit();
  }

  private handleConversationFailure(message: string, seq: number): void {
    this.clearTimers();
    this.detachSessionListener();
    this.isLiveAudioTransmitting = false;
    this.endingLocked = false;
    this.lastError = message;

    const current = this.fsm.getState();
    if (current !== 'error') {
      this.transitionTo('error', 'conversation_failed');
    } else {
      this.emit();
    }

    // After a recoverable conversation failure, restore local wake-word detection ONLY
    // when user consent and engine readiness remain valid (never infinite paid retries!)
    if (this.userConsentEnabled && this.wakeWordService.getStatus() === 'ready') {
      void this.rearmLocalWakeWord(seq, 'recover_to_local_wake');
    }
  }

  private handleHardwareMicDisconnect(reason: string): void {
    this.clearTimers();
    this.wakeWordService.suspend();
    this.isLiveAudioTransmitting = false;
    this.lastError = reason;
    this.requiresUserGestureToResume = true;
    if (this.fsm.getState() !== 'error') {
      this.transitionTo('error', 'microphone_disconnected');
    } else {
      this.emit();
    }
  }

  private bumpInactivityTimer(): void {
    this.clearInactivityTimer();
    if (this.inactivityTimeoutMs <= 0) return;
    if (this.fsm.getState() !== 'conversation_active') return;

    const seq = this.operationSeq;
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;
      if (!this.isStale(seq) && this.fsm.getState() === 'conversation_active') {
        void this.finalizeConversationAndRearm(seq);
      }
    }, this.inactivityTimeoutMs);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearInactivityTimer();
    if (this.wakeAckTimer !== null) {
      clearTimeout(this.wakeAckTimer);
      this.wakeAckTimer = null;
    }
    if (this.farewellTimer !== null) {
      clearTimeout(this.farewellTimer);
      this.farewellTimer = null;
    }
  }

  private transitionTo(next: HandsFreeActivationState, reason?: string): void {
    this.fsm.transition(next, reason);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private isStale(seq: number): boolean {
    return this.isDisposed || seq !== this.operationSeq;
  }
}
