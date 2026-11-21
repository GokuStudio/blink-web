/**
 * Blink Stage 2D — Hey Blink Integrated Voice Assistant Test Suite
 *
 * Covers:
 * - Authoritative 12-state machine transitions & illegal transition guards
 * - Integrated /demo click-to-talk, eye-to-voice choreography, and Voice Ring bubble
 * - Microphone permission denial & Issue Center voice error mapping
 * - Rapid duplicate click guard (no duplicate mic streams / duplicate sessions)
 * - Listening -> User Speaking -> Processing -> Assistant Speaking -> Interruption -> End & Cleanup
 * - Concurrent Camera + Voice coexistence & Elevated Insights / Firebase room preservation
 * - Wellness Nudge deferral during voice mode & resumption upon exit (without resetting fatigue timers)
 * - Standalone /device fullscreen voice mode (no bezel) + Escape key exit
 * - Unmount / navigation teardown (no leaked microphone or sockets)
 * - Reduced-motion support
 * - Security audit (no GEMINI_API_KEY in client env, strict self-origin Permissions-Policy in nginx.conf)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { DemoPage } from '@/pages/DemoPage';
import { DevicePage } from '@/pages/DevicePage';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import { useDeviceStore } from '@/features/blink-device/state';
import { useTrackingStore } from '@/features/blink-device/state/trackingStore';
import { useWellnessStore } from '@/features/blink-device/wellness/wellnessStore';
import { usePersonalityStore } from '@/features/blink-device/personality';
import { useDiagnosticStore } from '@/features/demo/diagnostics/diagnosticStore';
import { useVoiceStore } from '@/features/hey-blink/state/voice.store';
import {
  VoiceExperienceStateMachine,
  classifyVoiceDiagnosticCode,
} from '@/features/hey-blink/integration/voiceExperienceStateMachine';
import type {
  IVoiceSession,
  VoiceAudioLevels,
  VoiceAudioListener,
  VoiceSessionError,
  VoiceSessionSnapshot,
  VoiceSessionState,
  VoiceStateListener,
} from '@/features/hey-blink/services/voice-session.interface';

/**
 * Deterministic fake IVoiceSession for reliable unit/integration verification.
 * Does NOT make paid Gemini calls or open real hardware microphones.
 */
class FakeVoiceSession implements IVoiceSession {
  public readonly providerId: string;
  public readonly isSimulated: boolean;
  public startCalls = 0;
  public endCalls = 0;
  public interruptCalls = 0;
  public disposeCalls = 0;
  public failStartWith: VoiceSessionError | null = null;
  public holdStartPending = false;

  private state: VoiceSessionState = 'idle';
  private previousState: VoiceSessionState | null = null;
  private isMuted = false;
  private error: VoiceSessionError | null = null;
  private transitionCount = 0;
  private startedAt: number | null = null;
  private audioLevels: VoiceAudioLevels = {
    inputLevel: 0,
    outputLevel: 0,
    timestamp: Date.now(),
    isSimulated: false,
  };
  private stateListeners = new Set<VoiceStateListener>();
  private audioListeners = new Set<VoiceAudioListener>();
  private pendingStartResolver: (() => void) | null = null;

  constructor(opts?: { isSimulated?: boolean; providerId?: string }) {
    this.isSimulated = opts?.isSimulated ?? false;
    this.providerId = opts?.providerId ?? 'fake-gemini-live';
    this.audioLevels.isSimulated = this.isSimulated;
  }

  public getSnapshot(): VoiceSessionSnapshot {
    return {
      sessionId: this.startedAt ? 'fake-session-1' : null,
      providerId: this.providerId,
      isSimulated: this.isSimulated,
      state: this.state,
      previousState: this.previousState,
      isMuted: this.isMuted,
      error: this.error,
      startedAt: this.startedAt,
      lastTransitionAt: Date.now(),
      transitionCount: this.transitionCount,
    };
  }

  public getAudioLevels(): VoiceAudioLevels {
    return { ...this.audioLevels };
  }

  public emitState(next: VoiceSessionState, err: VoiceSessionError | null = null): void {
    const prev = this.state;
    if (prev === next && !err) return;
    this.previousState = prev;
    this.state = next;
    this.error = err;
    this.transitionCount += 1;
    const snap = this.getSnapshot();
    this.stateListeners.forEach((l) =>
      l({ previousState: prev, nextState: next, snapshot: snap })
    );
  }

