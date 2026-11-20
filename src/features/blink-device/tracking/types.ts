/**
 * Eye Tracking & Blink Classification Contract Types
 * Non-medical ergonomic telemetry.
 */

export type CameraPermissionState = 
  | 'idle' 
  | 'requesting' 
  | 'granted' 
  | 'denied' 
  | 'unsupported' 
  | 'error';

export type EyeStatus = 'OPEN' | 'CLOSING' | 'CLOSED';

export type BlinkEventType = 
  | 'BilateralBlink' 
  | 'LeftWink' 
  | 'RightWink' 
  | 'ProlongedClosure' 
  | 'FaceLost';

export interface BlinkEvent {
  type: BlinkEventType;
  timestamp: number;
  durationMs: number;
  leftClosure: number;
  rightClosure: number;
}

export interface BlinkClassifierConfig {
  /** Score at or above which eye enters CLOSED state (default 0.60) */
  closeThreshold: number;
  /** Score at or below which eye returns to OPEN state (default 0.35) */
  openThreshold: number;
  /** Minimum duration in ms to qualify as a blink event (default 50ms, filters jitter) */
  minDurationMs: number;
  /** Maximum duration in ms before considered prolonged closure (default 450ms) */
  maxDurationMs: number;
  /** Debounce window in ms between consecutive classified blinks (default 100ms) */
  debounceMs: number;
  /** Max time delta in ms between left & right closures to coalesce into bilateral (default 50ms) */
  coincidenceWindowMs: number;
}

export interface EyeClosureState {
  status: EyeStatus;
  currentScore: number;
  closedTimestamp: number | null;
  durationMs: number;
}

export interface TrackingFrameResult {
  timestamp: number;
  /** Anatomical Left Eye closure score (0.0 = wide open, 1.0 = fully closed) */
  closureLeft: number;
  /** Anatomical Right Eye closure score (0.0 = wide open, 1.0 = fully closed) */
  closureRight: number;
  isFaceDetected: boolean;
  trackingConfidence: number;
  inferenceDurationMs: number;
}

export interface TrackingMetrics {
  permissionState: CameraPermissionState;
  isCameraActive: boolean;
  isModelLoaded: boolean;
  isModelLoading: boolean;
  modelError: string | null;
  cameraError: string | null;
  
  // Real-time closure scores
  closureLeft: number;
  closureRight: number;
  isFaceDetected: boolean;
  trackingConfidence: number;
  
  // Performance
  inferenceFps: number;
  averageLatencyMs: number;
  
  // Event counters
  blinkCount: number;
  leftWinkCount: number;
  rightWinkCount: number;
  lastEvent: BlinkEvent | null;
  
  // Real vs Simulated marker
  isSimulated: boolean;
}
