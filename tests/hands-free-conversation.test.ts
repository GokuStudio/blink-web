import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AudioResourceManager,
  ConversationEndDetector,
  HandsFreeActivationStateMachine,
  HandsFreeConversationController,
  IllegalActivationTransitionError,
  MicrophoneCaptureError,
  MockVoiceSession,
  UnconfiguredOnDeviceWakeWordEngine,
  WakeWordService,
  int16ToBase64,
  type CapturedAudioChunk,
  type IMicrophoneCapturePipeline,
  type IWakeWordEngine,
  type MicrophoneCaptureCallbacks,
  type WakeWordDetectionEvent,
} from '@/features/hey-blink';

/**
 * Deterministic on-device wake-word engine stub for automated tests.
 * Triggers "Hey Blink" when a test PCM frame contains a sentinel amplitude (> 20000).
 */
class DeterministicTestWakeEngine implements IWakeWordEngine {
  public readonly engineId = 'test-on-device-kws';
  public readonly wakePhrase = 'Hey Blink';
  public readonly isOnDevice = true as const;
  public readonly requiresCustomModel = false;
  public framesSeen = 0;
  public disposed = false;

  public async initialize() {
    return { ready: true, status: 'ready' as const };
  }

  public processPcmFrame(pcm16k: Int16Array, _rms: number): WakeWordDetectionEvent | null {
    this.framesSeen += 1;
    if (pcm16k.length > 0 && pcm16k[0] >= 20000) {
      return {
        phrase: this.wakePhrase,
        confidence: 0.98,
        engineId: this.engineId,
        detectedAtMs: Date.now(),
        isSimulatedTrigger: false,
      };
    }
    return null;
  }

  public setSensitivity(): void {}
  public reset(): void {}
  public dispose(): void {
    this.disposed = true;
  }
}

function createFakeCaptureHarness(options?: { denyPermission?: boolean }) {
  let activeCallbacks: MicrophoneCaptureCallbacks | null = null;
  let running = false;
  let muted = false;
  let startCount = 0;
  let stopCount = 0;

  const createCapture = (callbacks: MicrophoneCaptureCallbacks): IMicrophoneCapturePipeline => {
    activeCallbacks = callbacks;
    return {
      start: async () => {
        if (options?.denyPermission) {
          throw new MicrophoneCaptureError(
            'MICROPHONE_PERMISSION_DENIED',
            'Microphone permission denied'
          );
        }
        startCount += 1;
        running = true;
        muted = false;
      },
      setMuted: (m) => {
        muted = m;
      },
      resumeIfSuspended: async () => {},
      stop: () => {
        if (running) {
          stopCount += 1;
        }
        running = false;
      },
      getIsRunning: () => running,
      getIsMuted: () => muted,
      getStartupLatencyMs: () => 12,
      getDroppedChunks: () => 0,
    };
  };

  const emitPcm = (sample0: number, seq = 0) => {
    const pcm = new Int16Array(512).fill(sample0);
    const chunk: CapturedAudioChunk = {
      pcm,
      base64: int16ToBase64(pcm),
      rms: Math.min(1, Math.abs(sample0) / 32768),
      seq,
      sampleRate: 16000,
      capturedAtMs: performance.now(),
    };
    activeCallbacks?.onChunk(chunk);
  };

  return {
    createCapture,
    emitPcm,
    isRunning: () => running,
    getStartCount: () => startCount,
    getStopCount: () => stopCount,
    triggerDisconnect: (reason: string) => activeCallbacks?.onDeviceDisconnected?.(reason),
  };
}

describe('Phase H2.5 — HandsFreeActivationStateMachine', () => {
  it('enforces legal activation transitions and rejects illegal jumps', () => {
    const fsm = new HandsFreeActivationStateMachine('wake_unavailable');
    expect(() => fsm.transition('conversation_active')).toThrow(IllegalActivationTransitionError);
    expect(() => fsm.transition('wake_ready')).toThrow(IllegalActivationTransitionError);

    expect(fsm.transition('wake_initializing')).toBe('wake_initializing');
    expect(fsm.transition('wake_ready')).toBe('wake_ready');
    expect(fsm.transition('wake_detected')).toBe('wake_detected');
    expect(fsm.transition('conversation_starting')).toBe('conversation_starting');
    expect(fsm.transition('conversation_active')).toBe('conversation_active');
    expect(fsm.transition('conversation_ending')).toBe('conversation_ending');
    expect(fsm.transition('wake_rearming')).toBe('wake_rearming');
    expect(fsm.transition('wake_ready')).toBe('wake_ready');
  });
});

