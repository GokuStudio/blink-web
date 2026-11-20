/**
 * Wellness Monitoring & Automatic Nudge Zustand Store
 * Orchestrates the WellnessEngine with TrackingStore and DeviceStore.
 */

import { create } from 'zustand';
import {
  WellnessEngineConfig,
  WellnessMetrics,
} from './types';
import { WellnessEngine, DEFAULT_WELLNESS_CONFIG } from './wellnessEngine';
import { useDeviceStore } from '../state';
import { BlinkEvent } from '../tracking/types';
import { BlinkExpressionType } from '@/shared/contracts';

export interface WellnessStoreState {
  metrics: WellnessMetrics;
  config: WellnessEngineConfig;
  isMonitoringActive: boolean;
  isAutoNudgeEnabled: boolean;

  // Lifecycle
  startMonitoring: () => void;
  pauseMonitoring: () => void;
  resumeMonitoring: () => void;
  stopMonitoring: () => void;
  resetMonitoring: () => void;
  updateConfig: (partial: Partial<WellnessEngineConfig>) => void;
  toggleAutoNudge: (enabled?: boolean) => void;
  forceCooldownExpiration: () => void;
  triggerManualNudge: () => void;

  // Pipeline feeding methods
  onBlinkEvent: (event: BlinkEvent, now?: number) => void;
  onTrackingUpdate: (isTrackingActive: boolean, isFaceDetected: boolean, confidence: number, now?: number) => void;
  onNudgeFinished: () => void;

  // Deterministic Simulation Controls (Requirement 9)
  simulateNormalBlinking: () => Promise<void>;
  simulateProlongedStare: () => Promise<void>;
  simulateLowBlinkRate: () => Promise<void>;
  simulateFaceLoss: () => void;
}

export const wellnessEngineInstance = new WellnessEngine();
let previousExpressionBeforeNudge: BlinkExpressionType = 'idle';
let simulationTimer: NodeJS.Timeout | null = null;

