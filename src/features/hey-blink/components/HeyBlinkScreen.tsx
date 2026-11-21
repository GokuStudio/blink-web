import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useFullscreen } from '@/shared/hooks/useFullscreen';
import { cn } from '@/shared/utils/cn';
import {
  playMuteToggleChime,
  playSessionEndChime,
  playSessionEnterChime,
} from '../audio/acoustic-chimes';
import { useHandsFreeVoice } from '../hooks/useHandsFreeVoice';
import type {
  DeviceExperienceVoiceMountProps,
  VoiceProviderKind,
  VoiceSessionState,
} from '../services/voice-session.interface';
import type { IWakeWordEngine } from '../wake-word/wake-word.interface';
import { BlinkVoiceGlow } from '../visualizer/BlinkVoiceGlow';
import {
  DEFAULT_VOICE_GLOW_TUNING,
  type VoiceGlowTuning,
} from '../visualizer/visual-presets';
import { BlinkDialStudio } from './BlinkDialStudio';
import { VoiceControls } from './VoiceControls';
import { VoiceStatus } from './VoiceStatus';

export interface HeyBlinkScreenProps extends DeviceExperienceVoiceMountProps {
  /** Optional initial voice provider ('mock' | 'gemini-live') */
  initialProvider?: VoiceProviderKind;
  /**
   * Interaction mode:
   * - `'manual'` (default web UX): Sculpted "Talk to Blink" entry capsule + full-duplex
   *   hands-free turn-taking, automatic voice barge-in (no Interrupt button), and automatic
   *   natural voice ending ("Thanks Blink, that's all.").
   * - `'hands-free'`: Wake-word driven mode (for future on-device wake model / hardware).
   */
  interactionMode?: 'hands-free' | 'manual';
  /** Optional on-device wake-word engine implementation */
  wakeWordEngine?: IWakeWordEngine;
  className?: string;
}

/**
 * HeyBlinkScreen — Standalone & Embeddable Fullscreen Voice Experience
 *
 * Crafted for serenity, optical balance, and delight:
 * - Pitch-black fullscreen presence driven at 60 FPS with zero per-frame React re-renders.
 * - Symmetric 2-button active dock (Mute · End); natural voice barge-in replaces Interrupt chrome.
 * - Unified singular status whisper with live 3-bar ref-driven micro-waveform.
 * - DialKit floating customization studio for live sliders, toggles, atmospheres, & USB mic selection.
 */
