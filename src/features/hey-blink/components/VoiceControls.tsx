import React from 'react';
import { Hand, Mic, MicOff, PhoneOff } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { VoiceSessionState } from '../services/voice-session.interface';

export interface VoiceControlsProps {
  state: VoiceSessionState;
  isMuted: boolean;
  canInterrupt: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
}

/**
 * Minimal, accessible voice interaction controls.
 * - Idle: Single refined "Talk to Blink" trigger.
 * - Active: Compact floating glassmorphic pill for Mute, Interrupt, and End.
 * - Error: Defers cleanly to centered retry/dismiss actions in VoiceStatus.
 */
export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  isMuted,
  canInterrupt,
  onStart,
  onEnd,
  onToggleMute,
  onInterrupt,
}) => {
  if (state === 'error') {
    return null;
  }

  if (state === 'idle') {
    return (
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onStart}
          data-testid="talk-to-blink-button"
          className={cn(
            'group relative inline-flex items-center gap-3 px-7 py-3.5 rounded-full',
            'bg-[#0B1218]/85 backdrop-blur-xl border border-[#35DFFF]/35',
            'text-white text-sm font-medium tracking-[0.06em]',
            'shadow-[0_0_32px_rgba(53,223,255,0.16)]',
            'hover:border-[#35DFFF]/70 hover:bg-[#0E1922]/90 hover:shadow-[0_0_44px_rgba(53,223,255,0.28)]',
            'active:scale-[0.97] transition-all duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70'
          )}
        >
          <span className="w-8 h-8 rounded-full bg-[#35DFFF]/15 border border-[#35DFFF]/40 flex items-center justify-center text-[#35DFFF] group-hover:bg-[#35DFFF]/25 transition-colors">
            <Mic className="w-4 h-4" />
          </span>
          <span>Talk to Blink</span>
        </button>
      </div>
    );
  }

  const isEnding = state === 'ending';

  return (
    <div
      data-testid="voice-active-controls"
      className={cn(
        'inline-flex items-center gap-2.5 p-2 rounded-full',
        'bg-[#070B10]/70 backdrop-blur-xl border border-white/[0.09] shadow-2xl',
        'transition-all duration-300',
        isEnding && 'opacity-40 pointer-events-none scale-95'
      )}
    >
      {/* Mute / Unmute */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-pressed={isMuted}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        data-testid="voice-mute-button"
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60 active:scale-95',
          isMuted
            ? 'bg-amber-400/15 border border-amber-300/35 text-amber-200 hover:bg-amber-400/25'
            : 'bg-white/[0.06] border border-white/[0.08] text-white/90 hover:bg-white/[0.12]'
        )}
        title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Interrupt (visible & immediately responsive during thinking or speaking) */}
      {canInterrupt && (
        <button
          type="button"
          onClick={onInterrupt}
          aria-label="Interrupt Blink"
          data-testid="voice-interrupt-button"
          className={cn(
            'inline-flex items-center gap-2 h-12 px-5 rounded-full text-xs font-medium uppercase tracking-[0.14em]',
            'bg-[#35DFFF]/14 border border-[#35DFFF]/40 text-[#7CEEFF]',
            'hover:bg-[#35DFFF]/24 hover:text-white active:scale-95 transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70'
          )}
          title="Interrupt (Space)"
        >
          <Hand className="w-4 h-4" />
          <span>Interrupt</span>
        </button>
      )}

      {/* End Session */}
      <button
        type="button"
        onClick={onEnd}
        aria-label="End voice session"
        data-testid="voice-end-button"
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200',
          'bg-rose-500/16 border border-rose-400/35 text-rose-300',
          'hover:bg-rose-500/28 hover:text-rose-100 active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60'
        )}
        title="End Session (Esc)"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
};