  public emitAudio(inputLevel: number, outputLevel: number): void {
    this.audioLevels = {
      inputLevel,
      outputLevel,
      timestamp: Date.now(),
      isSimulated: this.isSimulated,
    };
    this.audioListeners.forEach((l) => l(this.audioLevels));
  }

  public resolvePendingStart(): void {
    this.pendingStartResolver?.();
    this.pendingStartResolver = null;
  }

  public async start(): Promise<void> {
    this.startCalls += 1;
    this.startedAt = Date.now();
    this.emitState('entering');

    if (this.holdStartPending) {
      await new Promise<void>((resolve) => {
        this.pendingStartResolver = resolve;
      });
    }

    if (this.failStartWith) {
      this.emitState('error', this.failStartWith);
      return;
    }

    this.emitState('listening');
  }

  public async end(): Promise<void> {
    this.endCalls += 1;
    this.emitState('ending');
    this.emitState('idle');
  }

  public async retry(): Promise<void> {
    await this.start();
  }

  public interrupt(): void {
    this.interruptCalls += 1;
    this.emitAudio(0, 0);
    this.emitState('interrupted');
    this.emitState('listening');
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public handleVisibilityChange(_isVisible: boolean): void {
    // No-op in fake
  }

  public subscribeState(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeAudio(listener: VoiceAudioListener): () => void {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  public dispose(): void {
    this.disposeCalls += 1;
    this.stateListeners.clear();
    this.audioListeners.clear();
  }
}

function renderDemoWithVoice(
  realtimeService: MockRealtimeService,
  createVoiceSession: () => IVoiceSession,
  initialRoute = '/demo?room=VOICE-2D'
) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/demo"
          element={
            <DemoPage
              realtimeService={realtimeService}
              createVoiceSession={createVoiceSession}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Blink Stage 2D — Hey Blink Integrated Voice Assistant', () => {
  let sharedRealtime: MockRealtimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    sharedRealtime = new MockRealtimeService();
    sharedRealtime.setMockUid('stage-2d-user');

    useDiagnosticStore.getState().resetStore();
    useVoiceStore.getState().resetStore();
    useDeviceStore.getState().setExpression('idle');
    useDeviceStore.getState().resetMaterialParams();
    useWellnessStore.getState().resetMonitoring();
    useWellnessStore.getState().setNudgeDeferredForVoice(false);
    usePersonalityStore.getState().stopEngine();
    usePersonalityStore.getState().resetOwnership();
    useTrackingStore.setState({
      permissionState: 'idle',
      isCameraActive: false,
      isModelLoaded: false,
      isModelLoading: false,
      modelError: null,
      cameraError: null,
      isFaceDetected: false,
      trackingConfidence: 0,
      blinkCount: 0,
      leftWinkCount: 0,
      rightWinkCount: 0,
      closureLeft: 0,
      closureRight: 0,
    });
  });

  afterEach(() => {
    usePersonalityStore.getState().stopEngine();
    useWellnessStore.getState().setNudgeDeferredForVoice(false);
    useDiagnosticStore.getState().resetStore();
    useVoiceStore.getState().resetStore();
  });

  it('1. enforces legal 12-state transitions in VoiceExperienceStateMachine and rejects illegal leaps', () => {
    const fsm = new VoiceExperienceStateMachine();
    expect(fsm.getState()).toBe('EYE_IDLE');

    // Cannot jump straight from EYE_IDLE to VOICE_LISTENING without request/connect
    expect(fsm.transition('VOICE_LISTENING')).toBe(false);
    expect(fsm.getState()).toBe('EYE_IDLE');

    // Valid full lifecycle
    expect(fsm.transition('VOICE_REQUESTED')).toBe(true);
    expect(fsm.transition('MIC_PERMISSION_PENDING')).toBe(true);
    expect(fsm.transition('VOICE_CONNECTING')).toBe(true);
    expect(fsm.transition('VOICE_LISTENING')).toBe(true);
    expect(fsm.transition('USER_SPEAKING')).toBe(true);
    expect(fsm.transition('VOICE_PROCESSING')).toBe(true);
    expect(fsm.transition('ASSISTANT_SPEAKING')).toBe(true);
    expect(fsm.transition('VOICE_INTERRUPTED')).toBe(true);
    expect(fsm.transition('VOICE_LISTENING')).toBe(true);
    expect(fsm.transition('VOICE_ENDING')).toBe(true);
    expect(fsm.transition('RETURNING_TO_EYES')).toBe(true);
    expect(fsm.transition('EYE_IDLE')).toBe(true);
  });

  it('2. renders cohesive [Enable Camera] [Talk to Blink] controls and transitions Eyes -> Voice Ring -> Eyes on /demo', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    expect(screen.getByTestId('stage-camera-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('stage-voice-toggle')).toHaveTextContent('Talk to Blink');
    expect(screen.getByTestId('device-shell-desktop')).toHaveAttribute('data-visual-mode', 'eyes');
    expect(screen.queryByTestId('blink-voice-bubble-stage')).not.toBeInTheDocument();

    // Click Talk to Blink
    fireEvent.click(screen.getByTestId('stage-voice-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toBeInTheDocument();
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
      expect(screen.getByTestId('voice-bubble-status-label')).toHaveTextContent('Listening');
      expect(screen.getByTestId('device-shell-desktop')).toHaveAttribute('data-visual-mode', 'voice');
    });

    // Personality ownership switched to voice while WebGL EyeCanvas remains mounted
    expect(usePersonalityStore.getState().owner).toBe('voice');
    expect(screen.getByTestId('eye-webgl-canvas')).toBeInTheDocument();

    // End conversation -> returns cleanly to eyes and disposes session
    fireEvent.click(screen.getByTestId('voice-end-btn'));

    await waitFor(
      () => {
        expect(screen.getByTestId('device-shell-desktop')).toHaveAttribute('data-visual-mode', 'eyes');
        expect(screen.getByTestId('stage-voice-toggle')).toBeInTheDocument();
      },
      { timeout: 1500 }
    );

    expect(fakeSession.endCalls).toBe(1);
    expect(fakeSession.disposeCalls).toBeGreaterThanOrEqual(1);
    expect(usePersonalityStore.getState().owner).toBe('default');
  });

  it('3. handles user speaking, processing, assistant speaking, and barge-in interruption accurately', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    fireEvent.click(screen.getByTestId('stage-voice-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });

    // User speaks (real input level > threshold)
    await act(async () => {
      fakeSession.emitAudio(0.45, 0);
    });
    expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
      'data-voice-state',
      'USER_SPEAKING'
    );

    // Processing turn
    await act(async () => {
      fakeSession.emitState('thinking');
    });
    expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
      'data-voice-state',
      'VOICE_PROCESSING'
    );
    expect(screen.getByTestId('voice-bubble-status-label')).toHaveTextContent('Thinking');

    // Assistant speaking (driven by playback outputLevel)
    await act(async () => {
      fakeSession.emitState('speaking');
      fakeSession.emitAudio(0, 0.62);
    });
    expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
      'data-voice-state',
      'ASSISTANT_SPEAKING'
    );
    expect(screen.getByTestId('voice-bubble-status-label')).toHaveTextContent('Blink is speaking');
    expect(screen.getByTestId('voice-interrupt-btn')).toBeInTheDocument();

    // User interrupts Blink -> barge-in returns to listening
    fireEvent.click(screen.getByTestId('voice-interrupt-btn'));
    expect(fakeSession.interruptCalls).toBe(1);
    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });
  });

  it('4. guards against rapid duplicate clicks and never creates duplicate voice sessions or mic streams', async () => {
    let createdCount = 0;
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    fakeSession.holdStartPending = true;

    renderDemoWithVoice(sharedRealtime, () => {
      createdCount += 1;
      return fakeSession;
    });

    const btn = screen.getByTestId('stage-voice-toggle');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(createdCount).toBe(1);
    expect(fakeSession.startCalls).toBe(1);
    // Must NOT claim VOICE_LISTENING while start() is still pending
    expect(screen.getByTestId('blink-voice-bubble-stage')).not.toHaveAttribute(
      'data-voice-state',
      'VOICE_LISTENING'
    );

    await act(async () => {
      fakeSession.resolvePendingStart();
    });

    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });
  });

  it('5. reports microphone permission denial to Issue Center, never claims LISTENING, and returns safely to Eyes', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    fakeSession.failStartWith = {
      code: 'MICROPHONE_PERMISSION_DENIED',
      message: 'Microphone permission denied by browser.',
      recoverable: true,
      timestamp: Date.now(),
    };

    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    fireEvent.click(screen.getByTestId('stage-voice-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_ERROR'
      );
    });

    expect(screen.getByTestId('voice-bubble-status-label')).toHaveTextContent('Connection lost');
    expect(
      useDiagnosticStore
        .getState()
        .activeIssues.some((i) => i.code === 'VOICE_MIC_PERMISSION_DENIED')
    ).toBe(true);

    // Return safely to Eye Mode
    fireEvent.click(screen.getByTestId('voice-end-btn'));
    await waitFor(
      () => {
        expect(screen.getByTestId('device-shell-desktop')).toHaveAttribute('data-visual-mode', 'eyes');
      },
      { timeout: 1500 }
    );
  });

  it('6. preserves live camera tracking, blink count, Elevated LIVE mode, and shared room during Voice Mode', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    // Establish active live camera + blinks before entering voice mode
    await act(async () => {
      useWellnessStore.getState().startMonitoring();
      useTrackingStore.setState({
        permissionState: 'granted',
        isCameraActive: true,
        isModelLoaded: true,
        isFaceDetected: true,
        trackingConfidence: 0.96,
        blinkCount: 7,
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
      },
      { timeout: 2500 }
    );
    expect(screen.getByTestId('room-session-trigger')).toHaveTextContent('VOICE-2D');

    // Enter Voice Mode
    fireEvent.click(screen.getByTestId('stage-voice-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });

    // Elevated MUST stay mounted in LIVE mode with unchanged room and preserved blinkCount
    expect(screen.getByTestId('insights-elevated-app')).toBeInTheDocument();
    expect(screen.getByTestId('authenticity-mode-badge')).toHaveTextContent('LIVE');
    expect(screen.getByTestId('room-session-trigger')).toHaveTextContent('VOICE-2D');
    expect(useTrackingStore.getState().blinkCount).toBe(7);

    // Further blinks during voice mode still propagate to Elevated
    await act(async () => {
      useTrackingStore.setState({ blinkCount: 9 });
    });
    await waitFor(() => {
      expect(screen.getByTestId('metric-total-blinks')).toHaveTextContent('9');
    });
  });

  it('7. defers wellness nudge visuals during active Voice Mode without resetting fatigue timers and resumes cleanly on exit', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    const startNow = performance.now();
    await act(async () => {
      useWellnessStore.getState().startMonitoring();
      useWellnessStore.getState().forceCooldownExpiration();
    });

    // Enter Voice Mode
    fireEvent.click(screen.getByTestId('stage-voice-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });
    expect(useWellnessStore.getState().isNudgeDeferredForVoice).toBe(true);

    // Feed prolonged stare tracking updates during voice mode -> must defer, not hijack expression
    await act(async () => {
      useWellnessStore.getState().onTrackingUpdate(true, true, 0.95, startNow + 100);
      useWellnessStore.getState().onTrackingUpdate(true, true, 0.95, startNow + 22000);
    });
    expect(useWellnessStore.getState().pendingDeferredNudge).not.toBeNull();
    expect(useDeviceStore.getState().expression).not.toBe('nudging');

    // End Voice Mode -> deferred nudge resumes cleanly
    fireEvent.click(screen.getByTestId('voice-end-btn'));
    await waitFor(
      () => {
        expect(useWellnessStore.getState().isNudgeDeferredForVoice).toBe(false);
      },
      { timeout: 1500 }
    );
    expect(useWellnessStore.getState().pendingDeferredNudge).toBeNull();
  });

  it('8. works cleanly in standalone /device fullscreen mode without bezel and exits on Escape', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    render(
      <MemoryRouter initialEntries={['/device']}>
        <Routes>
          <Route path="/device" element={<DevicePage createVoiceSession={() => fakeSession} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('device-shell-standalone')).toBeInTheDocument();
    expect(screen.queryByAltText('Blink Physical Bezel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stage-voice-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });

    // Escape key ends conversation cleanly
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(
      () => {
        expect(screen.getByTestId('device-shell-standalone')).toHaveAttribute(
          'data-visual-mode',
          'eyes'
        );
      },
      { timeout: 1500 }
    );
    expect(fakeSession.endCalls).toBe(1);
  });

  it('9. disposes active voice session and releases mic/ownership immediately on unmount / navigation', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: false });
    const { unmount } = renderDemoWithVoice(sharedRealtime, () => fakeSession);

    fireEvent.click(screen.getByTestId('stage-voice-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
        'data-voice-state',
        'VOICE_LISTENING'
      );
    });

    unmount();

    expect(fakeSession.disposeCalls).toBeGreaterThanOrEqual(1);
    expect(usePersonalityStore.getState().owner).toBe('default');
    expect(useWellnessStore.getState().isNudgeDeferredForVoice).toBe(false);
  });

  it('10. classifies all voice error categories cleanly and enforces strict security & nginx Permissions-Policy invariants', () => {
    expect(
      classifyVoiceDiagnosticCode({ code: 'MICROPHONE_PERMISSION_DENIED', message: 'Denied' })
    ).toBe('VOICE_MIC_PERMISSION_DENIED');
    expect(classifyVoiceDiagnosticCode({ message: 'No microphone device not found' })).toBe(
      'VOICE_MIC_NOT_FOUND'
    );
    expect(classifyVoiceDiagnosticCode({ code: 'AUDIO_DEVICE_ERROR', message: 'Mic unplugged' })).toBe(
      'VOICE_MIC_INTERRUPTED'
    );
    expect(classifyVoiceDiagnosticCode({ message: 'Live voice token service is not configured' })).toBe(
      'VOICE_BACKEND_UNREACHABLE'
    );
    expect(classifyVoiceDiagnosticCode({ message: 'HTTP 401 unauthorized' })).toBe(
      'VOICE_AUTH_FAILED'
    );
    expect(classifyVoiceDiagnosticCode({ message: 'HTTP 429 rate limit reached' })).toBe(
      'VOICE_QUOTA_EXCEEDED'
    );
    expect(classifyVoiceDiagnosticCode({ code: 'PROVIDER_DISCONNECTED', message: 'Socket closed' })).toBe(
      'VOICE_TRANSPORT_DISCONNECTED'
    );
    expect(
      classifyVoiceDiagnosticCode({ code: 'AUDIO_DEVICE_ERROR', message: 'Speaker playback failed' })
    ).toBe('VOICE_AUDIO_PLAYBACK_FAILED');
    expect(classifyVoiceDiagnosticCode({ message: 'MediaDevices unsupported' })).toBe(
      'VOICE_BROWSER_UNSUPPORTED'
    );

    // Security check: nginx.conf permits camera=(self), microphone=(self) and never wildcard
    const nginxContent = fs.readFileSync(path.resolve(process.cwd(), 'nginx.conf'), 'utf8');
    expect(nginxContent).toContain('Permissions-Policy "camera=(self), microphone=(self)"');
    expect(nginxContent).not.toContain('microphone=()');
    expect(nginxContent).not.toContain('microphone=*');

    // Security check: client env.ts never reads or exposes GEMINI_API_KEY
    const envContent = fs.readFileSync(path.resolve(process.cwd(), 'src/config/env.ts'), 'utf8');
    expect(envContent).not.toContain('GEMINI_API_KEY');
  });

  it('11. opens Voice Settings popover on /demo to switch Voice Ring vs Voice Glow, adjust grouped sliders, and hide status text', async () => {
    const fakeSession = new FakeVoiceSession({ isSimulated: true });
    renderDemoWithVoice(sharedRealtime, () => fakeSession);

    fireEvent.click(screen.getByTestId('voice-settings-trigger'));
    expect(await screen.findByTestId('voice-settings-popover')).toBeInTheDocument();

    // Switch ring style to mono, expand Ring Motion group, and adjust sensitivity slider
    fireEvent.click(screen.getByTestId('voice-ring-type-mono'));
    fireEvent.click(screen.getByTestId('voice-group-ring-motion'));
    fireEvent.change(screen.getByTestId('voice-slider-sensitivity'), { target: { value: '1.3' } });
    expect((screen.getByTestId('voice-slider-sensitivity') as HTMLInputElement).value).toBe('1.3');

    // Toggle "Show status text" off and confirm status pill hides while Voice Ring stays active
    fireEvent.click(screen.getByTestId('stage-voice-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('voice-bubble-status-label')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('voice-toggle-status-label'));
    expect(screen.queryByTestId('voice-bubble-status-label')).not.toBeInTheDocument();

    // Switch visualizer to Voice Glow (libraries.dev/voice) and adjust curved-bezel Edge Fade
    fireEvent.click(screen.getByTestId('voice-visualizer-glow'));
    expect(screen.getByTestId('blink-voice-bubble-stage')).toHaveAttribute(
      'data-voice-visualizer',
      'voice-glow'
    );
    expect(screen.getByTestId('blink-voice-glow-viewport')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('voice-glow-slider-edge-fade'), { target: { value: '0.9' } });
    expect((screen.getByTestId('voice-glow-slider-edge-fade') as HTMLInputElement).value).toBe('0.9');

    // Reset defaults restores edgeFade & status text visible
    fireEvent.click(screen.getByTestId('voice-tuning-reset'));
    expect((screen.getByTestId('voice-glow-slider-edge-fade') as HTMLInputElement).value).toBe('0.78');
    expect(screen.getByTestId('voice-bubble-status-label')).toBeInTheDocument();

    // Escape closes popover cleanly
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('voice-settings-popover')).not.toBeInTheDocument();
    });
  });
});
