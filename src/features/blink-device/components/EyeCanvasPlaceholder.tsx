import React from 'react';
import { BlinkExpressionType } from '@/shared/contracts';

interface EyeCanvasPlaceholderProps {
  expression?: BlinkExpressionType;
  isBlinking?: boolean;
  className?: string;
}

/**
 * Placeholder for Phase W0 eye renderer.
 * Demonstrates Layer 2 of the visual architecture:
 * Two glowing cyan eyes with responsive proportions before Three.js integration in later milestones.
 */
export const EyeCanvasPlaceholder: React.FC<EyeCanvasPlaceholderProps> = ({
  expression = 'idle',
  isBlinking = false,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none ${className}`}
      data-testid="eye-canvas-placeholder"
    >
      {/* Background ambient cyan eye glow */}
      <div className="absolute inset-0 bg-radial from-[#35DFFF]/10 via-transparent to-transparent opacity-60 blur-2xl pointer-events-none" />

      {/* Eyes Container */}
      <div className="relative flex items-center justify-center gap-10 sm:gap-16 z-10 transition-all duration-300">
        {/* Left Eye */}
        <div
          className={`w-14 sm:w-20 md:w-24 rounded-[32px] bg-[#35DFFF] shadow-[0_0_35px_#35DFFF] transition-all duration-300 ${
            isBlinking ? 'h-1.5 scale-y-10' : expression === 'sleepy' ? 'h-8' : 'h-24 sm:h-32'
          }`}
          style={{
            transform: expression === 'happy' ? 'translateY(-6px)' : undefined,
          }}
        />

        {/* Right Eye */}
        <div
          className={`w-14 sm:w-20 md:w-24 rounded-[32px] bg-[#35DFFF] shadow-[0_0_35px_#35DFFF] transition-all duration-300 ${
            isBlinking ? 'h-1.5 scale-y-10' : expression === 'sleepy' ? 'h-8' : 'h-24 sm:h-32'
          }`}
          style={{
            transform: expression === 'happy' ? 'translateY(-6px)' : undefined,
          }}
        />
      </div>

      {/* Expression Badge for developer verification */}
      <div className="absolute bottom-4 left-4 z-20 text-[10px] uppercase font-mono tracking-widest text-[#35DFFF]/70 bg-[#080A0C]/80 px-2 py-0.5 rounded border border-[#35DFFF]/20">
        EYE STATE: {expression}
      </div>
    </div>
  );
};
