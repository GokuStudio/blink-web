/**
 * Expression and emotion states for Blink Eye Character.
 * Version: 1.0.0
 */

export type BlinkExpressionType =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'alert'
  | 'thinking'
  | 'listening'
  | 'speaking'
  | 'nudging'
  | 'offline'
  | 'error';

export interface GazeTarget {
  x: number; // Normalized -1.0 to 1.0
  y: number; // Normalized -1.0 to 1.0
}

export interface ExpressionState {
  current: BlinkExpressionType;
  targetExpression: BlinkExpressionType;
  transitionProgress: number; // 0.0 to 1.0
  intensity: number; // 0.0 to 1.0
  gaze: GazeTarget;
  isBlinking: boolean;
  blinkFrequencyPerMin: number;
  lastChangedAt: number;
}

export const DEFAULT_EXPRESSION_STATE: ExpressionState = {
  current: 'idle',
  targetExpression: 'idle',
  transitionProgress: 1.0,
  intensity: 1.0,
  gaze: { x: 0, y: 0 },
  isBlinking: false,
  blinkFrequencyPerMin: 18,
  lastChangedAt: Date.now(),
};
