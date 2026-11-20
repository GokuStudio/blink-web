import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Minimal JSDOM polyfills so real `voice-glow` <VoiceBeam> runs cleanly in jsdom
// (jsdom lacks Canvas 2D and SVG filter animated properties like feDisplacementMap.scale.baseVal).
const originalCreateElementNS = document.createElementNS.bind(document);
vi.spyOn(document, 'createElementNS').mockImplementation((ns: string | null, tag: string) => {
  const el = originalCreateElementNS(ns, tag) as unknown as Record<string, unknown>;
  if (tag === 'feDisplacementMap' && !('scale' in el)) {
    Object.defineProperty(el, 'scale', { value: { baseVal: 0 }, writable: true });
  }
  if (tag === 'feOffset' && !('dx' in el)) {
    Object.defineProperty(el, 'dx', { value: { baseVal: 0 }, writable: true });
    Object.defineProperty(el, 'dy', { value: { baseVal: 0 }, writable: true });
  }
  return el as unknown as Element;
});

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    })),
  });
});

import {
  AudioEnvelopeFollower,
  DualChannelAudioMeter,
  computeTimeDomainRms,
  VoiceStateMachine,
  IllegalVoiceTransitionError,
  MockVoiceSession,
  HeyBlinkScreen,
  BLINK_VISUAL_PRESETS,
  resolveVisualPreset,
  computeResponsiveBeamScale,
  ALL_VOICE_STATES,
} from '@/features/hey-blink';
import { HeyBlinkPage } from '@/pages/HeyBlinkPage';

describe('Hey Blink — VoiceStateMachine', () => {
  it('allows valid lifecycle transitions', () => {
    const fsm = new VoiceStateMachine('idle');
    expect(fsm.transition('entering')).toBe('entering');
    expect(fsm.transition('listening')).toBe('listening');
    expect(fsm.transition('thinking')).toBe('thinking');
    expect(fsm.transition('speaking')).toBe('speaking');
    expect(fsm.transition('interrupted')).toBe('interrupted');
    expect(fsm.transition('listening')).toBe('listening');
    expect(fsm.transition('ending')).toBe('ending');
    expect(fsm.transition('idle')).toBe('idle');
    expect(fsm.getTransitionCount()).toBe(8);
  });

  it('rejects illegal transitions explicitly', () => {
    const fsm = new VoiceStateMachine('idle');
    expect(() => fsm.transition('speaking')).toThrow(IllegalVoiceTransitionError);
    expect(() => fsm.transition('thinking')).toThrow(IllegalVoiceTransitionError);
    expect(() => fsm.transition('interrupted')).toThrow(IllegalVoiceTransitionError);
    expect(() => fsm.transition('idle')).toThrow(IllegalVoiceTransitionError);

    fsm.transition('entering');
    fsm.transition('ending');
    expect(() => fsm.transition('listening')).toThrow(IllegalVoiceTransitionError);
    expect(() => fsm.transition('speaking')).toThrow(IllegalVoiceTransitionError);
    expect(fsm.transition('idle')).toBe('idle');
  });

  it('supports error recovery transitions', () => {
    const fsm = new VoiceStateMachine('idle');
    fsm.transition('entering');
    fsm.transition('error');
    expect(fsm.canTransitionTo('entering')).toBe(true);
    expect(fsm.canTransitionTo('speaking')).toBe(false);
    expect(fsm.transition('entering')).toBe('entering');
  });
});

describe('Hey Blink — DualChannelAudioMeter', () => {
  it('applies fast attack, controlled release, and noise floor gating', () => {
    const follower = new AudioEnvelopeFollower({
      attackSeconds: 0.04,
      releaseSeconds: 0.25,
      noiseFloor: 0.02,
      gain: 1,
    });

    // Below noise floor reads 0
    expect(follower.step(0.01, 0.016)).toBe(0);

    // Rising step responds faster than falling step
    const afterAttack = follower.step(0.9, 0.05);
    expect(afterAttack).toBeGreaterThan(0.5);

    const afterRelease = follower.step(0, 0.05);
    expect(afterRelease).toBeLessThan(afterAttack);
    expect(afterRelease).toBeGreaterThan(0.3);

    // Instant reset zeroes immediately
    follower.reset();
    expect(follower.getLevel()).toBe(0);
  });

  it('keeps input and output channels strictly independent', () => {
    const meter = new DualChannelAudioMeter();
    const frame1 = meter.step(0.85, 0, 100);
    expect(frame1.input).toBeGreaterThan(0);
    expect(frame1.output).toBe(0);

    const frame2 = meter.step(0, 0.9, 132);
    expect(frame2.output).toBeGreaterThan(0);

    // Suppressing output does not disturb input
    meter.suppressOutput();
    expect(meter.getLevels().output).toBe(0);
    expect(meter.getLevels().input).toBeGreaterThan(0);
  });

  it('computes normalized RMS from time-domain PCM samples', () => {
    const silent = new Uint8Array(64).fill(128);
    expect(computeTimeDomainRms(silent)).toBe(0);

    const active = new Uint8Array(64).map((_, idx) => (idx % 2 === 0 ? 190 : 66));
    const rms = computeTimeDomainRms(active);
    expect(rms).toBeGreaterThan(0.5);
    expect(rms).toBeLessThanOrEqual(1);
  });
});