describe('Phase H2.5 — ConversationEndDetector (Natural Ending & False-Positive Protection)', () => {
  const detector = new ConversationEndDetector();

  it('recognizes explicit natural closing phrases on finalized user speech', () => {
    const validEndings = [
      "Okay Blink, that's all.",
      'Thanks Blink, bye.',
      "That's it for now.",
      'Goodbye Blink.',
      'You can stop listening now.',
      'Talk to you later.',
      "Thank you, that's all I needed.",
      'All done Blink!',
      'See you later Blink.',
    ];

    for (const phrase of validEndings) {
      const res = detector.evaluateUserTranscript(phrase, true);
      expect(res.shouldEnd, `Expected closing match for: "${phrase}"`).toBe(true);
      expect(res.layer).toBe('local_high_confidence');
    }
  });

  it('strictly rejects questions, quotations, compositions, negations, partials, and isolated words', () => {
    const mustNotEnd = [
      'How do I say goodbye in Japanese?',
      'Write an email ending with thank you.',
      "My colleague said that's all.",
      "Don't end the conversation yet.",
      'Is goodbye one word or two?',
      'Do not stop listening please.',
      'Wait, hold on, one more thing.',
      'She told me "goodbye" yesterday.',
      'thanks',
      'okay',
      'stop',
      'done',
    ];

    for (const phrase of mustNotEnd) {
      const res = detector.evaluateUserTranscript(phrase, true);
      expect(res.shouldEnd, `Must NOT end for: "${phrase}"`).toBe(false);
    }

    // Partial transcripts NEVER terminate even if text matches a closing phrase
    const partial = detector.evaluateUserTranscript('Goodbye Blink', false);
    expect(partial.shouldEnd).toBe(false);
    expect(partial.rejectionReason).toBe('partial_transcript');
  });

  it('validates Layer B structured end_conversation signals against active session & user turn', () => {
    const now = Date.now();
    // Valid structured signal backed by recent non-question user turn
    const ok = detector.validateStructuredEndSignal(
      { sessionId: 'sess-1', reason: 'user_done', confidence: 0.9, receivedAtMs: now },
      {
        activeSessionId: 'sess-1',
        lastFinalUserTranscript: 'Alright I think we covered everything',
        lastFinalUserTranscriptAtMs: now - 1500,
      }
    );
    expect(ok.shouldEnd).toBe(true);
    expect(ok.layer).toBe('gemini_structured');

    // Stale session ID rejected
    const stale = detector.validateStructuredEndSignal(
      { sessionId: 'old-sess', confidence: 0.95, receivedAtMs: now },
      {
        activeSessionId: 'sess-1',
        lastFinalUserTranscript: 'Goodbye Blink',
        lastFinalUserTranscriptAtMs: now - 500,
      }
    );
    expect(stale.shouldEnd).toBe(false);

    // Rejected if recent user turn was actually a question or negation
    const questionRejected = detector.validateStructuredEndSignal(
      { sessionId: 'sess-1', confidence: 0.95, receivedAtMs: now },
      {
        activeSessionId: 'sess-1',
        lastFinalUserTranscript: 'How do I say goodbye in Japanese?',
        lastFinalUserTranscriptAtMs: now - 500,
      }
    );
    expect(questionRejected.shouldEnd).toBe(false);

    // Rejected when no recent user turn exists (Gemini saying "Goodbye" on its own!)
    const noUserTurn = detector.validateStructuredEndSignal(
      { sessionId: 'sess-1', confidence: 0.95, receivedAtMs: now },
      {
        activeSessionId: 'sess-1',
        lastFinalUserTranscript: null,
        lastFinalUserTranscriptAtMs: null,
      }
    );
    expect(noUserTurn.shouldEnd).toBe(false);
  });
});

