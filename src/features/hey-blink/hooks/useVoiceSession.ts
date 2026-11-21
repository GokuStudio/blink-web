import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listAudioInputDevices,
  type AudioInputDeviceInfo,
} from '../audio/microphone-capture';
import { GeminiLiveVoiceSession } from '../services/gemini-live-voice-session';
import {
  createVoiceSessionProvider,
  resolveVoiceProviderConfig,
} from '../services/voice-provider-factory';
import {
  DeviceExperienceTransitionHooks,
  hasMockVoiceControls,
  hasVoiceDiagnostics,
  IVoiceSession,
  TransientDebugTranscript,
  VoiceAudioLevels,
  VoiceAudioListener,
  VoiceProviderKind,
  VoiceSessionErrorCode,
  VoiceSessionMetrics,
  VoiceSessionStartOptions,
  VoiceSessionState,
} from '../services/voice-session.interface';
import { canInterruptVoiceState, isActiveVoiceState } from '../services/voice-state-machine';
import { useVoiceStore } from '../state/voice.store';

export interface UseVoiceSessionOptions {
  /** Optional custom session factory (overrides default provider factory) */
  createSession?: () => IVoiceSession;
  /** Optional initial provider override ('mock' | 'gemini-live') */
  initialProvider?: VoiceProviderKind;
  /** Future DeviceExperienceController lifecycle hooks */
  transitionHooks?: DeviceExperienceTransitionHooks;
}

export interface UseVoiceSessionResult {
  state: VoiceSessionState;
  previousState: VoiceSessionState | null;
  isActive: boolean;
  canInterrupt: boolean;
  isMuted: boolean;
  isSimulated: boolean;
  providerId: string;
  providerKind: VoiceProviderKind;
  isLiveEndpointConfigured: boolean;
  sessionId: string | null;
  error: ReturnType<typeof useVoiceStore.getState>['error'];
  autoCycleEnabled: boolean;
  supportsDevControls: boolean;
  supportsDiagnostics: boolean;

  /** Available browser audio input devices (e.g. USB microphones) */
  audioInputDevices: AudioInputDeviceInfo[];
  selectedAudioDeviceId: string;
  setSelectedAudioDeviceId: (deviceId: string) => void;
  refreshAudioDevices: () => Promise<void>;

  /** Switch active provider between 'mock' and 'gemini-live' (tears down active session cleanly) */
  switchProvider: (kind: VoiceProviderKind) => void;

  /** High-frequency ref updated every audio tick with ZERO React re-renders */
  audioLevelsRef: React.MutableRefObject<VoiceAudioLevels>;
  /** Subscribe directly to audio frames for imperative DOM / Canvas visualizers */
  subscribeAudio: (listener: VoiceAudioListener) => () => void;
  /** Subscribe to transient user transcripts (used internally by ConversationEndDetector) */
  subscribeUserTranscript: (listener: (text: string, isFinal: boolean) => void) => () => void;
  /** Access underlying session instance for controller coordination */
  getSessionInstance: () => IVoiceSession | null;

  start: (options?: VoiceSessionStartOptions) => Promise<void>;
  end: () => Promise<void>;
  retry: () => Promise<void>;
  interrupt: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;

  /** Dev-only actions (safe no-ops when provider does not expose mock controls) */
  devTriggerState: (target: VoiceSessionState) => void;
  devTriggerError: (code: VoiceSessionErrorCode) => void;
  devTriggerSpeechBurst: () => void;
  devSetAutoCycle: (enabled: boolean) => void;

  /** Dev-only live diagnostics (safe null/empty when unsupported) */
  getDiagnosticsMetrics: () => VoiceSessionMetrics | null;
  getDebugTranscripts: () => readonly TransientDebugTranscript[];
  debugTranscriptionEnabled: boolean;
  setDebugTranscriptionEnabled: (enabled: boolean) => void;
}

