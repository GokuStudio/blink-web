/**
 * Blink Stage 2D — Voice Ring Visual System
 *
 * Renders the centered, audio-reactive, translucent voice bubble using
 * Libraries.dev `voice-ring` (type="ring") tuned to Blink's restrained
 * blue / cyan / violet / soft-white palette on a pitch-black screen.
 *
 * Audio reactivity invariant:
 * - Zero per-frame React state updates: `level` is passed as a stable getter
 *   reading `audioLevelsRef` directly at 60 FPS inside VoiceRing's own rAF loop.
 * - Listening / user speaking reacts strictly to `inputLevel` (microphone).
 * - Assistant speaking reacts strictly to `outputLevel` (Gemini playback DAC).
 * - Never feeds Math.random() or synthetic noise into a live visualizer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { VoiceRing, type VoiceOrbState, type TypeOpts } from 'voice-ring';
import type { VoiceAudioLevels } from '../services/voice-session.interface';
import type { VoiceRingTuning } from '../integration/useBlinkVoiceExperience';
import {
  getVoiceStatusCaption,
  type VoiceExperienceState,
} from '../integration/voiceExperienceStateMachine';

export interface BlinkVoiceBubbleProps {
  /** Authoritative integrated voice experience state */
  experienceState: VoiceExperienceState;
  /** High-frequency audio ref updated without React re-renders */
  audioLevelsRef: React.MutableRefObject<VoiceAudioLevels>;
  /** Whether the user microphone is currently muted */
  isMuted?: boolean;
  /** True when running in explicit simulated preview mode */
  isSimulated?: boolean;
  /** Display surface context: embedded square device vs fullscreen standalone /device */
  variant?: 'desktop-integrated' | 'standalone-device';
  /** Concise error explanation displayed calmly in VOICE_ERROR state */
  errorMessage?: string | null;
  /** Optional user-adjusted visualizer tuning (ring/mono, sensitivity, glow, speed, warmth) */
  tuning?: VoiceRingTuning;
  /** Optional click handler (e.g. tap bubble to interrupt while speaking) */
  onBubbleClick?: () => void;
}

function mapExperienceToRingState(state: VoiceExperienceState): VoiceOrbState {
  switch (state) {
    case 'VOICE_LISTENING':
    case 'USER_SPEAKING':
    case 'VOICE_INTERRUPTED':
      return 'listening';
    case 'VOICE_REQUESTED':
    case 'MIC_PERMISSION_PENDING':
    case 'VOICE_CONNECTING':
    case 'VOICE_PROCESSING':
      return 'processing';
    case 'ASSISTANT_SPEAKING':
      return 'speaking';
    case 'EYE_IDLE':
    case 'VOICE_ENDING':
    case 'RETURNING_TO_EYES':
    case 'VOICE_ERROR':
      return 'idle';
  }
}