describe('Phase H2.5 — AudioResourceManager Single-Pipeline Handover & Privacy', () => {
  it('routes passive audio strictly locally, preserves bounded pre-roll, and never leaks hardware tracks', async () => {
    const fakeMic = createFakeCaptureHarness();
    const manager = new AudioResourceManager({
      preRollMaxMs: 128,
      chunkDurationMs: 32,
      createCapture: fakeMic.createCapture,
    });

    const wakeChunks: CapturedAudioChunk[] = [];
    const convChunks: CapturedAudioChunk[] = [];

    await manager.acquireForWakeWord({
      onChunk: (c) => wakeChunks.push(c),
    });

    expect(manager.getOwner()).toBe('wake-word');
    expect(fakeMic.getStartCount()).toBe(1);

    // Emit 10 passive frames -> routed ONLY to wake-word, NEVER to conversation
    for (let i = 0; i < 10; i += 1) {
      fakeMic.emitPcm(500 + i, i);
    }
    expect(wakeChunks.length).toBe(10);
    expect(convChunks.length).toBe(0);
    expect(manager.getPreRollChunkCount()).toBeLessThanOrEqual(4);

    // Atomic handover to conversation uses the SAME single capture pipeline (startCount stays 1!)
    const handover = await manager.handoverToConversation({
      onChunk: (c) => convChunks.push(c),
    });
    expect(fakeMic.getStartCount()).toBe(1);
    expect(manager.getOwner()).toBe('conversation');
    expect(handover.bufferedChunks.length).toBe(4);
    expect(manager.getPreRollChunkCount()).toBe(0);

    // Further frames route ONLY to conversation; wake-word receives zero frames
    fakeMic.emitPcm(900, 11);
    expect(wakeChunks.length).toBe(10);
    expect(convChunks.length).toBe(1);

    // Release back to wake-word
    manager.releaseConversation(true);
    expect(manager.getOwner()).toBe('wake-word');
    fakeMic.emitPcm(700, 12);
    expect(wakeChunks.length).toBe(11);
    expect(convChunks.length).toBe(1);

    // Privacy hard disable stops hardware tracks immediately
    manager.releaseAll();
    expect(manager.getOwner()).toBe('none');
    expect(fakeMic.isRunning()).toBe(false);
    expect(fakeMic.getStopCount()).toBe(1);

    manager.dispose();
  });
});