export const HeyBlinkScreen: React.FC<HeyBlinkScreenProps> = ({
  embedded = false,
  transitionHooks,
  createSession,
  initialProvider,
  interactionMode = 'manual',
  wakeWordEngine,
  enableDevPanel = true,
  className,
}) => {
  const {
    state,
    isActive,
    canInterrupt,
    isMuted,
    isSimulated,
    providerId,
    providerKind,
    error,
    autoCycleEnabled,
    supportsDevControls,
    audioInputDevices,
    selectedAudioDeviceId,
    setSelectedAudioDeviceId,
    switchProvider,
    audioLevelsRef,
    subscribeAudio,
    start,
    end,
    retry,
    interrupt,
    toggleMute,
    devTriggerState,
    devTriggerError,
    devSetAutoCycle,
    debugTranscriptionEnabled,
    setDebugTranscriptionEnabled,
    handsFree,
    enableHandsFree,
    disableHandsFree,
    devSimulateUserTranscript,
  } = useHandsFreeVoice({
    createSession,
    initialProvider,
    transitionHooks,
    wakeWordEngine,
  });

  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [glowTuning, setGlowTuning] = useState<VoiceGlowTuning>(DEFAULT_VOICE_GLOW_TUNING);
  const [acousticChimesEnabled, setAcousticChimesEnabled] = useState(true);
  const chimesRef = useRef(acousticChimesEnabled);
  chimesRef.current = acousticChimesEnabled;

  // Play whisper-soft spatial chimes on enter / exit when enabled in DialKit
  const prevStateRef = useRef<VoiceSessionState>(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!chimesRef.current) return;

    if (prev === 'idle' && state === 'entering') {
      playSessionEnterChime();
    } else if (prev !== 'ending' && prev !== 'idle' && state === 'ending') {
      playSessionEndChime();
    }
  }, [state]);

  const handleToggleMute = useCallback(() => {
    if (chimesRef.current) {
      playMuteToggleChime(!isMuted);
    }
    toggleMute();
  }, [isMuted, toggleMute]);

  // Keyboard shortcuts for desktop accessibility (Space still interrupts if desired)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
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
        handleToggleMute();
      } else if (event.key === 'Escape' && (isActive || state === 'error')) {
        event.preventDefault();
        void end();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canInterrupt, end, handleToggleMute, interrupt, isActive, state]);

  const visualGlowState: VoiceSessionState =
    state === 'idle' && handsFree.activationState === 'wake_detected'
      ? 'entering'
      : handsFree.activationState === 'error' && state === 'idle'
        ? 'error'
        : state;

  const isLiveTransmitting =
    !isSimulated &&
    !isMuted &&
    (state === 'listening' ||
      state === 'thinking' ||
      state === 'speaking' ||
      state === 'interrupted');

  const handleRetry = () => {
    if (handsFree.activationState === 'error' && state === 'idle') {
      void enableHandsFree();
    } else {
      void retry();
    }
  };

  const handleDismissError = () => {
    if (handsFree.activationState === 'error' && state === 'idle') {
      void disableHandsFree();
    } else {
      void end();
    }
  };

  return (
    <main
      data-testid="hey-blink-screen"
      data-voice-state={state}
      data-voice-provider={providerId}
      data-activation-state={handsFree.activationState}
      data-interaction-mode={interactionMode}
      className={cn(
        'relative overflow-hidden bg-[#030508] text-white',
        embedded ? 'w-full h-full' : 'w-screen h-[100dvh]',
        className
      )}
    >
      <BlinkVoiceGlow
        state={visualGlowState}
        isMuted={isMuted}
        audioLevelsRef={audioLevelsRef}
        tuning={glowTuning}
      >
        {/* Top Refined Bar — Whisper Chrome + Quiet Hardware-Style Live Indicator */}
        {!embedded ? (
          <header
            className={cn(
              'relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 transition-opacity duration-500',
              // Leave comfortable top-right clearance for DialKit's collapsed floating dial
              enableDevPanel ? 'pr-16 sm:pr-20' : '',
              isActive
                ? 'opacity-45 hover:opacity-100 focus-within:opacity-100'
                : 'opacity-80 hover:opacity-100'
            )}
          >
            <Link
              to="/demo"
              aria-label="Back to Blink Demo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-xs text-slate-300/90 hover:text-white hover:bg-white/[0.09] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Blink</span>
            </Link>

            {/* Quiet Top Privacy / Mode Indicator (replaces stacked status boxes) */}
            <div className="flex items-center">
              {isLiveTransmitting ? (
                <span
                  data-testid="voice-live-transmission-indicator"
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] backdrop-blur-xl border border-cyan-400/20 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-200/85"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#35DFFF] shadow-[0_0_8px_#35DFFF] animate-pulse" />
                  Live
                </span>
              ) : isSimulated && isActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] text-[10px] uppercase tracking-[0.18em] text-slate-400/80">
                  Preview
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="p-2 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-slate-300/90 hover:text-white hover:bg-white/[0.09] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35DFFF]/60"
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

        {/* Center Negative Space — Serene Wordmark on Idle or Error Recovery Only */}
        <section className="relative z-20 flex-1 flex flex-col items-center justify-center px-4">
          {(state === 'idle' || state === 'error' || handsFree.activationState === 'error') && (
            <VoiceStatus
              key={state === 'error' || handsFree.activationState === 'error' ? 'err' : 'idle'}
              state={state}
              isMuted={isMuted}
              isSimulated={isSimulated}
              error={error}
              interactionMode={interactionMode}
              handsFree={handsFree}
              subscribeAudio={subscribeAudio}
              onRetry={handleRetry}
              onDismissError={handleDismissError}
            />
          )}
        </section>

        {/* Bottom Dock — Singular Presence Whisper + Sculpted Controls */}
        <footer className="relative z-20 flex flex-col items-center gap-5 pb-9 sm:pb-12 px-4">
          {state !== 'idle' && state !== 'error' && handsFree.activationState !== 'error' && (
            <VoiceStatus
              state={state}
              isMuted={isMuted}
              isSimulated={isSimulated}
              error={error}
              interactionMode={interactionMode}
              handsFree={handsFree}
              subscribeAudio={subscribeAudio}
              onRetry={handleRetry}
              onDismissError={handleDismissError}
            />
          )}

          <VoiceControls
            state={state}
            isMuted={isMuted}
            canInterrupt={canInterrupt}
            interactionMode={interactionMode}
            handsFree={handsFree}
            onStart={() => void start()}
            onEnd={() => void end()}
            onToggleMute={handleToggleMute}
            onInterrupt={interrupt}
            onEnableHandsFree={() => void enableHandsFree()}
            onDisableHandsFree={() => void disableHandsFree()}
          />
        </footer>
      </BlinkVoiceGlow>

      {/* DialKit Live Customization Studio (sliders, toggles, palettes, USB mic & provider) */}
      {enableDevPanel && !embedded && (
        <BlinkDialStudio
          providerKind={providerKind}
          audioInputDevices={audioInputDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          autoCycleEnabled={autoCycleEnabled}
          debugTranscriptionEnabled={debugTranscriptionEnabled}
          supportsMockControls={supportsDevControls}
          onTuningChange={setGlowTuning}
          onAcousticChimesChange={setAcousticChimesEnabled}
          onSwitchProvider={switchProvider}
          onSelectAudioDevice={setSelectedAudioDeviceId}
          onSetAutoCycle={devSetAutoCycle}
          onSetDebugTranscription={setDebugTranscriptionEnabled}
          onTriggerState={devTriggerState}
          onTriggerError={devTriggerError}
          onSimulateUserTranscript={devSimulateUserTranscript}
        />
      )}
    </main>
  );
};
