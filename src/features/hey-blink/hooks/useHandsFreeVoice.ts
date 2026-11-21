import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioResourceManager } from '../audio/audio-resource-manager';
import {
  HandsFreeConversationController,
  type HandsFreeSnapshot,
} from '../conversation/hands-free-conversation-controller';
import type {
  DeviceExperienceTransitionHooks,
  IVoiceSession,
  VoiceProviderKind,
} from '../services/voice-session.interface';
import type { IWakeWordEngine } from '../wake-word/wake-word.interface';
import { WakeWordService } from '../wake-word/wake-word.service';
import { useVoiceSession, type UseVoiceSessionResult } from './useVoiceSession';

export interface UseHandsFreeVoiceOptions {
  createSession?: () => IVoiceSession;
  initialProvider?: VoiceProviderKind;
  transitionHooks?: DeviceExperienceTransitionHooks;
  wakeWordEngine?: IWakeWordEngine;
}

export interface UseHandsFreeVoiceResult extends UseVoiceSessionResult {
  handsFree: HandsFreeSnapshot;
  enableHandsFree: () => Promise<void>;
  disableHandsFree: () => Promise<void>;
  devTriggerWakeWord: () => void;
  devSimulateUserTranscript: (text: string, isFinal?: boolean) => void;
}

const INITIAL_HANDS_FREE_SNAPSHOT: HandsFreeSnapshot = {
  activationState: 'wake_unavailable',
  previousActivationState: null,
  userConsentEnabled: false,
  micOwner: 'none',
  wakeEngineId: 'on-device-model-pending',
  wakeEngineStatus: 'uninitialized',
  wakePhrase: 'Hey Blink',
  requiresUserGestureToResume: false,
  isLiveAudioTransmitting: false,
  statusMessage: null,
  lastError: null,
  lastWakeEvent: null,
  lastEndEvaluation: null,
  metrics: {
    wakeToConversationReadyMs: null,
    micHandoverDelayMs: null,
    wakeRearmDelayMs: null,
    conversationsCompleted: 0,
    suppressedDuplicateWakes: 0,
    rejectedEndFalsePositives: 0,
  },
};

/**
 * Coordinates Phase H2.5 HandsFreeConversationController alongside H1/H2 `useVoiceSession`.
 * React.StrictMode-safe and guarantees clean microphone + wake-word teardown on unmount.
 */
export function useHandsFreeVoice(
  options: UseHandsFreeVoiceOptions = {}
): UseHandsFreeVoiceResult {
  const { createSession, initialProvider, transitionHooks, wakeWordEngine } = options;

  const voice = useVoiceSession({
    createSession,
    initialProvider,
    transitionHooks,
  });

  const [handsFree, setHandsFree] = useState<HandsFreeSnapshot>(INITIAL_HANDS_FREE_SNAPSHOT);

  const controllerRef = useRef<HandsFreeConversationController | null>(null);
  const wakeEngineRef = useRef(wakeWordEngine);
  wakeEngineRef.current = wakeWordEngine;
  const hooksRef = useRef(transitionHooks);
  hooksRef.current = transitionHooks;
  const selectedDeviceRef = useRef(voice.selectedAudioDeviceId);
  selectedDeviceRef.current = voice.selectedAudioDeviceId;

  const { getSessionInstance, subscribeUserTranscript, providerKind } = voice;

  useEffect(() => {
    const audioManager = new AudioResourceManager();
    const wakeWordService = new WakeWordService({
      engine: wakeEngineRef.current,
    });

    const controller = new HandsFreeConversationController({
      audioManager,
      wakeWordService,
      getVoiceSession: getSessionInstance,
      // transitionHooks are already fired by useVoiceSession; omit here to avoid double-firing
    });

    controllerRef.current = controller;
    setHandsFree(controller.getSnapshot());

    const unsubscribeController = controller.subscribe((snapshot) => {
      setHandsFree(snapshot);
    });

    const unsubscribeTranscript = subscribeUserTranscript((text, isFinal) => {
      controller.evaluateUserTranscript(text, isFinal);
    });

    const onVisibilityChange = () => {
      controller.handleVisibilityChange(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribeTranscript();
      unsubscribeController();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [providerKind, getSessionInstance, subscribeUserTranscript]);

  useEffect(() => {
    controllerRef.current?.setSelectedAudioDeviceId(voice.selectedAudioDeviceId);
  }, [voice.selectedAudioDeviceId]);

  const startWithNaturalEnding = useCallback(
    async (startOpts?: Parameters<UseVoiceSessionResult['start']>[0]) => {
      if (controllerRef.current) {
        await hooksRef.current?.onPrepareConversationTransition?.();
        await controllerRef.current.startConversationDirect({
          deviceId: startOpts?.audioInputDeviceId ?? selectedDeviceRef.current,
          initialMuted: startOpts?.initialMuted,
        });
        return;
      }
      await voice.start(startOpts);
    },
    [voice.start]
  );

  const endWithCleanup = useCallback(async () => {
    if (controllerRef.current) {
      await controllerRef.current.endConversationDirect();
      return;
    }
    await voice.end();
  }, [voice.end]);

  const retryWithNaturalEnding = useCallback(async () => {
    if (controllerRef.current) {
      await controllerRef.current.startConversationDirect({
        deviceId: selectedDeviceRef.current,
      });
      return;
    }
    await voice.retry();
  }, [voice.retry]);

  const enableHandsFree = useCallback(async () => {
    await controllerRef.current?.enableHandsFree({
      deviceId: selectedDeviceRef.current,
    });
  }, []);

  const disableHandsFree = useCallback(async () => {
    await controllerRef.current?.disableHandsFree('user_disabled_microphone');
  }, []);

  const devTriggerWakeWord = useCallback(() => {
    controllerRef.current?.triggerWakeForDev();
  }, []);

  const devSimulateUserTranscript = useCallback((text: string, isFinal = true) => {
    controllerRef.current?.evaluateUserTranscript(text, isFinal);
  }, []);

  return {
    ...voice,
    start: startWithNaturalEnding,
    end: endWithCleanup,
    retry: retryWithNaturalEnding,
    handsFree,
    enableHandsFree,
    disableHandsFree,
    devTriggerWakeWord,
    devSimulateUserTranscript,
  };
}