function getPaletteOptsForState(
  state: VoiceExperienceState,
  reducedMotion: boolean
): {
  speed: number;
  idle: number;
  calm: number;
  sensitivity: number;
  opts: TypeOpts;
  glowBackdrop: string;
} {
  const motionScale = reducedMotion ? 0.35 : 1;

  switch (state) {
    case 'USER_SPEAKING':
      return {
        speed: 1.05 * motionScale,
        idle: reducedMotion ? 0.03 : 0.08,
        calm: 0.36,
        sensitivity: 1.05,
        opts: {
          hue: -6,
          chroma: 0.96,
          warmth: -0.18,
          contrast: 1.08,
          glowSize: 0.96,
          bloom: 0.5,
          fringe: 0.72,
          core: 1.05,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(53, 223, 255, 0.22) 0%, rgba(108, 125, 255, 0.10) 42%, rgba(0, 0, 0, 0) 72%)',
      };

    case 'VOICE_LISTENING':
    case 'VOICE_INTERRUPTED':
      return {
        speed: 0.92 * motionScale,
        idle: reducedMotion ? 0.02 : 0.07,
        calm: 0.34,
        sensitivity: 0.98,
        opts: {
          hue: -10,
          chroma: 0.88,
          warmth: -0.26,
          contrast: 1.02,
          glowSize: 0.9,
          bloom: 0.44,
          fringe: 0.62,
          core: 1.0,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(53, 223, 255, 0.16) 0%, rgba(96, 130, 255, 0.08) 44%, rgba(0, 0, 0, 0) 72%)',
      };

    case 'VOICE_REQUESTED':
    case 'MIC_PERMISSION_PENDING':
    case 'VOICE_CONNECTING':
    case 'VOICE_PROCESSING':
      return {
        speed: 0.76 * motionScale,
        idle: reducedMotion ? 0.02 : 0.06,
        calm: 0.28,
        sensitivity: 0.75,
        opts: {
          hue: 18,
          chroma: 0.84,
          warmth: -0.32,
          contrast: 1.0,
          glowSize: 0.82,
          bloom: 0.4,
          fringe: 0.55,
          core: 0.95,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(118, 132, 255, 0.16) 0%, rgba(53, 200, 255, 0.07) 45%, rgba(0, 0, 0, 0) 72%)',
      };

    case 'ASSISTANT_SPEAKING':
      return {
        speed: 0.98 * motionScale,
        idle: reducedMotion ? 0.03 : 0.09,
        calm: 0.36,
        sensitivity: 1.1,
        // Warmer soft-white/cyan internal light when Blink speaks
        opts: {
          hue: -14,
          chroma: 0.82,
          warmth: 0.14,
          contrast: 1.06,
          glowSize: 1.0,
          bloom: 0.52,
          fringe: 0.58,
          core: 1.12,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(164, 232, 255, 0.22) 0%, rgba(130, 148, 255, 0.11) 44%, rgba(0, 0, 0, 0) 72%)',
      };

    case 'VOICE_ERROR':
      return {
        speed: 0.32 * motionScale,
        idle: 0.02,
        calm: 0.18,
        sensitivity: 0.4,
        opts: {
          hue: 8,
          chroma: 0.38,
          warmth: -0.2,
          contrast: 0.88,
          glowSize: 0.52,
          bloom: 0.22,
          fringe: 0.25,
          core: 0.78,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(248, 113, 113, 0.12) 0%, rgba(100, 116, 139, 0.05) 42%, rgba(0, 0, 0, 0) 70%)',
      };

    case 'VOICE_ENDING':
    case 'RETURNING_TO_EYES':
    case 'EYE_IDLE':
    default:
      return {
        speed: 0.5 * motionScale,
        idle: 0.03,
        calm: 0.22,
        sensitivity: 0.6,
        opts: {
          hue: -8,
          chroma: 0.72,
          warmth: -0.22,
          contrast: 0.95,
          glowSize: 0.7,
          bloom: 0.32,
          fringe: 0.4,
          core: 0.9,
        },
        glowBackdrop:
          'radial-gradient(circle, rgba(53, 223, 255, 0.10) 0%, rgba(0, 0, 0, 0) 68%)',
      };
  }
}

function canRender2dCanvas(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext && canvas.getContext('2d'));
  } catch {
    return false;
  }
}

