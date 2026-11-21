/**
 * Blink Stage 2D — Cohesive Voice Control Pill
 *
 * Designed as one unified hardware control system alongside Blink's Camera button:
 * - Minimum 44x44px touch targets (h-11 / min-w-11)
 * - Consistent pill geometry, optical icon alignment, and focus-visible rings
 * - Always-available End Conversation action while voice is engaged
 * - Calm error recovery (Retry / Preview / Return to Eyes) without modal clutter
 */

import React from 'react';
import {
  Mic,
  MicOff,
  Loader2,
  X,
  RotateCcw,
  Sparkles,
  Hand,
} from 'lucide-react';
import type { BlinkVoiceExperience } from '../integration/useBlinkVoiceExperience';

export interface BlinkVoiceControlsPillProps {
  voice: BlinkVoiceExperience;
  /** Compact icon-only secondary controls on tight viewports */
  compact?: boolean;
}

export const BlinkVoiceControlsPill: React.FC<BlinkVoiceControlsPillProps> = ({
  voice,
  compact = false,
}) => {
  const {
    experienceState,
    isEngaged,
    isConversationLive,
    canInterrupt,
    isMuted,
    isVoiceSupported,
    isLiveEndpointConfigured,
    providerKind,
    startVoice,
    startPreviewVoice,
    endVoice,
    retryVoice,
    interruptVoice,
    toggleMute,
    returnToEyes,
  } = voice;

  const isConnecting =
    experienceState === 'VOICE_REQUESTED' ||
    experienceState === 'MIC_PERMISSION_PENDING' ||
    experienceState === 'VOICE_CONNECTING';

  const isEnding =
    experienceState === 'VOICE_ENDING' ||
    experienceState === 'RETURNING_TO_EYES';

  const isError = experienceState === 'VOICE_ERROR';

  // Idle Eye Mode -> Primary "Talk to Blink" button
  if (!isEngaged) {
    return (
      <button
        type="button"
        onClick={() => void startVoice()}
        disabled={!isVoiceSupported}
        data-testid="stage-voice-toggle"
        aria-label={
          isVoiceSupported
            ? 'Talk to Blink voice assistant'
            : 'Voice assistant unavailable in this browser'
        }
        aria-pressed={false}
        className="inline-flex h-11 w-[152px] items-center justify-center gap-2 rounded-full bg-[#35DFFF]/12 border border-[#35DFFF]/35 px-3.5 text-[12px] font-medium text-[#DFF8FF] transition-all duration-200 hover:bg-[#35DFFF]/20 hover:border-[#35DFFF]/55 active:scale-[0.98] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
      >
        <Mic className="h-4 w-4 text-[#35DFFF] shrink-0" strokeWidth={1.9} />
        <span className="whitespace-nowrap">Talk to Blink</span>
      </button>
    );
  }

  // Error State -> Calm inline recovery controls
  if (isError) {
    const showPreviewOption =
      providerKind === 'gemini-live' && !isLiveEndpointConfigured;

    return (
      <div
        className="inline-flex items-center gap-1.5"
        data-testid="voice-error-controls"
      >
        {showPreviewOption ? (
          <button
            type="button"
            onClick={() => void startPreviewVoice()}
            data-testid="voice-preview-fallback-btn"
            aria-label="Try simulated voice preview mode"
            className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-[#35DFFF]/14 border border-[#35DFFF]/40 px-3.5 text-[12px] font-medium text-[#DFF8FF] transition-all duration-200 hover:bg-[#35DFFF]/22 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#35DFFF]" strokeWidth={1.9} />
            <span>Preview</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void retryVoice()}
            data-testid="voice-retry-btn"
            aria-label="Retry voice connection"
            className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-white/[0.08] border border-white/[0.14] px-3.5 text-[12px] font-medium text-[#F2F4F1] transition-all duration-200 hover:bg-white/[0.14] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#35DFFF]" strokeWidth={1.9} />
            <span>Retry</span>
          </button>
        )}

        <button
          type="button"
          onClick={returnToEyes}
          data-testid="voice-end-btn"
          aria-label="Return to Blink eyes"
          className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-white/[0.05] border border-white/[0.10] px-3.5 text-[12px] font-medium text-neutral-300 transition-all duration-200 hover:bg-white/[0.10] hover:text-white active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
        >
          <X className="h-4 w-4" strokeWidth={1.9} />
          {!compact && <span>Eyes</span>}
        </button>
      </div>
    );
  }

  // Active / Connecting / Ending Voice Conversation Controls
  return (
    <div
      className="inline-flex items-center gap-1.5"
      data-testid="voice-active-controls"
    >
      {/* Connecting Indicator OR Mute/Unmute Toggle */}
      {isConnecting || isEnding ? (
        <span
          data-testid="voice-connecting-indicator"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#35DFFF]/12 border border-[#35DFFF]/30 px-4 text-[12px] font-medium text-[#9EEBFF]"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#35DFFF]" />
          <span>{isEnding ? 'Ending…' : 'Connecting…'}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={toggleMute}
          data-testid="voice-mute-toggle"
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMuted}
          className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
            isMuted
              ? 'bg-amber-400/14 border-amber-400/35 text-amber-200 hover:bg-amber-400/22'
              : 'bg-[#35DFFF]/14 border-[#35DFFF]/40 text-[#DFF8FF] hover:bg-[#35DFFF]/22'
          }`}
        >
          {isMuted ? (
            <MicOff className="h-4 w-4 shrink-0" strokeWidth={1.9} />
          ) : (
            <Mic className="h-4 w-4 text-[#35DFFF] shrink-0" strokeWidth={1.9} />
          )}
          {!compact && <span>{isMuted ? 'Muted' : 'Mic On'}</span>}
        </button>
      )}

      {/* Barge-in Interrupt button when Blink is speaking or processing */}
      {isConversationLive && canInterrupt && (
        <button
          type="button"
          onClick={interruptVoice}
          data-testid="voice-interrupt-btn"
          aria-label="Interrupt Blink"
          className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] px-3.5 text-[12px] font-medium text-neutral-100 transition-all duration-200 hover:bg-white/[0.14] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
        >
          <Hand className="h-3.5 w-3.5 text-[#9EEBFF]" strokeWidth={1.9} />
          {!compact && <span>Interrupt</span>}
        </button>
      )}

      {/* Always-available End Conversation action */}
      <button
        type="button"
        onClick={() => void endVoice()}
        disabled={isEnding}
        data-testid="voice-end-btn"
        aria-label="End voice conversation"
        className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-red-500/14 border border-red-500/35 px-3.5 text-[12px] font-medium text-red-200 transition-all duration-200 hover:bg-red-500/24 hover:border-red-500/50 active:scale-[0.98] cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-400"
      >
        <X className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>End</span>
      </button>
    </div>
  );
};