describe('Phase H2.5 — HandsFreeConversationController Full Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('honestly reports model_unavailable when no on-device wake model is installed and uploads zero cloud audio', async () => {
    const fakeMic = createFakeCaptureHarness();
    const audioManager = new AudioResourceManager({ createCapture: fakeMic.createCapture });
    const wakeWordService = new WakeWordService({
      engine: new UnconfiguredOnDeviceWakeWordEngine(),
    });
    const session = new MockVoiceSession({ autoCycle: false });
    const startSpy = vi.spyOn(session, 'start');

    const controller = new HandsFreeConversationController({
      audioManager,
      wakeWordService,
      getVoiceSession: () => session,
    });

    await controller.enableHandsFree();

    expect(controller.getSnapshot().activationState).toBe('wake_unavailable');
    expect(controller.getSnapshot().wakeEngineStatus).toBe('model_unavailable');
    expect(fakeMic.isRunning()).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();

    controller.dispose();
    session.dispose();
  });

  it('executes 3 full sequential wake -> conversation -> natural end -> rearm cycles with zero leaks and zero passive cloud sessions', async () => {
    const fakeMic = createFakeCaptureHarness();
    const audioManager = new AudioResourceManager({ createCapture: fakeMic.createCapture });
    const engine = new DeterministicTestWakeEngine();
    const wakeWordService = new WakeWordService({
      engine,
      config: { duplicateSuppressionMs: 100 },
    });
    const session = new MockVoiceSession({
      enteringDurationMs: 40,
      endingDurationMs: 40,
      autoCycle: false,
    });
    const startSpy = vi.spyOn(session, 'start');
    const endSpy = vi.spyOn(session, 'end');
    const onPrepare = vi.fn();
    const onReturn = vi.fn();

    const controller = new HandsFreeConversationController({
      audioManager,
      wakeWordService,
      getVoiceSession: () => session,
      wakeAcknowledgeDelayMs: 40,
      farewellTimeoutMs: 200,
      transitionHooks: {
        onPrepareConversationTransition: onPrepare,
        onReturnToCompanionEyes: onReturn,
      },
    });

    // 1. Enable hands-free once -> passive local listening, ZERO Gemini sessions started
    await controller.enableHandsFree();
    expect(controller.getSnapshot().activationState).toBe('wake_ready');
    expect(startSpy).toHaveBeenCalledTimes(0);

    // Passive audio (non-wake) stays local and starts 0 conversations
    for (let i = 0; i < 20; i += 1) {
      fakeMic.emitPcm(500, i);
    }
    expect(engine.framesSeen).toBe(20);
    expect(startSpy).toHaveBeenCalledTimes(0);

    // Run 3 complete back-to-back hands-free conversations
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      // Advance past duplicate cooldown
      await vi.advanceTimersByTimeAsync(150);

      // Say "Hey Blink" (sentinel frame)
      fakeMic.emitPcm(25000, cycle * 100);
      expect(controller.getSnapshot().activationState).toBe('wake_detected');
      expect(wakeWordService.getIsSuspended()).toBe(true);

      // Duplicate wake trigger during startup is strictly suppressed
      fakeMic.emitPcm(25000, cycle * 100 + 1);

      await vi.advanceTimersByTimeAsync(100);
      expect(controller.getSnapshot().activationState).toBe('conversation_active');
      expect(session.getSnapshot().state).toBe('listening');
      expect(startSpy).toHaveBeenCalledTimes(cycle);

      // False-positive question does NOT end conversation
      const falseEnd = controller.evaluateUserTranscript('How do I say goodbye in Japanese?', true);
      expect(falseEnd.shouldEnd).toBe(false);
      expect(controller.getSnapshot().activationState).toBe('conversation_active');

      // Natural closing phrase ends conversation cleanly and rearms wake-word
      const realEnd = controller.evaluateUserTranscript("Thanks Blink, that's all.", true);
      expect(realEnd.shouldEnd).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(endSpy).toHaveBeenCalledTimes(cycle);
      expect(session.getSnapshot().state).toBe('idle');
      expect(controller.getSnapshot().activationState).toBe('wake_ready');
      expect(wakeWordService.getIsSuspended()).toBe(false);
      expect(controller.getSnapshot().metrics.conversationsCompleted).toBe(cycle);
    }

    expect(onPrepare).toHaveBeenCalledTimes(3);
    expect(onReturn).toHaveBeenCalledTimes(3);

    controller.dispose();
    session.dispose();
    expect(fakeMic.isRunning()).toBe(false);
    expect(engine.disposed).toBe(true);
  });

  it('waits for farewell playback when ending while speaking, and cancels ending if user interrupts farewell', async () => {
    const fakeMic = createFakeCaptureHarness();
    const audioManager = new AudioResourceManager({ createCapture: fakeMic.createCapture });
    const wakeWordService = new WakeWordService({
      engine: new DeterministicTestWakeEngine(),
      config: { duplicateSuppressionMs: 50 },
    });
    const session = new MockVoiceSession({
      enteringDurationMs: 20,
      endingDurationMs: 20,
      interruptedDurationMs: 20,
      autoCycle: false,
    });

    const controller = new HandsFreeConversationController({
      audioManager,
      wakeWordService,
      getVoiceSession: () => session,
      wakeAcknowledgeDelayMs: 20,
      farewellTimeoutMs: 500,
    });

    await controller.enableHandsFree();
    fakeMic.emitPcm(25000, 1);
    await vi.advanceTimersByTimeAsync(60);
    expect(controller.getSnapshot().activationState).toBe('conversation_active');

    // Blink is speaking when user says closing phrase -> enters conversation_ending and waits
    session.triggerStateForDev('speaking');
    controller.evaluateUserTranscript('Goodbye Blink.', true);
    expect(controller.getSnapshot().activationState).toBe('conversation_ending');

    // User interrupts farewell with a follow-up -> cancels closing and returns to conversation_active!
    session.interrupt();
    expect(controller.getSnapshot().activationState).toBe('conversation_active');
    await vi.advanceTimersByTimeAsync(40);
    expect(session.getSnapshot().state).toBe('listening');

    // Now Blink delivers farewell cleanly and bounded timeout/drain closes session & rearms
    session.triggerStateForDev('speaking');
    controller.evaluateUserTranscript("Okay Blink, that's all.", true);
    expect(controller.getSnapshot().activationState).toBe('conversation_ending');

    // Farewell finishes -> voice session returns to listening -> controller finalizes immediately
    session.triggerStateForDev('listening');
    await vi.advanceTimersByTimeAsync(60);
    expect(session.getSnapshot().state).toBe('idle');
    expect(controller.getSnapshot().activationState).toBe('wake_ready');

    controller.dispose();
    session.dispose();
  });

  it('handles permission denial, tab suspension/recovery, explicit mic disable, and conversation failure recovery safely', async () => {
    // 1. Permission denial -> error state, consent revoked, requires user gesture
    const deniedMic = createFakeCaptureHarness({ denyPermission: true });
    const deniedController = new HandsFreeConversationController({
      audioManager: new AudioResourceManager({ createCapture: deniedMic.createCapture }),
      wakeWordService: new WakeWordService({ engine: new DeterministicTestWakeEngine() }),
      getVoiceSession: () => new MockVoiceSession({ autoCycle: false }),
    });
    await deniedController.enableHandsFree();
    expect(deniedController.getSnapshot().activationState).toBe('error');
    expect(deniedController.getSnapshot().userConsentEnabled).toBe(false);
    expect(deniedController.getSnapshot().requiresUserGestureToResume).toBe(true);
    deniedController.dispose();

    // 2. Tab suspension -> releases passive mic; visibility return -> rearms if consent active
    const fakeMic = createFakeCaptureHarness();
    const session = new MockVoiceSession({
      enteringDurationMs: 20,
      endingDurationMs: 20,
      autoCycle: false,
    });
    const controller = new HandsFreeConversationController({
      audioManager: new AudioResourceManager({ createCapture: fakeMic.createCapture }),
      wakeWordService: new WakeWordService({
        engine: new DeterministicTestWakeEngine(),
        config: { duplicateSuppressionMs: 50 },
      }),
      getVoiceSession: () => session,
      wakeAcknowledgeDelayMs: 20,
    });

    await controller.enableHandsFree();
    expect(controller.getSnapshot().activationState).toBe('wake_ready');
    expect(fakeMic.isRunning()).toBe(true);

    controller.handleVisibilityChange(false);
    expect(controller.getSnapshot().activationState).toBe('suspended');
    expect(fakeMic.isRunning()).toBe(false);

    controller.handleVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(controller.getSnapshot().activationState).toBe('wake_ready');
    expect(fakeMic.isRunning()).toBe(true);

    // 3. Conversation failure -> recovers cleanly back to local wake_ready (no infinite paid retries)
    fakeMic.emitPcm(25000, 1);
    await vi.advanceTimersByTimeAsync(60);
    expect(controller.getSnapshot().activationState).toBe('conversation_active');
    session.triggerSimulatedError('NETWORK_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(40);
    expect(controller.getSnapshot().activationState).toBe('wake_ready');

    // 4. Explicit microphone disable -> stops hardware immediately & NEVER reactivates on visibility change
    const disablePromise = controller.disableHandsFree();
    await vi.advanceTimersByTimeAsync(40);
    await disablePromise;
    expect(controller.getSnapshot().activationState).toBe('suspended');
    expect(controller.getSnapshot().userConsentEnabled).toBe(false);
    expect(fakeMic.isRunning()).toBe(false);

    controller.handleVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(40);
    expect(controller.getSnapshot().activationState).toBe('suspended');
    expect(fakeMic.isRunning()).toBe(false);

    controller.dispose();
    session.dispose();
  });
});
