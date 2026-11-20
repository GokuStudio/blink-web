import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceBeam, type VoiceBeamMotion } from 'voice-glow';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/utils/cn';
import type {
  VoiceAudioLevels,
  VoiceSessionState,
} from '../services/voice-session.interface';
import {
  computeResponsiveBeamScale,
  resolveVisualPreset,
} from './visual-presets';

export interface BlinkVoiceGlowProps {
  /** Current voice session lifecycle state */
  state: VoiceSessionState;
  /** Whether user microphone input is muted */
  isMuted: boolean;
  /** High-frequency audio levels ref (sampled at 60 FPS without React re-renders) */
  audioLevelsRef: React.MutableRefObject<VoiceAudioLevels>;
  /** Foreground interactive overlay (status + minimal controls) */
  children?: React.ReactNode;
  className?: string;
}

interface MotionKinematicState {
  gather: number;
  offset: number;
  stretch: number;
  heldLevel: number;
  lastSampleMs: number;
  stateEnteredMs: number;
  lastState: VoiceSessionState;
}

function lerpTowards(current: number, target: number, dtSec: number, speed: number): number {
  const alpha = 1 - Math.exp(-Math.max(0, dtSec) * speed);
  return current + (target - current) * alpha;
}

/**
 * BlinkVoiceGlow — Fullscreen Voice Presence Visualizer
 *
 * Composes `voice-glow`'s `VoiceBeam` (using the `mobile` geometry preset,
 * custom cyan/electric-blue/violet palettes, and zero-re-render `level` & `motion`
 * getters) within a pitch-black fullscreen atmospheric canvas.
 *
 * Performance guarantees:
 * - Zero React re-renders per frame (audio levels and thinking sweep kinematics
 *   are polled directly inside VoiceBeam's single shared rAF driver).
 * - Ambient horizon diffusion updates CSS transforms/opacity via a direct DOM ref.
 * - Full `prefers-reduced-motion` compliance.
 */