describe('Hey Blink — MockVoiceSession Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('progresses through entering -> listening -> thinking -> speaking -> listening cleanly', async () => {
    const session = new MockVoiceSession({
      enteringDurationMs: 100,
      listeningCycleMs: 200,
      thinkingCycleMs: 150,
      speakingCycleMs: 200,
      audioTickMs: 20,
      autoCycle: true,
    });

    const transitions: string[] = [];
    session.subscribeState((evt) => transitions.push(evt.nextState));

    const startPromise = session.start();
    expect(session.getSnapshot().state).toBe('entering');
    expect(session.getSnapshot().isSimulated).toBe(true);

    // Duplicate start while active is ignored (no competing session)
    const firstSessionId = session.getSnapshot().sessionId;
    await session.start();
    expect(session.getSnapshot().sessionId).toBe(firstSessionId);

    await vi.advanceTimersByTimeAsync(100);
    await startPromise;
    expect(session.getSnapshot().state).toBe('listening');

    // Listening emits simulated input audio and zero output audio
    await vi.advanceTimersByTimeAsync(80);
    const listeningAudio = session.getAudioLevels();
    expect(listeningAudio.isSimulated).toBe(true);
    expect(listeningAudio.outputLevel).toBe(0);

    // Listening -> Thinking
    await vi.advanceTimersByTimeAsync(140);
    expect(session.getSnapshot().state).toBe('thinking');

    // Thinking MUST NOT simulate speech
    await vi.advanceTimersByTimeAsync(80);
    expect(session.getAudioLevels().outputLevel).toBe(0);

    // Thinking -> Speaking
    await vi.advanceTimersByTimeAsync(90);
    expect(session.getSnapshot().state).toBe('speaking');

    // Speaking emits outgoing assistant audio while input stays 0
    await vi.advanceTimersByTimeAsync(80);
    const speakingAudio = session.getAudioLevels();
    expect(speakingAudio.outputLevel).toBeGreaterThan(0);
    expect(speakingAudio.inputLevel).toBe(0);

    // Speaking -> Listening
    await vi.advanceTimersByTimeAsync(150);
    expect(session.getSnapshot().state).toBe('listening');

    expect(transitions).toEqual([
      'entering',
      'listening',
      'thinking',
      'speaking',
      'listening',
    ]);

    session.dispose();
  });

  it('immediately suppresses outgoing audio on interrupt and returns to listening', async () => {
    const session = new MockVoiceSession({
      enteringDurationMs: 50,
      interruptedDurationMs: 80,
      autoCycle: false,
      audioTickMs: 16,
    });

    session.triggerStateForDev('speaking');
    await vi.advanceTimersByTimeAsync(100);
    expect(session.getAudioLevels().outputLevel).toBeGreaterThan(0);

    session.interrupt();
    expect(session.getSnapshot().state).toBe('interrupted');
    expect(session.getAudioLevels().outputLevel).toBe(0);

    await vi.advanceTimersByTimeAsync(90);
    expect(session.getSnapshot().state).toBe('listening');

    session.dispose();
  });

  it('supports mute, simulated errors, retry recovery, and clean teardown', async () => {
    const session = new MockVoiceSession({
      enteringDurationMs: 50,
      endingDurationMs: 50,
      autoCycle: false,
      audioTickMs: 16,
    });

    const startPromise = session.start();
    await vi.advanceTimersByTimeAsync(50);
    await startPromise;

    session.setMuted(true);
    await vi.advanceTimersByTimeAsync(64);
    expect(session.getSnapshot().isMuted).toBe(true);
    expect(session.getAudioLevels().inputLevel).toBe(0);

    session.triggerSimulatedError('MICROPHONE_PERMISSION_DENIED');
    expect(session.getSnapshot().state).toBe('error');
    expect(session.getSnapshot().error?.code).toBe('MICROPHONE_PERMISSION_DENIED');

    const retryPromise = session.retry();
    expect(session.getSnapshot().state).toBe('entering');
    await vi.advanceTimersByTimeAsync(50);
    await retryPromise;
    expect(session.getSnapshot().state).toBe('listening');

    const endPromise = session.end();
    expect(session.getSnapshot().state).toBe('ending');
    await vi.advanceTimersByTimeAsync(60);
    await endPromise;
    expect(session.getSnapshot().state).toBe('idle');
    expect(session.getSnapshot().sessionId).toBeNull();

    session.dispose();
  });

  it('pauses audio loop on page hidden visibility change and resumes on visible', async () => {
    const session = new MockVoiceSession({ autoCycle: false, audioTickMs: 20 });
    const audioListener = vi.fn();
    session.subscribeAudio(audioListener);

    session.triggerStateForDev('speaking');
    await vi.advanceTimersByTimeAsync(60);
    const countBeforeHide = audioListener.mock.calls.length;
    expect(countBeforeHide).toBeGreaterThan(0);

    session.handleVisibilityChange(false);
    audioListener.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    // No continuous tick frames while hidden
    expect(audioListener).not.toHaveBeenCalled();

    session.handleVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(60);
    expect(audioListener).toHaveBeenCalled();

    session.dispose();
  });
});

