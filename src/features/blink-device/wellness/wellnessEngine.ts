/**
 * Deterministic Wellness Monitoring & Automatic Nudge Engine
 * 
 * Invariants:
 * 1. Monotonic time calculations only (no Date.now() jitter).
 * 2. Bilateral blinks update blink intervals; winks are NOT counted as ordinary bilateral blinks.
 * 3. Valid observation time accumulates ONLY when face is reliably tracked in a fresh stream.
 * 4. Stare duration is suspended upon face loss (never penalizes turning away).
 * 5. Low blink rate requires minimum observation duration (30s) + hysteresis margin.
 * 6. Conservative cooldown prevents repeated or duplicate nudges.
 * 7. Decoupled from camera, WebGL, and Firebase; 100% unit-testable with controllable clocks.
 */

import { NudgeUrgency, NudgeEvent, MonitoringMode } from '@/shared/contracts';
import { BlinkEvent } from '../tracking/types';
import {
  WellnessEngineConfig,
  WellnessMetrics,
  WellnessState,
  NudgeDecision,
  NudgeTriggerReason,
} from './types';

export const DEFAULT_WELLNESS_CONFIG: WellnessEngineConfig = {
  noBlinkReminderThresholdMs: 12000,  // 12s gentle warning
  noBlinkNudgeThresholdMs: 18000,      // 18s full nudge eligibility
  lowBlinkRateThresholdBpm: 12,        // 12 blinks per minute threshold
  minObservationTimeForRateMs: 30000,  // 30s minimum valid observation
  rollingWindowDurationMs: 60000,      // 60s rolling evaluation window
  nudgeCooldownMs: 45000,              // 45s cooldown
  maxStaleDataThresholdMs: 1500,       // 1.5s max stale tracking timeout
  lowRateHysteresisBpm: 2,             // Recovers at 12 + 2 = 14 bpm
  minTrackingConfidence: 0.70,         // 70% confidence required
  autoNudgeEnabled: true,
};

export class WellnessEngine {
  private config: WellnessEngineConfig;
  private mode: MonitoringMode = 'idle';

  // Observation timelines (monotonic timestamps)
  private sessionStartTime: number | null = null;
  private lastBlinkTimestamp: number | null = null;
  private lastUpdateTime: number | null = null;
  private lastSampleTimestamp: number = -Infinity;
  private validObservationDurationMs = 0;
  private totalObservationDurationMs = 0;

  // Rolling blink ring buffer: array of monotonic timestamps
  private blinkTimestamps: number[] = [];

  // Tracking quality & presence state
  private isTrackingActive = false;
  private isFaceDetected = false;
  private trackingConfidence = 0;
  private isLowBlinkRate = false;

  // Nudge lifecycle state
  private isNudging = false;
  private lastNudgeEvent: NudgeEvent | null = null;
  private cooldownExpiresAt = -Infinity;
  private totalAutomaticNudges = 0;

  constructor(config: Partial<WellnessEngineConfig> = {}) {
    this.config = { ...DEFAULT_WELLNESS_CONFIG, ...config };
  }

  public getConfig(): WellnessEngineConfig {
    return { ...this.config };
  }

  public getSessionStartTime(): number | null {
    return this.sessionStartTime;
  }

