/**
 * Blink Stage 2D — Grouped Voice Settings, Visualizer Switcher & Tuning Popover
 *
 * Supports switching seamlessly between:
 * - Voice Ring (`libraries.dev/voice-ring`) with its own grouped configs
 * - Voice Glow (`libraries.dev/voice` / `voice-glow`) with its own grouped configs
 *   including curved-bezel Edge Fade feathering, Atmospheres, Geometry, and Luminance.
 *
 * Organized into clean collapsible groups so power controls stay calm and scannable.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  Mic,
  RefreshCw,
  RotateCcw,
  X,
  Radio,
  Sparkles,
  ChevronDown,
  Circle,
  Waves,
} from 'lucide-react';
import type { BlinkAtmosphereId } from '../visualizer/visual-presets';
import type { BlinkVoiceExperience } from '../integration/useBlinkVoiceExperience';

export interface BlinkVoiceSettingsPopoverProps {
  voice: BlinkVoiceExperience;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Visual variant & popover anchoring: 'dock-left' (utility rail) or 'capsule' (inline pill) */
  placement?: 'dock-left' | 'capsule';
}

const ATMOSPHERE_OPTIONS: ReadonlyArray<{
  id: BlinkAtmosphereId;
  label: string;
  swatch: string;
}> = [
  { id: 'blink-cyan', label: 'Blink Cyan', swatch: 'from-[#35DFFF] to-[#2563EB]' },
  { id: 'aurora-violet', label: 'Aurora Violet', swatch: 'from-[#A78BFA] to-[#38BDF8]' },
  { id: 'bioluminescent', label: 'Bioluminescent', swatch: 'from-[#2DD4BF] to-[#0EA5E9]' },
  { id: 'midnight-ice', label: 'Midnight Ice', swatch: 'from-[#E0F2FE] to-[#1D4ED8]' },
  { id: 'obsidian-mono', label: 'Obsidian Mono', swatch: 'from-[#F8FAFC] to-[#475569]' },
];

interface SectionGroupProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  testId?: string;
}

const SectionGroup: React.FC<SectionGroupProps> = ({
  title,
  open,
  onToggle,
  children,
  testId,
}) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={testId}
      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
    >
      <span className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-neutral-300">
        {title}
      </span>
      <ChevronDown
        className={`h-3.5 w-3.5 text-neutral-500 transition-transform duration-200 ${
          open ? 'rotate-180 text-neutral-300' : ''
        }`}
      />
    </button>
    {open && <div className="px-3 pb-3 pt-1.5 space-y-2.5 border-t border-white/[0.05]">{children}</div>}
  </div>
);

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
  testId?: string;
}

