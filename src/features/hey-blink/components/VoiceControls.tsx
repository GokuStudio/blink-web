import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, ShieldOff } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { HandsFreeSnapshot } from '../conversation/hands-free-conversation-controller';
import type { VoiceSessionState } from '../services/voice-session.interface';

export interface VoiceControlsProps {
  state: VoiceSessionState;
  isMuted: boolean;
  /** Retained for accessibility/keyboard API compatibility; natural voice barge-in replaces an Interrupt button */
  canInterrupt?: boolean;
  interactionMode?: 'hands-free' | 'manual';
  handsFree?: HandsFreeSnapshot;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onInterrupt?: () => void;
  onEnableHandsFree?: () => void;
  onDisableHandsFree?: () => void;
}

const SPRING_TACTILE = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 30,
  mass: 0.8,
};

/**
 * Refined, distraction-free voice controls.
 *
 * - Removes the explicit Interrupt button: Gemini Live supports natural full-duplex
 *   voice barge-in (plus Spacebar shortcut), keeping the active dock a balanced,
 *   symmetric 2-button glass jewel (`Mute` · `End`) with zero layout jump.
 * - Idle displays a sculpted obsidian-and-cyan `Talk to Blink` capsule with spring physics.
 */
export const VoiceControls: React.FC<VoiceControlsProps> = ({
  state,
  isMuted,
  interactionMode = 'manual',
  handsFree,
  onStart,
  onEnd,
  onToggleMute,
  onEnableHandsFree,
  onDisableHandsFree,
}) => {
  if (state === 'error' || handsFree?.activationState === 'error') {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Optional Hands-Free Mode (for future on-device wake-word model / hardware)
  // ---------------------------------------------------------------------------
  if (interactionMode === 'hands-free') {
    const activation = handsFree?.activationState ?? 'wake_unavailable';
    const needsOneTimeEnable =
      state === 'idle' &&
      (!handsFree?.userConsentEnabled ||
        activation === 'wake_unavailable' ||
        activation === 'suspended' ||
        Boolean(handsFree?.requiresUserGestureToResume));

    if (needsOneTimeEnable && activation !== 'wake_detected' && activation !== 'wake_initializing') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={SPRING_TACTILE}
          className="flex flex-col items-center gap-2.5 max-w-xs text-center"
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={SPRING_TACTILE}
            onClick={onEnableHandsFree}
            data-testid="enable-hands-free-button"
            className={cn(
              'group relative inline-flex items-center gap-3 px-6 py-3 rounded-full',
              'bg-white/[0.04] backdrop-blur-2xl border border-white/[0.12]',
              'text-white/95 text-[13px] font-medium tracking-[0.04em]',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.55),0_0_28px_rgba(53,223,255,0.12)]',
              'hover:border-[#35DFFF]/50 hover:bg-white/[0.07] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_44px_rgba(0,0,0,0.6),0_0_38px_rgba(53,223,255,0.22)]',
              'transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70'
            )}
          >
            <span className="w-7 h-7 rounded-full bg-[#35DFFF]/15 border border-[#35DFFF]/35 flex items-center justify-center text-[#7CEEFF]">
              <Mic className="w-3.5 h-3.5" />
            </span>
            <span>Enable hands-free mode</span>
          </motion.button>

          <p className="text-[11px] text-slate-400/70 leading-relaxed">
            One-time mic permission for local &ldquo;Hey Blink&rdquo; listening while this tab is open.
          </p>
        </motion.div>
      );
    }

    const isEnding = state === 'ending' || activation === 'conversation_ending';
    const isInConversation = state !== 'idle';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: isEnding ? 0.38 : 1, scale: isEnding ? 0.96 : 1, y: 0 }}
        transition={SPRING_TACTILE}
        data-testid="voice-hands-free-privacy-controls"
        className={cn(
          'inline-flex items-center gap-2 p-1.5 rounded-full',
          'bg-[#070B10]/55 backdrop-blur-2xl border border-white/[0.09]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_rgba(0,0,0,0.55)]',
          isEnding && 'pointer-events-none'
        )}
      >
        {isInConversation && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={SPRING_TACTILE}
            onClick={onToggleMute}
            aria-pressed={isMuted}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            data-testid="voice-mute-button"
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60',
              isMuted
                ? 'bg-amber-400/16 border border-amber-300/35 text-amber-200 hover:bg-amber-400/24'
                : 'bg-white/[0.06] border border-white/[0.08] text-white/90 hover:bg-white/[0.12]'
            )}
            title={isMuted ? 'Unmute microphone (M)' : 'Mute microphone (M)'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </motion.button>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          transition={SPRING_TACTILE}
          onClick={onDisableHandsFree}
          aria-label="Disable microphone and hands-free listening"
          data-testid="voice-mic-disable-button"
          className={cn(
            'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-[11px] font-medium tracking-[0.06em]',
            'bg-white/[0.04] border border-white/[0.09] text-slate-300',
            'hover:bg-rose-500/18 hover:border-rose-400/35 hover:text-rose-200 transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60'
          )}
          title="Disable microphone"
        >
          <ShieldOff className="w-3.5 h-3.5" />
          <span>Disable mic</span>
        </motion.button>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Primary Crafted Experience: Sculpted "Talk to Blink" + Symmetric 2-Button Pill
  // ---------------------------------------------------------------------------
  const isEnding = state === 'ending';

  return (
    <AnimatePresence initial={false}>
      {state === 'idle' ? (
        <motion.div
          key="idle-cta"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94, position: 'absolute' }}
          transition={SPRING_TACTILE}
          className="flex flex-col items-center gap-3"
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.025, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={SPRING_TACTILE}
            onClick={onStart}
            data-testid="talk-to-blink-button"
            className={cn(
              'group relative inline-flex items-center gap-3.5 pl-2.5 pr-7 py-2.5 rounded-full',
              'bg-gradient-to-b from-white/[0.08] to-white/[0.03] backdrop-blur-2xl',
              'border border-white/[0.13] hover:border-[#35DFFF]/45',
              'text-white/95 text-[14px] font-medium tracking-[0.03em]',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_48px_rgba(0,0,0,0.6),0_0_32px_rgba(53,223,255,0.14)]',
              'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_20px_56px_rgba(0,0,0,0.65),0_0_46px_rgba(53,223,255,0.26)]',
              'transition-[border-color,box-shadow] duration-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/70'
            )}
          >
            {/* Inner luminous icon medallion */}
            <span
              className={cn(
                'relative w-9 h-9 rounded-full flex items-center justify-center',
                'bg-gradient-to-b from-[#35DFFF]/25 to-[#0EA5E9]/10',
                'border border-[#35DFFF]/40 text-[#7CEEFF]',
                'shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_0_18px_rgba(53,223,255,0.28)]',
                'group-hover:from-[#35DFFF]/35 group-hover:text-white transition-all duration-300'
              )}
            >
              <Mic className="w-4 h-4" />
            </span>

            <span className="pr-0.5">Talk to Blink</span>
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          key="active-dock"
          initial={{ opacity: 0, y: 14, scale: 0.92 }}
          animate={{
            opacity: isEnding ? 0.35 : 1,
            y: 0,
            scale: isEnding ? 0.95 : 1,
          }}
          exit={{ opacity: 0, y: 10, scale: 0.92, filter: 'blur(4px)' }}
          transition={SPRING_TACTILE}
          data-testid="voice-active-controls"
          className={cn(
            'inline-flex items-center gap-2 p-2 rounded-full',
            'bg-[#070B10]/62 backdrop-blur-2xl border border-white/[0.10]',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_18px_48px_rgba(0,0,0,0.62)]',
            isEnding && 'pointer-events-none'
          )}
        >
          {/* Mute / Unmute */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_TACTILE}
            onClick={onToggleMute}
            aria-pressed={isMuted}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            data-testid="voice-mute-button"
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60',
              isMuted
                ? 'bg-amber-400/18 border border-amber-300/40 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.18)] hover:bg-amber-400/26'
                : 'bg-white/[0.06] border border-white/[0.09] text-white/90 hover:bg-white/[0.13] hover:text-white'
            )}
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {isMuted ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </motion.button>

          {/* Subtle optical divider */}
          <span aria-hidden="true" className="w-[1px] h-5 bg-white/[0.08]" />

          {/* End Session */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_TACTILE}
            onClick={onEnd}
            aria-label="End voice session"
            data-testid="voice-end-button"
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200',
              'bg-rose-500/14 border border-rose-400/30 text-rose-300',
              'hover:bg-rose-500/26 hover:border-rose-400/50 hover:text-rose-100',
              'shadow-[0_0_20px_rgba(244,63,94,0.12)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60'
            )}
            title="End conversation (Esc) — or simply say “Thanks Blink, that’s all”"
          >
            <PhoneOff className="w-[18px] h-[18px]" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
