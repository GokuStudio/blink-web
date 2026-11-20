/**
 * Autonomous Personality Engine
 * 
 * Deterministic, context-aware personality controller for Blink.
 * Evaluates operational context, schedules spontaneous expressions,
 * arbitrates priority, and ensures cancellation safety.
 */

import {
  PersonalityConfig,
  DEFAULT_PERSONALITY_CONFIG,
  PersonalityContext,
  PersonalityDecision,
  PersonalityDiagnostics,
  SpontaneousExpression,
  SuppressionReason,
} from './types';
import { SeededPRNG } from '../components/EyeCanvas';

export class PersonalityEngine {
  private config: PersonalityConfig;
  private prng: SeededPRNG;

  // Lifecycle & timing state
  private generationToken = 0;
  private isActionActive = false;
  private currentSpontaneous: SpontaneousExpression | null = null;
  private lastSpontaneous: SpontaneousExpression | null = null;
  private activeActionEndsAt = 0;
  private actionDurationMs = 0;
  private lastActionTimestamp = 0;
  private quietPeriodStart = 0;
  private nextScheduledTime = 0;
  private totalSpontaneousActions = 0;

  constructor(config: Partial<PersonalityConfig> = {}, startTime: number = 0) {
    this.config = { ...DEFAULT_PERSONALITY_CONFIG, ...config };
    this.prng = new SeededPRNG(this.config.seed);
    this.reset(this.config.seed, startTime);
  }

  public getConfig(): PersonalityConfig {
    return { ...this.config };
  }

  public setConfig(partial: Partial<PersonalityConfig>, now: number = 0): void {
    const prevSeed = this.config.seed;
    this.config = { ...this.config, ...partial };
    if (partial.seed !== undefined && partial.seed !== prevSeed) {
      this.prng.setSeed(partial.seed);
    }
    // If intervals changed, ensure nextScheduledTime is clamped within bounds
    if (partial.minIntervalMs !== undefined || partial.maxIntervalMs !== undefined) {
      this.rescheduleNext(now);
    }
  }

  public setSeed(seed: number, now: number = 0): void {
    this.config.seed = seed;
    this.prng.setSeed(seed);
    this.rescheduleNext(now);
  }

  public reset(seed: number = this.config.seed, now: number = 0): void {
    this.generationToken++;
    this.config.seed = seed;
    this.prng.setSeed(seed);
    this.isActionActive = false;
    this.currentSpontaneous = null;
    this.lastSpontaneous = null;
    this.activeActionEndsAt = 0;
    this.actionDurationMs = 0;
    this.lastActionTimestamp = 0;
    this.quietPeriodStart = now;
    this.totalSpontaneousActions = 0;
    this.rescheduleNext(now);
  }

  public getGenerationToken(): number {
    return this.generationToken;
  }

  private rescheduleNext(now: number): void {
    const interval = this.prng.range(this.config.minIntervalMs, this.config.maxIntervalMs);
    this.nextScheduledTime = now + interval;
  }

  /**
   * Evaluates the suppression reason according to strict priority hierarchy.
   */
  public evaluateSuppression(context: PersonalityContext): SuppressionReason {
    if (!this.config.enabled) {
      return 'disabled';
    }
    if (this.config.testSuppressed) {
      return 'test_suppressed';
    }
    if (!context.isDocumentVisible) {
      return 'tab_hidden';
    }
    // Priority 1: Nudge active
    if (context.isNudgeActive || context.currentExpression === 'nudging' || context.currentOwner === 'nudge') {
      return 'nudge_active';
    }
    // Priority 2: Hey Blink / Voice listening active
    if (context.isListeningActive || context.currentExpression === 'listening' || context.currentOwner === 'voice') {
      return 'listening_active';
    }
    // Priority 3: Explicit Remote Command active
    if (context.currentOwner === 'command') {
      return 'explicit_command';
    }
    // Priority 4: Local User Override active
    if (context.currentOwner === 'user') {
      return 'user_override';
    }
    // Priority 5: Camera Mirroring active
    if (context.isMirroringActive && this.config.suppressDuringMirroring) {
      return 'mirroring_active';
    }
    return 'none';
  }

  /**
   * Main evaluation loop step called periodically or on state change.
   */
  public evaluate(context: PersonalityContext, now: number): PersonalityDecision {
    const suppression = this.evaluateSuppression(context);

    // If suppressed by higher priority systems
    if (suppression !== 'none') {
      // If an autonomous action was active, interrupt and cancel it safely
      if (this.isActionActive) {
        this.generationToken++;
        this.isActionActive = false;
        this.currentSpontaneous = null;
        this.quietPeriodStart = now;
        this.rescheduleNext(now);
      }

      return {
        action: 'none',
        generationToken: this.generationToken,
        suppressionReason: suppression,
        timeUntilNextEligibleMs: Math.max(0, this.nextScheduledTime - now),
      };
    }

    // If an action is currently active
    if (this.isActionActive) {
      if (now >= this.activeActionEndsAt) {
        // Active action expired: return smoothly to neutral
        this.isActionActive = false;
        this.currentSpontaneous = null;
        this.quietPeriodStart = now;
        this.rescheduleNext(now);

        return {
          action: 'return_to_neutral',
          expression: 'idle',
          generationToken: this.generationToken,
          suppressionReason: 'none',
          timeUntilNextEligibleMs: Math.max(0, this.nextScheduledTime - now),
        };
      }

      // Action is still ongoing
      return {
        action: 'hold',
        expression: this.currentSpontaneous!,
        durationMs: this.actionDurationMs,
        generationToken: this.generationToken,
        suppressionReason: 'none',
        timeUntilNextEligibleMs: 0,
      };
    }

    // Check quiet resting interval requirement
    const quietElapsed = now - this.quietPeriodStart;
    if (quietElapsed < this.config.minQuietIntervalMs) {
      const remainingQuiet = this.config.minQuietIntervalMs - quietElapsed;
      const timeUntil = Math.max(remainingQuiet, this.nextScheduledTime - now);
      return {
        action: 'none',
        generationToken: this.generationToken,
        suppressionReason: 'quiet_interval',
        timeUntilNextEligibleMs: timeUntil,
      };
    }

    // Check scheduled randomized interval
    if (now < this.nextScheduledTime) {
      return {
        action: 'none',
        generationToken: this.generationToken,
        suppressionReason: 'quiet_interval',
        timeUntilNextEligibleMs: this.nextScheduledTime - now,
      };
    }

    // All conditions met: trigger spontaneous expression
    return this.triggerNext(context, now);
  }

