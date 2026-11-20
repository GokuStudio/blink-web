/**
 * Autonomous Personality Zustand Store
 * 
 * Coordinates the PersonalityEngine with DeviceStore, TrackingStore,
 * WellnessStore, and document visibility lifecycle.
 */

import { create } from 'zustand';
import {
  PersonalityConfig,
  PersonalityContext,
  PersonalityDiagnostics,
  ExpressionOwner,
  SpontaneousExpression,
} from './types';
import { PersonalityEngine } from './personalityEngine';
import { useDeviceStore } from '../state';
import { useTrackingStore } from '../state/trackingStore';
import { useWellnessStore } from '../wellness/wellnessStore';
import { BlinkExpressionType } from '@/shared/contracts';

export interface PersonalityStoreState {
  config: PersonalityConfig;
  diagnostics: PersonalityDiagnostics;
  owner: ExpressionOwner;
  currentSpontaneous: SpontaneousExpression | null;
  isRunning: boolean;

  // Lifecycle
  startEngine: () => void;
  stopEngine: () => void;
  toggleEnabled: (enabled?: boolean) => void;
  toggleTestSuppression: (suppressed?: boolean) => void;
  updateConfig: (partial: Partial<PersonalityConfig>) => void;
  setSeed: (seed: number) => void;
  triggerNextExpression: (force?: boolean) => void;
  resetOwnership: () => void;

  // Context & Priority Interruption hooks
  onUserExpression: (expr: BlinkExpressionType) => void;
  onRemoteCommand: (expr: BlinkExpressionType, durationSeconds?: number) => void;
  onNudgeStart: () => void;
  onNudgeComplete: () => void;
  onListeningMode: (active: boolean) => void;

  // Internal evaluation tick
  evaluateTick: (now?: number) => void;
  getContext: (now?: number) => PersonalityContext;
}

export const personalityEngineInstance = new PersonalityEngine();

let evaluationIntervalId: NodeJS.Timeout | null = null;
let activeRestorationTimerId: NodeJS.Timeout | null = null;
let remoteCommandTimerId: NodeJS.Timeout | null = null;
let visibilityListenerAttached = false;

