/**
 * Blink Stage 2D — Unified Blink Voice Experience Controller
 *
 * Bridges Hey Blink's existing IVoiceSession (`GeminiLiveVoiceSession` /
 * `MockVoiceSession`) with Blink's physical DeviceShell, PersonalityStore,
 * WellnessStore, and Issue Center Diagnostics.
 *
 * Guarantees:
 * - One authoritative 12-state machine (`VoiceExperienceState`).
 * - Zero duplicate microphone streams or duplicate voice sockets.
 * - Never claims LISTENING before actual mic capture & transport succeed.
 * - Zero per-frame React re-renders (high-frequency audio flows via ref).
 * - Camera monitoring, blink counts, and Firebase telemetry remain intact.
 * - Nonurgent wellness nudges are deferred during voice mode (never silently dropped).
 * - Guaranteed teardown of mic tracks, sockets, players, and timers on end/unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePersonalityStore } from '@/features/blink-device/personality';
import { useWellnessStore } from '@/features/blink-device/wellness/wellnessStore';
import {
  useDiagnosticStore,
  type DiagnosticCode,
} from '@/features/demo/diagnostics/diagnosticStore';
import {
  createVoiceSessionProvider,
  resolveVoiceProviderConfig,
} from '../services/voice-provider-factory';
import {
  listAudioInputDevices,
  type AudioInputDeviceInfo,
} from '../audio/microphone-capture';
import {
  DEFAULT_VOICE_GLOW_TUNING,
  type VoiceGlowTuning,
} from '../visualizer/visual-presets';
import type {
  IVoiceSession,
  VoiceAudioLevels,
  VoiceProviderKind,
  VoiceSessionError,
  VoiceSessionState,
} from '../services/voice-session.interface';
import { useVoiceStore } from '../state/voice.store';
import {
  canActivateVoice,
  canInterruptExperience,
  classifyVoiceDiagnosticCode,
  deriveVisualMode,
  isVoiceConversationLive,
  isVoiceEngaged,
  VoiceExperienceStateMachine,
  type BlinkVisualMode,
  type VoiceExperienceState,
} from './voiceExperienceStateMachine';

const ZERO_AUDIO_LEVELS: VoiceAudioLevels = {
  inputLevel: 0,
  outputLevel: 0,
  timestamp: 0,
  isSimulated: true,
};

const ALL_VOICE_DIAGNOSTIC_CODES: readonly DiagnosticCode[] = [
  'VOICE_MIC_PERMISSION_DENIED',
  'VOICE_MIC_NOT_FOUND',
  'VOICE_MIC_INTERRUPTED',
  'VOICE_BACKEND_UNREACHABLE',
  'VOICE_AUTH_FAILED',
  'VOICE_QUOTA_EXCEEDED',
  'VOICE_TRANSPORT_DISCONNECTED',
  'VOICE_AUDIO_PLAYBACK_FAILED',
  'VOICE_BROWSER_UNSUPPORTED',
  'VOICE_SESSION_TERMINATED',
];

const USER_SPEAKING_ON_THRESHOLD = 0.12;
const USER_SPEAKING_HOLD_MS = 450;
const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_RETURN_TO_EYES_MS = 320;

export interface UseBlinkVoiceExperienceOptions {
  /** Optional custom session factory (primarily for deterministic automated testing) */
  createSession?: () => IVoiceSession;
  /** Optional explicit initial provider kind */
  initialProvider?: VoiceProviderKind;
  /** Max session duration before graceful timeout cleanup (default 15m) */
  sessionTimeoutMs?: number;
  /** Return-to-eyes choreography duration in ms (default 320ms) */
  returnDurationMs?: number;
  /** Whether to report voice errors into the shared Issue Center (default true) */
  reportDiagnostics?: boolean;
}

export type VoiceVisualizerKind = 'voice-ring' | 'voice-glow';

export interface VoiceGlowIntegratedTuning extends VoiceGlowTuning {
  /** Edge feathering inside Blink's curved display aperture (0.2..1.0, default 0.78) */
  edgeFade: number;
}

export const DEFAULT_VOICE_GLOW_INTEGRATED_TUNING: VoiceGlowIntegratedTuning = {
  ...DEFAULT_VOICE_GLOW_TUNING,
  edgeFade: 0.78,
};

