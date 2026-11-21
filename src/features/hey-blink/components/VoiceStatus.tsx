import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { HandsFreeSnapshot } from '../conversation/hands-free-conversation-controller';
import type {
  VoiceAudioListener,
  VoiceSessionError,
  VoiceSessionState,
} from '../services/voice-session.interface';

export interface VoiceStatusProps {
  state: VoiceSessionState;
  isMuted: boolean;
  isSimulated: boolean;
  error: VoiceSessionError | null;
  interactionMode?: 'hands-free' | 'manual';
  handsFree?: HandsFreeSnapshot;
  subscribeAudio?: (listener: VoiceAudioListener) => () => void;
  onRetry: () => void;
  onDismissError: () => void;
}

const STATE_LABELS: Record<VoiceSessionState, string> = {
  idle: '',
  entering: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  interrupted: 'Listening',
  error: 'Session Unavailable',
  ending: 'Ending',
};

const TEXT_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Singular, whisper-minimal presence typography & audio-reactive micro-bars.
 *
 * - Replaces double-stacked status boxes with one serene, cross-fading state whisper.
 * - Live 3-bar micro-waveform updates directly via DOM refs at 60 FPS (zero React re-renders).
 */
export const VoiceStatus: React.FC<VoiceStatusProps> = ({
  state,
  isMuted,
  isSimulated,
  error,
  interactionMode = 'manual',
  handsFree,
  subscribeAudio,
  onRetry,
  onDismissError,
}) => {
  const bar0Ref = useRef<HTMLSpanElement | null>(null);
  const bar1Ref = useRef<HTMLSpanElement | null>(null);
  const bar2Ref = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef(state);
  const mutedRef = useRef(isMuted);
  stateRef.current = state;
  mutedRef.current = isMuted;

  // Imperatively animate the tiny 3-bar living presence dot at 60 FPS with zero React renders
  useEffect(() => {
    if (!subscribeAudio || state === 'idle' || state === 'error' || state === 'ending') {
      return;
    }
    return subscribeAudio((frame) => {
      const s = stateRef.current;
      const energy =
        s === 'speaking'
          ? frame.outputLevel
          : s === 'listening' && !mutedRef.current
            ? frame.inputLevel
            : 0;

      const h0 = 0.28 + Math.min(0.72, energy * 0.95);
      const h1 = 0.36 + Math.min(0.64, energy * 1.25);
      const h2 = 0.25 + Math.min(0.75, energy * 0.85);

      if (bar0Ref.current) bar0Ref.current.style.transform = `scaleY(${h0.toFixed(3)})`;
      if (bar1Ref.current) bar1Ref.current.style.transform = `scaleY(${h1.toFixed(3)})`;
      if (bar2Ref.current) bar2Ref.current.style.transform = `scaleY(${h2.toFixed(3)})`;
    });
  }, [subscribeAudio, state]);

  const effectiveErrorMessage =
    state === 'error'
      ? error?.message ?? 'The voice session encountered an error.'
      : handsFree?.activationState === 'error'
        ? handsFree.lastError
        : null;

  if (state === 'error' || handsFree?.activationState === 'error') {
    return (
      <motion.div
        key="voice-error"
        role="alert"
        data-testid="voice-error-state"
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: TEXT_EASE }}
        className="mx-auto max-w-sm px-6 text-center flex flex-col items-center gap-4"
      >
        <div className="w-11 h-11 rounded-full bg-rose-500/12 border border-rose-400/25 flex items-center justify-center text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-[15px] font-medium tracking-tight text-white/95">
            Unable to connect
          </h2>
          <p className="text-[13px] text-slate-300/75 leading-relaxed">
            {effectiveErrorMessage ?? 'The voice session encountered an error.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onRetry}
            data-testid="voice-retry-button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#35DFFF] text-[#030508] text-xs font-semibold tracking-[0.04em] hover:bg-[#7CEEFF] active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <button
            type="button"
            onClick={onDismissError}
            data-testid="voice-dismiss-error-button"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.06] border border-white/10 text-slate-300 text-xs font-medium hover:bg-white/[0.11] hover:text-white active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <X className="w-3.5 h-3.5" />
            <span>Dismiss</span>
          </button>
        </div>
      </motion.div>
    );
  }

  if (state === 'idle') {
    const activation = handsFree?.activationState;
    const isWakeDetected = activation === 'wake_detected';
    const isWakeReady = activation === 'wake_ready';
    const isSuspended = activation === 'suspended';
    const isModelPending =
      interactionMode === 'hands-free' &&
      activation === 'wake_unavailable' &&
      handsFree?.wakeEngineStatus === 'model_unavailable';

    return (
      <motion.div
        key="voice-idle"
        data-testid="voice-idle-presence"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
        transition={{ duration: 0.45, ease: TEXT_EASE }}
        className="flex flex-col items-center gap-3.5 text-center px-6"
      >
        {/* Serene sculpted wordmark */}
        <h1 className="text-[28px] sm:text-[34px] font-extralight tracking-[0.22em] uppercase text-white/92 drop-shadow-[0_0_28px_rgba(53,223,255,0.16)]">
          Hey Blink
        </h1>

        {isSimulated && (
          <span
            data-testid="voice-simulation-badge"
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.035] border border-white/[0.07] text-[10px] font-medium tracking-[0.16em] uppercase text-cyan-200/65"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#35DFFF]/70" />
            Simulated Voice Preview
          </span>
        )}

        {!isSimulated && interactionMode === 'manual' && (
          <p className="text-[12px] font-light tracking-[0.06em] text-slate-400/75">
            Speak naturally &middot; interrupt anytime
          </p>
        )}

        {interactionMode === 'hands-free' && (
          <div
            data-testid="hands-free-passive-status"
            className="flex flex-col items-center gap-1.5 max-w-xs"
          >
            {isWakeDetected && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#35DFFF]/12 border border-[#35DFFF]/35 text-[11px] uppercase tracking-[0.18em] text-[#7CEEFF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#35DFFF] animate-pulse" />
                Listening...
              </span>
            )}
            {isWakeReady && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] tracking-[0.12em] uppercase text-slate-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                Say &ldquo;Hey Blink&rdquo; &middot; Local Only
              </span>
            )}
            {isSuspended && (
              <span className="text-xs text-slate-400/80">
                {handsFree?.statusMessage ?? 'Hands-free listening is paused.'}
              </span>
            )}
            {isModelPending && (
              <span className="text-xs text-amber-200/75 leading-relaxed">
                On-device &ldquo;Hey Blink&rdquo; wake-word model not yet installed.
              </span>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  const label = state === 'listening' && isMuted ? 'Muted' : STATE_LABELS[state];
  const showMicroBars = (state === 'listening' && !isMuted) || state === 'speaking';
  const barColor = state === 'speaking' ? 'bg-[#7CEEFF]' : 'bg-[#35DFFF]';

  const dotStyle = cn(
    'w-1.5 h-1.5 rounded-full transition-colors duration-300',
    state === 'thinking' && 'bg-indigo-300 shadow-[0_0_12px_#818CF8] animate-pulse',
    state === 'listening' && isMuted && 'bg-amber-300/80',
    state === 'entering' && 'bg-[#35DFFF]/80 animate-pulse',
    state === 'interrupted' && 'bg-cyan-200',
    state === 'ending' && 'bg-slate-500/60'
  );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="voice-status-indicator"
      className={cn(
        'inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full',
        'bg-[#030508]/45 backdrop-blur-xl border border-white/[0.07]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-opacity duration-500',
        state === 'ending' ? 'opacity-30' : 'opacity-100'
      )}
    >
      {showMicroBars ? (
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-[2px] h-3"
        >
          <span
            ref={bar0Ref}
            className={cn('w-[2px] h-full rounded-full origin-center', barColor)}
            style={{ transform: 'scaleY(0.35)' }}
          />
          <span
            ref={bar1Ref}
            className={cn('w-[2px] h-full rounded-full origin-center', barColor)}
            style={{ transform: 'scaleY(0.55)' }}
          />
          <span
            ref={bar2Ref}
            className={cn('w-[2px] h-full rounded-full origin-center', barColor)}
            style={{ transform: 'scaleY(0.35)' }}
          />
        </span>
      ) : (
        <span className={dotStyle} />
      )}

      <motion.span
        key={label}
        initial={{ opacity: 0, y: 3, filter: 'blur(2px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.2, ease: TEXT_EASE }}
        className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/85"
      >
        {label}
      </motion.span>
    </div>
  );
};
