import React from 'react';
import { EyeCanvasPlaceholder } from './EyeCanvasPlaceholder';
import { BlinkExpressionType } from '@/shared/contracts';

interface DeviceShellProps {
  mode: 'desktop-integrated' | 'standalone-device';
  expression?: BlinkExpressionType;
  className?: string;
}

/**
 * Blink Device Shell
 * Implements Section 4 Visual Architecture:
 * - Desktop integrated: Layer 1 (Black bg) + Layer 2 (WebGL / Canvas) + Layer 3 (Static Bezel overlay)
 * - Standalone device: Fullscreen WebGL display, bezel completely hidden.
 */
export const DeviceShell: React.FC<DeviceShellProps> = ({
  mode,
  expression = 'idle',
  className = '',
}) => {
  if (mode === 'standalone-device') {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <EyeCanvasPlaceholder expression={expression} className="w-full h-full" />
      </div>
    );
  }

  // Desktop Integrated Composition
  return (
    <div
      className={`relative w-full aspect-[16/10] max-w-2xl mx-auto rounded-3xl overflow-hidden bg-black shadow-2xl border border-[#272E36] ${className}`}
      data-testid="device-shell-desktop"
    >
      {/* Layer 1 & 2: Background + Animated Eyes Canvas */}
      <div className="absolute inset-0 z-0">
        <EyeCanvasPlaceholder expression={expression} />
      </div>

      {/* Layer 3: Physical Bezel Overlay (Static Image Asset) */}
      <img
        src="/assets/bezel/bezel-placeholder.svg"
        alt="Blink Physical Bezel"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
      />
    </div>
  );
};