export interface VoiceRingTuning {
  /** Active voice visualizer: libraries.dev/voice-ring vs libraries.dev/voice (voice-glow) */
  visualizerKind: VoiceVisualizerKind;
  ringType: 'ring' | 'mono';
  sensitivityScale: number;
  glowScale: number;
  speedScale: number;
  warmthOffset: number;
  /** When false, hides the on-screen Listening / Thinking / Speaking pill so the visualizer speaks for itself */
  showStatusLabel: boolean;
  /** Dedicated configuration for libraries.dev/voice (VoiceGlow / VoiceBeam) */
  glow: VoiceGlowIntegratedTuning;
}

export const DEFAULT_VOICE_RING_TUNING: VoiceRingTuning = {
  visualizerKind: 'voice-ring',
  ringType: 'ring',
  sensitivityScale: 1.0,
  glowScale: 1.0,
  speedScale: 1.0,
  warmthOffset: 0,
  showStatusLabel: true,
  glow: { ...DEFAULT_VOICE_GLOW_INTEGRATED_TUNING },
};

export interface BlinkVoiceExperience {
  /** Authoritative 12-state voice experience state */
  experienceState: VoiceExperienceState;
  /** Derived high-level visual mode for DeviceShell choreography */
  visualMode: BlinkVisualMode;
  /** True whenever Blink is outside EYE_IDLE (transitioning, active, or error) */
  isEngaged: boolean;
  /** True when live listening/processing/speaking is active */
  isConversationLive: boolean;
  /** True when Talk to Blink button can start a session */
  canActivate: boolean;
  /** True when user can interrupt Blink (barge-in) */
  canInterrupt: boolean;
  /** True while microphone input is muted */
  isMuted: boolean;
  /** True when running on simulated preview provider (never hidden from user) */
  isSimulated: boolean;
  /** Active provider kind ('gemini-live' | 'mock') */
  providerKind: VoiceProviderKind;
  /** Configured token endpoint URL (empty if not configured) */
  tokenEndpoint: string;
  /** True when live Gemini token endpoint is configured in env */
  isLiveEndpointConfigured: boolean;
  /** True when this browser context supports voice capture */
  isVoiceSupported: boolean;
  /** Current voice error, if any */
  error: VoiceSessionError | null;
  /** High-frequency 60 FPS audio levels ref (no React re-renders) */
  audioLevelsRef: React.MutableRefObject<VoiceAudioLevels>;

  // Audio device & visualizer tuning controls
  audioInputDevices: AudioInputDeviceInfo[];
  selectedAudioDeviceId: string;
  setSelectedAudioDeviceId: (deviceId: string) => void;
  refreshAudioDevices: () => Promise<void>;
  switchProvider: (kind: VoiceProviderKind) => void;
  tuning: VoiceRingTuning;
  updateTuning: (partial: Partial<VoiceRingTuning>) => void;
  updateGlowTuning: (partial: Partial<VoiceGlowIntegratedTuning>) => void;
  resetTuning: () => void;

  // Actions
  startVoice: () => Promise<void>;
  startPreviewVoice: () => Promise<void>;
  endVoice: () => Promise<void>;
  retryVoice: () => Promise<void>;
  interruptVoice: () => void;
  toggleMute: () => void;
  returnToEyes: () => void;
}

function checkBrowserVoiceSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

