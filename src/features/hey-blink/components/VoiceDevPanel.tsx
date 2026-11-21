import React, { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  X,
  Zap,
  WifiOff,
  MicOff,
  RefreshCw,
  Mic,
  Radio,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { AudioInputDeviceInfo } from '../audio/microphone-capture';
import type { HandsFreeSnapshot } from '../conversation/hands-free-conversation-controller';
import type {
  TransientDebugTranscript,
  VoiceAudioListener,
  VoiceProviderKind,
  VoiceSessionErrorCode,
  VoiceSessionMetrics,
  VoiceSessionState,
} from '../services/voice-session.interface';

export interface VoiceDevPanelProps {
  state: VoiceSessionState;
  isMuted: boolean;
  providerId: string;
  providerKind: VoiceProviderKind;
  isLiveEndpointConfigured: boolean;
  supportsDevControls: boolean;
  supportsDiagnostics: boolean;
  sessionId: string | null;
  autoCycleEnabled: boolean;
  audioInputDevices: AudioInputDeviceInfo[];
  selectedAudioDeviceId: string;
  onSelectAudioDevice: (deviceId: string) => void;
  onSwitchProvider: (kind: VoiceProviderKind) => void;
  subscribeAudio: (listener: VoiceAudioListener) => () => void;
  onTriggerState: (state: VoiceSessionState) => void;
  onTriggerError: (code: VoiceSessionErrorCode) => void;
  onTriggerSpeechBurst: () => void;
  onSetAutoCycle: (enabled: boolean) => void;
  getDiagnosticsMetrics: () => VoiceSessionMetrics | null;
  getDebugTranscripts: () => readonly TransientDebugTranscript[];
  debugTranscriptionEnabled: boolean;
  onSetDebugTranscriptionEnabled: (enabled: boolean) => void;
  handsFree?: HandsFreeSnapshot;
  onTriggerWakeWord?: () => void;
  onSimulateUserTranscript?: (text: string, isFinal?: boolean) => void;
}

const MANUAL_STATES: ReadonlyArray<{ state: VoiceSessionState; label: string }> = [
  { state: 'idle', label: 'Idle' },
  { state: 'entering', label: 'Entering' },
  { state: 'listening', label: 'Listening' },
  { state: 'thinking', label: 'Thinking' },
  { state: 'speaking', label: 'Speaking' },
  { state: 'interrupted', label: 'Interrupted' },
  { state: 'ending', label: 'Ending' },
];

function fmtMs(val: number | null | undefined): string {
  return typeof val === 'number' ? `${val} ms` : '—';
}

/**
 * Development-only testing & diagnostics drawer visually separated from
 * the production fullscreen voice interface.
 * Live audio meters update via direct DOM refs (zero React re-renders per frame).
 */
export const VoiceDevPanel: React.FC<VoiceDevPanelProps> = ({
  state,
  isMuted,
  providerId,
  providerKind,
  isLiveEndpointConfigured,
  supportsDevControls,
  supportsDiagnostics,
  sessionId,
  autoCycleEnabled,
  audioInputDevices,
  selectedAudioDeviceId,
  onSelectAudioDevice,
  onSwitchProvider,
  subscribeAudio,
  onTriggerState,
  onTriggerError,
  onTriggerSpeechBurst,
  onSetAutoCycle,
  getDiagnosticsMetrics,
  getDebugTranscripts,
  debugTranscriptionEnabled,
  onSetDebugTranscriptionEnabled,
  handsFree,
  onTriggerWakeWord,
  onSimulateUserTranscript,
}) => {
  const [open, setOpen] = useState(false);
  const [metricsSnapshot, setMetricsSnapshot] = useState<VoiceSessionMetrics | null>(null);
  const [transcripts, setTranscripts] = useState<readonly TransientDebugTranscript[]>([]);
  const inputBarRef = useRef<HTMLDivElement | null>(null);
  const outputBarRef = useRef<HTMLDivElement | null>(null);

  // Ref-driven 60 FPS meter bars — ZERO React state updates per frame
  useEffect(() => {
    if (!open) return;
    return subscribeAudio((frame) => {
      if (inputBarRef.current) {
        inputBarRef.current.style.transform = `scaleX(${Math.min(1, frame.inputLevel).toFixed(3)})`;
      }
      if (outputBarRef.current) {
        outputBarRef.current.style.transform = `scaleX(${Math.min(1, frame.outputLevel).toFixed(3)})`;
      }
    });
  }, [open, subscribeAudio]);

  // Low-frequency (1 Hz) diagnostics polling ONLY when dev drawer is open
  useEffect(() => {
    if (!open || !supportsDiagnostics) {
      setMetricsSnapshot(null);
      setTranscripts([]);
      return;
    }
    const poll = () => {
      setMetricsSnapshot(getDiagnosticsMetrics());
      if (debugTranscriptionEnabled) {
        setTranscripts(getDebugTranscripts());
      } else {
        setTranscripts([]);
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [open, supportsDiagnostics, debugTranscriptionEnabled, getDiagnosticsMetrics, getDebugTranscripts]);

  return (
    <aside
      data-testid="voice-dev-panel"
      aria-label="Voice development state harness"
      className="fixed top-16 right-4 sm:top-auto sm:bottom-4 sm:right-4 z-50 flex flex-col-reverse sm:flex-col items-end gap-2"
    >
      {open && (
        <div className="w-80 max-h-[78dvh] overflow-y-auto rounded-2xl bg-[#0C1015]/95 backdrop-blur-xl border border-white/12 p-3.5 shadow-2xl text-xs text-slate-200 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-[10px] font-mono font-semibold text-amber-300">
                DEV ONLY
              </span>
              <span className="font-medium text-white/90">Voice Harness</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close dev panel"
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Provider Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>Voice Provider</span>
              <span
                className={cn(
                  'font-mono text-[9px]',
                  isLiveEndpointConfigured ? 'text-emerald-300' : 'text-amber-300/80'
                )}
              >
                {isLiveEndpointConfigured ? 'Token Endpoint Ready' : 'No Token Endpoint'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSwitchProvider('mock')}
                data-testid="dev-provider-mock"
                className={cn(
                  'px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
                  providerKind === 'mock'
                    ? 'bg-[#35DFFF]/20 border-[#35DFFF]/50 text-[#7CEEFF]'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.1]'
                )}
              >
                Mock (Simulated)
              </button>
              <button
                type="button"
                onClick={() => onSwitchProvider('gemini-live')}
                data-testid="dev-provider-gemini-live"
                className={cn(
                  'inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
                  providerKind === 'gemini-live'
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.1]'
                )}
              >
                <Radio className="w-3 h-3" />
                <span>Gemini Live</span>
              </button>
            </div>
          </div>

          {/* Microphone Device Picker (supports USB microphones) */}
          <div className="space-y-1">
            <label
              htmlFor="hey-blink-mic-select"
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400"
            >
              <Mic className="w-3 h-3" />
              <span>Microphone Input</span>
            </label>
            <select
              id="hey-blink-mic-select"
              data-testid="dev-mic-select"
              value={selectedAudioDeviceId}
              onChange={(e) => onSelectAudioDevice(e.target.value)}
              className="w-full rounded-lg bg-black/50 border border-white/12 px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-[#35DFFF]/60"
            >
              <option value="default">System Default Microphone</option>
              {audioInputDevices
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
            </select>
          </div>

          {/* Live State Metadata */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-black/40 rounded-lg p-2 border border-white/5">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Voice State</span>
              <span className="text-[#35DFFF]">{state}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Provider</span>
              <span className="text-slate-300 truncate block">{providerId}</span>
            </div>
            {handsFree && (
              <>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Activation</span>
                  <span className="text-emerald-300 truncate block">
                    {handsFree.activationState}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Mic Owner</span>
                  <span className="text-slate-300 truncate block">{handsFree.micOwner}</span>
                </div>
              </>
            )}
            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-slate-500 text-[9px] uppercase">Session</span>
              <span className="text-slate-400 truncate max-w-[180px]">
                {sessionId ?? 'none'} {isMuted ? '(muted)' : ''}
              </span>
            </div>
          </div>

          {/* Hands-Free Dev Simulation Triggers (dev-only) */}
          {handsFree && (onTriggerWakeWord || onSimulateUserTranscript) && (
            <div className="space-y-1.5 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                <span>Hands-Free Harness</span>
                <span className="font-mono text-[9px] text-slate-500">
                  Ended: {handsFree.metrics.conversationsCompleted}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {onTriggerWakeWord && (
                  <button
                    type="button"
                    onClick={onTriggerWakeWord}
                    data-testid="dev-trigger-wake"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#35DFFF]/15 border border-[#35DFFF]/40 text-[#7CEEFF] hover:bg-[#35DFFF]/25 text-[11px] font-medium"
                  >
                    Simulate &ldquo;Hey Blink&rdquo; Wake
                  </button>
                )}
                {onSimulateUserTranscript && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSimulateUserTranscript("Thanks Blink, that's all.", true)}
                      data-testid="dev-trigger-end-phrase"
                      className="px-2 py-1.5 rounded-lg bg-emerald-500/12 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20 text-[10px]"
                    >
                      Say &ldquo;That&rsquo;s all&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSimulateUserTranscript('How do I say goodbye in Japanese?', true)
                      }
                      data-testid="dev-trigger-false-end"
                      className="px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.1] text-[10px]"
                    >
                      Test False End
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Independent Audio Channel Meters (ref-driven, 0 re-renders) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>IN (Microphone)</span>
              <span>Independent Channels</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                ref={inputBarRef}
                className="h-full w-full origin-left bg-[#35DFFF] transition-none"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>OUT (Blink Audio)</span>
              <span>{providerKind === 'mock' ? 'Simulated' : 'Audible Playback'}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                ref={outputBarRef}
                className="h-full w-full origin-left bg-violet-400 transition-none"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          </div>

          {/* Gemini Live Performance Metrics & Optional Transient Debug Transcript */}
          {supportsDiagnostics && metricsSnapshot && (
            <div className="space-y-2 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                <span>Live Telemetry</span>
                <span className="font-mono text-[9px] text-cyan-300/80 truncate max-w-[160px]">
                  {metricsSnapshot.model ?? 'not connected'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono bg-black/40 rounded-lg p-2 border border-white/5 text-slate-300">
                <div>Ready: {fmtMs(metricsSnapshot.activationToReadyMs)}</div>
                <div>Mic: {fmtMs(metricsSnapshot.micStartupMs)}</div>
                <div>Tx: {fmtMs(metricsSnapshot.lastCaptureToSendMs)}</div>
                <div>1st Audio: {fmtMs(metricsSnapshot.endOfSpeechToFirstAudioMs)}</div>
                <div>Play: {fmtMs(metricsSnapshot.firstAudioToPlaybackMs)}</div>
                <div>Barge-in: {fmtMs(metricsSnapshot.interruptionToSilenceMs)}</div>
                <div>Underruns: {metricsSnapshot.underrunCount}</div>
                <div>Dropped: {metricsSnapshot.droppedChunks}</div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Debug Transcript (transient, dev-only)
                </span>
                <button
                  type="button"
                  onClick={() => onSetDebugTranscriptionEnabled(!debugTranscriptionEnabled)}
                  data-testid="dev-toggle-transcript"
                  className={cn(
                    'px-2 py-0.5 rounded border text-[10px] font-mono',
                    debugTranscriptionEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-white/[0.04] border-white/10 text-slate-400'
                  )}
                >
                  {debugTranscriptionEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {debugTranscriptionEnabled && transcripts.length > 0 && (
                <div className="max-h-24 overflow-y-auto rounded-lg bg-black/50 border border-white/5 p-2 space-y-1 text-[10px]">
                  {transcripts.slice(-6).map((entry) => (
                    <div key={entry.id} className="leading-snug">
                      <span
                        className={cn(
                          'font-mono uppercase mr-1',
                          entry.speaker === 'user' ? 'text-[#35DFFF]' : 'text-violet-300'
                        )}
                      >
                        {entry.speaker}:
                      </span>
                      <span className="text-slate-300">{entry.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mock Provider State Triggers */}
          {supportsDevControls && (
            <>
              <div className="space-y-1.5 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Trigger Lifecycle State (Mock)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MANUAL_STATES.map((item) => (
                    <button
                      key={item.state}
                      type="button"
                      onClick={() => onTriggerState(item.state)}
                      data-testid={`dev-state-${item.state}`}
                      className={cn(
                        'px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
                        state === item.state
                          ? 'bg-[#35DFFF]/20 border-[#35DFFF]/50 text-[#7CEEFF]'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.1] hover:text-white'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Simulate Events
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onTriggerError('NETWORK_UNAVAILABLE')}
                    data-testid="dev-error-network"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-rose-500/12 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-[11px]"
                  >
                    <WifiOff className="w-3 h-3" />
                    <span>Net Error</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerError('MICROPHONE_PERMISSION_DENIED')}
                    data-testid="dev-error-mic"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-rose-500/12 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-[11px]"
                  >
                    <MicOff className="w-3 h-3" />
                    <span>Mic Denied</span>
                  </button>
                  <button
                    type="button"
                    onClick={onTriggerSpeechBurst}
                    data-testid="dev-speech-burst"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20 text-[11px]"
                  >
                    <Zap className="w-3 h-3" />
                    <span>User Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAutoCycle(!autoCycleEnabled)}
                    data-testid="dev-toggle-autocycle"
                    className={cn(
                      'inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[11px]',
                      autoCycleEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                    )}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{autoCycleEnabled ? 'Cycle: ON' : 'Cycle: OFF'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Compact Detached Toggle Pill */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-testid="voice-dev-panel-toggle"
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border backdrop-blur-md transition-colors',
          open
            ? 'bg-[#35DFFF]/15 border-[#35DFFF]/40 text-[#7CEEFF]'
            : 'bg-[#0C1015]/80 border-white/12 text-slate-400 hover:text-white hover:border-white/25'
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>DEV</span>
      </button>
    </aside>
  );
};
