/**
 * Deterministic Blink Classifier
 * 
 * Provides robust, hysteresis-based classification of eye blink and wink events
 * from raw facial blendshape closure scores.
 * 
 * Invariants:
 * 1. Bilateral blinks are coalesced and counted as EXACTLY ONE event (never double-counted).
 * 2. Unilateral closures with opposite eye open are classified as Left/Right Wink candidates.
 * 3. Hysteresis prevents high-frequency chatter at boundary scores.
 * 4. Temporal bounds filter single-frame noise (<50ms) and prolonged closures (>450ms).
 * 5. Face loss resets tracking state cleanly without false emissions.
 * 6. Non-medical ergonomic telemetry only.
 */

import {
  BlinkClassifierConfig,
  BlinkEvent,
  EyeClosureState,
  TrackingFrameResult,
} from './types';

export const DEFAULT_CLASSIFIER_CONFIG: BlinkClassifierConfig = {
  closeThreshold: 0.60,
  openThreshold: 0.35,
  minDurationMs: 50,
  maxDurationMs: 450,
  debounceMs: 100,
  coincidenceWindowMs: 60,
};

export interface CalibrationOffsets {
  leftOffset: number;
  rightOffset: number;
}

export class BlinkClassifier {
  private config: BlinkClassifierConfig;
  private calibration: CalibrationOffsets = { leftOffset: 0, rightOffset: 0 };

  private leftEye: EyeClosureState = {
    status: 'OPEN',
    currentScore: 0,
    closedTimestamp: null,
    durationMs: 0,
  };

  private rightEye: EyeClosureState = {
    status: 'OPEN',
    currentScore: 0,
    closedTimestamp: null,
    durationMs: 0,
  };

  private wasConcurrentlyClosed = false;
  private lastBilateralEmissionTime = -Infinity;
  private lastEventTime = -Infinity;
  private lastTimestamp = -Infinity;

  // Event counters
  private blinkCount = 0;
  private leftWinkCount = 0;
  private rightWinkCount = 0;
  private lastEvent: BlinkEvent | null = null;

