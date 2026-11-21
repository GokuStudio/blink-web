import React, { useEffect, useMemo, useRef } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import type { AudioInputDeviceInfo } from '../audio/microphone-capture';
import type {
  VoiceProviderKind,
  VoiceSessionErrorCode,
  VoiceSessionState,
} from '../services/voice-session.interface';
import {
  DEFAULT_VOICE_GLOW_TUNING,
  type BlinkAtmosphereId,
  type VoiceGlowTuning,
} from '../visualizer/visual-presets';

export interface BlinkDialStudioProps {
  providerKind: VoiceProviderKind;
  audioInputDevices: AudioInputDeviceInfo[];
  selectedAudioDeviceId: string;
  autoCycleEnabled: boolean;
  debugTranscriptionEnabled: boolean;
  supportsMockControls: boolean;
  onTuningChange: (tuning: VoiceGlowTuning) => void;
  onAcousticChimesChange: (enabled: boolean) => void;
  onSwitchProvider: (kind: VoiceProviderKind) => void;
  onSelectAudioDevice: (deviceId: string) => void;
  onSetAutoCycle: (enabled: boolean) => void;
  onSetDebugTranscription: (enabled: boolean) => void;
  onTriggerState: (state: VoiceSessionState) => void;
  onTriggerError: (code: VoiceSessionErrorCode) => void;
  onSimulateUserTranscript: (text: string, isFinal?: boolean) => void;
}

const ATMOSPHERE_OPTIONS: Array<{ value: BlinkAtmosphereId; label: string }> = [
  { value: 'blink-cyan', label: 'Blink Cyan' },
  { value: 'aurora-violet', label: 'Aurora Violet' },
  { value: 'bioluminescent', label: 'Bioluminescent' },
  { value: 'midnight-ice', label: 'Midnight Ice' },
  { value: 'obsidian-mono', label: 'Obsidian Mono' },
];

/**
 * DialKit-powered live creative customization studio for Hey Blink.
 *
 * Provides tactile spring-animated sliders, toggles, color pickers, atmosphere
 * themes, USB microphone selection, provider switching, and version snapshots —
 * collapsed cleanly to a tiny icon by default so the fullscreen voice canvas
 * remains serene and unobstructed.
 */
