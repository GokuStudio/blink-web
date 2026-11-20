import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Wifi, Play } from 'lucide-react';
import { blinkSound } from '../utils/soundEngine';

interface SwipeToRestProps {
  label: string;
  mode?: 'rest' | 'reconnect' | 'resume';
  secondaryLabel?: string;
  trackRef?: React.RefObject<HTMLDivElement>;
  onComplete: () => void;
  onSecondaryAction?: () => void;
}

/**
 * Precision custom SVG stopwatch whose needle rotates cleanly around its exact
 * dial center pivot (12, 13.5), driven by swipe position + instantaneous velocity.
 */
const PrecisionStopwatchIcon: React.FC<{
  angleDeg: number;
  crownPressed: boolean;
}> = ({ angleDeg, crownPressed }) => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="overflow-visible"
  >
    {/* Top crown stem & cap — depresses slightly on swipe completion */}
    <g
      style={{
        transform: crownPressed ? 'translateY(1.1px)' : 'translateY(0px)',
        transition: 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <line
        x1="9.6"
        y1="3.2"
        x2="14.4"
        y2="3.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="3.4"
        x2="12"
        y2="5.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </g>

    {/* Side chrono pusher */}
    <line
      x1="17.3"
      y1="7.4"
      x2="18.9"
      y2="5.9"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />

    {/* Circular stopwatch case centered precisely at (12, 13.5) */}
    <circle
      cx="12"
      cy="13.5"
      r="7.4"
      stroke="currentColor"
      strokeWidth="2.05"
    />

    {/* Subtle 12 o'clock index mark */}
    <line
      x1="12"
      y1="7.6"
      x2="12"
      y2="8.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.55"
    />

    {/* Rotating stopwatch needle strictly pivoted at exact center (12, 13.5) */}
    <g transform={`rotate(${angleDeg.toFixed(1)} 12 13.5)`}>
      <line
        x1="12"
        y1="13.5"
        x2="12"
        y2="9.0"
        stroke="currentColor"
        strokeWidth="2.0"
        strokeLinecap="round"
      />
      {/* Tiny counterbalance tail */}
      <line
        x1="12"
        y1="13.5"
        x2="12"
        y2="14.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </g>

    {/* Exact center pivot pin */}
    <circle cx="12" cy="13.5" r="1.45" fill="currentColor" />
  </svg>
);

/**
 * Tactile horizontal Swipe-to-Rest pill control with:
 * - Mechanical stopwatch needle rotating on its center pivot from drag position + velocity
 * - 5-second periodic left-to-right light sheen inviting interaction
 * - Progressive chevron illumination & velocity-matched vernier detents
 */
export const SwipeToRest: React.FC<SwipeToRestProps> = ({
  label,
  mode = 'rest',
  secondaryLabel,
  trackRef: externalTrackRef,
  onComplete,
  onSecondaryAction,
}) => {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const localTrackRef = useRef<HTMLDivElement>(null);
  const resolvedTrackRef = externalTrackRef ?? localTrackRef;

  const [dragX, setDragX] = useState(0);
  const [velocityBoostDeg, setVelocityBoostDeg] = useState(0);
  const [maxTravel, setMaxTravel] = useState(260);
  const [dragging, setDragging] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const startXRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number }>({ x: 0, t: 0 });
  const lastDetentRef = useRef(0);

  const thumbSize = 48;
  const padding = 4;

  const measureTravel = () => {
    const el = resolvedTrackRef.current;
    if (!el) return 260;
    const travel = Math.max(120, el.clientWidth - thumbSize - padding * 2);
    setMaxTravel(travel);
    return travel;
  };

  const triggerCompletion = (travel: number) => {
    setTriggered(true);
    setDragX(travel);
    setVelocityBoostDeg(0);
    blinkSound.playWaveFlow();
    window.setTimeout(() => {
      onComplete();
      window.setTimeout(() => {
        setTriggered(false);
        setDragX(0);
        setVelocityBoostDeg(0);
        lastDetentRef.current = 0;
      }, 360);
    }, 140);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (triggered) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    measureTravel();
    startXRef.current = e.clientX - dragX;
    lastMoveRef.current = { x: e.clientX, t: performance.now() };
    lastDetentRef.current = 0;
    setVelocityBoostDeg(0);
    setDragging(true);
    blinkSound.playVernierTick(0.15);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || triggered) return;
    const now = performance.now();
    const dt = Math.max(8, now - lastMoveRef.current.t);
    const dx = e.clientX - lastMoveRef.current.x;
    const speedPxPerMs = dx / dt;
    lastMoveRef.current = { x: e.clientX, t: now };

    const next = Math.min(maxTravel, Math.max(0, e.clientX - startXRef.current));
    setDragX(next);

    // Subtle inertial needle lead driven by swipe velocity (clamped to +/- 55deg)
    const boost = Math.max(-40, Math.min(55, speedPxPerMs * 28));
    setVelocityBoostDeg(boost);

    // Subtle escalating haptic-like ticks at 25%, 50%, 75% matching drag speed
    const detent = Math.floor((next / Math.max(1, maxTravel)) * 4);
    if (detent > lastDetentRef.current && detent <= 3) {
      lastDetentRef.current = detent;
      blinkSound.playVernierTick(detent / 3);
    }
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    setVelocityBoostDeg(0);
    const travel = measureTravel();
    if (dragX >= travel * 0.68) {
      triggerCompletion(travel);
    } else {
      setDragX(0);
    }
  };

  const progress = maxTravel > 0 ? Math.min(1, dragX / maxTravel) : 0;
  // Base 42deg resting stopwatch angle -> sweeps full 360deg clockwise across swipe + velocity inertia
  const needleAngle = prefersReducedMotion
    ? 42 + progress * 318
    : 42 + progress * 360 + velocityBoostDeg;

  return (
    <div className="w-full space-y-2.5">
      <div
        ref={resolvedTrackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Drag slider right or press Enter to activate.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
            e.preventDefault();
            triggerCompletion(measureTravel());
          }
        }}
        className="relative flex h-[56px] w-full items-center rounded-full surface-well p-[4px] overflow-hidden select-none focus-visible:outline-2 focus-visible:outline-[#A6FA4C] focus-visible:outline-offset-2"
      >
        {/* 5-second periodic light traveling left-to-right to invite swiping */}
        {!dragging && !triggered && !prefersReducedMotion && (
          <div
            aria-hidden="true"
            className="animate-swipe-shimmer pointer-events-none absolute inset-y-0 left-0 w-[96px]"
            style={{
              background:
                mode === 'rest'
                  ? 'linear-gradient(90deg, transparent 0%, rgba(166,250,76,0.16) 40%, rgba(255,255,255,0.22) 52%, rgba(166,250,76,0.12) 66%, transparent 100%)'
                  : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)',
            }}
          />
        )}

        {/* Illuminated swipe trail fill */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[4px] left-[4px] rounded-full"
          style={{
            width: `${thumbSize + dragX}px`,
            background:
              mode === 'rest'
                ? 'linear-gradient(90deg, rgba(166,250,76,0.22) 0%, rgba(166,250,76,0.08) 100%)'
                : 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
            transition: dragging ? 'none' : 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />

        {/* Centered swipe prompt + progressively lit directional chevrons */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => triggerCompletion(measureTravel())}
          className="absolute inset-0 flex items-center justify-center pl-9 pr-4 text-[13.5px] font-medium text-[#C8CFCB] cursor-pointer"
          style={{
            opacity: Math.max(0.15, 1 - progress * 1.25),
            transition: dragging ? 'none' : 'opacity 200ms ease',
          }}
        >
          <span>{label}</span>
          <span className="ml-2 inline-flex items-center text-[#7E8782]" aria-hidden="true">
            <ChevronRight
              className={`h-3.5 w-3.5 -mr-1.5 transition-colors duration-150 ${
                progress > 0.15 ? 'text-[#A6FA4C] opacity-90' : 'opacity-45'
              }`}
            />
            <ChevronRight
              className={`h-3.5 w-3.5 -mr-1.5 transition-colors duration-150 ${
                progress > 0.4 ? 'text-[#A6FA4C] opacity-100' : 'opacity-75'
              }`}
            />
            <ChevronRight className="h-3.5 w-3.5 text-[#A6FA4C]" />
          </span>
        </button>

        {/* Mildly skeuomorphic dark tactile thumb with accent-green stopwatch */}
        <motion.div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          animate={{ x: dragX, scale: dragging ? 0.96 : 1 }}
          transition={
            dragging || prefersReducedMotion
              ? { duration: 0.08 }
              : { type: 'spring', stiffness: 420, damping: 32 }
          }
          style={{
            background:
              'linear-gradient(155deg, #2F3431 0%, #1D211F 48%, #131615 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: dragging
              ? 'inset 0 2px 5px rgba(0, 0, 0, 0.78), inset 0 -1px 1px rgba(255, 255, 255, 0.08), 0 3px 10px rgba(0, 0, 0, 0.72), 0 0 14px rgba(166, 250, 76, 0.18)'
              : 'inset 0 1.5px 1px rgba(255, 255, 255, 0.18), inset 0 -2px 4px rgba(0, 0, 0, 0.72), 0 6px 16px rgba(0, 0, 0, 0.78), 0 1px 2px rgba(0, 0, 0, 0.9)',
          }}
          className="relative z-10 flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full touch-none text-[#A6FA4C] cursor-grab active:cursor-grabbing"
        >
          {/* Subtle concave inner thumb dimple for physical tactile feel */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[4px] rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 68%, rgba(255, 255, 255, 0.05) 0%, rgba(12, 15, 13, 0.42) 66%, rgba(0, 0, 0, 0.35) 100%)',
              boxShadow:
                'inset 0 1.5px 3px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 255, 255, 0.06)',
            }}
          />

          <span
            className="relative z-10 flex items-center justify-center"
            style={{
              filter:
                progress > 0.1 || dragging
                  ? 'drop-shadow(0 0 7px rgba(166, 250, 76, 0.5))'
                  : 'drop-shadow(0 0 4px rgba(166, 250, 76, 0.28))',
            }}
          >
            {mode === 'reconnect' ? (
              <Wifi className="h-[18px] w-[18px]" strokeWidth={2.2} />
            ) : mode === 'resume' ? (
              <Play className="h-[18px] w-[18px] ml-0.5" strokeWidth={2.2} />
            ) : (
              <PrecisionStopwatchIcon
                angleDeg={needleAngle}
                crownPressed={triggered || progress >= 0.72}
              />
            )}
          </span>
        </motion.div>
      </div>

      {secondaryLabel && onSecondaryAction && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onSecondaryAction}
            className="press-tactile rounded-full px-3 py-1 text-[12px] font-medium text-[#7F8782] hover:text-[#DCE0DD] cursor-pointer"
          >
            {secondaryLabel}
          </button>
        </div>
      )}
    </div>
  );
};
