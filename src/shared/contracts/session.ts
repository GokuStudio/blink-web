/**
 * Completed Eye Health Session Summary Contract (Firestore storage).
 * Version: 1.0.0
 */

export interface SessionSummary {
  sessionId: string;
  userId: string;
  schemaVersion: number;
  isSimulated: boolean;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  averageBlinksPerMinute: number;
  lowestBlinkRate: number;
  highestBlinkRate: number;
  totalNudgesDelivered: number;
  totalNudgesAcknowledged: number;
  finalEyeHealthScore: number;
  notes?: string;
}
