/**
 * Monitoring session state contract.
 * Version: 1.0.0
 */

export type MonitoringMode = 'idle' | 'active' | 'paused' | 'calibrating';

export interface MonitoringState {
  mode: MonitoringMode;
  sessionStartedAt?: number;
  sessionDurationSeconds: number;
  totalBlinksDetected: number;
  isSimulated: boolean;
  sampleIntervalMs: number;
  lastSampleTimestamp: number;
}

export const DEFAULT_MONITORING_STATE: MonitoringState = {
  mode: 'idle',
  sessionDurationSeconds: 0,
  totalBlinksDetected: 0,
  isSimulated: true, // Default to true for hackathon MVP demo
  sampleIntervalMs: 1000,
  lastSampleTimestamp: Date.now(),
};
