import React from 'react';
import { EyeCanvas } from './EyeCanvas';
import { BlinkExpressionType } from '@/shared/contracts';

interface EyeCanvasPlaceholderProps {
  expression?: BlinkExpressionType;
  isBlinking?: boolean;
  className?: string;
  onNudgeComplete?: () => void;
}

/**
 * EyeCanvasPlaceholder
 * Retains backward-compatible export and test ID for Phase W0 smoke test suites,
 * delegating to the production WebGL EyeCanvas.
 */
export const EyeCanvasPlaceholder: React.FC<EyeCanvasPlaceholderProps> = (props) => {
  return <EyeCanvas {...props} />;
};
