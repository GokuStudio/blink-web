/**
 * Blink Stage 2D — Compact Voice Settings, Microphone & Visualizer Tuning Popover
 *
 * Provides clean access to:
 * - Provider selection (Gemini Live vs Preview) + live backend status
 * - Microphone device selector (USB / default mics via MediaDevices)
 * - Voice Ring visualizer controls (Ring vs Mono, Sensitivity, Glow, Speed, Warmth)
 *
 * Keeps the primary Blink Device stage uncluttered while giving power users
 * and demo operators full real-time control.
 */

import React, { useEffect, useRef } from 'react';
import {
  SlidersHorizontal,
  Mic,
  RefreshCw,
  RotateCcw,
  X,
  Radio,
  Sparkles,
} from 'lucide-react';
import type { BlinkVoiceExperience } from '../integration/useBlinkVoiceExperience';

export interface BlinkVoiceSettingsPopoverProps {
  voice: BlinkVoiceExperience;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Visual variant & popover anchoring: 'dock-left' (utility rail) or 'capsule' (inline pill) */
  placement?: 'dock-left' | 'capsule';
}

export const BlinkVoiceSettingsPopover: React.FC<BlinkVoiceSettingsPopoverProps> = ({
  voice,
  open,
  onToggle,
  onClose,
  placement = 'capsule',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refresh available audio devices whenever popover opens
  useEffect(() => {
    if (open) {
      void voice.refreshAudioDevices();
    }
  }, [open, voice.refreshAudioDevices]);

  // Close on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  const { tuning, updateTuning, resetTuning } = voice;

  const triggerClassName =
    placement === 'dock-left'
      ? `relative flex h-8 w-8 min-[900px]:h-10 min-[900px]:w-10 items-center justify-center rounded-full min-[900px]:rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
          open
            ? 'bg-[#35DFFF]/18 text-[#35DFFF]'
            : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.08]'
        }`
      : `inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
          open
            ? 'bg-[#35DFFF]/16 border-[#35DFFF]/45 text-[#35DFFF]'
            : 'bg-white/[0.05] border-white/[0.09] text-neutral-300 hover:bg-white/[0.11] hover:text-white'
        }`;

  const popoverPositionClass =
    placement === 'dock-left'
      ? 'top-[calc(100%+10px)] -left-16 min-[900px]:top-auto min-[900px]:bottom-0 min-[900px]:left-[calc(100%+14px)]'
      : 'bottom-[calc(100%+12px)] right-0';

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={onToggle}
        data-testid="voice-settings-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Voice settings and visualizer tuning"
        title="Voice settings, microphone & visualizer tuning"
        className={triggerClassName}
      >
        <SlidersHorizontal
          className={placement === 'dock-left' ? 'h-[17px] w-[17px]' : 'h-4 w-4'}
          strokeWidth={1.85}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Voice settings and tuning"
          data-testid="voice-settings-popover"
          className={`absolute z-[70] w-[310px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/[0.11] bg-[#111316]/96 p-4 text-left shadow-[0_24px_64px_rgba(0,0,0,0.85)] backdrop-blur-xl ${popoverPositionClass}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
            <div>
              <h3 className="text-[12.5px] font-semibold text-[#F2F4F1] tracking-[-0.01em]">
                Voice &amp; Ring Controls
              </h3>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">
                {voice.providerKind === 'gemini-live'
                  ? voice.isLiveEndpointConfigured
                    ? 'Gemini Live endpoint configured'
                    : 'Gemini Live · token server not set'
                  : 'Preview mode (simulated turns)'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close voice settings"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 1. Voice Provider Switcher */}
          <div className="mt-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-400">
              Voice Engine
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-black/45 p-1 border border-white/[0.06]">
              <button
                type="button"
                onClick={() => voice.switchProvider('gemini-live')}
                data-testid="voice-provider-gemini"
                aria-pressed={voice.providerKind === 'gemini-live'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
                  voice.providerKind === 'gemini-live'
                    ? 'bg-[#35DFFF]/18 text-[#DFF8FF] border border-[#35DFFF]/35'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                <Radio className="h-3.5 w-3.5 text-[#35DFFF]" />
                <span>Gemini Live</span>
              </button>
              <button
                type="button"
                onClick={() => voice.switchProvider('mock')}
                data-testid="voice-provider-mock"
                aria-pressed={voice.providerKind === 'mock'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
                  voice.providerKind === 'mock'
                    ? 'bg-white/[0.12] text-white border border-white/[0.16]'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-300" />
                <span>Preview</span>
              </button>
            </div>
            {voice.providerKind === 'gemini-live' && (
              <p className="mt-1.5 text-[10px] text-neutral-500 leading-snug">
                {voice.isLiveEndpointConfigured
                  ? `Token server: ${voice.tokenEndpoint}`
                  : 'Run local token server (port 8787) with GEMINI_API_KEY in env for real speech.'}
              </p>
            )}
          </div>

          {/* 2. Microphone Selector */}
          <div className="mt-3.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="blink-mic-select"
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-400"
              >
                <Mic className="h-3 w-3 text-[#35DFFF]" />
                <span>Microphone</span>
              </label>
              <button
                type="button"
                onClick={() => void voice.refreshAudioDevices()}
                aria-label="Refresh microphones"
                className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white cursor-pointer"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                <span>Refresh</span>
              </button>
            </div>
            <select
              id="blink-mic-select"
              data-testid="voice-mic-select"
              value={voice.selectedAudioDeviceId}
              onChange={(e) => voice.setSelectedAudioDeviceId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/[0.10] bg-black/55 px-2.5 py-1.5 text-[11.5px] text-neutral-200 focus:border-[#35DFFF]/60 focus:outline-none"
            >
              <option value="default">System Default Microphone</option>
              {voice.audioInputDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Voice Ring Style & Sliders */}
          <div className="mt-3.5 pt-3 border-t border-white/[0.07] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-400">
                Ring Style
              </span>
              <div className="inline-flex rounded-lg bg-black/45 p-0.5 border border-white/[0.06]">
                {(['ring', 'mono'] as const).map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => updateTuning({ ringType: variant })}
                    data-testid={`voice-ring-type-${variant}`}
                    className={`rounded-md px-2.5 py-0.5 text-[10.5px] font-medium capitalize transition-colors cursor-pointer ${
                      tuning.ringType === variant
                        ? 'bg-[#35DFFF]/20 text-[#DFF8FF]'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {variant}
                  </button>
                ))}
              </div>
            </div>

            {/* On-Screen Status Pill Toggle */}
            <div className="flex items-center justify-between pt-0.5">
              <div>
                <span className="text-[11px] text-neutral-200 block leading-tight">
                  Show status text
                </span>
                <span className="text-[9.5px] text-neutral-500 block">
                  Hide Listening / Thinking / Speaking pill
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tuning.showStatusLabel}
                onClick={() => updateTuning({ showStatusLabel: !tuning.showStatusLabel })}
                data-testid="voice-toggle-status-label"
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
                  tuning.showStatusLabel
                    ? 'bg-[#35DFFF]/30 border-[#35DFFF]/50'
                    : 'bg-white/[0.08] border-white/[0.12]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    tuning.showStatusLabel
                      ? 'translate-x-[18px] bg-[#35DFFF]'
                      : 'translate-x-[2px] bg-neutral-400'
                  }`}
                />
              </button>
            </div>

            {/* Sensitivity Slider */}
            <label className="block">
              <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                <span>Audio Reactivity</span>
                <span className="font-mono text-[10.5px] text-neutral-400">
                  {Math.round(tuning.sensitivityScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.6}
                step={0.05}
                value={tuning.sensitivityScale}
                onChange={(e) => updateTuning({ sensitivityScale: Number(e.target.value) })}
                data-testid="voice-slider-sensitivity"
                className="w-full accent-[#35DFFF] cursor-pointer h-1.5"
              />
            </label>

            {/* Glow Slider */}
            <label className="block">
              <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                <span>Luminance &amp; Glow</span>
                <span className="font-mono text-[10.5px] text-neutral-400">
                  {Math.round(tuning.glowScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.35}
                max={1.45}
                step={0.05}
                value={tuning.glowScale}
                onChange={(e) => updateTuning({ glowScale: Number(e.target.value) })}
                data-testid="voice-slider-glow"
                className="w-full accent-[#35DFFF] cursor-pointer h-1.5"
              />
            </label>

            {/* Speed Slider */}
            <label className="block">
              <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                <span>Motion Speed</span>
                <span className="font-mono text-[10.5px] text-neutral-400">
                  {tuning.speedScale.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={1.6}
                step={0.05}
                value={tuning.speedScale}
                onChange={(e) => updateTuning({ speedScale: Number(e.target.value) })}
                data-testid="voice-slider-speed"
                className="w-full accent-[#35DFFF] cursor-pointer h-1.5"
              />
            </label>

            {/* Color Warmth Slider */}
            <label className="block">
              <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                <span>Color Warmth</span>
                <span className="font-mono text-[10.5px] text-neutral-400">
                  {tuning.warmthOffset >= 0 ? `+${tuning.warmthOffset.toFixed(2)}` : tuning.warmthOffset.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={-0.4}
                max={0.4}
                step={0.05}
                value={tuning.warmthOffset}
                onChange={(e) => updateTuning({ warmthOffset: Number(e.target.value) })}
                data-testid="voice-slider-warmth"
                className="w-full accent-[#35DFFF] cursor-pointer h-1.5"
              />
            </label>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={resetTuning}
                data-testid="voice-tuning-reset"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] text-neutral-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset defaults</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