export const useWellnessStore = create<WellnessStoreState>((set, get) => {
  const syncMetrics = (now: number = performance.now()) => {
    set({
      metrics: wellnessEngineInstance.getMetrics(now),
      config: wellnessEngineInstance.getConfig(),
      isMonitoringActive: wellnessEngineInstance.getMetrics(now).mode === 'active',
      isAutoNudgeEnabled: wellnessEngineInstance.getConfig().autoNudgeEnabled,
    });
  };

  const executeNudgeTrigger = (reason: 'prolonged_stare' | 'low_blink_rate' | 'manual_test', urgency: 'low' | 'medium' | 'high', now: number = performance.now()) => {
    const currentExpr = useDeviceStore.getState().expression;
    if (currentExpr !== 'nudging') {
      previousExpressionBeforeNudge = currentExpr;
    }

    wellnessEngineInstance.triggerNudge(reason, urgency, now);
    useDeviceStore.getState().setExpression('nudging');
    syncMetrics(now);
  };

  return {
    metrics: wellnessEngineInstance.getMetrics(),
    config: { ...DEFAULT_WELLNESS_CONFIG },
    isMonitoringActive: false,
    isAutoNudgeEnabled: true,

    startMonitoring: () => {
      const now = performance.now();
      wellnessEngineInstance.startMonitoring(now);
      syncMetrics(now);
    },

    pauseMonitoring: () => {
      wellnessEngineInstance.pauseMonitoring();
      syncMetrics();
    },

    resumeMonitoring: () => {
      const now = performance.now();
      wellnessEngineInstance.resumeMonitoring(now);
      syncMetrics(now);
    },

    stopMonitoring: () => {
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
      }
      wellnessEngineInstance.stopMonitoring();
      syncMetrics();
    },

    resetMonitoring: () => {
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
      }
      wellnessEngineInstance.reset();
      syncMetrics();
    },

    updateConfig: (partial) => {
      wellnessEngineInstance.setConfig(partial);
      syncMetrics();
    },

    toggleAutoNudge: (enabled) => {
      const next = enabled !== undefined ? enabled : !get().isAutoNudgeEnabled;
      wellnessEngineInstance.setAutoNudgeEnabled(next);
      syncMetrics();
    },

    forceCooldownExpiration: () => {
      wellnessEngineInstance.forceCooldownExpiration();
      syncMetrics();
    },

    triggerManualNudge: () => {
      const now = performance.now();
      executeNudgeTrigger('manual_test', 'medium', now);
    },

    onBlinkEvent: (event, now = performance.now()) => {
      wellnessEngineInstance.recordBlink(event, now);

      // If user blinks during an active nudge, they've refreshed their eyes!
      // The reminder succeeded.
      syncMetrics(now);
    },

    onTrackingUpdate: (isTrackingActive, isFaceDetected, confidence, now = performance.now()) => {
      wellnessEngineInstance.updateTrackingStatus(isTrackingActive, isFaceDetected, confidence, now);

      // Evaluate eligibility on fresh tracking frame
      const decision = wellnessEngineInstance.evaluate(now);
      if (decision.eligible && decision.triggerReason && decision.urgency) {
        executeNudgeTrigger(decision.triggerReason, decision.urgency, now);
      } else {
        syncMetrics(now);
      }
    },

    onNudgeFinished: () => {
      wellnessEngineInstance.completeNudge();
      // Restore previous expression safely unless user has changed it in the meantime
      const current = useDeviceStore.getState().expression;
      if (current === 'nudging') {
        useDeviceStore.getState().setExpression(previousExpressionBeforeNudge);
      }
      syncMetrics();
    },

    // ==========================================
    // DETERMINISTIC SIMULATIONS (Requirement 9)
    // ==========================================

    simulateNormalBlinking: () => {
      if (simulationTimer) clearInterval(simulationTimer);
      const { startMonitoring, onTrackingUpdate, onBlinkEvent } = get();
      startMonitoring();

      return new Promise<void>((resolve) => {
        const start = performance.now();
        let lastBlink = start;
        const totalDuration = 12000; // 12s test run

        simulationTimer = setInterval(() => {
          const now = performance.now();
          onTrackingUpdate(true, true, 0.95, now);

          // Blink every 3.2 seconds (~18.75 BPM healthy rate)
          if (now - lastBlink >= 3200) {
            onBlinkEvent(
              {
                type: 'BilateralBlink',
                timestamp: now,
                durationMs: 160,
                leftClosure: 0.85,
                rightClosure: 0.85,
              },
              now
            );
            lastBlink = now;
          }

          if (now - start >= totalDuration) {
            clearInterval(simulationTimer!);
            simulationTimer = null;
            resolve();
          }
        }, 100);
      });
    },

    simulateProlongedStare: () => {
      if (simulationTimer) clearInterval(simulationTimer);
      const { startMonitoring, onTrackingUpdate } = get();
      startMonitoring();

      return new Promise<void>((resolve) => {
        const start = performance.now();
        const duration = 19000; // Stare past 18s threshold

        simulationTimer = setInterval(() => {
          const now = performance.now();
          // Continuously track face without any blink events
          onTrackingUpdate(true, true, 0.95, now);

          const decision = wellnessEngineInstance.evaluate(now);
          if (decision.eligible || now - start >= duration) {
            clearInterval(simulationTimer!);
            simulationTimer = null;
            resolve();
          }
        }, 200);
      });
    },

    simulateLowBlinkRate: () => {
      if (simulationTimer) clearInterval(simulationTimer);
      const { startMonitoring, onTrackingUpdate, onBlinkEvent } = get();
      startMonitoring();

      return new Promise<void>((resolve) => {
        const start = performance.now();
        let lastBlink = start;
        const duration = 32000; // Over 30s observation requirement

        simulationTimer = setInterval(() => {
          const now = performance.now();
          onTrackingUpdate(true, true, 0.95, now);

          // Blink every 8 seconds (7.5 BPM, below 12 BPM threshold)
          if (now - lastBlink >= 8000) {
            onBlinkEvent(
              {
                type: 'BilateralBlink',
                timestamp: now,
                durationMs: 160,
                leftClosure: 0.85,
                rightClosure: 0.85,
              },
              now
            );
            lastBlink = now;
          }

          if (now - start >= duration) {
            clearInterval(simulationTimer!);
            simulationTimer = null;
            resolve();
          }
        }, 250);
      });
    },

    simulateFaceLoss: () => {
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
      }
      get().onTrackingUpdate(true, false, 0.0, performance.now());
    },
  };
});
