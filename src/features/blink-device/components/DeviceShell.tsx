import React from 'react';
import { EyeCanvas } from './EyeCanvas';
import { useDeviceStore } from '../state';
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
          onNudgeComplete={handleNudgeComplete}
        />
      </div>
    );
  }

  // Desktop Integrated Composition matching Reference 4
  // Device aspect ratio is 840 / 980 (~6:7)
  // Bezel screen opening is: left: 14.05%, top: 7.76%, width: 72.14%, height: 72.04%
  return (
    <div
      className={`relative w-full aspect-[840/980] max-w-sm sm:max-w-md mx-auto rounded-3xl overflow-hidden bg-black shadow-2xl ${className}`}
      data-testid="device-shell-desktop"
    >
      {/* Layer 1: Solid Pitch Black Base */}
      <div className="absolute inset-0 bg-[#080A0C] z-0" />

      {/* Layer 2: WebGL Animated Eyes Canvas positioned within the bezel aperture */}
      <div className="absolute left-[14%] top-[7.7%] w-[72.2%] h-[72.1%] rounded-[56px] overflow-hidden z-1 bg-black">
        <EyeCanvas
          expression={expression}
          className="w-full h-full"
          onNudgeComplete={handleNudgeComplete}
        />
      </div>

      {/* Layer 3: Physical Bezel Overlay (Static Image Asset from Production Reference) */}
      <img
        src="/assets/bezel/bezel.png"
        alt="Blink Physical Bezel"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 select-none"
      />
    </div>
  );
};
