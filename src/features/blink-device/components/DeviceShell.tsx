import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { EyeCanvas } from './EyeCanvas';
import { useDeviceStore } from '../state';
import { useWellnessStore } from '../wellness/wellnessStore';
import { BlinkExpressionType } from '@/shared/contracts';
import { BlinkVoiceBubble } from '@/features/hey-blink/components/BlinkVoiceBubble';
import type { BlinkVoiceExperience } from '@/features/hey-blink/integration/useBlinkVoiceExperience';

interface DeviceShellProps {
  mode: 'desktop-integrated' | 'standalone-device';
  expression?: BlinkExpressionType;
  className?: string;
  onNudgeComplete?: () => void;
  onWebGLStatusChange?: (status: 'ready' | 'unavailable' | 'context_lost' | 'restored') => void;
  onSustainedLowFps?: (fps: number | null) => void;
  onBezelError?: () => void;
  frameless?: boolean;
  /** Optional authoritative Stage 2D Voice Experience controller for Eye <-> Voice choreography */
  voiceExperience?: BlinkVoiceExperience;
}

/**
 * Computes coordinated Eye Layer transform & luminance for Eye <-> Voice transitions.
 * Preserves the mounted WebGL EyeCanvas without tearing down GPU contexts.
 */
function getEyeLayerTransitionClass(
  voice: BlinkVoiceExperience | undefined,
  reducedMotion: boolean
): string {
  if (!voice || voice.visualMode === 'eyes') {
    return 'opacity-100 scale-100 brightness-100';
  }
  if (voice.visualMode === 'transitioning-to-voice') {
    return reducedMotion
      ? 'opacity-30'
      : 'opacity-35 scale-[0.84] brightness-75';
  }
  if (voice.visualMode === 'transitioning-to-eyes') {
    return reducedMotion
      ? 'opacity-85'
      : 'opacity-85 scale-[0.95] brightness-95';
  }
  // Active Voice Mode: eyes dissolve cleanly while WebGL canvas stays intact
  return reducedMotion
    ? 'opacity-0 pointer-events-none'
    : 'opacity-0 scale-[0.72] brightness-50 pointer-events-none';
}

/**
 * Blink Device Shell
 * Implements Section 4 Visual Architecture + Stage 2D Eye <-> Voice Choreography:
 * - Desktop integrated: Layer 1 (Black bg) + Layer 2 (WebGL Eyes) + Layer 2.5 (Voice Ring Bubble) + Layer 3 (Static 2D Bezel PNG)
 *   Uses the unified 1:1 Square Coordinate System derived from the 1024x1024 reference image.
 * - Standalone device: Fullscreen WebGL Eyes / Voice Ring display, bezel completely omitted.
 */
export const DeviceShell: React.FC<DeviceShellProps> = ({
  mode,
  expression: propExpression,
  className = '',
  onNudgeComplete,
  onWebGLStatusChange,
  onSustainedLowFps,
  onBezelError,
  frameless = false,
  voiceExperience,
}) => {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const storeExpression = useDeviceStore((s) => s.expression);
  const setStoreExpression = useDeviceStore((s) => s.setExpression);
  const expression = propExpression ?? storeExpression;

  const handleNudgeComplete = () => {
    useWellnessStore.getState().onNudgeFinished();
    if (expression === 'nudging') {
      setStoreExpression('idle');
    }
    if (onNudgeComplete) {
      onNudgeComplete();
    }
  };

  const eyeLayerClass = getEyeLayerTransitionClass(voiceExperience, prefersReducedMotion);
  const showVoiceBubble = Boolean(voiceExperience && voiceExperience.isEngaged);

  if (mode === 'standalone-device') {
    return (
      <div
        className={`relative w-full h-full bg-black flex items-center justify-center overflow-hidden ${className}`}
        data-testid="device-shell-standalone"
        data-visual-mode={voiceExperience?.visualMode ?? 'eyes'}
      >
        <div
          className={`absolute inset-0 transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${eyeLayerClass}`}
        >
          <EyeCanvas
            expression={expression}
            className="w-full h-full"
            isStandalone={true}
            onNudgeComplete={handleNudgeComplete}
            onWebGLStatusChange={onWebGLStatusChange}
            onSustainedLowFps={onSustainedLowFps}
          />
        </div>

        {showVoiceBubble && voiceExperience && (
          <div className="absolute inset-0 z-[5]">
            <BlinkVoiceBubble
              experienceState={voiceExperience.experienceState}
              audioLevelsRef={voiceExperience.audioLevelsRef}
              isMuted={voiceExperience.isMuted}
              isSimulated={voiceExperience.isSimulated}
              variant="standalone-device"
              errorMessage={voiceExperience.error?.message ?? null}
              tuning={voiceExperience.tuning}
              onBubbleClick={
                voiceExperience.canInterrupt ? voiceExperience.interruptVoice : undefined
              }
            />
          </div>
        )}
      </div>
    );
  }

  // Desktop Integrated Composition:
  // Strict 1:1 Square aspect ratio matching the 1024x1024 reference.
  // Layer 2 (WebGL Eyes), Layer 2.5 (Voice Ring), and Layer 3 (Static 2D Bezel PNG) share the exact same square viewport.
  return (
    <div
      className={
        frameless
          ? `relative w-full aspect-square mx-auto overflow-hidden bg-black select-none ${className}`
          : `relative w-full aspect-square max-w-sm sm:max-w-md mx-auto rounded-3xl overflow-hidden bg-black shadow-2xl select-none ${className}`
      }
      data-testid="device-shell-desktop"
      data-visual-mode={voiceExperience?.visualMode ?? 'eyes'}
    >
      {/* Layer 1: Solid Pitch Black Base */}
      <div className="absolute inset-0 bg-black z-0" />

      {/* Layer 2: WebGL Animated Eyes Canvas covering the full square viewport */}
      <div
        className={`absolute inset-0 z-[1] bg-black overflow-hidden transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${eyeLayerClass}`}
      >
        <EyeCanvas
          expression={expression}
          className="w-full h-full"
          isStandalone={false}
          onNudgeComplete={handleNudgeComplete}
          onWebGLStatusChange={onWebGLStatusChange}
          onSustainedLowFps={onSustainedLowFps}
        />
      </div>

      {/* Layer 2.5: Centered Audio-Reactive Voice Ring (mounted only when voice is engaged) */}
      {showVoiceBubble && voiceExperience && (
        <div className="absolute inset-0 z-[5]">
          <BlinkVoiceBubble
            experienceState={voiceExperience.experienceState}
            audioLevelsRef={voiceExperience.audioLevelsRef}
            isMuted={voiceExperience.isMuted}
            isSimulated={voiceExperience.isSimulated}
            variant="desktop-integrated"
            errorMessage={voiceExperience.error?.message ?? null}
            tuning={voiceExperience.tuning}
            onBubbleClick={
              voiceExperience.canInterrupt ? voiceExperience.interruptVoice : undefined
            }
          />
        </div>
      )}

      {/* Layer 3: Physical Bezel Overlay (Square 1024x1024 transparent PNG asset — NEVER 3D) */}
      <img
        src="/assets/bezel/bezel.png"
        alt="Blink Physical Bezel"
        onError={() => onBezelError?.()}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 select-none"
      />
    </div>
  );
};
