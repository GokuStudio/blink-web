/**
 * Wellness Monitoring & Automatic Nudge Engine Types
 * Non-medical ergonomic telemetry and gentle eye-break reminders.
 */

import { NudgeUrgency, NudgeEvent, MonitoringMode } from '@/shared/contracts';

export type WellnessState = 
  | 'idle' 
  | 'observing' 
  | 'healthy' 
  | 'warning' 
  | 'nudge_eligible' 
  | 'nudging' 
  | 'cooldown' 
  | 'suspended';

export type NudgeTriggerReason = 'prolonged_stare' | 'low_blink_rate' | 'manual_test';

export interface WellnessEngineConfig {
  /** Time without blinking before entering gentle warning state (default 12000 ms = 12s) */
  noBlinkReminderThresholdMs: number;
  /** Prolonged no-blink interval triggering full nudge eligibility (default 18000 ms = 18s) */
  noBlinkNudgeThresholdMs: number;
  /** Low blink rate threshold in blinks per minute (default 12 bpm) */
  lowBlinkRateThresholdBpm: number;
  /** Minimum valid observation time needed before evaluating low rate (default 30000 ms = 30s) */
  minObservationTimeForRateMs: number;
  /** Rolling window duration for blink rate calculation (default 60000 ms = 60s) */
  rollingWindowDurationMs: number;
  /** Post-nudge cooldown period before another automatic nudge can fire (default 45000 ms = 45s) */
  nudgeCooldownMs: number;
  /** Max elapsed time without fresh tracking sample before considered stale (default 1500 ms) */
  maxStaleDataThresholdMs: number;
  /** Hysteresis recovery margin for low blink rate in BPM (default 2 bpm -> recovers at 14 bpm) */
  lowRateHysteresisBpm: number;
  /** Minimum face tracking confidence required (default 0.70) */
  minTrackingConfidence: number;
  /** Enabled state for automatic nudges */
  autoNudgeEnabled: boolean;
}

export interface NudgeDecision {
  eligible: boolean;
  reason: 
    | 'eligible'
    | 'cooldown_active' 
    | 'monitoring_paused' 
    | 'tracking_inactive' 
    | 'no_face' 
    | 'stale_data' 
    | 'insufficient_observation' 
    | 'already_nudging' 
    | 'threshold_not_met'
    | 'auto_nudge_disabled';
  triggerReason?: NudgeTriggerReason;
  urgency?: NudgeUrgency;
}

export interface WellnessMetrics {
  mode: MonitoringMode;
  state: WellnessState;
  timeSinceLastBlinkMs: number;
  rollingBlinkRateBpm: number | null; // null if insufficient observation time
  validObservationDurationMs: number;
  totalObservationDurationMs: number;
  isLowBlinkRate: boolean;
  cooldownRemainingMs: number;
  lastNudgeEvent: NudgeEvent | null;
  totalAutomaticNudges: number;
  isFaceReliable: boolean;
  isDataFresh: boolean;
}
