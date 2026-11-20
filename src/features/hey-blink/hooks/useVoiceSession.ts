import { useCallback, useEffect, useRef, useState } from 'react';
import { MockVoiceSession } from '../services/mock-voice-session';
import {
  DeviceExperienceTransitionHooks,
  hasMockVoiceControls,
  IVoiceSession,
  VoiceAudioLevels,
  VoiceAudioListener,
  VoiceSessionErrorCode,
  VoiceSessionStartOptions,
  VoiceSessionState,
} from '../services/voice-session.interface';
import { canInterruptVoiceState, isActiveVoiceState } from '../services/voice-state-machine';
import { useVoiceStore } from '../state/voice.store';

export interface UseVoiceSessionOptions {
  /** Factory for constructing the active IVoiceSession implementation */
  createSession?: () => IVoiceSession;
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
  sessionId: string | null;
  error: ReturnType<typeof useVoiceStore.getState>['error'];
  autoCycleEnabled: boolean;
  supportsDevControls: boolean;

  /** High-frequency ref updated every audio tick with ZERO React re-renders */
  audioLevelsRef: React.MutableRefObject<VoiceAudioLevels>;
  /** Subscribe directly to audio frames for imperative DOM / Canvas visualizers */
  subscribeAudio: (listener: VoiceAudioListener) => () => void;

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
}

const ZERO_AUDIO: VoiceAudioLevels = {
  inputLevel: 0,
  outputLevel: 0,
  timestamp: 0,
  isSimulated: true,
};

function defaultCreateSession(): IVoiceSession {
  return new MockVoiceSession({ autoCycle: true });
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSessionResult {
  const { createSession = defaultCreateSession, transitionHooks } = options;

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

  const [supportsDevControls, setSupportsDevControls] = useState(false);

  useEffect(() => {
    const session = createSessionRef.current();
    sessionRef.current = session;

    applySnapshot(session.getSnapshot());
    const hasDevControls = hasMockVoiceControls(session);
    setSupportsDevControls(hasDevControls);
    if (hasDevControls) {
      setAutoCycleEnabled(session.isAutoCycleEnabled());
    }

    const unsubscribeState = session.subscribeState((event) => {
      applySnapshot(event.snapshot);

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
  }, [applySnapshot, resetStore, setAutoCycleEnabled]);

  const start = useCallback(async (startOpts?: VoiceSessionStartOptions) => {
    const session = sessionRef.current;
    if (!session) return;
    await transitionHooksRef.current?.onPrepareConversationTransition?.();
    await session.start(startOpts);
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

  return {
    state,
    previousState,
    isActive: isActiveVoiceState(state),
    canInterrupt: canInterruptVoiceState(state),
    isMuted,
    isSimulated,
    providerId,
    sessionId,
    error,
    autoCycleEnabled,
    supportsDevControls,
    audioLevelsRef,
    subscribeAudio,
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
  };
}