  public setConfig(partial: Partial<WellnessEngineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public setAutoNudgeEnabled(enabled: boolean): void {
    this.config.autoNudgeEnabled = enabled;
  }

  public startMonitoring(now: number = performance.now()): void {
    this.mode = 'active';
    this.sessionStartTime = now;
    this.lastUpdateTime = now;
    this.lastBlinkTimestamp = now;
    this.validObservationDurationMs = 0;
    this.totalObservationDurationMs = 0;
    this.blinkTimestamps = [];
    this.isLowBlinkRate = false;
  }

  public pauseMonitoring(): void {
    this.mode = 'paused';
  }

  public resumeMonitoring(now: number = performance.now()): void {
    if (this.mode === 'paused') {
      this.mode = 'active';
      this.lastUpdateTime = now;
      if (this.lastBlinkTimestamp === null) {
        this.lastBlinkTimestamp = now;
      }
    }
  }

  public stopMonitoring(): void {
    this.mode = 'idle';
    this.sessionStartTime = null;
    this.lastUpdateTime = null;
    this.isNudging = false;
  }

  public reset(_now: number = performance.now()): void {
    this.mode = 'idle';
    this.sessionStartTime = null;
    this.lastBlinkTimestamp = null;
    this.lastUpdateTime = null;
    this.lastSampleTimestamp = -Infinity;
    this.validObservationDurationMs = 0;
    this.totalObservationDurationMs = 0;
    this.blinkTimestamps = [];
    this.isTrackingActive = false;
    this.isFaceDetected = false;
    this.trackingConfidence = 0;
    this.isLowBlinkRate = false;
    this.isNudging = false;
    this.lastNudgeEvent = null;
    this.cooldownExpiresAt = -Infinity;
    this.totalAutomaticNudges = 0;
  }

  public forceCooldownExpiration(): void {
    this.cooldownExpiresAt = -Infinity;
  }

  /**
   * Feed confirmed blink events from BlinkClassifier.
   * Only BilateralBlink resets stare timer and increments rolling rate.
   */
  public recordBlink(event: BlinkEvent, now: number = performance.now()): void {
    if (this.mode !== 'active') return;

    // Requirement 2: Do not count winks as ordinary bilateral blinks
    if (event.type !== 'BilateralBlink') {
      return;
    }

    this.lastBlinkTimestamp = now;
    this.blinkTimestamps.push(now);

    // Prune events outside rolling window
    this.pruneOldBlinks(now);
  }

  /**
   * Feed tracking presence and confidence from vision pipeline.
   */
  public updateTrackingStatus(
    isTrackingActive: boolean,
    isFaceDetected: boolean,
    confidence: number,
    now: number = performance.now()
  ): void {
    this.lastSampleTimestamp = now;
    this.isTrackingActive = isTrackingActive;
    this.isFaceDetected = isFaceDetected;
    this.trackingConfidence = confidence;

    this.advanceTime(now);
  }

  /**
   * Advances monotonic timelines.
   */
  public advanceTime(now: number): void {
    if (this.mode !== 'active') {
      this.lastUpdateTime = now;
      return;
    }

    if (this.lastUpdateTime === null) {
      this.lastUpdateTime = now;
      return;
    }

    const delta = Math.max(0, now - this.lastUpdateTime);
    this.lastUpdateTime = now;
    this.totalObservationDurationMs += delta;

    const isDataFresh = now - this.lastSampleTimestamp <= this.config.maxStaleDataThresholdMs;
    const isReliable = this.isTrackingActive && this.isFaceDetected && this.trackingConfidence >= this.config.minTrackingConfidence && isDataFresh;

    if (isReliable) {
      // Accumulate valid observation time only when tracking is reliable
      this.validObservationDurationMs += delta;
    } else {
      // Suspend staring accumulation during tracking loss by advancing lastBlinkTimestamp
      if (this.lastBlinkTimestamp !== null) {
        this.lastBlinkTimestamp += delta;
      }
    }

    this.pruneOldBlinks(now);
    this.updateLowBlinkRateState(now);
  }

  private pruneOldBlinks(now: number): void {
    const cutoff = now - this.config.rollingWindowDurationMs;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff) {
      this.blinkTimestamps.shift();
    }
  }

  /**
   * Calculates rolling blink rate in blinks per minute.
   * Returns null if valid observation duration is below the minimum threshold (30s).
   */
  public calculateRollingBlinkRate(now: number = performance.now()): number | null {
    this.pruneOldBlinks(now);
    if (this.validObservationDurationMs < this.config.minObservationTimeForRateMs) {
      return null;
    }

    const windowMs = Math.min(this.validObservationDurationMs, this.config.rollingWindowDurationMs);
    const windowSeconds = windowMs / 1000;
    if (windowSeconds <= 0) return 0;

    const blinksInWindow = this.blinkTimestamps.length;
    return (blinksInWindow / windowSeconds) * 60;
  }

  private updateLowBlinkRateState(now: number): void {
    const rate = this.calculateRollingBlinkRate(now);
    if (rate === null) {
      this.isLowBlinkRate = false;
      return;
    }

    if (!this.isLowBlinkRate) {
      // Trigger threshold: e.g. < 12 bpm
      if (rate < this.config.lowBlinkRateThresholdBpm) {
        this.isLowBlinkRate = true;
      }
    } else {
      // Hysteresis recovery threshold: e.g. >= 12 + 2 = 14 bpm
      if (rate >= this.config.lowBlinkRateThresholdBpm + this.config.lowRateHysteresisBpm) {
        this.isLowBlinkRate = false;
      }
    }
  }

