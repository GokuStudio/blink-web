import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type {
  VoiceSessionError,
  VoiceSessionState,
} from '../services/voice-session.interface';

export interface VoiceStatusProps {
  state: VoiceSessionState;
  isMuted: boolean;
  isSimulated: boolean;
  error: VoiceSessionError | null;
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

/**
 * Ultra-minimal presence indicator and error recovery view.
 * Preserves generous negative space and avoids chat cards or fabricated transcripts.
 */
export const VoiceStatus: React.FC<VoiceStatusProps> = ({
  state,
  isMuted,
  isSimulated,
  error,
  onRetry,
  onDismissError,
}) => {
  if (state === 'error') {
    return (
      <div
        role="alert"
        data-testid="voice-error-state"
        className="mx-auto max-w-sm px-6 text-center flex flex-col items-center gap-4 animate-in fade-in duration-300"
      >
        <div className="w-11 h-11 rounded-full bg-rose-500/12 border border-rose-400/30 flex items-center justify-center text-rose-300">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-medium tracking-tight text-white">
            Unable to connect
          </h2>
          <p className="text-sm text-slate-300/80 leading-relaxed">
            {error?.message ?? 'The voice session encountered an error.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onRetry}
            data-testid="voice-retry-button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#35DFFF] text-[#030508] text-sm font-semibold tracking-tight hover:bg-[#67E8FF] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try Again</span>
          </button>

          <button
            type="button"
            onClick={onDismissError}
            data-testid="voice-dismiss-error-button"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/[0.11] hover:text-white active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <X className="w-4 h-4" />
            <span>Dismiss</span>
          </button>
        </div>
      </div>
    );
  }

  if (state === 'idle') {
    return (
      <div
        data-testid="voice-idle-presence"
        className="flex flex-col items-center gap-3 text-center px-6"
      >
        <h1 className="text-2xl sm:text-3xl font-light tracking-[0.14em] uppercase text-white/90">
          Hey Blink
        </h1>
        {isSimulated && (
          <span
            data-testid="voice-simulation-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-medium tracking-[0.12em] uppercase text-cyan-200/65"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#35DFFF]/75" />
            Simulated Voice Preview
          </span>
        )}
      </div>
    );
  }

  const label = state === 'listening' && isMuted ? 'Muted' : STATE_LABELS[state];

  const dotStyle = cn(
    'w-1.5 h-1.5 rounded-full transition-colors duration-300',
    state === 'speaking' && 'bg-[#7CEEFF] shadow-[0_0_10px_#35DFFF]',
    state === 'thinking' && 'bg-indigo-400 shadow-[0_0_10px_#818CF8]',
    state === 'listening' && !isMuted && 'bg-[#35DFFF] shadow-[0_0_8px_#35DFFF]',
    state === 'listening' && isMuted && 'bg-slate-500',
    state === 'entering' && 'bg-[#35DFFF]/80',
    state === 'interrupted' && 'bg-cyan-200',
    state === 'ending' && 'bg-slate-500/60'
  );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="voice-status-indicator"
      className={cn(
        'inline-flex flex-col items-center gap-2 transition-opacity duration-500',
        state === 'ending' ? 'opacity-30' : 'opacity-100'
      )}
    >
      <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#030508]/40 backdrop-blur-md border border-white/[0.07]">
        <span className={dotStyle} />
        <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/80">
          {label}
        </span>
      </div>

      {isSimulated && (
        <span className="px-2.5 py-0.5 rounded-full bg-[#030508]/50 backdrop-blur-sm text-[10px] tracking-[0.16em] uppercase text-slate-300/75">
          Simulated Audio
        </span>
      )}
    </div>
  );
};
