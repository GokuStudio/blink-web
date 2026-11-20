import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Pause, Play, RotateCcw, Check, Volume2, VolumeX } from 'lucide-react';
import { PrecisionTickGauge } from './PrecisionTickGauge';
import { blinkSound } from '../utils/soundEngine';

export type RitualKind = 'horizon-20' | 'gentle-blinks';

interface RestRitualOverlayProps {
  open: boolean;
  kind: RitualKind;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onClose: () => void;
  onComplete: () => void;
}

/**
 * Full-bleed opaque Rest Ritual view designed to sit inside DistortionWave's
 * `revealedContent` slot with soothing Zen ambient audio and a mild singing-bowl
 * completion bell for eyes-closed / horizon rest.
 */
export const RestRitualOverlay: React.FC<RestRitualOverlayProps> = ({
  open,
  kind,
  soundEnabled,
  onToggleSound,
  onClose,
  onComplete,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const totalSeconds = kind === 'horizon-20' ? 20 : 15;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const lastBlinkCueRef = useRef(0);

  // Reset countdown ONLY when ritual opens or ritual kind changes (never on sound mute/unmute!)
  useEffect(() => {
    if (!open) {
      blinkSound.stopZenAmbience(0.5);
      return;
    }
    setSecondsLeft(totalSeconds);
    setPaused(false);
    setCompleted(false);
    lastBlinkCueRef.current = 0;

    if (blinkSound.isEnabled()) {
      blinkSound.startZenAmbience();
    }
    return () => {
      blinkSound.stopZenAmbience(0.45);
    };
  }, [open, totalSeconds]);

  // Smoothly sync mute & pause state in place without resetting countdown
  useEffect(() => {
    if (!open || completed) return;
    if (soundEnabled) {
      blinkSound.startZenAmbience();
      blinkSound.setZenPaused(paused);
    } else {
      blinkSound.setZenPaused(true);
    }
  }, [paused, soundEnabled, open, completed]);

  useEffect(() => {
    if (!open || paused || completed) return;
    if (secondsLeft <= 0) {
      setCompleted(true);
      blinkSound.stopZenAmbience(1.1);
      blinkSound.playZenBell();
      onComplete();
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [open, paused, completed, secondsLeft, onComplete]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const blinkNumber = Math.min(5, Math.floor((totalSeconds - secondsLeft) / 3) + 1);

  // Soft felt pacing tone on each blink step during eyes-closed 5-blink mode
  useEffect(() => {
    if (!open || paused || completed || kind !== 'gentle-blinks') return;
    if (blinkNumber !== lastBlinkCueRef.current) {
      lastBlinkCueRef.current = blinkNumber;
      blinkSound.playBlinkBreathCue();
    }
  }, [open, paused, completed, kind, blinkNumber]);

  return (
    <div
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      aria-label={kind === 'horizon-20' ? '20-second horizon rest' : '5 gentle blinks guide'}
      className={`h-full min-h-dvh w-full bg-[#080A09] px-5 ${
        open ? '' : 'pointer-events-none select-none'
      }`}
    >
      <div className="sticky top-0 flex min-h-dvh w-full flex-col items-center justify-center py-8">
        <div className="w-full max-w-[350px] rounded-[30px] surface-instrument p-6">
          {/* Minimal top bar with quick Zen sound toggle */}
          <div className="flex items-center justify-between">
            <span className="font-display text-[13px] font-medium tracking-[0.01em] text-[#B8C0BA]">
              {kind === 'horizon-20' ? 'Zen Mode' : 'Complete Blink Guide'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSound}
                aria-label={soundEnabled ? 'Mute Zen sound' : 'Unmute Zen sound'}
                className={`press-tactile flex h-9 w-9 items-center justify-center rounded-full surface-tactile cursor-pointer ${
                  soundEnabled ? 'text-[#A6FA4C]' : 'text-[#7F8782]'
                }`}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Dismiss rest ritual"
                className="press-tactile flex h-9 w-9 items-center justify-center rounded-full surface-tactile text-[#A8B0AA] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quiet Focal Sanctuary */}
          <div className="mt-7 flex flex-col items-center text-center">
            <div className="relative flex h-[156px] w-[156px] items-center justify-center">
              <motion.div
                aria-hidden="true"
                animate={
                  completed
                    ? { scale: 1.08, opacity: 0.55 }
                    : !open || paused || prefersReducedMotion
                      ? { scale: 1, opacity: 0.32 }
                      : { scale: [0.88, 1.08, 0.88], opacity: [0.24, 0.48, 0.24] }
                }
                transition={{
                  duration: completed ? 0.5 : 4.2,
                  repeat: completed || !open || paused || prefersReducedMotion ? 0 : Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(166,250,76,0.22) 0%, rgba(166,250,76,0.04) 55%, transparent 74%)',
                }}
              />
              <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full surface-well">
                {completed ? (
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#A6FA4C] text-[#0D1308] shadow-[0_0_28px_rgba(166,250,76,0.5)]"
                  >
                    <Check className="h-7 w-7" strokeWidth={2.6} />
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="font-num text-[44px] font-semibold leading-none tracking-[-0.04em] text-[#F4F6F3] tabular-nums">
                      {secondsLeft}
                      <span className="text-[18px] font-medium text-[#8C938E]">s</span>
                    </span>
                    <span className="mt-1 text-[10.5px] font-medium text-[#A6FA4C]">
                      {kind === 'horizon-20' ? 'Look 20 ft away' : `Blink ${blinkNumber} / 5`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <h2 className="mt-5 font-display text-[20px] font-semibold tracking-[-0.02em] text-[#F2F4F1]">
              {completed
                ? 'Rhythm restored.'
                : kind === 'horizon-20'
                  ? 'Let your focus soften.'
                  : 'Close gently, pause, open.'}
            </h2>
            <p className="mt-1.5 max-w-[260px] text-[12.5px] leading-[1.48] text-[#8E9690]">
              {completed
                ? 'Nice moment away from the display. Your simulated break count has been updated.'
                : kind === 'horizon-20'
                  ? 'Rest your gaze on something across the room until the ticks settle.'
                  : 'Take five slow, unhurried blinks to comfortably refresh your eyes.'}
            </p>
          </div>

          {/* Precision Optical Tick Window (Yellow -> Orange -> Green progression) */}
          <div className="mt-6 rounded-[18px] surface-well px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between font-mono-num text-[10px] text-[#737B76]">
              <span>0s</span>
              <span>{Math.round(totalSeconds / 2)}s</span>
              <span>{totalSeconds}s</span>
            </div>
            <PrecisionTickGauge
              total={totalSeconds}
              activeCount={completed ? totalSeconds : totalSeconds - secondsLeft}
              colorScale="yellow-orange-green"
              height={22}
              ariaLabel={`${totalSeconds - secondsLeft} of ${totalSeconds} seconds elapsed`}
            />
          </div>

          {/* Tactile Controls */}
          <div className="mt-5 flex items-center gap-2.5">
            {completed ? (
              <button
                type="button"
                onClick={onClose}
                className="press-tactile flex h-[48px] w-full items-center justify-center rounded-full bg-[#050606] border border-white/[0.14] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(0,0,0,0.65)] hover:bg-[#0E100F] cursor-pointer"
              >
                Back to Blink
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="btn-lime-tactile press-tactile flex h-[48px] flex-1 items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold cursor-pointer"
                >
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSecondsLeft(totalSeconds);
                    setPaused(false);
                  }}
                  aria-label="Restart ritual"
                  className="surface-tactile press-tactile flex h-[48px] w-[48px] items-center justify-center rounded-full text-[#DCE0DD] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="surface-tactile press-tactile flex h-[48px] px-4 items-center justify-center rounded-full text-[13px] font-medium text-[#C8CFCB] cursor-pointer"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
