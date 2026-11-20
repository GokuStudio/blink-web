import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useFullscreen } from '@/shared/hooks/useFullscreen';
import { cn } from '@/shared/utils/cn';
import { useVoiceSession } from '../hooks/useVoiceSession';
import type { DeviceExperienceVoiceMountProps } from '../services/voice-session.interface';
import { BlinkVoiceGlow } from '../visualizer/BlinkVoiceGlow';
import { VoiceControls } from './VoiceControls';
import { VoiceDevPanel } from './VoiceDevPanel';
import { VoiceStatus } from './VoiceStatus';

export interface HeyBlinkScreenProps extends DeviceExperienceVoiceMountProps {
  className?: string;
}

/**
 * HeyBlinkScreen — Standalone & Embeddable Fullscreen Voice Experience (Phase H1)
 *
 * Mounts standalone on `/hey-blink`, and is architected via
 * `DeviceExperienceVoiceMountProps` to embed directly inside a future
 * `DeviceExperienceController` (replacing expressive WebGL eyes during
 * active voice conversations).
 */
export const HeyBlinkScreen: React.FC<HeyBlinkScreenProps> = ({
  embedded = false,
  transitionHooks,
  createSession,
  enableDevPanel = import.meta.env.DEV,
  className,
}) => {
  const {
    state,
    isActive,
    canInterrupt,
    isMuted,
    isSimulated,
    providerId,
    sessionId,
    error,
    autoCycleEnabled,
    supportsDevControls,
    audioLevelsRef,
    subscribeAudio,
    start,
    end,
    retry,
    interrupt,
    toggleMute,
    devTriggerState,
    devTriggerError,
    devTriggerSpeechBurst,
    devSetAutoCycle,
  } = useVoiceSession({ createSession, transitionHooks });

  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Keyboard shortcuts for smooth desktop testing & accessibility
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === 'Space' && canInterrupt) {
        event.preventDefault();
        interrupt();
      } else if ((event.key === 'm' || event.key === 'M') && isActive) {
        event.preventDefault();
        toggleMute();
      } else if (event.key === 'Escape' && (isActive || state === 'error')) {
        event.preventDefault();
        void end();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canInterrupt, end, interrupt, isActive, state, toggleMute]);

  const showDevPanel = Boolean(import.meta.env.DEV && enableDevPanel && supportsDevControls);

  return (
    <main
      data-testid="hey-blink-screen"
      data-voice-state={state}
      className={cn(
        'relative overflow-hidden bg-[#030508] text-white',
        embedded ? 'w-full h-full' : 'w-screen h-[100dvh]',
        className
      )}
    >
      <BlinkVoiceGlow
        state={state}
        isMuted={isMuted}
        audioLevelsRef={audioLevelsRef}
      >
        {/* Top Minimal Navigation Chrome (omitted when embedded inside Blink Device) */}
        {!embedded ? (
          <header
            className={cn(
              'relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 transition-opacity duration-500',
              isActive ? 'opacity-35 hover:opacity-100 focus-within:opacity-100' : 'opacity-80 hover:opacity-100'
            )}
          >
            <Link
              to="/demo"
              aria-label="Back to Blink Demo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/[0.08] text-xs text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Blink</span>
            </Link>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="p-2 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </header>
        ) : (
          <div aria-hidden="true" />
        )}

        {/* Center Negative Space — Holds Idle Presence or Error Recovery Only */}
        <section className="relative z-20 flex-1 flex flex-col items-center justify-center px-4">
          {(state === 'idle' || state === 'error') && (
            <VoiceStatus
              state={state}
              isMuted={isMuted}
              isSimulated={isSimulated}
              error={error}
              onRetry={() => void retry()}
              onDismissError={() => void end()}
            />
          )}
        </section>

        {/* Bottom Dock — Active Presence Cue & Minimal Controls */}
        <footer className="relative z-20 flex flex-col items-center gap-4 pb-8 sm:pb-11 px-4">
          {state !== 'idle' && state !== 'error' && (
            <VoiceStatus
              state={state}
              isMuted={isMuted}
              isSimulated={isSimulated}
              error={error}
              onRetry={() => void retry()}
              onDismissError={() => void end()}
            />
          )}

          <VoiceControls
            state={state}
            isMuted={isMuted}
            canInterrupt={canInterrupt}
            onStart={() => void start()}
            onEnd={() => void end()}
            onToggleMute={toggleMute}
            onInterrupt={interrupt}
          />
        </footer>
      </BlinkVoiceGlow>

      {/* Detached Dev-Only Testing Panel (never shipped in production bundles) */}
      {showDevPanel && (
        <VoiceDevPanel
          state={state}
          isMuted={isMuted}
          providerId={providerId}
          sessionId={sessionId}
          autoCycleEnabled={autoCycleEnabled}
          subscribeAudio={subscribeAudio}
          onTriggerState={devTriggerState}
          onTriggerError={devTriggerError}
          onTriggerSpeechBurst={devTriggerSpeechBurst}
          onSetAutoCycle={devSetAutoCycle}
        />
      )}
    </main>
  );
};
