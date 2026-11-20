/**
 * Developer 1 Feature Boundary: Blink Device
 * Owns WebGL eyes, shaders, expressions, bezel composition, rendering performance,
 * camera eye tracking, low-latency eye mirroring, automatic nudge intelligence,
 * and autonomous context-aware personality.
 */

export * from './components/DeviceShell';
export * from './components/EyeCanvas';
export * from './components/EyeCanvasPlaceholder';
export * from './components/EyeTrackingDevPanel';
export * from './state';
export * from './state/trackingStore';
export * from './tracking/types';
export * from './tracking/cameraService';
export * from './tracking/blinkClassifier';
export * from './tracking/faceLandmarkerService';
export * from './tracking/eyeTrackingBridge';
export * from './wellness/types';
export * from './wellness/wellnessEngine';
export * from './wellness/wellnessStore';
export * from './telemetry/types';
export * from './telemetry/deviceTelemetryPublisher';
export * from './telemetry/telemetryStore';
export * from './personality';
