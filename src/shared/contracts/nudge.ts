/**
 * Nudge and alert configuration contract.
 * Version: 1.0.0
 */

export type NudgeUrgency = 'low' | 'medium' | 'high';

export interface NudgeConfig {
  enabled: boolean;
  intervalMinutes: number;
  thresholdLowBlinkRate: number; // Blinks per minute threshold
  soundEnabled: boolean;
  hapticEnabled: boolean;
  autoDismissSeconds: number;
  customMessage?: string;
}

export const DEFAULT_NUDGE_CONFIG: NudgeConfig = {
  enabled: true,
  intervalMinutes: 20,
  thresholdLowBlinkRate: 12,
  soundEnabled: false,
  hapticEnabled: true,
  autoDismissSeconds: 5,
};

export interface NudgeEvent {
  id: string; // UUID / stable event ID
  schemaVersion: number;
  timestamp: number;
  urgency: NudgeUrgency;
  reason: 'prolonged_stare' | 'low_blink_rate' | 'break_reminder' | 'manual_test';
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: number;
}
