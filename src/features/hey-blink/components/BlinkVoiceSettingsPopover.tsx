/**
 * Blink Stage 2D — DialKit-Powered Voice & Ring Controls Popover
 *
 * Uses authentic DialKit UI components (`Folder`, `SelectControl`, `Toggle`,
 * `Slider`, `ButtonGroup`) styled with `dialkit/styles.css` in dark mode:
 * - Engine & Audio: Voice Engine (Gemini Live / Preview), Microphone selector,
 *   Show status text toggle, Refresh Mics action
 * - Ring Appearance: Ring Variant (Ring / Mono), Luminance & Glow, Color Warmth
 * - Ring Motion: Audio Reactivity, Motion Speed
 * - Footer: Reset Defaults
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { ButtonGroup, Folder, SelectControl, Slider, Toggle } from 'dialkit';
import 'dialkit/styles.css';
import type { BlinkVoiceExperience } from '../integration/useBlinkVoiceExperience';

export interface BlinkVoiceSettingsPopoverProps {
  voice: BlinkVoiceExperience;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Visual variant & popover anchoring: 'dock-left' (utility rail) or 'capsule' (inline pill) */
  placement?: 'dock-left' | 'capsule';
}

const PROVIDER_OPTIONS = [
  { value: 'gemini-live', label: 'Gemini Live' },
  { value: 'mock', label: 'Preview' },
];

const RING_VARIANT_OPTIONS = [
  { value: 'ring', label: 'Ring' },
  { value: 'mono', label: 'Mono' },
];

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

  // Close on Escape or outside click (respecting open DialKit select dropdowns & slider inputs)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hasOpenDropdown = Boolean(
        containerRef.current?.querySelector('.dialkit-select-trigger[data-open="true"]')
      );
      const activeEl = document.activeElement;
      const isEditingSlider =
        activeEl instanceof HTMLElement && activeEl.classList.contains('dialkit-slider-input');
      if (hasOpenDropdown || isEditingSlider) return;
      e.stopPropagation();
      onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Also ignore clicks on portaled DialKit popovers if ever mounted on body
        if (target instanceof Element && target.closest('.dialkit-select-dropdown')) {
          return;
        }
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

  const micOptions = useMemo(
    () => [
      { value: 'default', label: 'System Default' },
      ...voice.audioInputDevices.map((dev) => ({
        value: dev.deviceId,
        label: dev.label,
      })),
    ],
    [voice.audioInputDevices]
  );

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
    <div ref={containerRef} className="dialkit-root relative inline-flex items-center">
      <button
        type="button"
        onClick={onToggle}
        data-testid="voice-settings-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Voice settings and ring tuning"
        title="Voice settings, microphone & ring tuning"
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
          aria-label="Voice settings and ring tuning"
          data-testid="voice-settings-popover"
          className={`absolute z-[70] w-[312px] max-w-[calc(100vw-24px)] max-h-[min(80dvh,560px)] flex flex-col rounded-[14px] border border-[var(--dial-border)] bg-[#1d1f23] text-left shadow-[0_24px_64px_rgba(0,0,0,0.88)] overflow-hidden [&_.dialkit-select-right]:min-w-0 [&_.dialkit-select-trigger]:gap-3 ${popoverPositionClass}`}
        >
          {/* Sticky Header */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--dial-surface-subtle)] shrink-0">
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-semibold text-[var(--dial-text-root)] tracking-[-0.01em] truncate">
                Voice &amp; Ring Controls
              </h3>
              <p className="text-[10.5px] text-[var(--dial-text-secondary)] mt-0.5 truncate">
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
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--dial-text-secondary)] hover:bg-[var(--dial-surface-hover)] hover:text-[var(--dial-text-focus)] transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scrollable DialKit Folders */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="dialkit-folder-inner !pb-1">
              <Folder title="Engine & Audio" defaultOpen={true}>
                <SelectControl
                  label="Voice Engine"
                  value={voice.providerKind}
                  options={PROVIDER_OPTIONS}
                  onChange={(next) => voice.switchProvider(next as 'gemini-live' | 'mock')}
                />
                <SelectControl
                  label="Microphone"
                  value={voice.selectedAudioDeviceId}
                  options={micOptions}
                  onChange={(next) => voice.setSelectedAudioDeviceId(next)}
                />
                <Toggle
                  label="Show status text"
                  checked={tuning.showStatusLabel}
                  onChange={(checked) => updateTuning({ showStatusLabel: checked })}
                />
                <ButtonGroup
                  buttons={[
                    {
                      label: 'Refresh Mics',
                      onClick: () => void voice.refreshAudioDevices(),
                    },
                  ]}
                />
              </Folder>

              <Folder title="Ring Appearance" defaultOpen={true}>
                <SelectControl
                  label="Ring Variant"
                  value={tuning.ringType}
                  options={RING_VARIANT_OPTIONS}
                  onChange={(next) => updateTuning({ ringType: next as 'ring' | 'mono' })}
                />
                <Slider
                  label="Luminance & Glow"
                  value={tuning.glowScale}
                  min={0.35}
                  max={1.45}
                  step={0.05}
                  onChange={(v) => updateTuning({ glowScale: v })}
                />
                <Slider
                  label="Color Warmth"
                  value={tuning.warmthOffset}
                  min={-0.4}
                  max={0.4}
                  step={0.05}
                  onChange={(v) => updateTuning({ warmthOffset: v })}
                />
              </Folder>

              <Folder title="Ring Motion" defaultOpen={false}>
                <Slider
                  label="Audio Reactivity"
                  value={tuning.sensitivityScale}
                  min={0.5}
                  max={1.6}
                  step={0.05}
                  onChange={(v) => updateTuning({ sensitivityScale: v })}
                />
                <Slider
                  label="Motion Speed"
                  value={tuning.speedScale}
                  min={0.4}
                  max={1.6}
                  step={0.05}
                  unit="x"
                  onChange={(v) => updateTuning({ speedScale: v })}
                />
              </Folder>
            </div>
          </div>

          {/* Sticky Footer with DialKit ButtonGroup */}
          <div className="px-3 py-2.5 border-t border-[var(--dial-surface-subtle)] bg-black/25 shrink-0 space-y-2">
            <ButtonGroup
              buttons={[
                {
                  label: 'Reset Defaults',
                  onClick: resetTuning,
                },
              ]}
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--dial-text-tertiary)] px-0.5">
              <span>libraries.dev/voice-ring</span>
              <span>dialkit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
