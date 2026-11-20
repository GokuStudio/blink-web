/**
 * Eye Tracking Zustand Store & Orchestration
 * Coordinates CameraService, FaceLandmarkerService, BlinkClassifier, and EyeTrackingBridge.
 */

import { create } from 'zustand';
import {
  TrackingMetrics,
  BlinkClassifierConfig,
  TrackingFrameResult,
} from '../tracking/types';
import { CameraService } from '../tracking/cameraService';
import { FaceLandmarkerService } from '../tracking/faceLandmarkerService';
import {
  BlinkClassifier,
  CalibrationOffsets,
  DEFAULT_CLASSIFIER_CONFIG,
} from '../tracking/blinkClassifier';
import { eyeTrackingBridge } from '../tracking/eyeTrackingBridge';
import { useWellnessStore } from '../wellness/wellnessStore';

export interface TrackingStoreState extends TrackingMetrics {
  isMirroringEnabled: boolean;
  classifierConfig: BlinkClassifierConfig;
  calibrationOffsets: CalibrationOffsets;

  // Additional Step 06 latency & instrumentation metrics
  bridgeLatencyMs: number;
  pipelineLatencyMs: number;
  droppedFrames: number;

  // Actions
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  setMirroringEnabled: (enabled: boolean) => void;
  resetCounters: () => void;
  updateClassifierConfig: (partial: Partial<BlinkClassifierConfig>) => void;
  updateCalibration: (offsets: Partial<CalibrationOffsets>) => void;

  // Synthetic Test Inputs (Step 06 Requirement 9)
  simulateBlink: (durationMs?: number) => Promise<void>;
  simulateWink: (side: 'left' | 'right', durationMs?: number) => Promise<void>;
  simulateSlowClosure: (durationMs?: number) => Promise<void>;
  simulateFaceLoss: () => void;
}

// Global coordinator singletons for lifecycle preservation
let cameraServiceInstance: CameraService | null = null;
let landmarkerServiceInstance: FaceLandmarkerService | null = null;
const classifierInstance = new BlinkClassifier();
let syntheticTimer: NodeJS.Timeout | null = null;

