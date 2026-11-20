import { BlinkExpressionType } from '@/shared/contracts';

export type SpontaneousExpression = 'happy' | 'sleepy' | 'thinking';

export type ExpressionOwner =
  | 'default'      // Rest / neutral idle
  | 'personality'  // Autonomous spontaneous expression
  | 'user'         // Local user UI selection
  | 'command'      // Remote Firebase command
  | 'nudge'        // Wellness engine automatic nudge
  | 'voice';       // Voice / Hey Blink listening state

export type SuppressionReason =
  | 'none'
  | 'disabled'
  | 'test_suppressed'
  | 'nudge_active'
  | 'explicit_command'
  | 'user_override'
  | 'listening_active'
  | 'tab_hidden'
  | 'mirroring_active'
  | 'quiet_interval';

export interface PersonalityConfig {
  enabled: boolean;
  minQuietIntervalMs: number;       // Min quiet rest before any spontaneous expression (default: 15000)
  minIntervalMs: number;            // Min random interval between spontaneous expressions (default: 20000)
  maxIntervalMs: number;            // Max random interval between spontaneous expressions (default: 45000)
  happyDurationMinMs: number;       // Default: 1000
  happyDurationMaxMs: number;       // Default: 2000
  thinkingDurationMinMs: number;    // Default: 1500
  thinkingDurationMaxMs: number;    // Default: 3000
  sleepyDurationMinMs: number;      // Default: 1500
  sleepyDurationMaxMs: number;      // Default: 3000
  sleepyQuietThresholdMs: number;   // Quiet rest duration before sleepy is eligible (default: 30000)
  weights: {
    happy: number;                  // default: 0.40
    thinking: number;               // default: 0.35
    sleepy: number;                 // default: 0.25
  };
  seed: number;                     // Default: 1337
  suppressDuringMirroring: boolean; // Default: true (keep calm during active camera mirroring)
  testSuppressed: boolean;          // Developer manual test suppression toggle
}

export const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  enabled: true,
  minQuietIntervalMs: 15000,
  minIntervalMs: 20000,
  maxIntervalMs: 45000,
  happyDurationMinMs: 1000,
  happyDurationMaxMs: 2000,
  thinkingDurationMinMs: 1500,
  thinkingDurationMaxMs: 3000,
  sleepyDurationMinMs: 1500,
  sleepyDurationMaxMs: 3000,
  sleepyQuietThresholdMs: 30000,
  weights: {
    happy: 0.40,
    thinking: 0.35,
    sleepy: 0.25,
  },
  seed: 1337,
  suppressDuringMirroring: true,
  testSuppressed: false,
};

export interface PersonalityContext {
  isCameraActive: boolean;
  isMirroringActive: boolean;
  isFaceDetected: boolean;
  isMonitoringActive: boolean;
  isMonitoringPaused: boolean;
  isNudgeActive: boolean;
  isListeningActive: boolean;
  isDocumentVisible: boolean;
  currentOwner: ExpressionOwner;
  currentExpression: BlinkExpressionType;
}

export interface PersonalityDecision {
  action: 'none' | 'trigger' | 'hold' | 'return_to_neutral';
  expression?: SpontaneousExpression | 'idle';
  durationMs?: number;
  generationToken: number;
  suppressionReason: SuppressionReason;
  timeUntilNextEligibleMs: number;
}

export interface PersonalityDiagnostics {
  enabled: boolean;
  activityState: 'idle' | 'active' | 'suppressed' | 'paused';
  currentOwner: ExpressionOwner;
  currentExpression: BlinkExpressionType;
  lastSpontaneousExpression: SpontaneousExpression | null;
  timeUntilNextEligibleMs: number;
  suppressionReason: SuppressionReason;
  totalSpontaneousActions: number;
  lastActionTimestamp: number;
  actionDurationMs: number;
  seed: number;
}