export const usePersonalityStore = create<PersonalityStoreState>((set, get) => {
  const getContext = (): PersonalityContext => {
    const deviceState = useDeviceStore.getState();
    const trackingState = useTrackingStore.getState();
    const wellnessState = useWellnessStore.getState();
    const currentOwner = get().owner;
    const isDocVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;

    const isMirroringActive =
      trackingState.isMirroringEnabled &&
      trackingState.isCameraActive &&
      trackingState.isFaceDetected;

    return {
      isCameraActive: trackingState.isCameraActive,
      isMirroringActive,
      isFaceDetected: trackingState.isFaceDetected,
      isMonitoringActive: wellnessState.isMonitoringActive,
      isMonitoringPaused: wellnessState.metrics.mode === 'paused',
      isNudgeActive:
        wellnessState.metrics.state === 'nudging' ||
        deviceState.expression === 'nudging' ||
        currentOwner === 'nudge',
      isListeningActive:
        deviceState.expression === 'listening' ||
        currentOwner === 'voice',
      isDocumentVisible: isDocVisible,
      currentOwner,
      currentExpression: deviceState.expression,
    };
  };

  const syncDiagnostics = (now: number = performance.now()) => {
    const ctx = getContext();
    const diag = personalityEngineInstance.getDiagnostics(ctx, now);
    set({
      config: personalityEngineInstance.getConfig(),
      diagnostics: diag,
    });
  };

  const clearRestorationTimer = () => {
    if (activeRestorationTimerId) {
      clearTimeout(activeRestorationTimerId);
      activeRestorationTimerId = null;
    }
  };

  const clearRemoteCommandTimer = () => {
    if (remoteCommandTimerId) {
      clearTimeout(remoteCommandTimerId);
      remoteCommandTimerId = null;
    }
  };

  const handleVisibilityChange = () => {
    const now = performance.now();
    get().evaluateTick(now);
  };

  return {
    config: personalityEngineInstance.getConfig(),
    diagnostics: personalityEngineInstance.getDiagnostics(
      {
        isCameraActive: false,
        isMirroringActive: false,
        isFaceDetected: false,
        isMonitoringActive: false,
        isMonitoringPaused: false,
        isNudgeActive: false,
        isListeningActive: false,
        isDocumentVisible: true,
        currentOwner: 'default',
        currentExpression: 'idle',
      },
      0
    ),
    owner: 'default',
    currentSpontaneous: null,
    isRunning: false,

    getContext,

    startEngine: () => {
      if (get().isRunning) return;

      if (!visibilityListenerAttached && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        visibilityListenerAttached = true;
      }

      set({ isRunning: true });
      const now = performance.now();
      personalityEngineInstance.reset(get().config.seed, now);
      syncDiagnostics(now);

      if (evaluationIntervalId) clearInterval(evaluationIntervalId);
      // Run evaluation tick at ~500ms cadence
      evaluationIntervalId = setInterval(() => {
        get().evaluateTick();
      }, 500);
    },

    stopEngine: () => {
      if (evaluationIntervalId) {
        clearInterval(evaluationIntervalId);
        evaluationIntervalId = null;
      }
      clearRestorationTimer();
      clearRemoteCommandTimer();

      if (visibilityListenerAttached && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        visibilityListenerAttached = false;
      }

      const now = performance.now();
      personalityEngineInstance.cancelActiveAction(now);
      set({ isRunning: false, currentSpontaneous: null });
      syncDiagnostics(now);
    },

    toggleEnabled: (enabled) => {
      const next = enabled !== undefined ? enabled : !get().config.enabled;
      personalityEngineInstance.setConfig({ enabled: next }, performance.now());
      if (!next) {
        clearRestorationTimer();
        if (get().owner === 'personality') {
          useDeviceStore.getState().setExpression('idle');
          set({ owner: 'default', currentSpontaneous: null });
        }
      }
      syncDiagnostics();
    },

    toggleTestSuppression: (suppressed) => {
      const next = suppressed !== undefined ? suppressed : !get().config.testSuppressed;
      personalityEngineInstance.setConfig({ testSuppressed: next }, performance.now());
      if (next && get().owner === 'personality') {
        clearRestorationTimer();
        useDeviceStore.getState().setExpression('idle');
        set({ owner: 'default', currentSpontaneous: null });
      }
      syncDiagnostics();
    },

    updateConfig: (partial) => {
      personalityEngineInstance.setConfig(partial, performance.now());
      syncDiagnostics();
    },

    setSeed: (seed) => {
      personalityEngineInstance.setSeed(seed, performance.now());
      syncDiagnostics();
    },

    triggerNextExpression: (force = true) => {
      const now = performance.now();
      const ctx = getContext();
      const decision = personalityEngineInstance.triggerNext(ctx, now, force);

      if (decision.action === 'trigger' && decision.expression && decision.durationMs) {
        clearRestorationTimer();
        const genToken = decision.generationToken;
        const expr = decision.expression as SpontaneousExpression;

        set({
          owner: 'personality',
          currentSpontaneous: expr,
        });
        useDeviceStore.getState().setExpression(expr);
        syncDiagnostics(now);

        // Schedule deterministic return to neutral
        activeRestorationTimerId = setTimeout(() => {
          // Strictly verify generation token and ownership before restoring neutral
          if (
            personalityEngineInstance.getGenerationToken() === genToken &&
            get().owner === 'personality'
          ) {
            useDeviceStore.getState().setExpression('idle');
            set({ owner: 'default', currentSpontaneous: null });
            syncDiagnostics();
          }
        }, decision.durationMs);
      } else {
        syncDiagnostics(now);
      }
    },

    resetOwnership: () => {
      clearRestorationTimer();
      clearRemoteCommandTimer();
      personalityEngineInstance.cancelActiveAction(performance.now());
      useDeviceStore.getState().setExpression('idle');
      set({ owner: 'default', currentSpontaneous: null });
      syncDiagnostics();
    },

    onUserExpression: (expr) => {
      clearRestorationTimer();
      clearRemoteCommandTimer();
      personalityEngineInstance.cancelActiveAction(performance.now());

      const nextOwner: ExpressionOwner = expr === 'idle' ? 'default' : 'user';
      set({ owner: nextOwner, currentSpontaneous: null });
      useDeviceStore.getState().setExpression(expr);
      syncDiagnostics();
    },

    onRemoteCommand: (expr, durationSeconds) => {
      clearRestorationTimer();
      clearRemoteCommandTimer();
      personalityEngineInstance.cancelActiveAction(performance.now());

      set({ owner: 'command', currentSpontaneous: null });
      useDeviceStore.getState().setExpression(expr);
      syncDiagnostics();

      if (durationSeconds && durationSeconds > 0) {
        remoteCommandTimerId = setTimeout(() => {
          if (get().owner === 'command') {
            useDeviceStore.getState().setExpression('idle');
            set({ owner: 'default', currentSpontaneous: null });
            syncDiagnostics();
          }
        }, durationSeconds * 1000);
      }
    },

    onNudgeStart: () => {
      clearRestorationTimer();
      personalityEngineInstance.cancelActiveAction(performance.now());
      set({ owner: 'nudge', currentSpontaneous: null });
      useDeviceStore.getState().setExpression('nudging');
      syncDiagnostics();
    },

    onNudgeComplete: () => {
      if (get().owner === 'nudge') {
        set({ owner: 'default', currentSpontaneous: null });
        useDeviceStore.getState().setExpression('idle');
      }
      syncDiagnostics();
    },

    onListeningMode: (active) => {
      clearRestorationTimer();
      personalityEngineInstance.cancelActiveAction(performance.now());
      if (active) {
        set({ owner: 'voice', currentSpontaneous: null });
        useDeviceStore.getState().setExpression('listening');
      } else if (get().owner === 'voice') {
        set({ owner: 'default', currentSpontaneous: null });
        useDeviceStore.getState().setExpression('idle');
      }
      syncDiagnostics();
    },

    evaluateTick: (now = performance.now()) => {
      const ctx = getContext();
      const decision = personalityEngineInstance.evaluate(ctx, now);

      if (decision.action === 'trigger' && decision.expression && decision.durationMs) {
        clearRestorationTimer();
        const genToken = decision.generationToken;
        const expr = decision.expression as SpontaneousExpression;

        set({
          owner: 'personality',
          currentSpontaneous: expr,
        });
        useDeviceStore.getState().setExpression(expr);
        syncDiagnostics(now);

        // Schedule safe return to neutral
        activeRestorationTimerId = setTimeout(() => {
          if (
            personalityEngineInstance.getGenerationToken() === genToken &&
            get().owner === 'personality'
          ) {
            useDeviceStore.getState().setExpression('idle');
            set({ owner: 'default', currentSpontaneous: null });
            syncDiagnostics();
          }
        }, decision.durationMs);
      } else if (decision.action === 'return_to_neutral') {
        if (get().owner === 'personality') {
          useDeviceStore.getState().setExpression('idle');
          set({ owner: 'default', currentSpontaneous: null });
        }
        syncDiagnostics(now);
      } else {
        syncDiagnostics(now);
      }
    },
  };
});