const ZERO_AUDIO: VoiceAudioLevels = {
  inputLevel: 0,
  outputLevel: 0,
  timestamp: 0,
  isSimulated: true,
};

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSessionResult {
  const { createSession, initialProvider, transitionHooks } = options;

  const resolvedConfig = resolveVoiceProviderConfig();
  const [providerKind, setProviderKind] = useState<VoiceProviderKind>(
    () => initialProvider ?? resolvedConfig.provider
  );
  const [audioInputDevices, setAudioInputDevices] = useState<AudioInputDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('default');
  const [debugTranscriptionEnabled, setDebugTranscriptionState] = useState(false);

  const state = useVoiceStore((s) => s.state);
  const previousState = useVoiceStore((s) => s.previousState);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isSimulated = useVoiceStore((s) => s.isSimulated);
  const providerId = useVoiceStore((s) => s.providerId);
  const sessionId = useVoiceStore((s) => s.sessionId);
  const error = useVoiceStore((s) => s.error);
  const autoCycleEnabled = useVoiceStore((s) => s.autoCycleEnabled);
  const applySnapshot = useVoiceStore((s) => s.applySnapshot);
  const setAutoCycleEnabled = useVoiceStore((s) => s.setAutoCycleEnabled);
  const resetStore = useVoiceStore((s) => s.resetStore);

  const sessionRef = useRef<IVoiceSession | null>(null);
  const audioLevelsRef = useRef<VoiceAudioLevels>({ ...ZERO_AUDIO });
  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;
  const transitionHooksRef = useRef(transitionHooks);
  transitionHooksRef.current = transitionHooks;
  const selectedAudioDeviceIdRef = useRef(selectedAudioDeviceId);
  selectedAudioDeviceIdRef.current = selectedAudioDeviceId;

  const [supportsDevControls, setSupportsDevControls] = useState(false);
  const [supportsDiagnostics, setSupportsDiagnostics] = useState(false);

  const refreshAudioDevices = useCallback(async () => {
    const devices = await listAudioInputDevices();
    setAudioInputDevices(devices);
  }, []);

  // Enumerate microphones initially and on hot-plug (e.g. USB mic connected/unplugged)
  useEffect(() => {
    void refreshAudioDevices();
    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.addEventListener === 'function'
    ) {
      const handleDeviceChange = () => {
        void refreshAudioDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
    return undefined;
  }, [refreshAudioDevices]);

  // Mount & cleanly dispose exactly one active session per providerKind (React.StrictMode-safe)
  useEffect(() => {
    const session = createSessionRef.current
      ? createSessionRef.current()
      : createVoiceSessionProvider(providerKind);
    sessionRef.current = session;

    applySnapshot(session.getSnapshot());
    const hasMock = hasMockVoiceControls(session);
    const hasDiag = hasVoiceDiagnostics(session);
    setSupportsDevControls(hasMock);
    setSupportsDiagnostics(hasDiag);
    if (hasMock) {
      setAutoCycleEnabled(session.isAutoCycleEnabled());
    }
    if (hasDiag) {
      session.setDebugTranscriptionEnabled(debugTranscriptionEnabled);
    }

    const unsubscribeState = session.subscribeState((event) => {
      applySnapshot(event.snapshot);

      // Refresh device labels once microphone permission has been granted during entering/listening
      if (event.previousState === 'entering' && event.nextState === 'listening') {
        void refreshAudioDevices();
      }

      const hooks = transitionHooksRef.current;
      if (!hooks) return;
      if (event.previousState === 'entering' && event.nextState === 'listening') {
        hooks.onConversationActive?.();
      } else if (event.nextState === 'ending') {
        hooks.onConversationEnding?.();
      } else if (event.previousState === 'ending' && event.nextState === 'idle') {
        hooks.onReturnToCompanionEyes?.();
      }
    });

    const unsubscribeAudio = session.subscribeAudio((levels) => {
      audioLevelsRef.current = levels;
    });

    const onVisibilityChange = () => {
      session.handleVisibilityChange(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribeState();
      unsubscribeAudio();
      session.dispose();
      sessionRef.current = null;
      audioLevelsRef.current = { ...ZERO_AUDIO };
      resetStore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKind, applySnapshot, resetStore, setAutoCycleEnabled, refreshAudioDevices]);

  const switchProvider = useCallback((kind: VoiceProviderKind) => {
    if (createSessionRef.current) return;
    setProviderKind(kind);
  }, []);

  const start = useCallback(async (startOpts?: VoiceSessionStartOptions) => {
    const session = sessionRef.current;
    if (!session) return;
    await transitionHooksRef.current?.onPrepareConversationTransition?.();
    await session.start({
      audioInputDeviceId: selectedAudioDeviceIdRef.current,
      ...startOpts,
    });
  }, []);

  const end = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await session.end();
  }, []);

  const retry = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await session.retry();
  }, []);

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);

  const toggleMute = useCallback(() => {
    sessionRef.current?.toggleMute();
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    sessionRef.current?.setMuted(muted);
  }, []);

  const subscribeAudio = useCallback((listener: VoiceAudioListener) => {
    const session = sessionRef.current;
    if (!session) return () => {};
    return session.subscribeAudio(listener);
  }, []);

  const subscribeUserTranscript = useCallback(
    (listener: (text: string, isFinal: boolean) => void) => {
      const session = sessionRef.current;
      if (session instanceof GeminiLiveVoiceSession) {
        return session.subscribeUserTranscript(listener);
      }
      return () => {};
    },
    []
  );

  const getSessionInstance = useCallback(() => sessionRef.current, []);

  const devTriggerState = useCallback((target: VoiceSessionState) => {
    const session = sessionRef.current;
    if (hasMockVoiceControls(session)) {
      session.triggerStateForDev(target);
    }
  }, []);

  const devTriggerError = useCallback((code: VoiceSessionErrorCode) => {
    const session = sessionRef.current;
    if (hasMockVoiceControls(session)) {
      session.triggerSimulatedError(code);
    }
  }, []);

  const devTriggerSpeechBurst = useCallback(() => {
    const session = sessionRef.current;
    if (hasMockVoiceControls(session)) {
      session.triggerSimulatedSpeechBurst();
    }
  }, []);

  const devSetAutoCycle = useCallback(
    (enabled: boolean) => {
      const session = sessionRef.current;
      if (hasMockVoiceControls(session)) {
        session.setAutoCycle(enabled);
        setAutoCycleEnabled(enabled);
      }
    },
    [setAutoCycleEnabled]
  );

  const getDiagnosticsMetrics = useCallback((): VoiceSessionMetrics | null => {
    const session = sessionRef.current;
    if (hasVoiceDiagnostics(session)) {
      return session.getMetrics();
    }
    return null;
  }, []);

  const getDebugTranscripts = useCallback((): readonly TransientDebugTranscript[] => {
    const session = sessionRef.current;
    if (hasVoiceDiagnostics(session)) {
      return session.getDebugTranscripts();
    }
    return [];
  }, []);

  const setDebugTranscriptionEnabled = useCallback((enabled: boolean) => {
    setDebugTranscriptionState(enabled);
    const session = sessionRef.current;
    if (hasVoiceDiagnostics(session)) {
      session.setDebugTranscriptionEnabled(enabled);
    }
  }, []);

  return {
    state,
    previousState,
    isActive: isActiveVoiceState(state),
    canInterrupt: canInterruptVoiceState(state),
    isMuted,
    isSimulated,
    providerId,
    providerKind,
    isLiveEndpointConfigured: resolvedConfig.isLiveConfigured,
    sessionId,
    error,
    autoCycleEnabled,
    supportsDevControls,
    supportsDiagnostics,
    audioInputDevices,
    selectedAudioDeviceId,
    setSelectedAudioDeviceId,
    refreshAudioDevices,
    switchProvider,
    audioLevelsRef,
    subscribeAudio,
    subscribeUserTranscript,
    getSessionInstance,
    start,
    end,
    retry,
    interrupt,
    toggleMute,
    setMuted,
    devTriggerState,
    devTriggerError,
    devTriggerSpeechBurst,
    devSetAutoCycle,
    getDiagnosticsMetrics,
    getDebugTranscripts,
    debugTranscriptionEnabled,
    setDebugTranscriptionEnabled,
  };
}
