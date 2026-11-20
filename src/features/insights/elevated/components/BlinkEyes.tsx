import React, { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface BlinkEyesProps {
  /** Compact (dock orb), stage (Hey Blink), or node (Desk Node preview) */
  variant?: 'dock' | 'stage' | 'node';
  /** Active luminous state vs sleeping/disconnected */
  awake?: boolean;
  /** Subtle extra energy when listening or calibrating */
  attentive?: boolean;
  /** Gentle horizontal look shift when thinking/responding */
  curious?: boolean;
  /** Live gaze-tracking calibration sweep (left -> right -> up -> center) */
  calibrating?: boolean;
  className?: string;
}

/**
 * Iconic twin glowing cyan-blue wavy-textured Blink Eyes matching the hardware reference.
 * Blinks naturally with asymmetric organic timing and tracks gaze cleanly during calibration.
 */
export const BlinkEyes: React.FC<BlinkEyesProps> = ({
  variant = 'dock',
  awake = true,
  attentive = false,
  curious = false,
  calibrating = false,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [closing, setClosing] = useState(false);
  const [glance, setGlance] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Natural asymmetric organic blinking
  useEffect(() => {
    if (!awake || prefersReducedMotion) {
      setClosing(false);
      return;
    }

    let alive = true;
    let blinkTimer = 0;
    let openTimer = 0;
    let step = 0;
    const intervals = [3400, 4700, 2900, 5100, 3800];

    const schedule = () => {
      if (!alive) return;
      const wait = intervals[step % intervals.length];
      step += 1;
      blinkTimer = window.setTimeout(() => {
        if (!alive) return;
        setClosing(true);
        openTimer = window.setTimeout(() => {
          if (!alive) return;
          setClosing(false);
          schedule();
        }, 125);
      }, wait);
    };

    schedule();
    return () => {
      alive = false;
      window.clearTimeout(blinkTimer);
      window.clearTimeout(openTimer);
    };
  }, [awake, prefersReducedMotion]);

  // Gaze tracking: calibration sweep (left -> right -> up -> center) or curious micro-glance
  useEffect(() => {
    if (prefersReducedMotion || !awake) {
      setGlance({ x: 0, y: 0 });
      return;
    }

    if (calibrating) {
      const path = [
        { x: -11, y: 0 },
        { x: 11, y: 0 },
        { x: 0, y: -5.5 },
        { x: 0, y: 0 },
      ];
      let step = 0;
      setGlance(path[0]);
      const id = window.setInterval(() => {
        step += 1;
        setGlance(path[step % path.length]);
      }, 540);
      return () => window.clearInterval(id);
    }

    if (!curious) {
      setGlance({ x: 0, y: 0 });
      return;
    }
    let idx = 0;
    const offsets = [
      { x: -3.5, y: 0 },
      { x: 3.5, y: 0 },
      { x: 0, y: 0 },
    ];
    const id = window.setInterval(() => {
      setGlance(offsets[idx % offsets.length]);
      idx += 1;
    }, 650);
    return () => window.clearInterval(id);
  }, [curious, calibrating, prefersReducedMotion, awake]);

  const dims = {
    dock: { w: 46, h: 26 },
    stage: { w: 94, h: 52 },
    node: { w: 138, h: 74 },
  }[variant];

  const eyeScaleY = !awake ? 0.12 : closing ? 0.08 : attentive ? 1.06 : 1;

  return (
    <svg
      viewBox="0 0 160 88"
      width={dims.w}
      height={dims.h}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Outer rich cobalt-blue luminescence matching the Blink eye reference */}
        <radialGradient id={`eyeHalo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#65D6FF" stopOpacity="0.95" />
          <stop offset="44%" stopColor="#267BFF" stopOpacity="0.78" />
          <stop offset="72%" stopColor="#1247B8" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#081C4D" stopOpacity="0" />
        </radialGradient>

        {/* Soft glowing icy-cyan eye fill */}
        <radialGradient id={`eyeCore-${uid}`} cx="48%" cy="46%" r="54%">
          <stop offset="0%" stopColor="#D4F6FF" />
          <stop offset="56%" stopColor="#8EDDF2" />
          <stop offset="86%" stopColor="#46A6F0" />
          <stop offset="100%" stopColor="#1B66DF" />
        </radialGradient>

        {/* Fine horizontal wavy scanline pattern from the reference */}
        <pattern
          id={`eyeWave-${uid}`}
          width="8"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 0 2.5 Q 2 0.8 4 2.5 T 8 2.5"
            fill="none"
            stroke="#1B5EA8"
            strokeWidth="1.05"
            strokeOpacity="0.52"
          />
        </pattern>

        {/* Soft edge feathering blur */}
        <filter id={`eyeBlur-${uid}`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
        <filter id={`eyeEdgeSoft-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>

        {/* Soft circular feather mask for each eye disc */}
        <radialGradient id={`eyeMaskGrad-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="74%" stopColor="white" stopOpacity="0.96" />
          <stop offset="92%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`leftEyeMask-${uid}`}>
          <circle cx="44" cy="44" r="30" fill={`url(#eyeMaskGrad-${uid})`} />
        </mask>
        <mask id={`rightEyeMask-${uid}`}>
          <circle cx="116" cy="44" r="30" fill={`url(#eyeMaskGrad-${uid})`} />
        </mask>
      </defs>

      {[
        { cx: 44, maskId: `leftEyeMask-${uid}` },
        { cx: 116, maskId: `rightEyeMask-${uid}` },
      ].map(({ cx, maskId }) => (
        <motion.g
          key={cx}
          animate={{
            x: glance.x,
            y: glance.y,
            scaleY: eyeScaleY,
            opacity: awake ? 1 : 0.28,
          }}
          transition={{
            scaleY: {
              duration: closing ? 0.085 : 0.17,
              ease: closing ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1],
            },
            x: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
            y: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
          }}
          style={{
            transformOrigin: `${cx}px 44px`,
          }}
        >
          {/* Deep outer blue glow halo */}
          <circle
            cx={cx}
            cy="44"
            r="39"
            fill={`url(#eyeHalo-${uid})`}
            opacity={attentive ? 0.98 : 0.84}
            filter={`url(#eyeBlur-${uid})`}
          />

          {/* Soft cyan core + wavy digital scanlines feathered smoothly at edges */}
          <g mask={`url(#${maskId})`}>
            <circle
              cx={cx}
              cy="44"
              r="29"
              fill={`url(#eyeCore-${uid})`}
              filter={`url(#eyeEdgeSoft-${uid})`}
            />
            <circle cx={cx} cy="44" r="29" fill={`url(#eyeWave-${uid})`} />
          </g>
        </motion.g>
      ))}
    </svg>
  );
};