const SwitchRow: React.FC<SwitchRowProps> = ({ label, hint, checked, onToggle, testId }) => (
  <div className="flex items-center justify-between gap-2">
    <div>
      <span className="text-[11px] text-neutral-200 block leading-tight">{label}</span>
      {hint && <span className="text-[9.5px] text-neutral-500 block">{hint}</span>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      data-testid={testId}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
        checked
          ? 'bg-[#35DFFF]/30 border-[#35DFFF]/50'
          : 'bg-white/[0.08] border-white/[0.12]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? 'translate-x-[18px] bg-[#35DFFF]' : 'translate-x-[2px] bg-neutral-400'
        }`}
      />
    </button>
  </div>
);

interface SliderRowProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
  testId?: string;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  testId,
}) => (
  <label className="block">
    <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
      <span>{label}</span>
      <span className="font-mono text-[10.5px] text-neutral-400">{valueLabel}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-testid={testId}
      className="w-full accent-[#35DFFF] cursor-pointer h-1.5"
    />
  </label>
);

export const BlinkVoiceSettingsPopover: React.FC<BlinkVoiceSettingsPopoverProps> = ({
  voice,
  open,
  onToggle,
  onClose,
  placement = 'capsule',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    engine: true,
    appearance: true,
    geometry: true,
    motion: false,
  });

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const { tuning, updateTuning, updateGlowTuning, resetTuning } = voice;
  const isGlow = tuning.visualizerKind === 'voice-glow';

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
        title="Voice settings, visualizer & tuning"
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
          aria-label="Voice settings and visualizer tuning"
          data-testid="voice-settings-popover"
          className={`absolute z-[70] w-[332px] max-w-[calc(100vw-24px)] max-h-[min(78dvh,580px)] flex flex-col rounded-2xl border border-white/[0.11] bg-[#111316]/96 text-left shadow-[0_24px_64px_rgba(0,0,0,0.88)] backdrop-blur-xl overflow-hidden ${popoverPositionClass}`}
        >
          {/* Sticky Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.07] shrink-0">
            <div>
              <h3 className="text-[12.5px] font-semibold text-[#F2F4F1] tracking-[-0.01em]">
                Voice &amp; Visualizer Controls
              </h3>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">
                {voice.providerKind === 'gemini-live'
                  ? voice.isLiveEndpointConfigured
                    ? 'Gemini Live · token endpoint ready'
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

          {/* Visualizer Selector Bar (Voice Ring vs Voice Glow / libraries.dev/voice) */}
          <div className="px-4 pt-3 pb-2 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-400">
              Visualizer
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-black/50 p-1 border border-white/[0.07]">
              <button
                type="button"
                onClick={() => updateTuning({ visualizerKind: 'voice-ring' })}
                data-testid="voice-visualizer-ring"
                aria-pressed={!isGlow}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
                  !isGlow
                    ? 'bg-[#35DFFF]/18 text-[#DFF8FF] border border-[#35DFFF]/35'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                <Circle className="h-3.5 w-3.5 text-[#35DFFF]" />
                <span>Voice Ring</span>
              </button>
              <button
                type="button"
                onClick={() => updateTuning({ visualizerKind: 'voice-glow' })}
                data-testid="voice-visualizer-glow"
                aria-pressed={isGlow}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
                  isGlow
                    ? 'bg-[#35DFFF]/18 text-[#DFF8FF] border border-[#35DFFF]/35'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                <Waves className="h-3.5 w-3.5 text-[#35DFFF]" />
                <span>Voice Glow</span>
              </button>
            </div>
          </div>

          {/* Scrollable Grouped Sections */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
            {/* GROUP 1: Engine, Mic & Display */}
            <SectionGroup
              title="Engine & Audio"
              open={openGroups.engine}
              onToggle={() => toggleGroup('engine')}
              testId="voice-group-engine"
            >
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-black/45 p-1 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => voice.switchProvider('gemini-live')}
                  data-testid="voice-provider-gemini"
                  aria-pressed={voice.providerKind === 'gemini-live'}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    voice.providerKind === 'gemini-live'
                      ? 'bg-[#35DFFF]/18 text-[#DFF8FF] border border-[#35DFFF]/35'
                      : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                  }`}
                >
                  <Radio className="h-3 w-3 text-[#35DFFF]" />
                  <span>Gemini Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => voice.switchProvider('mock')}
                  data-testid="voice-provider-mock"
                  aria-pressed={voice.providerKind === 'mock'}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    voice.providerKind === 'mock'
                      ? 'bg-white/[0.12] text-white border border-white/[0.16]'
                      : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-sky-300" />
                  <span>Preview</span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="blink-mic-select"
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-neutral-400"
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
                  className="mt-1 w-full rounded-lg border border-white/[0.10] bg-black/55 px-2.5 py-1.5 text-[11px] text-neutral-200 focus:border-[#35DFFF]/60 focus:outline-none"
                >
                  <option value="default">System Default Microphone</option>
                  {voice.audioInputDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label}
                    </option>
                  ))}
                </select>
              </div>

              <SwitchRow
                label="Show status text"
                hint="Hide Listening / Thinking / Speaking pill"
                checked={tuning.showStatusLabel}
                onToggle={() => updateTuning({ showStatusLabel: !tuning.showStatusLabel })}
                testId="voice-toggle-status-label"
              />
            </SectionGroup>

            {/* VISUALIZER-SPECIFIC GROUPS */}
            {!isGlow ? (
              <>
                {/* VOICE RING — GROUP 2: Ring Style & Color */}
                <SectionGroup
                  title="Ring Appearance"
                  open={openGroups.appearance}
                  onToggle={() => toggleGroup('appearance')}
                  testId="voice-group-ring-appearance"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-neutral-300">Ring Variant</span>
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

                  <SliderRow
                    label="Luminance & Glow"
                    valueLabel={`${Math.round(tuning.glowScale * 100)}%`}
                    min={0.35}
                    max={1.45}
                    step={0.05}
                    value={tuning.glowScale}
                    onChange={(v) => updateTuning({ glowScale: v })}
                    testId="voice-slider-glow"
                  />

                  <SliderRow
                    label="Color Warmth"
                    valueLabel={
                      tuning.warmthOffset >= 0
                        ? `+${tuning.warmthOffset.toFixed(2)}`
                        : tuning.warmthOffset.toFixed(2)
                    }
                    min={-0.4}
                    max={0.4}
                    step={0.05}
                    value={tuning.warmthOffset}
                    onChange={(v) => updateTuning({ warmthOffset: v })}
                    testId="voice-slider-warmth"
                  />
                </SectionGroup>

                {/* VOICE RING — GROUP 3: Ring Reactivity & Motion */}
                <SectionGroup
                  title="Ring Motion"
                  open={openGroups.motion}
                  onToggle={() => toggleGroup('motion')}
                  testId="voice-group-ring-motion"
                >
                  <SliderRow
                    label="Audio Reactivity"
                    valueLabel={`${Math.round(tuning.sensitivityScale * 100)}%`}
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={tuning.sensitivityScale}
                    onChange={(v) => updateTuning({ sensitivityScale: v })}
                    testId="voice-slider-sensitivity"
                  />

                  <SliderRow
                    label="Motion Speed"
                    valueLabel={`${tuning.speedScale.toFixed(2)}x`}
                    min={0.4}
                    max={1.6}
                    step={0.05}
                    value={tuning.speedScale}
                    onChange={(v) => updateTuning({ speedScale: v })}
                    testId="voice-slider-speed"
                  />
                </SectionGroup>
              </>
            ) : (
              <>
                {/* VOICE GLOW — GROUP 2: Atmosphere & Color */}
                <SectionGroup
                  title="Atmosphere & Color"
                  open={openGroups.appearance}
                  onToggle={() => toggleGroup('appearance')}
                  testId="voice-group-glow-atmosphere"
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {ATMOSPHERE_OPTIONS.map((opt) => {
                      const active = tuning.glow.atmosphere === opt.id && !tuning.glow.useCustomColors;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updateGlowTuning({ atmosphere: opt.id, useCustomColors: false })
                          }
                          data-testid={`voice-glow-atmosphere-${opt.id}`}
                          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#35DFFF]/14 border-[#35DFFF]/40 text-white'
                              : 'bg-black/35 border-white/[0.06] text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full bg-gradient-to-tr ${opt.swatch} shrink-0`}
                          />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <SwitchRow
                    label="Chromatic Rim"
                    hint="Subtle spectral edge shimmer"
                    checked={tuning.glow.chromaticRim}
                    onToggle={() =>
                      updateGlowTuning({ chromaticRim: !tuning.glow.chromaticRim })
                    }
                    testId="voice-glow-chromatic-rim"
                  />

                  <SwitchRow
                    label="Custom Palette"
                    hint="Override atmosphere with 2 custom colors"
                    checked={tuning.glow.useCustomColors}
                    onToggle={() =>
                      updateGlowTuning({ useCustomColors: !tuning.glow.useCustomColors })
                    }
                    testId="voice-glow-custom-colors"
                  />

                  {tuning.glow.useCustomColors && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="flex items-center justify-between rounded-lg bg-black/40 border border-white/[0.08] px-2 py-1 text-[10.5px] text-neutral-300">
                        <span>Primary</span>
                        <input
                          type="color"
                          value={tuning.glow.primaryColor}
                          onChange={(e) => updateGlowTuning({ primaryColor: e.target.value })}
                          className="h-5 w-6 bg-transparent cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-lg bg-black/40 border border-white/[0.08] px-2 py-1 text-[10.5px] text-neutral-300">
                        <span>Accent</span>
                        <input
                          type="color"
                          value={tuning.glow.accentColor}
                          onChange={(e) => updateGlowTuning({ accentColor: e.target.value })}
                          className="h-5 w-6 bg-transparent cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                </SectionGroup>

                {/* VOICE GLOW — GROUP 3: Geometry & Bezel Edge Fade */}
                <SectionGroup
                  title="Bezel Fit & Geometry"
                  open={openGroups.geometry}
                  onToggle={() => toggleGroup('geometry')}
                  testId="voice-group-glow-geometry"
                >
                  <SliderRow
                    label="Edge Fade (Curved Softness)"
                    valueLabel={`${Math.round(tuning.glow.edgeFade * 100)}%`}
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={tuning.glow.edgeFade}
                    onChange={(v) => updateGlowTuning({ edgeFade: v })}
                    testId="voice-glow-slider-edge-fade"
                  />

                  <SliderRow
                    label="Horizon Reach"
                    valueLabel={`${Math.round(tuning.glow.horizonReach * 100)}%`}
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={tuning.glow.horizonReach}
                    onChange={(v) => updateGlowTuning({ horizonReach: v })}
                    testId="voice-glow-slider-reach"
                  />

                  <SliderRow
                    label="Beam Scale"
                    valueLabel={`${tuning.glow.beamScale.toFixed(2)}x`}
                    min={0.65}
                    max={1.5}
                    step={0.05}
                    value={tuning.glow.beamScale}
                    onChange={(v) => updateGlowTuning({ beamScale: v })}
                    testId="voice-glow-slider-scale"
                  />
                </SectionGroup>

                {/* VOICE GLOW — GROUP 4: Luminance & Fluid Motion */}
                <SectionGroup
                  title="Luminance & Motion"
                  open={openGroups.motion}
                  onToggle={() => toggleGroup('motion')}
                  testId="voice-group-glow-motion"
                >
                  <SliderRow
                    label="Glow Intensity"
                    valueLabel={`${Math.round(tuning.glow.glowIntensity * 100)}%`}
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={tuning.glow.glowIntensity}
                    onChange={(v) => updateGlowTuning({ glowIntensity: v })}
                    testId="voice-glow-slider-intensity"
                  />

                  <SliderRow
                    label="Ambient Halo"
                    valueLabel={`${Math.round(tuning.glow.ambientHalo * 100)}%`}
                    min={0.0}
                    max={1.8}
                    step={0.05}
                    value={tuning.glow.ambientHalo}
                    onChange={(v) => updateGlowTuning({ ambientHalo: v })}
                    testId="voice-glow-slider-halo"
                  />

                  <SliderRow
                    label="Motion Flow"
                    valueLabel={`${tuning.glow.motionFlow.toFixed(2)}x`}
                    min={0.0}
                    max={2.0}
                    step={0.05}
                    value={tuning.glow.motionFlow}
                    onChange={(v) => updateGlowTuning({ motionFlow: v })}
                    testId="voice-glow-slider-flow"
                  />
                </SectionGroup>
              </>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.07] bg-black/30 shrink-0">
            <span className="text-[10px] text-neutral-500">
              {isGlow ? 'libraries.dev/voice' : 'libraries.dev/voice-ring'}
            </span>
            <button
              type="button"
              onClick={resetTuning}
              data-testid="voice-tuning-reset"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] text-neutral-400 hover:bg-white/[0.07] hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset defaults</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
