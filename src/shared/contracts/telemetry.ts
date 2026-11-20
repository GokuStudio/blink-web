/**
 * Real-time eye health telemetry contract.
 * Version: 1.0.0
 */

export interface DeviceTelemetry {
  eventId: string; // Stable UUID
  schemaVersion: number; // 1
  timestamp: number;
  isSimulated: boolean; // Explicit separation between simulated and real measurements
  
  // Blink metrics
  currentBlinkRatePerMinute: number;
  averageBlinkRatePerMinute: number;
  
  // Health & Fatigue scores (0-100 demo scale)
  eyeFatigueScore: number;
  eyeHealthScore: number;
  
  // Detailed tracking markers (for future camera-based ML)
  eyeAspectRatio?: {
    left: number;
    right: number;
  };
  screenDistanceCm?: number;
  ambientLightLux?: number;
}

export const DEFAULT_TELEMETRY: DeviceTelemetry = {
  eventId: 'telemetry-init',
  schemaVersion: 1,
  timestamp: Date.now(),
  isSimulated: true,
  currentBlinkRatePerMinute: 16,
  averageBlinkRatePerMinute: 18,
  eyeFatigueScore: 18,
  eyeHealthScore: 92,
};
