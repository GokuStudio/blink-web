import React from 'react';
import { EyeCanvas } from './EyeCanvas';
import { useDeviceStore } from '../state';
import { useWellnessStore } from '../wellness/wellnessStore';
import { BlinkExpressionType } from '@/shared/contracts';

interface DeviceShellProps {
  mode: 'desktop-integrated' | 'standalone-device';
  expression?: BlinkExpressionType;
  className?: string;
  onNudgeComplete?: () => void;
}

/**
 * Blink Device Shell
 * Implements Section 4 Visual Architecture:
 * - Desktop integrated: Layer 1 (Black bg) + Layer 2 (WebGL Canvas) + Layer 3 (Static Transparent Bezel overlay)
 *   Uses the unified 1:1 Square Coordinate System derived from the 1024x1024 reference image.
 * - Standalone device: Fullscreen WebGL display, bezel completely omitted.
 */
export const DeviceShell: React.FC<DeviceShellProps> = ({
  mode,
  expression: propExpression,
  className = '',
  onNudgeComplete,
}) => {
  const storeExpression = useDeviceStore((s) => s.expression);
  const setStoreExpression = useDeviceStore((s) => s.setExpression);
  const expression = propExpression ?? storeExpression;

  const handleNudgeComplete = () => {
    useWellnessStore.getState().onNudgeFinished();
    if (expression === 'nudging') {
      setStoreExpression('idle');
    }
    if (onNudgeComplete) {
      onNudgeComplete();
    }
  };

  if (mode === 'standalone-device') {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <EyeCanvas
          expression={expression}
          className="w-full h-full"
          isStandalone={true}
          onNudgeComplete={handleNudgeComplete}
        />
      </div>
    );
  }

  // Desktop Integrated Composition:
  // Strict 1:1 Square aspect ratio matching the 1024x1024 reference.
  // Both Layer 2 (WebGL Canvas) and Layer 3 (Bezel PNG) share the exact same square viewport.
  return (
    <div
      className={`relative w-full aspect-square max-w-sm sm:max-w-md mx-auto rounded-3xl overflow-hidden bg-black shadow-2xl select-none ${className}`}
      data-testid="device-shell-desktop"
    >
      {/* Layer 1: Solid Pitch Black Base */}
      <div className="absolute inset-0 bg-black z-0" />

      {/* Layer 2: WebGL Animated Eyes Canvas covering the full square viewport */}
      <div className="absolute inset-0 z-1 bg-black overflow-hidden">
        <EyeCanvas
          expression={expression}
          className="w-full h-full"
          isStandalone={false}
          onNudgeComplete={handleNudgeComplete}
        />
      </div>

      {/* Layer 3: Physical Bezel Overlay (Square 1024x1024 transparent PNG asset) */}
      <img
        src="/assets/bezel/bezel.png"
        alt="Blink Physical Bezel"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 select-none"
      />
    </div>
  );
};
