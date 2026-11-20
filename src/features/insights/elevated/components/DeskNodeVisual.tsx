import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BlinkEyes } from './BlinkEyes';

interface DeskNodeVisualProps {
  connected: boolean;
  calibrating: boolean;
  batteryPercent: number;
}

/**
 * Centered, enlarged physical visualization of Blink Desk Node 01 hardware
 * featuring the signature glowing wavy cyan-blue Blink Eyes.
 */
export const DeskNodeVisual: React.FC<DeskNodeVisualProps> = ({
  connected,
  calibrating,
  batteryPercent,
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative flex items-center justify-center py-1">
      {/* Soft feathered cobalt-blue glow behind hardware silhouette when connected */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 rounded-full transition-opacity duration-500"
        style={{
          opacity: connected ? 0.62 : 0.08,
          background: calibrating
            ? 'radial-gradient(circle at 50% 50%, rgba(166,250,76,0.22) 0%, transparent 66%)'
            : 'radial-gradient(circle at 50% 50%, rgba(38,123,255,0.24) 0%, rgba(101,214,255,0.06) 44%, transparent 68%)',
        }}
      />

      {/* Enlarged matte anodized hardware housing */}
      <div
        className="relative flex h-[122px] w-[192px] items-center justify-center rounded-[32px] p-[9px]"
        style={{
          background:
            'linear-gradient(155deg, #2D3230 0%, #191C1A 48%, #0E100F 100%)',
          boxShadow:
            'inset 0 1.5px 1px rgba(255,255,255,0.16), inset 0 -2px 6px rgba(0,0,0,0.85), 0 18px 36px rgba(0,0,0,0.72)',
        }}
      >
        {/* Recessed optical display face */}
        <div
          className="relative flex h-full w-full items-center justify-center rounded-[23px] overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 50% 44%, #081220 0%, #030508 100%)',
            boxShadow:
              'inset 0 3px 12px rgba(0,0,0,0.94), inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Calibration optical sweep */}
          {calibrating && !prefersReducedMotion && (
            <motion.div
              aria-hidden="true"
              initial={{ x: -115 }}
              animate={{ x: 115 }}
              transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
              className="pointer-events-none absolute inset-y-0 z-20 w-12"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(166,250,76,0.34), transparent)',
              }}
            />
          )}

          {/* Twin signature glowing wavy cyan-blue Blink Eyes with live calibration gaze tracking */}
          <div className="relative z-10 -mt-1.5 flex items-center justify-center">
            <BlinkEyes
              variant="node"
              awake={connected}
              attentive={calibrating}
              calibrating={calibrating}
            />
          </div>

          {/* Status LED bar at bottom center */}
          <span
            className="absolute bottom-[8px] z-10 h-[3.5px] w-[22px] rounded-full transition-colors duration-300"
            style={{
              backgroundColor: connected ? '#A6FA4C' : '#4E5451',
              opacity: connected ? 0.9 : 0.45,
              boxShadow: connected ? '0 0 10px rgba(166,250,76,0.65)' : 'none',
            }}
          />

          {/* Subtle top glass reflection */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 38%)',
            }}
          />
        </div>
      </div>

      {/* Battery pill cleanly docked on lower-right corner */}
      <span className="font-mono-num absolute -right-2.5 bottom-0 rounded-full bg-[#1C201E] border border-white/[0.11] px-2.5 py-[3px] text-[10.5px] font-medium text-[#E4E8E5] shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
        {connected ? `${batteryPercent}%` : 'OFF'}
      </span>
    </div>
  );
};