export const BlinkVoiceGlow: React.FC<BlinkVoiceGlowProps> = ({
  state,
  isMuted,
  audioLevelsRef,
  children,
  className,
}) => {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [viewportScale, setViewportScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1.15;
    return computeResponsiveBeamScale(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    const handleResize = () => {
      setViewportScale(computeResponsiveBeamScale(window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const preset = useMemo(
    () => resolveVisualPreset(state, isMuted),
    [state, isMuted]
  );

  // Refs synced on state changes so rAF getters never need to recreate closures
  const stateRef = useRef<VoiceSessionState>(state);
  const isMutedRef = useRef<boolean>(isMuted);
  const reducedMotionRef = useRef<boolean>(prefersReducedMotion);
  const presetRef = useRef(preset);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  reducedMotionRef.current = prefersReducedMotion;
  presetRef.current = preset;

  const ambientLayerRef = useRef<HTMLDivElement | null>(null);
  const coreWashRef = useRef<HTMLDivElement | null>(null);

  const kinematicsRef = useRef<MotionKinematicState>({
    gather: 0,
    offset: 0,
    stretch: 0,
    heldLevel: 0,
    lastSampleMs: performance.now(),
    stateEnteredMs: performance.now(),
    lastState: state,
  });

  /**
   * Imperatively updates the fullscreen ambient horizon diffusion behind
   * VoiceBeam using GPU-composited opacity & transform — zero React renders.
   */
  const syncAmbientAtmosphere = useCallback((energy: number) => {
    const p = presetRef.current;
    const clampedEnergy = Math.max(0, Math.min(1, energy));
    const targetOpacity = Math.min(
      1,
      p.ambientBaseOpacity + clampedEnergy * p.ambientEnergyBoost
    );

    if (ambientLayerRef.current) {
      ambientLayerRef.current.style.opacity = targetOpacity.toFixed(3);
      if (!reducedMotionRef.current) {
        const scaleY = 1 + clampedEnergy * 0.24;
        const scaleX = 1 + clampedEnergy * 0.08;
        ambientLayerRef.current.style.transform = `translate3d(0, 0, 0) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`;
      } else {
        ambientLayerRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    }

    if (coreWashRef.current) {
      const washOpacity = Math.min(0.95, targetOpacity * 0.85 + clampedEnergy * 0.25);
      coreWashRef.current.style.opacity = washOpacity.toFixed(3);
    }
  }, []);

  // Ensure ambient atmosphere updates immediately when state changes even when beam is inactive
  useEffect(() => {
    syncAmbientAtmosphere(state === 'ending' ? 0 : 0.08);
  }, [state, isMuted, syncAmbientAtmosphere]);

  /**
   * Frame-level getter sampled by VoiceBeam's single shared rAF loop.
   * Strictly separates incoming user audio (listening) from outgoing
   * assistant speech (speaking), and never fakes speech while thinking.
   */
  const getBeamLevel = useCallback((): number => {
    const current = stateRef.current;
    const levels = audioLevelsRef.current;

    let activeEnergy = 0;

    switch (current) {
      case 'listening':
        activeEnergy = isMutedRef.current ? 0 : levels.inputLevel;
        break;
      case 'speaking':
        activeEnergy = levels.outputLevel;
        break;
      case 'entering':
        activeEnergy = Math.max(0.24, levels.inputLevel);
        break;
      case 'interrupted':
        // Instant drop of outgoing energy — brief crisp pulse handled by motion
        activeEnergy = 0.14;
        break;
      case 'thinking':
      case 'idle':
      case 'error':
      case 'ending':
      default:
        activeEnergy = 0;
        break;
    }

    syncAmbientAtmosphere(activeEnergy);
    return activeEnergy;
  }, [audioLevelsRef, syncAmbientAtmosphere]);

  /**
   * Frame-level motion getter driving `VoiceBeam`'s native `motion` prop.
   * Choreographs:
   * - `entering`: luminous gather resolving outward into open listening glow
   * - `thinking`: focused gathered beam gliding deliberately across the horizon
   * - `interrupted`: immediate crisp contraction acknowledging barge-in
   * - all other states: smooth release back to rest (`gather -> 0`)
   */
  const getBeamMotion = useCallback((): VoiceBeamMotion => {
    const now = performance.now();
    const k = kinematicsRef.current;
    const current = stateRef.current;

    if (k.lastState !== current) {
      k.lastState = current;
      k.stateEnteredMs = now;
    }

    const dtSec = Math.min(0.1, Math.max(0.001, (now - k.lastSampleMs) / 1000));
    k.lastSampleMs = now;
    const elapsedSec = (now - k.stateEnteredMs) / 1000;

    let targetGather = 0;
    let targetOffset = 0;
    let targetStretch = 0;
    let targetHeldLevel = 0;
    let gatherSpeed = 7.5;

    if (current === 'entering') {
      // Soft gather that opens gracefully into full voice presence
      const progress = Math.min(1, elapsedSec / 0.65);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      targetGather = 0.58 * (1 - easeOut);
      targetOffset = 0;
      targetStretch = 0.25 * (1 - easeOut);
      targetHeldLevel = 0.48 * (1 - easeOut * 0.4);
      gatherSpeed = 12;
    } else if (current === 'thinking') {
      // Focused traveling beam — deliberate, contemplative, non-speech
      targetGather = 0.92;
      targetHeldLevel = 0.48;
      gatherSpeed = 6.5;

      if (reducedMotionRef.current) {
        targetOffset = 0;
        targetStretch = 0.08;
      } else {
        // Smooth eased oscillation with gentle turn dwell (period ~2.8s)
        const phase = elapsedSec * 2.25;
        const rawSin = Math.sin(phase);
        // Slightly dwell near center & soften reversals
        targetOffset = rawSin * 0.72;
        const velocity = Math.abs(Math.cos(phase));
        targetStretch = 0.12 + velocity * 0.34;
      }
    } else if (current === 'interrupted') {
      // Crisp, immediate contraction acknowledging user interruption
      const pulse = Math.max(0, 1 - elapsedSec / 0.26);
      targetGather = 0.42 * pulse;
      targetOffset = 0;
      targetStretch = 0.18 * pulse;
      targetHeldLevel = 0.52 * pulse;
      gatherSpeed = 24;
    } else {
      // Smoothly release back into full multi-lobe voice glow
      targetGather = 0;
      targetOffset = 0;
      targetStretch = 0;
      targetHeldLevel = 0;
      gatherSpeed = current === 'speaking' ? 9 : 7;
    }

    k.gather = lerpTowards(k.gather, targetGather, dtSec, gatherSpeed);
    k.offset = lerpTowards(k.offset, targetOffset, dtSec, current === 'thinking' ? 14 : 9);
    k.stretch = lerpTowards(k.stretch, targetStretch, dtSec, 10);
    k.heldLevel = lerpTowards(k.heldLevel, targetHeldLevel, dtSec, 9);

    // Keep resting states strictly zeroed once settled so distortion stays enabled
    if (k.gather < 0.004 && targetGather === 0) {
      k.gather = 0;
      k.offset = 0;
      k.stretch = 0;
      k.heldLevel = 0;
    }

    return {
      gather: k.gather,
      offset: k.offset,
      stretch: k.stretch,
      heldLevel: k.heldLevel,
      cornerFollow: 0.14,
    };
  }, []);

  return (
    <div
      className={cn(
        'relative w-full h-full overflow-hidden bg-[#030508] select-none',
        className
      )}
      data-testid="blink-voice-glow"
      data-voice-state={state}
      data-voice-muted={isMuted ? 'true' : 'false'}
    >
      {/* Layer 1: Fullscreen Atmospheric Horizon Diffusion (GPU-composited, ref-driven) */}
      <div
        ref={ambientLayerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-15%] bottom-[-18%] h-[78%] origin-bottom transition-[background] duration-700 ease-out will-change-transform"
        style={{
          opacity: preset.ambientBaseOpacity,
          background: `radial-gradient(ellipse 68% 64% at 50% 100%, ${preset.ambientPrimaryRgba} 0%, ${preset.ambientSecondaryRgba} 42%, rgba(3, 5, 8, 0) 76%)`,
          filter: 'blur(36px)',
        }}
      />

      {/* Layer 2: Soft Core Horizon Wash anchoring VoiceBeam into the fullscreen void */}
      <div
        ref={coreWashRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] transition-[background] duration-700 ease-out"
        style={{
          opacity: preset.ambientBaseOpacity * 0.8,
          background: `radial-gradient(ellipse 52% 85% at 50% 100%, ${preset.ambientPrimaryRgba} 0%, rgba(3, 5, 8, 0) 72%)`,
        }}
      />

      {/* Layer 3: Primary VoiceBeam Renderer (voice-glow mobile preset + custom Blink choreography) */}
      <VoiceBeam
        type="mobile"
        theme="dark"
        borderRadius={0}
        scale={viewportScale}
        active={preset.active}
        strength={preset.strength}
        level={getBeamLevel}
        motion={getBeamMotion}
        idle={prefersReducedMotion ? Math.min(0.14, preset.idle) : preset.idle}
        breatheDuration={preset.breatheDuration}
        attack={preset.attack}
        release={preset.release}
        reach={preset.reach}
        spread={preset.spread}
        flow={prefersReducedMotion ? 0 : preset.flow}
        bend={preset.bend}
        bandStrength={preset.bandStrength}
        bandAberration={preset.bandAberration}
        glowSize={preset.glowSize}
        brightness={preset.brightness}
        saturation={preset.saturation}
        distortion={prefersReducedMotion ? 0 : preset.distortion}
        innerHeight={preset.innerHeight}
        bloomHeight={preset.bloomHeight}
        staticColors={prefersReducedMotion || preset.staticColors}
        hueRange={preset.hueRange}
        hueDuration={preset.hueDuration}
        colors={preset.colors}
        bandColors={preset.bandColors}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', borderRadius: 0 }}
      >
        {/* Fullscreen dark interior container for foreground overlay chrome */}
        <div className="relative w-full h-full flex flex-col justify-between bg-transparent">
          {/* Top negative-space vignette keeping attention grounded on the luminous presence */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#030508]/85 via-[#030508]/35 to-transparent"
          />

          {children}
        </div>
      </VoiceBeam>
    </div>
  );
};