export const BlinkVoiceBubble: React.FC<BlinkVoiceBubbleProps> = ({
  experienceState,
  audioLevelsRef,
  isMuted = false,
  isSimulated = false,
  variant = 'desktop-integrated',
  errorMessage = null,
  tuning: userTuning,
  onBubbleClick,
}) => {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<VoiceExperienceState>(experienceState);
  stateRef.current = experienceState;
  const mutedRef = useRef<boolean>(isMuted);
  mutedRef.current = isMuted;

  const [ringSize, setRingSize] = useState<number>(variant === 'standalone-device' ? 236 : 152);
  const canvasSupported = useMemo(() => canRender2dCanvas(), []);

  // Dynamically size ring from host screen dimensions, maintaining generous black negative space
  // Inside desktop-integrated mode, keep clear of the top camera housing and lower bezel rim.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateSize = (width: number, height: number) => {
      const minDim = Math.min(width, height);
      if (minDim <= 0) return;
      const ratio = variant === 'standalone-device' ? 0.44 : 0.34;
      const clamped = Math.round(
        Math.max(
          variant === 'standalone-device' ? 156 : 118,
          Math.min(variant === 'standalone-device' ? 300 : 184, minDim * ratio)
        )
      );
      setRingSize((prev) => (Math.abs(prev - clamped) >= 4 ? clamped : prev));
    };

    const rect = el.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  // Strict real-channel level getter sampled at 60 FPS inside VoiceRing with zero React re-renders
  const getAudioLevel = useCallback((): number => {
    const s = stateRef.current;
    const levels = audioLevelsRef.current;
    if (!levels) return 0;

    if (s === 'ASSISTANT_SPEAKING') {
      // Strictly driven by assistant playback signal, never microphone input
      return Math.max(0, Math.min(1, levels.outputLevel));
    }
    if (s === 'VOICE_LISTENING' || s === 'USER_SPEAKING' || s === 'VOICE_INTERRUPTED') {
      if (mutedRef.current) return 0;
      return Math.max(0, Math.min(1, levels.inputLevel));
    }
    return 0;
  }, [audioLevelsRef]);

  const ringState = mapExperienceToRingState(experienceState);
  const baseTuning = useMemo(
    () => getPaletteOptsForState(experienceState, prefersReducedMotion),
    [experienceState, prefersReducedMotion]
  );

  const ringType = userTuning?.ringType ?? 'ring';
  const sensitivityScale = userTuning?.sensitivityScale ?? 1;
  const glowScale = userTuning?.glowScale ?? 1;
  const speedScale = userTuning?.speedScale ?? 1;
  const warmthOffset = userTuning?.warmthOffset ?? 0;

  const tuning = useMemo(
    () => ({
      ...baseTuning,
      speed: baseTuning.speed * speedScale,
      sensitivity: baseTuning.sensitivity * sensitivityScale,
      opts: {
        ...baseTuning.opts,
        glowSize: (baseTuning.opts.glowSize ?? 0.9) * glowScale,
        bloom: (baseTuning.opts.bloom ?? 0.48) * glowScale,
        warmth: Math.max(-1, Math.min(1, (baseTuning.opts.warmth ?? -0.2) + warmthOffset)),
      },
    }),
    [baseTuning, glowScale, sensitivityScale, speedScale, warmthOffset]
  );

  const isEntering =
    experienceState === 'VOICE_REQUESTED' ||
    experienceState === 'MIC_PERMISSION_PENDING';
  const isExiting =
    experienceState === 'VOICE_ENDING' ||
    experienceState === 'RETURNING_TO_EYES';
  const isInteractiveInterrupt =
    experienceState === 'ASSISTANT_SPEAKING' || experienceState === 'VOICE_PROCESSING';

  const statusCaption = getVoiceStatusCaption(experienceState, { isMuted, isSimulated });

  const containerTransformClass = isExiting
    ? prefersReducedMotion
      ? 'opacity-0'
      : 'opacity-0 scale-[0.76]'
    : isEntering
      ? prefersReducedMotion
        ? 'opacity-90'
        : 'opacity-90 scale-[0.92]'
      : 'opacity-100 scale-100';

  return (
    <div
      ref={containerRef}
      data-testid="blink-voice-bubble-stage"
      data-voice-state={experienceState}
      data-voice-simulated={isSimulated ? 'true' : 'false'}
      className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none transition-all duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${containerTransformClass}`}
    >
      {/* Soft restrained spatial glow behind the Voice Ring */}
      <div
        aria-hidden="true"
        className={`absolute rounded-full transition-all duration-500 ease-out ${
          variant === 'desktop-integrated' ? 'translate-y-[4%]' : ''
        }`}
        style={{
          width: ringSize * 1.5,
          height: ringSize * 1.5,
          background: tuning.glowBackdrop,
          opacity: isExiting ? 0 : 1,
        }}
      />

      {/* Centered Voice Ring Object */}
      <div
        role={isInteractiveInterrupt && onBubbleClick ? 'button' : 'img'}
        tabIndex={isInteractiveInterrupt && onBubbleClick ? 0 : -1}
        aria-label={
          isInteractiveInterrupt && onBubbleClick
            ? `${statusCaption || 'Blink voice active'}. Press to interrupt.`
            : statusCaption || 'Blink voice presence'
        }
        onClick={isInteractiveInterrupt && onBubbleClick ? onBubbleClick : undefined}
        onKeyDown={
          isInteractiveInterrupt && onBubbleClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBubbleClick();
                }
              }
            : undefined
        }
        data-testid="blink-voice-ring-wrapper"
        className={`relative flex items-center justify-center rounded-full ${
          variant === 'desktop-integrated' ? 'translate-y-[4%]' : ''
        } ${
          isInteractiveInterrupt && onBubbleClick
            ? 'pointer-events-auto cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF]'
            : 'pointer-events-none'
        }`}
        style={{ width: ringSize, height: ringSize }}
      >
        {canvasSupported ? (
          <VoiceRing
            type={ringType}
            state={ringState}
            size={ringSize}
            level={getAudioLevel}
            theme="dark"
            emotion="calm"
            speed={tuning.speed}
            idle={tuning.idle}
            calm={tuning.calm}
            sensitivity={tuning.sensitivity}
            paused={experienceState === 'EYE_IDLE'}
            opts={tuning.opts}
            aria-label={`Blink voice visualizer (${ringState})`}
            data-testid="blink-voice-ring-canvas"
          />
        ) : (
          /* Deterministic fallback ring for headless/JSDOM test environments without 2D canvas */
          <div
            data-testid="blink-voice-ring-fallback"
            className="rounded-full border border-[#35DFFF]/50 bg-gradient-to-br from-[#35DFFF]/20 via-[#6B7CFF]/15 to-white/10 shadow-[0_0_28px_rgba(53,223,255,0.22)]"
            style={{ width: ringSize * 0.72, height: ringSize * 0.72 }}
          />
        )}
      </div>

      {/* Compact, nonintrusive state label positioned cleanly inside visible screen aperture */}
      <div
        role="status"
        aria-live="polite"
        className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-center px-4 ${
          variant === 'standalone-device' ? 'bottom-[15%]' : 'bottom-[21.5%]'
        }`}
      >
        {statusCaption && (
          <div
            data-testid="voice-bubble-status-label"
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 border border-white/[0.08] px-3 py-1 backdrop-blur-md"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                experienceState === 'VOICE_ERROR'
                  ? 'bg-red-400'
                  : experienceState === 'ASSISTANT_SPEAKING'
                    ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]'
                    : experienceState === 'VOICE_PROCESSING' ||
                        experienceState === 'VOICE_CONNECTING'
                      ? 'bg-[#8B9DFF] animate-pulse'
                      : isMuted
                        ? 'bg-neutral-500'
                        : 'bg-[#35DFFF] shadow-[0_0_6px_rgba(53,223,255,0.8)]'
              }`}
            />
            <span className="text-[11px] font-medium tracking-[0.01em] text-neutral-200/90">
              {statusCaption}
            </span>
            {isSimulated && experienceState !== 'VOICE_ERROR' && (
              <span
                data-testid="voice-preview-badge"
                className="ml-0.5 rounded-full bg-white/[0.08] px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-[0.06em] text-sky-300/90"
              >
                Preview
              </span>
            )}
          </div>
        )}

        {experienceState === 'VOICE_ERROR' && errorMessage && (
          <p
            data-testid="voice-bubble-error-text"
            className="max-w-[230px] text-[10.5px] leading-snug text-red-300/90"
          >
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
};
