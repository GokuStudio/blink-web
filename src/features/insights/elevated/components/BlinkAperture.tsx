import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { WifiOff, Pause } from 'lucide-react';
import type { DerivedBlinkZone } from '../data/mockBlinkData';

interface BlinkApertureProps {
  blinkRate: number;
  paused: boolean;
  connected: boolean;
  baseline: number;
  zone: DerivedBlinkZone;
  expanded?: boolean;
  onTap?: () => void;
  isValidZero?: boolean;
}

const SCALE_MAX = 25; // 3 clean subtle arc segments across 0–25 blinks/min
const SEGMENT_COUNT = 3;
const SWEEP_START_DEG = -204; // Symmetrical open horseshoe
const SWEEP_END_DEG = 24;
const CENTERLINE_GAP_DEG = 19.5; // Accounts for round caps -> crisp separation between the 3 arcs

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const start = polarToXY(cx, cy, r, startDeg);
  const end = polarToXY(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function useAnimatedNumber(target: number, active: boolean, reducedMotion: boolean): number {
  const [display, setDisplay] = useState<number>(target);
  const prevRef = useRef<number>(target);

  useEffect(() => {
    if (!active) return;
    const startVal = prevRef.current;
    if (reducedMotion || startVal === target) {
      prevRef.current = target;
      setDisplay(target);
      return;
    }

    let rafId = 0;
    const duration = 360;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = startVal + (target - startVal) * eased;
      setDisplay(val);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
        setDisplay(target);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, active, reducedMotion]);

  return display;
}

/**
 * Subtle 3-segment circular blink gauge with seamlessly feathered radial glow,
 * automatic blink-rate color adaptation, and clean centered Geist numeric readout.
 */
export const BlinkAperture: React.FC<BlinkApertureProps> = ({
  blinkRate,
  paused,
  connected,
  baseline,
  zone,
  expanded = false,
  onTap,
  isValidZero = false,
}) => {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const isInactive = !connected || paused || (blinkRate <= 0 && !isValidZero);
  const animatedRate = useAnimatedNumber(blinkRate, !isInactive, prefersReducedMotion);

  const cx = 136;
  const cy = 136;
  const ringRadius = 104;
  const strokeWidth = 17;

  const { segments, dotPoint, activeAngle } = useMemo(() => {
    const totalSweep = SWEEP_END_DEG - SWEEP_START_DEG; // 228°
    const segSpan =
      (totalSweep - CENTERLINE_GAP_DEG * (SEGMENT_COUNT - 1)) / SEGMENT_COUNT;
    const unitsPerSeg = SCALE_MAX / SEGMENT_COUNT;
    const clamped = isInactive ? 0 : Math.min(SCALE_MAX, Math.max(0, animatedRate));

    const currentSegIdx =
      !isInactive && clamped > 0
        ? Math.min(SEGMENT_COUNT - 1, Math.floor((clamped - 0.001) / unitsPerSeg))
        : -1;

    const segs = Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
      const startDeg = SWEEP_START_DEG + i * (segSpan + CENTERLINE_GAP_DEG);
      const endDeg = startDeg + segSpan;
      return {
        index: i,
        startDeg,
        endDeg,
        path: describeArc(cx, cy, ringRadius, startDeg, endDeg),
        isPassed: !isInactive && i < currentSegIdx,
        isCurrent: !isInactive && i === currentSegIdx,
      };
    });

    let bead: { x: number; y: number; deg: number } | null = null;
    if (!isInactive && currentSegIdx >= 0) {
      const segMin = currentSegIdx * unitsPerSeg;
      const frac = Math.min(1, Math.max(0.06, (clamped - segMin) / unitsPerSeg));
      const deg =
        segs[currentSegIdx].startDeg +
        frac * (segs[currentSegIdx].endDeg - segs[currentSegIdx].startDeg);
      const pt = polarToXY(cx, cy, ringRadius, deg);
      bead = { ...pt, deg };
    }

    return {
      segments: segs,
      dotPoint: bead,
      activeAngle: bead ? bead.deg : -90,
    };
  }, [animatedRate, isInactive]);

  // Offset feathering focal center gently toward the active bead while staying deep inside a huge circle
  const glowFocus = polarToXY(200, 200, 32, activeAngle);
  const displayNumber = isInactive ? '—' : Math.round(animatedRate).toString();

  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
      aria-expanded={expanded}
      aria-label={`Blink cadence gauge: ${
        isInactive
          ? !connected
            ? 'Desk Node disconnected'
            : 'Tracking paused'
          : `${Math.round(blinkRate)} blinks per minute, ${zone.subLabel}, personal baseline ${baseline}`
      }. Tap for scale details.`}
      className="relative flex h-[238px] w-[272px] max-w-[82vw] items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] focus-visible:outline-offset-4 select-none"
    >
      {/* Oversized circular SVG ambient glow — fades smoothly to 0% well inside bounds (zero square edge) */}
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 overflow-visible ${
          !isInactive && !prefersReducedMotion ? 'animate-companion-breathe' : ''
        }`}
      >
        <defs>
          <radialGradient
            id="featheredGaugeGlow"
            cx="50%"
            cy="50%"
            r="48%"
            fx={`${(glowFocus.x / 400) * 100}%`}
            fy={`${(glowFocus.y / 400) * 100}%`}
          >
            <stop
              offset="0%"
              stopColor={zone.accentHex}
              stopOpacity={isInactive ? '0.07' : '0.22'}
            />
            <stop
              offset="34%"
              stopColor={zone.accentHex}
              stopOpacity={isInactive ? '0.025' : '0.085'}
            />
            <stop
              offset="62%"
              stopColor={zone.accentHex}
              stopOpacity={isInactive ? '0.005' : '0.02'}
            />
            <stop offset="86%" stopColor={zone.accentHex} stopOpacity="0" />
            <stop offset="100%" stopColor={zone.accentHex} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="196" fill="url(#featheredGaugeGlow)" />
      </svg>

      {/* 3 Subtle Translucent Curved Arc Segments */}
      <svg
        viewBox="0 0 272 238"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <filter id="dotSoftHalo" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {segments.map((seg) => {
          const strokeColor = seg.isCurrent
            ? zone.segmentTint
            : seg.isPassed
              ? `rgba(${zone.ambientRgb}, 0.22)`
              : 'rgba(255, 255, 255, 0.14)';

          return (
            <motion.path
              key={seg.index}
              d={seg.path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.35,
                delay: prefersReducedMotion ? 0 : seg.index * 0.065,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ transition: 'stroke 320ms ease' }}
            />
          );
        })}

        {/* Single Clean Luminous Indicator Bead positioned at the exact blink rate */}
        {dotPoint && (
          <motion.g
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, delay: 0.26 }}
          >
            <circle
              cx={dotPoint.x}
              cy={dotPoint.y}
              r="11"
              fill={zone.accentHex}
              opacity="0.28"
              filter="url(#dotSoftHalo)"
            />
            <circle
              cx={dotPoint.x}
              cy={dotPoint.y}
              r="7.4"
              fill={zone.accentHex}
              style={{ transition: 'fill 300ms ease' }}
            />
          </motion.g>
        )}
      </svg>

      {/* Clean Centered Geist Numeric Readout */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: prefersReducedMotion ? 0 : 0.22 }}
        className="relative z-10 mt-6 flex flex-col items-center justify-center text-center"
      >
        {!connected ? (
          <div className="flex flex-col items-center gap-2 text-[#8E9690]">
            <WifiOff className="h-6 w-6" strokeWidth={1.7} />
            <span className="text-[13px] font-medium text-[#98A09A]">Node away</span>
          </div>
        ) : paused || blinkRate <= 0 ? (
          <div className="flex flex-col items-center gap-1.5 text-[#98A09A]">
            <span className="font-num text-[48px] font-semibold leading-none text-[#8C938E] tabular-nums">
              0
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] text-[#8E9690]">
              <Pause className="h-3 w-3" /> Paused
            </span>
          </div>
        ) : (
          <>
            <span className="font-num text-[60px] font-semibold leading-none tracking-[-0.04em] text-[#F4F6F3] tabular-nums">
              {displayNumber}
            </span>
            <span className="mt-1 text-[13px] font-medium tracking-[0.01em] text-[#98A09A]">
              per min
            </span>
            <span
              className="mt-1.5 text-[12.5px] font-medium tracking-[-0.005em] transition-colors duration-300"
              style={{ color: zone.accentHex }}
            >
              {zone.subLabel}
            </span>
          </>
        )}
      </motion.div>
    </motion.button>
  );
};