describe('Hey Blink — Visual Presets & Responsive Scaling', () => {
  it('defines distinct presets for all 8 voice session states', () => {
    for (const state of ALL_VOICE_STATES) {
      expect(BLINK_VISUAL_PRESETS[state]).toBeDefined();
      expect(BLINK_VISUAL_PRESETS[state].colors.length).toBe(7);
    }
    expect(BLINK_VISUAL_PRESETS.ending.active).toBe(false);
    expect(BLINK_VISUAL_PRESETS.speaking.reach).toBeGreaterThan(
      BLINK_VISUAL_PRESETS.listening.reach
    );
    expect(resolveVisualPreset('listening', true).strength).toBeLessThan(
      resolveVisualPreset('listening', false).strength
    );
  });

  it('computes bounded responsive beam scales for mobile and desktop viewports', () => {
    expect(computeResponsiveBeamScale(390, 844)).toBeGreaterThanOrEqual(0.88);
    expect(computeResponsiveBeamScale(844, 390)).toBeGreaterThanOrEqual(0.88);
    expect(computeResponsiveBeamScale(1440, 900)).toBeGreaterThan(1.2);
    expect(computeResponsiveBeamScale(2560, 1440)).toBeLessThanOrEqual(1.65);
  });
});

describe('Hey Blink — Route & UI Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders /hey-blink independently with Talk to Blink trigger and simulation disclosure', () => {
    render(
      <MemoryRouter initialEntries={['/hey-blink']}>
        <Routes>
          <Route path="/hey-blink" element={<HeyBlinkPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('hey-blink-screen')).toBeInTheDocument();
    expect(screen.getByTestId('blink-voice-glow')).toHaveAttribute('data-voice-state', 'idle');
    expect(screen.getByTestId('talk-to-blink-button')).toHaveTextContent(/Talk to Blink/i);
    expect(screen.getByTestId('voice-simulation-badge')).toHaveTextContent(
      /Simulated Voice Preview/i
    );
  });

  it('supports start, mute, interrupt, error recovery, end, and DeviceExperienceController hooks', async () => {
    const onPrepareConversationTransition = vi.fn();
    const onConversationActive = vi.fn();
    const onConversationEnding = vi.fn();
    const onReturnToCompanionEyes = vi.fn();

    const { unmount } = render(
      <MemoryRouter>
        <HeyBlinkScreen
          embedded
          enableDevPanel
          createSession={() =>
            new MockVoiceSession({
              enteringDurationMs: 50,
              endingDurationMs: 50,
              interruptedDurationMs: 50,
              autoCycle: false,
            })
          }
          transitionHooks={{
            onPrepareConversationTransition,
            onConversationActive,
            onConversationEnding,
            onReturnToCompanionEyes,
          }}
        />
      </MemoryRouter>
    );

    // Start conversation
    await act(async () => {
      fireEvent.click(screen.getByTestId('talk-to-blink-button'));
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(onPrepareConversationTransition).toHaveBeenCalledTimes(1);
    expect(onConversationActive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'listening'
    );

    // Toggle Mute
    await act(async () => {
      fireEvent.click(screen.getByTestId('voice-mute-button'));
    });
    expect(screen.getByTestId('voice-mute-button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('voice-status-indicator')).toHaveTextContent(/Muted/i);

    // Open dev panel and trigger Speaking -> Interrupt
    await act(async () => {
      fireEvent.click(screen.getByTestId('voice-dev-panel-toggle'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('dev-state-speaking'));
    });
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'speaking'
    );
    expect(screen.getByTestId('voice-interrupt-button')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('voice-interrupt-button'));
    });
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'interrupted'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'listening'
    );

    // Trigger Error -> Retry
    await act(async () => {
      fireEvent.click(screen.getByTestId('dev-error-network'));
    });
    expect(screen.getByTestId('voice-error-state')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('voice-retry-button'));
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'listening'
    );

    // End Session cleanly
    await act(async () => {
      fireEvent.click(screen.getByTestId('voice-end-button'));
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(onConversationEnding).toHaveBeenCalledTimes(1);
    expect(onReturnToCompanionEyes).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute('data-voice-state', 'idle');

    // Clean unmount
    unmount();
  });

  it('remains fully interactive under React.StrictMode double effect mounting', async () => {
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/hey-blink']}>
          <Routes>
            <Route
              path="/hey-blink"
              element={
                <HeyBlinkScreen
                  enableDevPanel
                  createSession={() =>
                    new MockVoiceSession({
                      enteringDurationMs: 40,
                      autoCycle: false,
                    })
                  }
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('talk-to-blink-button'));
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByTestId('hey-blink-screen')).toHaveAttribute(
      'data-voice-state',
      'listening'
    );
  });
});