  /**
   * Selects and triggers the next eligible spontaneous expression.
   */
  public triggerNext(
    context: PersonalityContext,
    now: number,
    force: boolean = false
  ): PersonalityDecision {
    if (!force) {
      const suppression = this.evaluateSuppression(context);
      if (suppression !== 'none') {
        return {
          action: 'none',
          generationToken: this.generationToken,
          suppressionReason: suppression,
          timeUntilNextEligibleMs: Math.max(0, this.nextScheduledTime - now),
        };
      }
    }

    // Pool candidate selection
    const quietElapsed = now - this.quietPeriodStart;
    const candidates: SpontaneousExpression[] = ['happy', 'thinking'];

    // Sleepy is eligible ONLY after extended quiet rest
    if (quietElapsed >= this.config.sleepyQuietThresholdMs || force) {
      candidates.push('sleepy');
    }

    // Prevent immediate consecutive repetition when possible
    let available = candidates;
    if (this.lastSpontaneous && candidates.length > 1) {
      const filtered = candidates.filter((c) => c !== this.lastSpontaneous);
      if (filtered.length > 0) {
        available = filtered;
      }
    }

    // Weighted random selection
    const chosen = this.selectWeightedExpression(available);
    const duration = this.calculateDuration(chosen);

    this.generationToken++;
    this.isActionActive = true;
    this.currentSpontaneous = chosen;
    this.lastSpontaneous = chosen;
    this.lastActionTimestamp = now;
    this.actionDurationMs = duration;
    this.activeActionEndsAt = now + duration;
    this.totalSpontaneousActions++;

    return {
      action: 'trigger',
      expression: chosen,
      durationMs: duration,
      generationToken: this.generationToken,
      suppressionReason: 'none',
      timeUntilNextEligibleMs: 0,
    };
  }

  /**
   * Manually cancels active action (e.g. on external interrupt or unmount).
   */
  public cancelActiveAction(now: number = 0): number {
    this.generationToken++;
    this.isActionActive = false;
    this.currentSpontaneous = null;
    this.quietPeriodStart = now;
    this.rescheduleNext(now);
    return this.generationToken;
  }

  public getDiagnostics(context: PersonalityContext, now: number): PersonalityDiagnostics {
    const suppression = this.evaluateSuppression(context);
    let activityState: 'idle' | 'active' | 'suppressed' | 'paused' = 'idle';

    if (suppression !== 'none') {
      activityState = 'suppressed';
    } else if (context.isMonitoringPaused) {
      activityState = 'paused';
    } else if (this.isActionActive) {
      activityState = 'active';
    }

    const quietElapsed = now - this.quietPeriodStart;
    const remainingQuiet = Math.max(0, this.config.minQuietIntervalMs - quietElapsed);
    const remainingScheduled = Math.max(0, this.nextScheduledTime - now);
    const timeUntilNextEligibleMs = Math.max(remainingQuiet, remainingScheduled);

    return {
      enabled: this.config.enabled,
      activityState,
      currentOwner: context.currentOwner,
      currentExpression: context.currentExpression,
      lastSpontaneousExpression: this.lastSpontaneous,
      timeUntilNextEligibleMs: suppression !== 'none' ? 0 : timeUntilNextEligibleMs,
      suppressionReason: suppression,
      totalSpontaneousActions: this.totalSpontaneousActions,
      lastActionTimestamp: this.lastActionTimestamp,
      actionDurationMs: this.actionDurationMs,
      seed: this.config.seed,
    };
  }

  private selectWeightedExpression(candidates: SpontaneousExpression[]): SpontaneousExpression {
    if (candidates.length === 1) return candidates[0];

    let totalWeight = 0;
    for (const c of candidates) {
      totalWeight += this.config.weights[c] ?? 0.33;
    }

    const r = this.prng.next() * totalWeight;
    let accum = 0;
    for (const c of candidates) {
      accum += this.config.weights[c] ?? 0.33;
      if (r <= accum) {
        return c;
      }
    }

    return candidates[0];
  }

  private calculateDuration(expression: SpontaneousExpression): number {
    switch (expression) {
      case 'happy':
        return Math.round(this.prng.range(this.config.happyDurationMinMs, this.config.happyDurationMaxMs));
      case 'thinking':
        return Math.round(this.prng.range(this.config.thinkingDurationMinMs, this.config.thinkingDurationMaxMs));
      case 'sleepy':
        return Math.round(this.prng.range(this.config.sleepyDurationMinMs, this.config.sleepyDurationMaxMs));
    }
  }
}