  constructor(config: Partial<BlinkClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CLASSIFIER_CONFIG, ...config };
  }

  public getConfig(): BlinkClassifierConfig {
    return { ...this.config };
  }

  public setConfig(partial: Partial<BlinkClassifierConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public setCalibrationOffsets(offsets: Partial<CalibrationOffsets>): void {
    this.calibration = { ...this.calibration, ...offsets };
  }

  public getCalibrationOffsets(): CalibrationOffsets {
    return { ...this.calibration };
  }

  public getCounters() {
    return {
      blinkCount: this.blinkCount,
      leftWinkCount: this.leftWinkCount,
      rightWinkCount: this.rightWinkCount,
      lastEvent: this.lastEvent,
    };
  }

  public getEyeStates() {
    return {
      left: { ...this.leftEye },
      right: { ...this.rightEye },
    };
  }

  public reset(): void {
    this.leftEye = {
      status: 'OPEN',
      currentScore: 0,
      closedTimestamp: null,
      durationMs: 0,
    };
    this.rightEye = {
      status: 'OPEN',
      currentScore: 0,
      closedTimestamp: null,
      durationMs: 0,
    };
    this.wasConcurrentlyClosed = false;
    this.lastBilateralEmissionTime = -Infinity;
    this.lastEventTime = -Infinity;
    this.lastTimestamp = -Infinity;
    this.blinkCount = 0;
    this.leftWinkCount = 0;
    this.rightWinkCount = 0;
    this.lastEvent = null;
  }

  /**
   * Process a single video tracking frame.
   * Deterministic, zero side-effects outside class state.
   */
  public processFrame(frame: TrackingFrameResult): BlinkEvent | null {
    const { timestamp } = frame;

    // Handle invalid or duplicate timestamps gracefully
    if (timestamp <= this.lastTimestamp && this.lastTimestamp !== -Infinity) {
      return null;
    }
    this.lastTimestamp = timestamp;

    // 1. Face loss handling: reset ongoing closure immediately
    if (!frame.isFaceDetected) {
      this.handleFaceLoss(timestamp);
      return null;
    }

    // 2. Apply calibration offsets and clamp scores to [0.0, 1.0]
    const rawLeft = Math.max(0, Math.min(1, frame.closureLeft - this.calibration.leftOffset));
    const rawRight = Math.max(0, Math.min(1, frame.closureRight - this.calibration.rightOffset));

    this.leftEye.currentScore = rawLeft;
    this.rightEye.currentScore = rawRight;

    // 3. Process Hysteresis Transitions for Left Eye
    const leftTransition = this.updateEyeHysteresis(this.leftEye, rawLeft, timestamp);

    // 4. Process Hysteresis Transitions for Right Eye
    const rightTransition = this.updateEyeHysteresis(this.rightEye, rawRight, timestamp);

    // Track whether both eyes are closed concurrently
    if (this.leftEye.status === 'CLOSED' && this.rightEye.status === 'CLOSED') {
      this.wasConcurrentlyClosed = true;
    }

    // 5. Evaluate Completed Closures (Transitioned from CLOSED to OPEN)
    const leftFinished = leftTransition === 'REOPENED';
    const rightFinished = rightTransition === 'REOPENED';

    if (!leftFinished && !rightFinished) {
      return null;
    }

    // Determine event classification
    return this.classifyReopenEvents(leftFinished, rightFinished, timestamp, rawLeft, rawRight);
  }

  private updateEyeHysteresis(
    eye: EyeClosureState,
    score: number,
    timestamp: number
  ): 'STABLE' | 'CLOSED' | 'REOPENED' {
    if (eye.status === 'OPEN') {
      if (score >= this.config.closeThreshold) {
        eye.status = 'CLOSED';
        eye.closedTimestamp = timestamp;
        eye.durationMs = 0;
        return 'CLOSED';
      }
      return 'STABLE';
    } else {
      // eye is CLOSED
      if (eye.closedTimestamp !== null) {
        eye.durationMs = timestamp - eye.closedTimestamp;
      }

      if (score <= this.config.openThreshold) {
        eye.status = 'OPEN';
        const finalDuration = eye.durationMs;
        eye.closedTimestamp = null;

        // Check duration bounds
        if (finalDuration >= this.config.minDurationMs && finalDuration <= this.config.maxDurationMs) {
          return 'REOPENED';
        }
        // If > maxDurationMs, was prolonged closure; if < minDurationMs, was noise
        return 'STABLE';
      }
      return 'STABLE';
    }
  }

  private classifyReopenEvents(
    leftFinished: boolean,
    rightFinished: boolean,
    timestamp: number,
    currentLeft: number,
    currentRight: number
  ): BlinkEvent | null {
    // Check if within debounce window of the last emitted event
    const timeSinceLastEvent = timestamp - this.lastEventTime;
    const isDebounced = timeSinceLastEvent < this.config.debounceMs;

    // Check if this eye reopen is already consumed by a recent bilateral emission
    const timeSinceLastBilateral = timestamp - this.lastBilateralEmissionTime;
    const isPartOfRecentBilateral = timeSinceLastBilateral <= this.config.coincidenceWindowMs;

    if (leftFinished && rightFinished) {
      // Both completed simultaneously
      this.wasConcurrentlyClosed = false;
      if (isDebounced) return null;

      const duration = Math.max(this.leftEye.durationMs, this.rightEye.durationMs);
      return this.emitBilateralBlink(timestamp, duration, currentLeft, currentRight);
    }

    if (leftFinished) {
      if (this.wasConcurrentlyClosed || this.rightEye.status === 'CLOSED' || isPartOfRecentBilateral) {
        // Left eye reopened while right is closed or was closed concurrently
        if (isPartOfRecentBilateral) {
          // Already counted as bilateral blink
          return null;
        }
        this.wasConcurrentlyClosed = false;
        if (isDebounced) return null;

        return this.emitBilateralBlink(timestamp, this.leftEye.durationMs, currentLeft, currentRight);
      }

      // Right eye remained OPEN throughout
      this.wasConcurrentlyClosed = false;
      if (isDebounced) return null;

      return this.emitLeftWink(timestamp, this.leftEye.durationMs, currentLeft, currentRight);
    }

    if (rightFinished) {
      if (this.wasConcurrentlyClosed || this.leftEye.status === 'CLOSED' || isPartOfRecentBilateral) {
        // Right eye reopened while left is closed or was closed concurrently
        if (isPartOfRecentBilateral) {
          // Already counted as bilateral blink
          return null;
        }
        this.wasConcurrentlyClosed = false;
        if (isDebounced) return null;

        return this.emitBilateralBlink(timestamp, this.rightEye.durationMs, currentLeft, currentRight);
      }

      // Left eye remained OPEN throughout
      this.wasConcurrentlyClosed = false;
      if (isDebounced) return null;

      return this.emitRightWink(timestamp, this.rightEye.durationMs, currentLeft, currentRight);
    }

    return null;
  }

  private emitBilateralBlink(
    timestamp: number,
    durationMs: number,
    leftClosure: number,
    rightClosure: number
  ): BlinkEvent {
    this.blinkCount += 1;
    this.lastBilateralEmissionTime = timestamp;
    this.lastEventTime = timestamp;

    const event: BlinkEvent = {
      type: 'BilateralBlink',
      timestamp,
      durationMs,
      leftClosure,
      rightClosure,
    };
    this.lastEvent = event;
    return event;
  }

  private emitLeftWink(
    timestamp: number,
    durationMs: number,
    leftClosure: number,
    rightClosure: number
  ): BlinkEvent {
    this.leftWinkCount += 1;
    this.lastEventTime = timestamp;

    const event: BlinkEvent = {
      type: 'LeftWink',
      timestamp,
      durationMs,
      leftClosure,
      rightClosure,
    };
    this.lastEvent = event;
    return event;
  }

  private emitRightWink(
    timestamp: number,
    durationMs: number,
    leftClosure: number,
    rightClosure: number
  ): BlinkEvent {
    this.rightWinkCount += 1;
    this.lastEventTime = timestamp;

    const event: BlinkEvent = {
      type: 'RightWink',
      timestamp,
      durationMs,
      leftClosure,
      rightClosure,
    };
    this.lastEvent = event;
    return event;
  }

  private handleFaceLoss(timestamp: number): void {
    const wasTrackingClosure = this.leftEye.status === 'CLOSED' || this.rightEye.status === 'CLOSED';
    this.leftEye.status = 'OPEN';
    this.leftEye.closedTimestamp = null;
    this.leftEye.durationMs = 0;
    this.rightEye.status = 'OPEN';
    this.rightEye.closedTimestamp = null;
    this.rightEye.durationMs = 0;
    this.wasConcurrentlyClosed = false;

    if (wasTrackingClosure) {
      this.lastEvent = {
        type: 'FaceLost',
        timestamp,
        durationMs: 0,
        leftClosure: 0,
        rightClosure: 0,
      };
    }
  }
}