export function useBlinkVoiceExperience(
  options: UseBlinkVoiceExperienceOptions = {}
): BlinkVoiceExperience {
  const {
    createSession,
    initialProvider,
    sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
    returnDurationMs = DEFAULT_RETURN_TO_EYES_MS,
    reportDiagnostics = true,
  } = options;

  const resolvedConfig = useMemo(() => resolveVoiceProviderConfig(), []);
  const [providerKind, setProviderKind] = useState<VoiceProviderKind>(
    () => initialProvider ?? resolvedConfig.provider
  );

  const machineRef = useRef<VoiceExperienceStateMachine>(new VoiceExperienceStateMachine());
  const [experienceState, setExperienceState] = useState<VoiceExperienceState>('EYE_IDLE');
  const [isMuted, setIsMuted] = useState(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(
    (initialProvider ?? resolvedConfig.provider) === 'mock'
  );
  const [error, setError] = useState<VoiceSessionError | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<AudioInputDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('default');
  const [tuning, setTuning] = useState<VoiceRingTuning>({ ...DEFAULT_VOICE_RING_TUNING });

  const selectedAudioDeviceIdRef = useRef(selectedAudioDeviceId);
  selectedAudioDeviceIdRef.current = selectedAudioDeviceId;

  const refreshAudioDevices = useCallback(async () => {
    try {
      const devices = await listAudioInputDevices();
      setAudioInputDevices(devices);
    } catch {
      // Ignore enumeration errors in unsupported environments
    }
  }, []);

  const updateTuning = useCallback((partial: Partial<VoiceRingTuning>) => {
    setTuning((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateGlowTuning = useCallback((partial: Partial<VoiceGlowIntegratedTuning>) => {
    setTuning((prev) => ({
      ...prev,
      glow: { ...prev.glow, ...partial },
    }));
  }, []);

  const resetTuning = useCallback(() => {
    setTuning((prev) => ({
      ...DEFAULT_VOICE_RING_TUNING,
      visualizerKind: prev.visualizerKind,
      glow: { ...DEFAULT_VOICE_GLOW_INTEGRATED_TUNING },
    }));
  }, []);

  const sessionRef = useRef<IVoiceSession | null>(null);
  const unsubStateRef = useRef<(() => void) | null>(null);
  const unsubAudioRef = useRef<(() => void) | null>(null);
  const audioLevelsRef = useRef<VoiceAudioLevels>({ ...ZERO_AUDIO_LEVELS });
  const activationInFlightRef = useRef(false);
  const endingInFlightRef = useRef(false);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSpeakingHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  const isVoiceSupported = useMemo(
    () => Boolean(createSession) || providerKind === 'mock' || checkBrowserVoiceSupport(),
    [createSession, providerKind]
  );

  const clearAllTimers = useCallback(() => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    if (sessionTimeoutTimerRef.current) {
      clearTimeout(sessionTimeoutTimerRef.current);
      sessionTimeoutTimerRef.current = null;
    }
    if (userSpeakingHoldTimerRef.current) {
      clearTimeout(userSpeakingHoldTimerRef.current);
      userSpeakingHoldTimerRef.current = null;
    }
  }, []);

  const clearVoiceDiagnostics = useCallback(() => {
    if (!reportDiagnostics) return;
    const { resolveIssue } = useDiagnosticStore.getState();
    for (const code of ALL_VOICE_DIAGNOSTIC_CODES) {
      resolveIssue(code);
    }
  }, [reportDiagnostics]);

  const releaseVisualOwnership = useCallback(() => {
    usePersonalityStore.getState().onListeningMode(false);
    useWellnessStore.getState().setNudgeDeferredForVoice(false);
  }, []);

  const acquireVisualOwnership = useCallback(() => {
    usePersonalityStore.getState().onListeningMode(true);
    useWellnessStore.getState().setNudgeDeferredForVoice(true);
  }, []);

  const transitionTo = useCallback((next: VoiceExperienceState): boolean => {
    const moved = machineRef.current.transition(next);
    if (moved) {
      setExperienceState(next);
    }
    return moved;
  }, []);

  const finishReturnToEyes = useCallback(() => {
    clearAllTimers();
    audioLevelsRef.current = { ...ZERO_AUDIO_LEVELS, isSimulated };
    setIsMuted(false);
    setError(null);
    activationInFlightRef.current = false;
    endingInFlightRef.current = false;

    if (!machineRef.current.transition('EYE_IDLE')) {
      machineRef.current.forceReset();
    }
    setExperienceState('EYE_IDLE');
    releaseVisualOwnership();
  }, [clearAllTimers, isSimulated, releaseVisualOwnership]);

  const scheduleReturnToEyes = useCallback(() => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    if (machineRef.current.getState() !== 'RETURNING_TO_EYES') {
      transitionTo('RETURNING_TO_EYES');
    }
    if (returnDurationMs <= 0) {
      finishReturnToEyes();
      return;
    }
    returnTimerRef.current = setTimeout(() => {
      finishReturnToEyes();
    }, returnDurationMs);
  }, [finishReturnToEyes, returnDurationMs, transitionTo]);

  const disposeActiveSession = useCallback(() => {
    if (unsubStateRef.current) {
      unsubStateRef.current();
      unsubStateRef.current = null;
    }
    if (unsubAudioRef.current) {
      unsubAudioRef.current();
      unsubAudioRef.current = null;
    }
    if (sessionRef.current) {
      try {
        sessionRef.current.dispose();
      } catch {
        // Ignore teardown errors during forced disposal
      }
      sessionRef.current = null;
    }
    audioLevelsRef.current = { ...ZERO_AUDIO_LEVELS };
  }, []);

  const reportVoiceError = useCallback(
    (err: VoiceSessionError) => {
      setError(err);
      if (reportDiagnostics) {
        const diagCode = classifyVoiceDiagnosticCode(err);
        useDiagnosticStore.getState().reportIssue(diagCode, {
          explanation: err.message,
        });
      }
      if (!machineRef.current.transition('VOICE_ERROR')) {
        // Ensure we surface error even from states that couldn't step directly
        machineRef.current.forceReset();
        machineRef.current.transition('VOICE_ERROR');
      }
      setExperienceState('VOICE_ERROR');
      activationInFlightRef.current = false;
    },
    [reportDiagnostics]
  );

  const mapUnderlyingState = useCallback(
    (next: VoiceSessionState, snapshotError: VoiceSessionError | null, simFlag: boolean) => {
      setIsSimulated(simFlag);

      switch (next) {
        case 'entering':
          if (machineRef.current.getState() === 'VOICE_REQUESTED') {
            transitionTo('VOICE_CONNECTING');
          } else if (machineRef.current.getState() === 'MIC_PERMISSION_PENDING') {
            transitionTo('VOICE_CONNECTING');
          }
          break;

        case 'listening':
          activationInFlightRef.current = false;
          setError(null);
          clearVoiceDiagnostics();
          if (machineRef.current.getState() !== 'VOICE_LISTENING') {
            if (!transitionTo('VOICE_LISTENING')) {
              // Step through connecting if provider jumped straight to listening
              transitionTo('VOICE_CONNECTING');
              transitionTo('VOICE_LISTENING');
            }
          }
          // Enforce bounded session timeout for cost/mic-safety control
          if (sessionTimeoutTimerRef.current) clearTimeout(sessionTimeoutTimerRef.current);
          sessionTimeoutTimerRef.current = setTimeout(() => {
            void endVoiceRef.current();
          }, sessionTimeoutMs);
          break;

        case 'thinking':
          if (userSpeakingHoldTimerRef.current) {
            clearTimeout(userSpeakingHoldTimerRef.current);
            userSpeakingHoldTimerRef.current = null;
          }
          transitionTo('VOICE_PROCESSING');
          break;

        case 'speaking':
          if (userSpeakingHoldTimerRef.current) {
            clearTimeout(userSpeakingHoldTimerRef.current);
            userSpeakingHoldTimerRef.current = null;
          }
          transitionTo('ASSISTANT_SPEAKING');
          break;

        case 'interrupted':
          transitionTo('VOICE_INTERRUPTED');
          break;

        case 'ending':
          transitionTo('VOICE_ENDING');
          break;

        case 'error':
          if (sessionTimeoutTimerRef.current) {
            clearTimeout(sessionTimeoutTimerRef.current);
            sessionTimeoutTimerRef.current = null;
          }
          reportVoiceError(
            snapshotError ?? {
              code: 'UNKNOWN_ERROR',
              message: 'Voice session encountered an unexpected error.',
              recoverable: true,
              timestamp: Date.now(),
            }
          );
          break;

        case 'idle':
          // Return smoothly to Eye Mode if we were actively engaged or ending
          if (
            machineRef.current.getState() !== 'EYE_IDLE' &&
            machineRef.current.getState() !== 'VOICE_ERROR' &&
            machineRef.current.getState() !== 'RETURNING_TO_EYES'
          ) {
            if (machineRef.current.getState() !== 'VOICE_ENDING') {
              transitionTo('VOICE_ENDING');
            }
            scheduleReturnToEyes();
          }
          break;
      }
    },
    [clearVoiceDiagnostics, reportVoiceError, scheduleReturnToEyes, sessionTimeoutMs, transitionTo]
  );

  const attachSession = useCallback(
    (session: IVoiceSession) => {
      disposeActiveSession();
      sessionRef.current = session;

      const snap = session.getSnapshot();
      setIsSimulated(snap.isSimulated);
      setIsMuted(snap.isMuted);
      useVoiceStore.getState().applySnapshot(snap);

      unsubStateRef.current = session.subscribeState((evt) => {
        useVoiceStore.getState().applySnapshot(evt.snapshot);
        setIsMuted(evt.snapshot.isMuted);
        mapUnderlyingState(evt.nextState, evt.snapshot.error, evt.snapshot.isSimulated);
      });

      unsubAudioRef.current = session.subscribeAudio((levels) => {
        // Zero React state re-renders on normal frames
        audioLevelsRef.current = levels;

        // Lightweight hysteretic transition between VOICE_LISTENING <-> USER_SPEAKING
        const current = machineRef.current.getState();
        if (current === 'VOICE_LISTENING' && levels.inputLevel >= USER_SPEAKING_ON_THRESHOLD) {
          if (userSpeakingHoldTimerRef.current) {
            clearTimeout(userSpeakingHoldTimerRef.current);
            userSpeakingHoldTimerRef.current = null;
          }
          transitionTo('USER_SPEAKING');
        } else if (current === 'USER_SPEAKING') {
          if (levels.inputLevel >= USER_SPEAKING_ON_THRESHOLD * 0.65) {
            if (userSpeakingHoldTimerRef.current) {
              clearTimeout(userSpeakingHoldTimerRef.current);
              userSpeakingHoldTimerRef.current = null;
            }
          } else if (!userSpeakingHoldTimerRef.current) {
            userSpeakingHoldTimerRef.current = setTimeout(() => {
              userSpeakingHoldTimerRef.current = null;
              if (machineRef.current.getState() === 'USER_SPEAKING') {
                transitionTo('VOICE_LISTENING');
              }
            }, USER_SPEAKING_HOLD_MS);
          }
        }
      });
    },
    [disposeActiveSession, mapUnderlyingState, transitionTo]
  );

  const launchSession = useCallback(
    async (targetProvider: VoiceProviderKind) => {
      const current = machineRef.current.getState();
      if (activationInFlightRef.current || endingInFlightRef.current) {
        return;
      }
      if (!canActivateVoice(current)) {
        return;
      }

      // Guard: browser mic API check for live provider (unless custom test session injected)
      if (targetProvider === 'gemini-live' && !createSessionRef.current && !checkBrowserVoiceSupport()) {
        acquireVisualOwnership();
        reportVoiceError({
          code: 'AUDIO_DEVICE_ERROR',
          message: 'Live voice requires HTTPS (or localhost) with browser microphone support.',
          recoverable: false,
          timestamp: Date.now(),
        });
        return;
      }

      activationInFlightRef.current = true;
      setError(null);
      clearVoiceDiagnostics();
      acquireVisualOwnership();

      if (!transitionTo('VOICE_REQUESTED')) {
        machineRef.current.forceReset();
        transitionTo('VOICE_REQUESTED');
      }

      // Live mode explicitly enters MIC_PERMISSION_PENDING before transport connect
      if (targetProvider === 'gemini-live') {
        transitionTo('MIC_PERMISSION_PENDING');
      } else {
        transitionTo('VOICE_CONNECTING');
      }

      setProviderKind(targetProvider);

      const session = createSessionRef.current
        ? createSessionRef.current()
        : createVoiceSessionProvider(targetProvider);
      attachSession(session);

      try {
        const deviceIdOpt =
          selectedAudioDeviceIdRef.current && selectedAudioDeviceIdRef.current !== 'default'
            ? { audioInputDeviceId: selectedAudioDeviceIdRef.current }
            : undefined;
        await session.start(deviceIdOpt);
        // Refresh labeled microphones after browser grants mic permission
        void refreshAudioDevices();
        // Verify session actually reached an active state; if start() resolved in error/idle, sync cleanly
        const postSnap = session.getSnapshot();
        if (postSnap.state === 'error') {
          reportVoiceError(
            postSnap.error ?? {
              code: 'SESSION_INIT_FAILED',
              message: 'Could not initialize voice session.',
              recoverable: true,
              timestamp: Date.now(),
            }
          );
        } else if (postSnap.state === 'idle' && machineRef.current.getState() !== 'EYE_IDLE') {
          scheduleReturnToEyes();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to start voice conversation.';
        reportVoiceError({
          code: 'SESSION_INIT_FAILED',
          message,
          recoverable: true,
          timestamp: Date.now(),
        });
      } finally {
        activationInFlightRef.current = false;
      }
    },
    [
      acquireVisualOwnership,
      attachSession,
      clearVoiceDiagnostics,
      reportVoiceError,
      scheduleReturnToEyes,
      transitionTo,
    ]
  );

  const startVoice = useCallback(async () => {
    await launchSession(providerKind);
  }, [launchSession, providerKind]);

  const startPreviewVoice = useCallback(async () => {
    // Tear down any existing error state first so preview starts cleanly
    disposeActiveSession();
    machineRef.current.forceReset();
    setExperienceState('EYE_IDLE');
    await launchSession('mock');
  }, [disposeActiveSession, launchSession]);

  const endVoice = useCallback(async () => {
    if (endingInFlightRef.current) return;
    const current = machineRef.current.getState();
    if (current === 'EYE_IDLE') return;

    endingInFlightRef.current = true;
    activationInFlightRef.current = false;
    clearAllTimers();

    if (current !== 'VOICE_ENDING' && current !== 'RETURNING_TO_EYES') {
      transitionTo('VOICE_ENDING');
    }

    const active = sessionRef.current;
    if (active) {
      try {
        await active.end();
      } catch {
        // Proceed to forced cleanup
      }
    }
    disposeActiveSession();
    scheduleReturnToEyes();
  }, [clearAllTimers, disposeActiveSession, scheduleReturnToEyes, transitionTo]);

  const endVoiceRef = useRef(endVoice);
  endVoiceRef.current = endVoice;

  const returnToEyes = useCallback(() => {
    clearVoiceDiagnostics();
    void endVoice();
  }, [clearVoiceDiagnostics, endVoice]);

  const retryVoice = useCallback(async () => {
    disposeActiveSession();
    machineRef.current.forceReset();
    setExperienceState('EYE_IDLE');
    await launchSession(providerKind);
  }, [disposeActiveSession, launchSession, providerKind]);

  const interruptVoice = useCallback(() => {
    if (!canInterruptExperience(machineRef.current.getState())) return;
    sessionRef.current?.interrupt();
  }, []);

  const toggleMute = useCallback(() => {
    const active = sessionRef.current;
    if (!active) return;
    const nextMuted = active.toggleMute();
    setIsMuted(nextMuted);
    if (nextMuted && machineRef.current.getState() === 'USER_SPEAKING') {
      transitionTo('VOICE_LISTENING');
    }
  }, [transitionTo]);

  const switchProvider = useCallback(
    (kind: VoiceProviderKind) => {
      if (kind === providerKind) return;
      clearAllTimers();
      disposeActiveSession();
      releaseVisualOwnership();
      machineRef.current.forceReset();
      setExperienceState('EYE_IDLE');
      setError(null);
      setIsMuted(false);
      setProviderKind(kind);
      setIsSimulated(kind === 'mock');
    },
    [clearAllTimers, disposeActiveSession, providerKind, releaseVisualOwnership]
  );

  // Forward browser tab visibility changes to active session
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      sessionRef.current?.handleVisibilityChange(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Guaranteed cleanup on component unmount / route navigation (never leave mic open!)
  useEffect(() => {
    return () => {
      clearAllTimers();
      disposeActiveSession();
      releaseVisualOwnership();
      useVoiceStore.getState().resetStore();
    };
  }, [clearAllTimers, disposeActiveSession, releaseVisualOwnership]);

  const visualMode: BlinkVisualMode = deriveVisualMode(experienceState);

  return {
    experienceState,
    visualMode,
    isEngaged: isVoiceEngaged(experienceState),
    isConversationLive: isVoiceConversationLive(experienceState),
    canActivate: canActivateVoice(experienceState),
    canInterrupt: canInterruptExperience(experienceState),
    isMuted,
    isSimulated,
    providerKind,
    tokenEndpoint: resolvedConfig.tokenEndpoint,
    isLiveEndpointConfigured: resolvedConfig.isLiveConfigured,
    isVoiceSupported,
    error,
    audioLevelsRef,
    audioInputDevices,
    selectedAudioDeviceId,
    setSelectedAudioDeviceId,
    refreshAudioDevices,
    switchProvider,
    tuning,
    updateTuning,
    updateGlowTuning,
    resetTuning,
    startVoice,
    startPreviewVoice,
    endVoice,
    retryVoice,
    interruptVoice,
    toggleMute,
    returnToEyes,
  };
}
