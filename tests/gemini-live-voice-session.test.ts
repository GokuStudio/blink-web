import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LiveCallbacks, LiveServerMessage } from '@google/genai';
import {
  GeminiLiveVoiceSession,
  LiveSessionTokenClient,
  int16ToBase64,
  createVoiceSessionProvider,
  type IAudioPlayerAdapter,
  type IGeminiLiveTransport,
  type IMicrophoneAdapter,
  type CapturedAudioChunk,
  type VoiceSessionState,
  type GeminiLiveConnectParams,
} from '@/features/hey-blink';

interface MockTransportHarness {
  transport: IGeminiLiveTransport;
  callbacks: LiveCallbacks;
  sentRealtimeInputs: Array<{ audio?: { data: string; mimeType: string }; audioStreamEnd?: boolean }>;
  sentClientContents: Array<{ turns?: unknown[]; turnComplete?: boolean }>;
  closed: boolean;
}

function createMockTokenClient(overrides?: Partial<ConstructorParameters<typeof LiveSessionTokenClient>[0]>) {
  return new LiveSessionTokenClient({
    endpointUrl: 'http://127.0.0.1:8787/api/hey-blink/token',
    getAuthIdToken: async () => 'fake-firebase-id-token',
    fetchFn: vi.fn(async () =>
      new Response(
        JSON.stringify({
          ephemeralToken: 'auth_tokens/test-ephemeral-token',
          model: 'gemini-3.1-flash-live-preview',
          apiVersion: 'v1alpha',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          newSessionExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
          voiceName: 'Aoede',
          constraintsLocked: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch,
    ...overrides,
  });
}

function createFakeAudioHarness() {
  let micCallbacks: {
    onChunk: (chunk: CapturedAudioChunk) => void;
    onLevel: (rms: number) => void;
    onDeviceDisconnected: (reason: string) => void;
  } | null = null;

  let playerCallbacks: {
    onLevel: (rms: number, isPlaying: boolean) => void;
    onPlaybackStart: (generationId: number, latencyMs: number | null) => void;
    onPlaybackDrain: (generationId: number) => void;
  } | null = null;

  const micState = {
    started: false,
    stopped: false,
    muted: false,
    deviceId: undefined as string | undefined,
  };

  const playerState = {
    initialized: false,
    disposed: false,
    generationId: 0,
    isPlaying: false,
    enqueuedChunks: [] as Array<{ data: string; mimeType?: string; generationId: number }>,
    flushedCount: 0,
    turnCompletedForGen: -1,
  };

  const createMicrophone = (cb: NonNullable<typeof micCallbacks>): IMicrophoneAdapter => {
    micCallbacks = cb;
    return {
      start: async (opts) => {
        micState.started = true;
        micState.stopped = false;
        micState.muted = Boolean(opts?.muted);
        micState.deviceId = opts?.deviceId;
      },
      setMuted: (muted) => {
        micState.muted = muted;
        if (muted) cb.onLevel(0);
      },
      resumeIfSuspended: async () => {},
      stop: () => {
        micState.stopped = true;
        micState.started = false;
        cb.onLevel(0);
      },
      getStartupLatencyMs: () => 24.5,
      getDroppedChunks: () => 0,
    };
  };

  const createPlayer = (cb: NonNullable<typeof playerCallbacks>): IAudioPlayerAdapter => {
    playerCallbacks = cb;
    return {
      initialize: async () => {
        playerState.initialized = true;
        playerState.disposed = false;
      },
      resume: async () => {},
      enqueueBase64Pcm: (data, mimeType, genId = playerState.generationId) => {
        if (genId < playerState.generationId) return false;
        playerState.enqueuedChunks.push({ data, mimeType, generationId: genId });
        if (!playerState.isPlaying) {
          playerState.isPlaying = true;
          cb.onPlaybackStart(genId, 18.2);
        }
        cb.onLevel(0.62, true);
        return true;
      },
      markTurnComplete: (genId = playerState.generationId) => {
        playerState.turnCompletedForGen = genId;
      },
      flush: () => {
        playerState.generationId += 1;
        playerState.isPlaying = false;
        playerState.flushedCount += 1;
        playerState.enqueuedChunks = [];
        cb.onLevel(0, false);
        return playerState.generationId;
      },
      dispose: () => {
        playerState.disposed = true;
        playerState.isPlaying = false;
      },
      getGenerationId: () => playerState.generationId,
      getIsPlaying: () => playerState.isPlaying,
      getStats: () => ({
        underrunCount: 0,
        droppedChunks: 0,
        firstAudioToPlaybackMs: 18.2,
        lastInterruptionToSilenceMs: 2.1,
      }),
    };
  };

  const triggerDrain = () => {
    playerState.isPlaying = false;
    playerCallbacks?.onPlaybackDrain(playerState.generationId);
  };

  const emitMicChunk = (rms = 0.4, seq = 0) => {
    const pcm = new Int16Array(512).fill(1200);
    micCallbacks?.onLevel(rms);
    micCallbacks?.onChunk({
      pcm,
      base64: int16ToBase64(pcm),
      rms,
      seq,
      sampleRate: 16000,
      capturedAtMs: performance.now(),
    });
  };

  return {
    micState,
    playerState,
    createMicrophone,
    createPlayer,
    triggerDrain,
    emitMicChunk,
    disconnectMic: (reason: string) => micCallbacks?.onDeviceDisconnected(reason),
  };
}

describe('Phase H2 — GeminiLiveVoiceSession (Deterministic Mocked Transport)', () => {
  let harnesses: MockTransportHarness[];

  beforeEach(() => {
    vi.useFakeTimers();
    harnesses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeTransportFactory() {
    return vi.fn(async ({ callbacks }: GeminiLiveConnectParams) => {
      const h: MockTransportHarness = {
        callbacks,
        sentRealtimeInputs: [],
        sentClientContents: [],
        closed: false,
        transport: {
          sendRealtimeInput: (params) => h.sentRealtimeInputs.push(params),
          sendClientContent: (params) => h.sentClientContents.push(params),
          close: () => {
            h.closed = true;
          },
        },
      };
      harnesses.push(h);
      callbacks.onopen?.();
      return h.transport;
    });
  }

  it('completes full-duplex lifecycle: entering -> listening -> thinking -> speaking -> listening -> ending -> idle', async () => {
    const audio = createFakeAudioHarness();
    const transportFactory = makeTransportFactory();
    const session = new GeminiLiveVoiceSession({
      tokenClient: createMockTokenClient(),
      createTransport: transportFactory,
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
      endingDurationMs: 100,
    });

    const states: VoiceSessionState[] = [];
    session.subscribeState((evt) => states.push(evt.nextState));

    await session.start({ audioInputDeviceId: 'usb-mic-01' });
    expect(session.getSnapshot().state).toBe('entering');
    expect(session.getSnapshot().isSimulated).toBe(false);
    expect(audio.micState.deviceId).toBe('usb-mic-01');

    // Duplicate start while entering is ignored
    await session.start();
    expect(transportFactory).toHaveBeenCalledTimes(1);

    // Server sends setupComplete -> transitions to listening
    harnesses[0].callbacks.onmessage({
      setupComplete: { sessionId: 'live-sess-123' },
    } as LiveServerMessage);

    expect(session.getSnapshot().state).toBe('listening');
    expect(session.getSnapshot().sessionId).toBe('live-sess-123');

    // Stream microphone PCM chunk -> sent as audio/pcm;rate=16000
    audio.emitMicChunk(0.5, 0);
    expect(harnesses[0].sentRealtimeInputs.length).toBe(1);
    expect(harnesses[0].sentRealtimeInputs[0].audio?.mimeType).toBe('audio/pcm;rate=16000');

    // Server VAD ACTIVITY_END -> transitions to thinking
    harnesses[0].callbacks.onmessage({
      voiceActivity: { voiceActivityType: 'ACTIVITY_END' },
    } as unknown as LiveServerMessage);
    expect(session.getSnapshot().state).toBe('thinking');

    // Server streams native 24 kHz PCM audio -> transitions to speaking
    const replyPcm = int16ToBase64(new Int16Array(240).fill(5000));
    harnesses[0].callbacks.onmessage({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: replyPcm, mimeType: 'audio/pcm;rate=24000' } }],
        },
      },
    } as unknown as LiveServerMessage);
    expect(session.getSnapshot().state).toBe('speaking');
    expect(audio.playerState.enqueuedChunks.length).toBe(1);

    // Turn completes, then playback drains -> returns to listening
    harnesses[0].callbacks.onmessage({
      serverContent: { turnComplete: true },
    } as unknown as LiveServerMessage);
    expect(session.getSnapshot().state).toBe('speaking'); // Still audible until drain

    audio.triggerDrain();
    expect(session.getSnapshot().state).toBe('listening');

    // End session cleanly releases mic, transport, and player
    const endPromise = session.end();
    expect(session.getSnapshot().state).toBe('ending');
    expect(audio.micState.stopped).toBe(true);
    expect(audio.playerState.disposed).toBe(true);
    expect(harnesses[0].closed).toBe(true);

    await vi.advanceTimersByTimeAsync(110);
    await endPromise;
    expect(session.getSnapshot().state).toBe('idle');
    expect(states).toEqual([
      'entering',
      'listening',
      'thinking',
      'speaking',
      'listening',
      'ending',
      'idle',
    ]);

    session.dispose();
  });

  it('handles server barge-in AND manual interrupt by flushing playback immediately without reconnecting', async () => {
    const audio = createFakeAudioHarness();
    const transportFactory = makeTransportFactory();
    const session = new GeminiLiveVoiceSession({
      tokenClient: createMockTokenClient(),
      createTransport: transportFactory,
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
      interruptedDurationMs: 120,
    });

    await session.start();
    harnesses[0].callbacks.onmessage({ setupComplete: { sessionId: 'barge-1' } } as LiveServerMessage);

    // Enter speaking
    const pcm = int16ToBase64(new Int16Array(240).fill(4000));
    harnesses[0].callbacks.onmessage({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] },
      },
    } as unknown as LiveServerMessage);
    expect(session.getSnapshot().state).toBe('speaking');

    // 1. Server reports barge-in (`interrupted: true`)
    harnesses[0].callbacks.onmessage({
      serverContent: { interrupted: true },
    } as unknown as LiveServerMessage);

    expect(session.getSnapshot().state).toBe('interrupted');
    expect(audio.playerState.flushedCount).toBe(1);
    expect(audio.playerState.generationId).toBe(1);
    expect(session.getAudioLevels().outputLevel).toBe(0);
    expect(harnesses[0].closed).toBe(false); // No unnecessary reconnect

    await vi.advanceTimersByTimeAsync(130);
    expect(session.getSnapshot().state).toBe('listening');

    // 2. Manual interrupt during speaking sends server cancel cue and flushes
    harnesses[0].callbacks.onmessage({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: pcm, mimeType: 'audio/pcm;rate=24000' } }] },
      },
    } as unknown as LiveServerMessage);
    expect(session.getSnapshot().state).toBe('speaking');

    session.interrupt();
    expect(session.getSnapshot().state).toBe('interrupted');
    expect(audio.playerState.flushedCount).toBe(2);
    expect(harnesses[0].sentClientContents.length).toBe(1);
    expect(harnesses[0].sentClientContents[0].turnComplete).toBe(false);

    await vi.advanceTimersByTimeAsync(130);
    expect(session.getSnapshot().state).toBe('listening');
    session.dispose();
  });

  it('stops microphone transmission and sends audioStreamEnd when muted', async () => {
    const audio = createFakeAudioHarness();
    const session = new GeminiLiveVoiceSession({
      tokenClient: createMockTokenClient(),
      createTransport: makeTransportFactory(),
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
    });

    await session.start();
    harnesses[0].callbacks.onmessage({ setupComplete: { sessionId: 'mute-1' } } as LiveServerMessage);

    session.setMuted(true);
    expect(audio.micState.muted).toBe(true);
    expect(harnesses[0].sentRealtimeInputs.some((i) => i.audioStreamEnd === true)).toBe(true);

    // Any muted chunk does not transmit
    const beforeCount = harnesses[0].sentRealtimeInputs.length;
    audio.emitMicChunk(0.9, 1);
    expect(harnesses[0].sentRealtimeInputs.length).toBe(beforeCount);
    expect(session.getAudioLevels().inputLevel).toBe(0);

    session.dispose();
  });

  it('surfaces token authentication failures cleanly without silently falling back to mock', async () => {
    const audio = createFakeAudioHarness();
    const unauthClient = createMockTokenClient({
      fetchFn: vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 })
      ) as unknown as typeof fetch,
    });

    const session = new GeminiLiveVoiceSession({
      tokenClient: unauthClient,
      createTransport: makeTransportFactory(),
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
    });

    await session.start();
    expect(session.getSnapshot().state).toBe('error');
    expect(session.getSnapshot().isSimulated).toBe(false);
    expect(session.getSnapshot().error?.message).toMatch(/Sign in required/i);
    expect(audio.micState.stopped).toBe(true);
    session.dispose();
  });

  it('resumes cleanly on goAway / transient drop when a resumption handle exists, and stops on terminal close codes', async () => {
    const audio = createFakeAudioHarness();
    const transportFactory = makeTransportFactory();
    const session = new GeminiLiveVoiceSession({
      tokenClient: createMockTokenClient(),
      createTransport: transportFactory,
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
      reconnectBaseDelayMs: 200,
    });

    await session.start();
    harnesses[0].callbacks.onmessage({ setupComplete: { sessionId: 'res-1' } } as LiveServerMessage);

    // Server sends a valid resumption handle
    harnesses[0].callbacks.onmessage({
      sessionResumptionUpdate: { newHandle: 'handle-abc-123', resumable: true },
    } as LiveServerMessage);
    expect(session.getMetrics().hasResumptionHandle).toBe(true);

    // Recoverable network close (1006) triggers bounded backoff reconnect with saved handle
    harnesses[0].callbacks.onclose?.({ code: 1006, reason: 'network blip' } as CloseEvent);
    await vi.advanceTimersByTimeAsync(250);

    expect(transportFactory).toHaveBeenCalledTimes(2);
    const secondCallConfig = transportFactory.mock.calls[1][0].config;
    expect(secondCallConfig.sessionResumption?.handle).toBe('handle-abc-123');

    // Terminal policy error (1008) on second socket fails immediately without infinite retry
    harnesses[1].callbacks.onclose?.({ code: 1008, reason: 'quota exceeded' } as CloseEvent);
    expect(session.getSnapshot().state).toBe('error');
    await vi.advanceTimersByTimeAsync(5000);
    expect(transportFactory).toHaveBeenCalledTimes(2);

    session.dispose();
  });

  it('aborts safely when End is clicked rapidly while connecting', async () => {
    const audio = createFakeAudioHarness();
    let resolveConnect!: (t: IGeminiLiveTransport) => void;
    const delayedTransport: IGeminiLiveTransport = {
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      close: vi.fn(),
    };

    const session = new GeminiLiveVoiceSession({
      tokenClient: createMockTokenClient(),
      createTransport: () =>
        new Promise<IGeminiLiveTransport>((resolve) => {
          resolveConnect = resolve;
        }),
      createMicrophone: audio.createMicrophone,
      createPlayer: audio.createPlayer,
      endingDurationMs: 50,
    });

    const startPromise = session.start();
    // Flush microtasks up to connect
    await vi.advanceTimersByTimeAsync(0);
    const endPromise = session.end();

    // Even if transport resolves after End was clicked, it is closed immediately
    resolveConnect(delayedTransport);
    await vi.advanceTimersByTimeAsync(60);
    await Promise.all([startPromise, endPromise]);

    expect(delayedTransport.close).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().state).toBe('idle');
    session.dispose();
  });

  it('switches cleanly between mock and gemini-live providers via factory', () => {
    const mock = createVoiceSessionProvider('mock');
    expect(mock.isSimulated).toBe(true);
    expect(mock.providerId).toBe('mock-voice-session');
    mock.dispose();

    const live = createVoiceSessionProvider('gemini-live', {
      tokenEndpoint: 'http://127.0.0.1:8787/api/hey-blink/token',
    });
    expect(live.isSimulated).toBe(false);
    expect(live.providerId).toBe('gemini-live');
    live.dispose();
  });
});

// Opt-in live integration test — strictly skipped unless explicitly enabled with real backend endpoint
const liveEndpoint = process.env.HEY_BLINK_LIVE_TEST_TOKEN_ENDPOINT;
describe.skipIf(!liveEndpoint)('Phase H2 — Opt-In Live Gemini Token & Session Integration', () => {
  it('mints an ephemeral token from the configured backend without exposing master API keys', async () => {
    const client = new LiveSessionTokenClient({
      endpointUrl: liveEndpoint!,
      getAuthIdToken: async () => process.env.HEY_BLINK_LIVE_TEST_ID_TOKEN ?? null,
    });
    const token = await client.requestToken();
    expect(token.ephemeralToken).toBeTruthy();
    expect(token.model).toBeTruthy();
  });
});