export const useTrackingStore = create<TrackingStoreState>((set, get) => {
  const dispatchTrackingFrame = (frame: TrackingFrameResult) => {
    eyeTrackingBridge.updateFromTracking(frame);
    const event = classifierInstance.processFrame(frame);
    const counters = classifierInstance.getCounters();
    const metrics = eyeTrackingBridge.getMetrics();

    // Feed wellness engine
    useWellnessStore.getState().onTrackingUpdate(
      get().isCameraActive,
      frame.isFaceDetected,
      frame.trackingConfidence,
      frame.timestamp
    );
    if (event) {
      useWellnessStore.getState().onBlinkEvent(event, frame.timestamp);
    }

    set({
      closureLeft: frame.closureLeft,
      closureRight: frame.closureRight,
      isFaceDetected: frame.isFaceDetected,
      trackingConfidence: frame.trackingConfidence,
      blinkCount: counters.blinkCount,
      leftWinkCount: counters.leftWinkCount,
      rightWinkCount: counters.rightWinkCount,
      lastEvent: event || get().lastEvent,
      bridgeLatencyMs: metrics.bridgeLatencyMs,
      pipelineLatencyMs: metrics.pipelineLatencyMs,
      droppedFrames: metrics.droppedFrames,
    });
  };

  return {
    permissionState: 'idle',
    isCameraActive: false,
    isModelLoaded: false,
    isModelLoading: false,
    modelError: null,
    cameraError: null,
    isMirroringEnabled: true,

    closureLeft: 0,
    closureRight: 0,
    isFaceDetected: false,
    trackingConfidence: 0,

    inferenceFps: 0,
    averageLatencyMs: 0,
    bridgeLatencyMs: 0,
    pipelineLatencyMs: 0,
    droppedFrames: 0,

    blinkCount: 0,
    leftWinkCount: 0,
    rightWinkCount: 0,
    lastEvent: null,

    isSimulated: false, // Tagged per AGENTS.md
    classifierConfig: { ...DEFAULT_CLASSIFIER_CONFIG },
    calibrationOffsets: { leftOffset: 0, rightOffset: 0 },

    setMirroringEnabled: (enabled) => {
      eyeTrackingBridge.setMirroringEnabled(enabled);
      set({ isMirroringEnabled: enabled });
    },

    startTracking: async () => {
      const state = get();
      if (state.isCameraActive) return;

      set({ cameraError: null, modelError: null });

      // Initialize CameraService
      if (!cameraServiceInstance) {
        cameraServiceInstance = new CameraService({
          onPermissionChange: (permState) => set({ permissionState: permState }),
          onError: (err) => set({ cameraError: err.message }),
          onStreamInterrupted: () => {
            get().stopTracking();
          },
        });
      }

      // Initialize FaceLandmarkerService
      if (!landmarkerServiceInstance) {
        landmarkerServiceInstance = new FaceLandmarkerService({
          onModelLoaded: () => set({ isModelLoaded: true, isModelLoading: false }),
          onError: (err) => set({ modelError: err.message, isModelLoading: false }),
          onFpsUpdate: (fps, avgLat) => set({ inferenceFps: fps, averageLatencyMs: avgLat }),
          onFrame: (frame) => {
            dispatchTrackingFrame(frame);
          },
        });
      }

      try {
        const stream = await cameraServiceInstance.start();
        set({ isCameraActive: true });
        eyeTrackingBridge.setTrackingActive(true);

        if (!landmarkerServiceInstance.isReady()) {
          set({ isModelLoading: true });
          await landmarkerServiceInstance.initialize();
        }

        landmarkerServiceInstance.start(stream);
      } catch (err: unknown) {
        get().stopTracking();
        const message = err instanceof Error ? err.message : String(err);
        set({ cameraError: message });
        throw err;
      }
    },

    stopTracking: () => {
      if (syntheticTimer) {
        clearInterval(syntheticTimer);
        syntheticTimer = null;
      }
      if (landmarkerServiceInstance) {
        landmarkerServiceInstance.stop();
      }
      if (cameraServiceInstance) {
        cameraServiceInstance.stop();
      }

      eyeTrackingBridge.setTrackingActive(false);
      useWellnessStore.getState().onTrackingUpdate(false, false, 0.0);

      set({
        isCameraActive: false,
        closureLeft: 0,
        closureRight: 0,
        isFaceDetected: false,
        trackingConfidence: 0,
        inferenceFps: 0,
      });
    },

    resetCounters: () => {
      classifierInstance.reset();
      eyeTrackingBridge.reset();
      set({
        blinkCount: 0,
        leftWinkCount: 0,
        rightWinkCount: 0,
        lastEvent: null,
      });
    },

    updateClassifierConfig: (partial) => {
      classifierInstance.setConfig(partial);
      set({ classifierConfig: classifierInstance.getConfig() });
    },

    updateCalibration: (offsets) => {
      classifierInstance.setCalibrationOffsets(offsets);
      set({ calibrationOffsets: classifierInstance.getCalibrationOffsets() });
    },

    // ==========================================
    // SYNTHETIC INPUT TESTING DRIVERS
    // ==========================================

    simulateBlink: (durationMs = 180) => {
      if (syntheticTimer) clearInterval(syntheticTimer);
      eyeTrackingBridge.setTrackingActive(true);

      return new Promise<void>((resolve) => {
        const start = performance.now();
        const interval = 16;

        syntheticTimer = setInterval(() => {
          const elapsed = performance.now() - start;
          const now = performance.now();

          if (elapsed >= durationMs) {
            clearInterval(syntheticTimer!);
            syntheticTimer = null;
            dispatchTrackingFrame({
              timestamp: now,
              closureLeft: 0.05,
              closureRight: 0.05,
              isFaceDetected: true,
              trackingConfidence: 1.0,
              inferenceDurationMs: 14.2,
            });
            resolve();
            return;
          }

          const p = elapsed / durationMs;
          let score = 0.05;
          if (p < 0.35) {
            score = 0.05 + 0.85 * (p / 0.35);
          } else if (p < 0.50) {
            score = 0.90;
          } else {
            score = 0.90 - 0.85 * ((p - 0.50) / 0.50);
          }

          dispatchTrackingFrame({
            timestamp: now,
            closureLeft: score,
            closureRight: score,
            isFaceDetected: true,
            trackingConfidence: 1.0,
            inferenceDurationMs: 14.5,
          });
        }, interval);
      });
    },

    simulateWink: (side: 'left' | 'right', durationMs = 180) => {
      if (syntheticTimer) clearInterval(syntheticTimer);
      eyeTrackingBridge.setTrackingActive(true);

      return new Promise<void>((resolve) => {
        const start = performance.now();
        const interval = 16;

        syntheticTimer = setInterval(() => {
          const elapsed = performance.now() - start;
          const now = performance.now();

          if (elapsed >= durationMs) {
            clearInterval(syntheticTimer!);
            syntheticTimer = null;
            dispatchTrackingFrame({
              timestamp: now,
              closureLeft: 0.05,
              closureRight: 0.05,
              isFaceDetected: true,
              trackingConfidence: 1.0,
              inferenceDurationMs: 14.2,
            });
            resolve();
            return;
          }

          const p = elapsed / durationMs;
          let score = 0.05;
          if (p < 0.35) {
            score = 0.05 + 0.85 * (p / 0.35);
          } else if (p < 0.50) {
            score = 0.90;
          } else {
            score = 0.90 - 0.85 * ((p - 0.50) / 0.50);
          }

          dispatchTrackingFrame({
            timestamp: now,
            closureLeft: side === 'left' ? score : 0.05,
            closureRight: side === 'right' ? score : 0.05,
            isFaceDetected: true,
            trackingConfidence: 1.0,
            inferenceDurationMs: 14.5,
          });
        }, interval);
      });
    },

    simulateSlowClosure: (durationMs = 600) => {
      if (syntheticTimer) clearInterval(syntheticTimer);
      eyeTrackingBridge.setTrackingActive(true);

      return new Promise<void>((resolve) => {
        const start = performance.now();
        const interval = 20;

        syntheticTimer = setInterval(() => {
          const elapsed = performance.now() - start;
          const now = performance.now();

          if (elapsed >= durationMs) {
            clearInterval(syntheticTimer!);
            syntheticTimer = null;
            dispatchTrackingFrame({
              timestamp: now,
              closureLeft: 0.05,
              closureRight: 0.05,
              isFaceDetected: true,
              trackingConfidence: 1.0,
              inferenceDurationMs: 14.0,
            });
            resolve();
            return;
          }

          const p = elapsed / durationMs;
          const score = p < 0.70 ? 0.05 + 0.80 * (p / 0.70) : 0.85 - 0.80 * ((p - 0.70) / 0.30);

          dispatchTrackingFrame({
            timestamp: now,
            closureLeft: score,
            closureRight: score,
            isFaceDetected: true,
            trackingConfidence: 1.0,
            inferenceDurationMs: 14.0,
          });
        }, interval);
      });
    },

    simulateFaceLoss: () => {
      if (syntheticTimer) {
        clearInterval(syntheticTimer);
        syntheticTimer = null;
      }
      dispatchTrackingFrame({
        timestamp: performance.now(),
        closureLeft: 0,
        closureRight: 0,
        isFaceDetected: false,
        trackingConfidence: 0,
        inferenceDurationMs: 0,
      });
    },
  };
});
