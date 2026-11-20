import React, { useEffect, useRef, useState } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { MetalFx, useMetalBend } from 'metal-fx';
import { useReducedMotion } from 'framer-motion';
import type { AssistantPhase } from '../data/mockBlinkData';
import { BlinkEyes } from './BlinkEyes';

const PHASE_TO_ORB: Record<AssistantPhase, OrbState> = {
  idle: 'breathing',
  listening: 'listening',
  thinking: 'solving',
  responding: 'composing',
};

interface BlinkPresenceOrbProps {
  phase: AssistantPhase;
  size?: 'dock' | 'stage';
  active?: boolean;
  reflectionTargets?: React.RefObject<HTMLElement | null>[];
  onTap?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  ariaLabel?: string;
}

export const BlinkPresenceOrb: React.FC<BlinkPresenceOrbProps> = ({
  phase,
  size = 'dock',
  active = false,
  reflectionTargets,
  onTap,
  onHoldStart,
  onHoldEnd,
  ariaLabel = 'Hey Blink assistant',
}) => {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const metalRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  // Cursor-driven spring-physics liquid-metal dent along the circular stroke
  useMetalBend(metalRef);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  const isDock = size === 'dock';
  const dim = isDock ? 60 : 124;
  const isListening = phase === 'listening';
  const isBusy = phase === 'thinking' || phase === 'responding';

  const handlePointerDown = () => {
    setPressing(true);
    didHoldRef.current = false;
    if (onHoldStart) {
      holdTimerRef.current = window.setTimeout(() => {
        didHoldRef.current = true;
        onHoldStart();
      }, 320);
    }
  };

  const handlePointerUp = () => {
    setPressing(false);
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (didHoldRef.current) {
      onHoldEnd?.();
    } else {
      onTap?.();
    }
  };

  const handlePointerCancel = () => {
    setPressing(false);
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (didHoldRef.current) onHoldEnd?.();
  };

  const orbInterior = (
    <>
      {/* Subtle ThinkingOrb activity ring during listening / thinking / responding */}
      {(isListening || isBusy) && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          style={{
            transform: isDock ? 'scale(0.86)' : 'scale(1.68)',
            mixBlendMode: 'screen',
            opacity: 0.44,
          }}
        >
          <ThinkingOrb
            state={PHASE_TO_ORB[phase]}
            size={64}
            theme="dark"
            speed={isListening ? 1.2 : 1.05}
            paused={prefersReducedMotion}
            color="#65D6FF"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Signature Glowing Wavy Twin Blink Eyes blinking naturally */}
      <div className="pointer-events-none relative z-20 flex items-center justify-center">
        <BlinkEyes
          variant={isDock ? 'dock' : 'stage'}
          awake={true}
          attentive={isListening}
          curious={isBusy}
        />
      </div>

      {/* Subtle top curved dark-glass highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 38% 16%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.025) 26%, transparent 55%)',
        }}
      />
    </>
  );

  const surfaceStyle: React.CSSProperties = {
    width: `${dim}px`,
    height: `${dim}px`,
    transform: pressing ? 'scale(0.95)' : 'scale(1)',
    background:
      'radial-gradient(circle at 50% 48%, #071324 0%, #05090F 66%, #030406 100%)',
    boxShadow: isListening
      ? '0 0 26px rgba(38,123,255,0.45), inset 0 0 18px rgba(101,214,255,0.22)'
      : '0 10px 24px rgba(0,0,0,0.72)',
  };

  const metalStrength = isListening || isBusy || active ? 1 : 0.92;

  if (!onTap && !onHoldStart) {
    return (
      <MetalFx
        ref={metalRef}
        preset="chromatic"
        variant="circle"
        theme="dark"
        innerShadow
        strength={metalStrength}
        paused={prefersReducedMotion}
        reflectionTargets={reflectionTargets}
        className="shrink-0 rounded-full"
      >
        <div
          role="img"
          aria-label={ariaLabel}
          style={surfaceStyle}
          className="relative flex items-center justify-center rounded-full overflow-hidden select-none"
        >
          {orbInterior}
        </div>
      </MetalFx>
    );
  }

  return (
    <MetalFx
      ref={metalRef}
      preset="chromatic"
      variant="circle"
      theme="dark"
      innerShadow
      strength={metalStrength}
      paused={prefersReducedMotion}
      reflectionTargets={reflectionTargets}
      className="shrink-0 rounded-full"
    >
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap?.();
          }
        }}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        style={surfaceStyle}
        className="relative flex items-center justify-center rounded-full overflow-hidden select-none transition-transform duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] focus-visible:outline-offset-3"
      >
        {orbInterior}
      </button>
    </MetalFx>
  );
};