export const BlinkDialStudio: React.FC<BlinkDialStudioProps> = ({
  providerKind,
  audioInputDevices,
  selectedAudioDeviceId,
  autoCycleEnabled,
  debugTranscriptionEnabled,
  supportsMockControls,
  onTuningChange,
  onAcousticChimesChange,
  onSwitchProvider,
  onSelectAudioDevice,
  onSetAutoCycle,
  onSetDebugTranscription,
  onTriggerState,
  onTriggerError,
  onSimulateUserTranscript,
}) => {
  const callbacksRef = useRef({
    onSwitchProvider,
    onSelectAudioDevice,
    onSetAutoCycle,
    onSetDebugTranscription,
    onTriggerState,
    onTriggerError,
    onSimulateUserTranscript,
  });
  callbacksRef.current = {
    onSwitchProvider,
    onSelectAudioDevice,
    onSetAutoCycle,
    onSetDebugTranscription,
    onTriggerState,
    onTriggerError,
    onSimulateUserTranscript,
  };

  const micOptions = useMemo(() => {
    const base: Array<{ value: string; label: string }> = [
      { value: 'default', label: 'System Default' },
    ];
    for (const dev of audioInputDevices) {
      if (dev.deviceId && dev.deviceId !== 'default') {
        base.push({ value: dev.deviceId, label: dev.label });
      }
    }
    return base;
  }, [audioInputDevices]);

  const dial = useDialKit(
    'Blink Studio',
    {
      atmosphere: {
        type: 'select' as const,
        options: ATMOSPHERE_OPTIONS,
        default: DEFAULT_VOICE_GLOW_TUNING.atmosphere,
      },
      glowIntensity: [DEFAULT_VOICE_GLOW_TUNING.glowIntensity, 0.3, 1.5, 0.05] as [
        number,
        number,
        number,
        number,
      ],
      horizonReach: [DEFAULT_VOICE_GLOW_TUNING.horizonReach, 0.5, 1.6, 0.05] as [
        number,
        number,
        number,
        number,
      ],
      motionFlow: [DEFAULT_VOICE_GLOW_TUNING.motionFlow, 0, 2.0, 0.05] as [
        number,
        number,
        number,
        number,
      ],
      beamScale: [DEFAULT_VOICE_GLOW_TUNING.beamScale, 0.65, 1.5, 0.05] as [
        number,
        number,
        number,
        number,
      ],
      ambientHalo: [DEFAULT_VOICE_GLOW_TUNING.ambientHalo, 0, 1.8, 0.05] as [
        number,
        number,
        number,
        number,
      ],
      chromaticRim: true,
      acousticChimes: true,
      palette: {
        _collapsed: true,
        useCustomColors: false,
        primaryColor: DEFAULT_VOICE_GLOW_TUNING.primaryColor,
        accentColor: DEFAULT_VOICE_GLOW_TUNING.accentColor,
      },
      audio: {
        _collapsed: false,
        provider: {
          type: 'select' as const,
          options: [
            { value: 'gemini-live', label: 'Gemini Live' },
            { value: 'mock', label: 'Mock (Simulated)' },
          ],
          default: providerKind,
        },
        microphone: {
          type: 'select' as const,
          options: micOptions,
          default: selectedAudioDeviceId || 'default',
        },
      },
      ...(import.meta.env.DEV
        ? {
            harness: {
              _collapsed: true,
              autoCycle: autoCycleEnabled,
              debugTranscripts: debugTranscriptionEnabled,
              previewListening: { type: 'action' as const, label: 'Preview Listening' },
              previewThinking: { type: 'action' as const, label: 'Preview Thinking' },
              previewSpeaking: { type: 'action' as const, label: 'Preview Speaking' },
              previewError: { type: 'action' as const, label: 'Preview Error' },
              sayThatsAll: { type: 'action' as const, label: 'Say “That’s all”' },
              sayFalseEnd: { type: 'action' as const, label: 'Test False End' },
            },
          }
        : {}),
    },
    {
      id: 'hey-blink-studio',
      defaultCollapsed: true,
      onAction: (path) => {
        if (path === 'harness.previewListening') {
          callbacksRef.current.onTriggerState('listening');
        } else if (path === 'harness.previewThinking') {
          callbacksRef.current.onTriggerState('thinking');
        } else if (path === 'harness.previewSpeaking') {
          callbacksRef.current.onTriggerState('speaking');
        } else if (path === 'harness.previewError') {
          callbacksRef.current.onTriggerError('NETWORK_UNAVAILABLE');
        } else if (path === 'harness.sayThatsAll') {
          callbacksRef.current.onSimulateUserTranscript("Thanks Blink, that's all.", true);
        } else if (path === 'harness.sayFalseEnd') {
          callbacksRef.current.onSimulateUserTranscript(
            'How do I say goodbye in Japanese?',
            true
          );
        }
      },
    }
  );

  // Sync visual tuning sliders & toggles -> BlinkVoiceGlow
  useEffect(() => {
    onTuningChange({
      atmosphere: dial.atmosphere as BlinkAtmosphereId,
      glowIntensity: dial.glowIntensity,
      horizonReach: dial.horizonReach,
      motionFlow: dial.motionFlow,
      beamScale: dial.beamScale,
      ambientHalo: dial.ambientHalo,
      chromaticRim: dial.chromaticRim,
      useCustomColors: dial.palette.useCustomColors,
      primaryColor: dial.palette.primaryColor,
      accentColor: dial.palette.accentColor,
    });
  }, [
    dial.atmosphere,
    dial.glowIntensity,
    dial.horizonReach,
    dial.motionFlow,
    dial.beamScale,
    dial.ambientHalo,
    dial.chromaticRim,
    dial.palette.useCustomColors,
    dial.palette.primaryColor,
    dial.palette.accentColor,
    onTuningChange,
  ]);

  useEffect(() => {
    onAcousticChimesChange(dial.acousticChimes);
  }, [dial.acousticChimes, onAcousticChimesChange]);

  // Sync audio provider & USB microphone selection
  useEffect(() => {
    const chosen = dial.audio.provider as VoiceProviderKind;
    if (chosen && chosen !== providerKind) {
      callbacksRef.current.onSwitchProvider(chosen);
    }
  }, [dial.audio.provider, providerKind]);

  useEffect(() => {
    const chosenMic = dial.audio.microphone;
    if (chosenMic && chosenMic !== selectedAudioDeviceId) {
      callbacksRef.current.onSelectAudioDevice(chosenMic);
    }
  }, [dial.audio.microphone, selectedAudioDeviceId]);

  // Sync dev harness toggles when present
  const harnessAutoCycle = (dial as { harness?: { autoCycle?: boolean } }).harness?.autoCycle;
  const harnessDebugTr = (dial as { harness?: { debugTranscripts?: boolean } }).harness
    ?.debugTranscripts;

  useEffect(() => {
    if (
      supportsMockControls &&
      typeof harnessAutoCycle === 'boolean' &&
      harnessAutoCycle !== autoCycleEnabled
    ) {
      callbacksRef.current.onSetAutoCycle(harnessAutoCycle);
    }
  }, [harnessAutoCycle, autoCycleEnabled, supportsMockControls]);

  useEffect(() => {
    if (
      typeof harnessDebugTr === 'boolean' &&
      harnessDebugTr !== debugTranscriptionEnabled
    ) {
      callbacksRef.current.onSetDebugTranscription(harnessDebugTr);
    }
  }, [harnessDebugTr, debugTranscriptionEnabled]);

  return (
    <DialRoot
      position="top-right"
      theme="dark"
      defaultOpen={false}
      productionEnabled={true}
    />
  );
};