  /**
   * Evaluates wellness condition and determines whether an automatic nudge is eligible.
   */
  public evaluate(now: number = performance.now()): NudgeDecision {
    this.advanceTime(now);

    if (this.mode !== 'active') {
      return { eligible: false, reason: 'monitoring_paused' };
    }

    if (!this.config.autoNudgeEnabled) {
      return { eligible: false, reason: 'auto_nudge_disabled' };
    }

    if (!this.isTrackingActive) {
      return { eligible: false, reason: 'tracking_inactive' };
    }

    if (!this.isFaceDetected || this.trackingConfidence < this.config.minTrackingConfidence) {
      return { eligible: false, reason: 'no_face' };
    }

    const isDataFresh = now - this.lastSampleTimestamp <= this.config.maxStaleDataThresholdMs;
    if (!isDataFresh) {
      return { eligible: false, reason: 'stale_data' };
    }

    if (this.isNudging) {
      return { eligible: false, reason: 'already_nudging' };
    }

    if (now < this.cooldownExpiresAt) {
      return { eligible: false, reason: 'cooldown_active' };
    }

    const timeSinceLastBlink = this.lastBlinkTimestamp !== null ? now - this.lastBlinkTimestamp : 0;

    // Condition A: Prolonged Stare (> 18s default)
    if (timeSinceLastBlink >= this.config.noBlinkNudgeThresholdMs) {
      const urgency: NudgeUrgency = timeSinceLastBlink >= this.config.noBlinkNudgeThresholdMs * 1.5 ? 'high' : 'medium';
      return {
        eligible: true,
        reason: 'eligible',
        triggerReason: 'prolonged_stare',
        urgency,
      };
    }

    // Condition B: Sustained Low Blink Rate (after >= 30s observation)
    if (this.isLowBlinkRate) {
      return {
        eligible: true,
        reason: 'eligible',
        triggerReason: 'low_blink_rate',
        urgency: 'low',
      };
    }

    return { eligible: false, reason: 'threshold_not_met' };
  }

  /**
   * Triggers an automatic or manual nudge, updating cooldown and counters.
   */
  public triggerNudge(
    reason: NudgeTriggerReason = 'prolonged_stare',
    urgency: NudgeUrgency = 'medium',
    now: number = performance.now()
  ): NudgeEvent {
    this.isNudging = true;
    this.cooldownExpiresAt = now + this.config.nudgeCooldownMs;

    if (reason !== 'manual_test') {
      this.totalAutomaticNudges++;
    }

    const message =
      reason === 'prolonged_stare'
        ? 'Time to blink and refresh your eyes.'
        : reason === 'low_blink_rate'
        ? 'Your blink rate has been lower than usual.'
        : 'Manual wellness test reminder.';

    const event: NudgeEvent = {
      id: `nudge-${now.toFixed(0)}-${Math.random().toString(36).substring(2, 7)}`,
      schemaVersion: 1,
      timestamp: now,
      urgency,
      reason: reason === 'manual_test' ? 'manual_test' : reason === 'prolonged_stare' ? 'prolonged_stare' : 'low_blink_rate',
      message,
      acknowledged: false,
    };

    this.lastNudgeEvent = event;
    return event;
  }

  public completeNudge(): void {
    this.isNudging = false;
  }

  public cancelNudge(): void {
    this.isNudging = false;
  }

  /**
   * Computes the current high-level wellness state for UI badges.
   */
  public getWellnessState(now: number = performance.now()): WellnessState {
    if (this.mode !== 'active') return 'idle';

    const isDataFresh = now - this.lastSampleTimestamp <= this.config.maxStaleDataThresholdMs;
    const isReliable = this.isTrackingActive && this.isFaceDetected && this.trackingConfidence >= this.config.minTrackingConfidence && isDataFresh;

    if (!isReliable) return 'suspended';
    if (this.isNudging) return 'nudging';
    if (now < this.cooldownExpiresAt) return 'cooldown';

    const timeSinceLastBlink = this.lastBlinkTimestamp !== null ? now - this.lastBlinkTimestamp : 0;

    if (timeSinceLastBlink >= this.config.noBlinkNudgeThresholdMs || this.isLowBlinkRate) {
      return 'nudge_eligible';
    }

    if (timeSinceLastBlink >= this.config.noBlinkReminderThresholdMs) {
      return 'warning';
    }

    if (this.validObservationDurationMs < this.config.minObservationTimeForRateMs) {
      return 'observing';
    }

    return 'healthy';
  }

  /**
   * Snapshot of all metrics for UI consumption.
   */
  public getMetrics(now: number = performance.now()): WellnessMetrics {
    const isDataFresh = now - this.lastSampleTimestamp <= this.config.maxStaleDataThresholdMs;
    const isFaceReliable = this.isTrackingActive && this.isFaceDetected && this.trackingConfidence >= this.config.minTrackingConfidence && isDataFresh;
    const timeSinceLastBlinkMs = this.lastBlinkTimestamp !== null ? Math.max(0, now - this.lastBlinkTimestamp) : 0;
    const cooldownRemainingMs = Math.max(0, this.cooldownExpiresAt - now);

    return {
      mode: this.mode,
      state: this.getWellnessState(now),
      timeSinceLastBlinkMs,
      rollingBlinkRateBpm: this.calculateRollingBlinkRate(now),
      validObservationDurationMs: this.validObservationDurationMs,
      totalObservationDurationMs: this.totalObservationDurationMs,
      isLowBlinkRate: this.isLowBlinkRate,
      cooldownRemainingMs,
      lastNudgeEvent: this.lastNudgeEvent,
      totalAutomaticNudges: this.totalAutomaticNudges,
      isFaceReliable,
      isDataFresh,
    };
  }
}
