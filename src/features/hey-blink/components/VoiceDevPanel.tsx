import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X, Zap, WifiOff, MicOff, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type {
  VoiceAudioListener,
  VoiceSessionErrorCode,
  VoiceSessionState,
} from '../services/voice-session.interface';

export interface VoiceDevPanelProps {
  state: VoiceSessionState;
  isMuted: boolean;
  providerId: string;
  sessionId: string | null;
  autoCycleEnabled: boolean;
  subscribeAudio: (listener: VoiceAudioListener) => () => void;
  onTriggerState: (state: VoiceSessionState) => void;
  onTriggerError: (code: VoiceSessionErrorCode) => void;
  onTriggerSpeechBurst: () => void;
  onSetAutoCycle: (enabled: boolean) => void;
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

/**
 * Development-only testing drawer visually separated from production voice UI.
 * Live audio meters update via direct DOM refs (zero React re-renders per frame).
 */
export const VoiceDevPanel: React.FC<VoiceDevPanelProps> = ({
  state,
  isMuted,
  providerId,
  sessionId,
  autoCycleEnabled,
  subscribeAudio,
  onTriggerState,
  onTriggerError,
  onTriggerSpeechBurst,
  onSetAutoCycle,
}) => {
  const [open, setOpen] = useState(false);
  const inputBarRef = useRef<HTMLDivElement | null>(null);
  const outputBarRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <aside
      data-testid="voice-dev-panel"
      aria-label="Voice development state harness"
      className="fixed top-16 right-4 sm:top-auto sm:bottom-4 sm:right-4 z-50 flex flex-col-reverse sm:flex-col items-end gap-2"
    >
      {open && (
        <div className="w-72 rounded-2xl bg-[#0C1015]/95 backdrop-blur-xl border border-white/12 p-3.5 shadow-2xl text-xs text-slate-200 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-[10px] font-mono font-semibold text-amber-300">
                DEV ONLY
              </span>
              <span className="font-medium text-white/90">Voice State Harness</span>
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

          {/* Live State Metadata */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-black/40 rounded-lg p-2 border border-white/5">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">State</span>
              <span className="text-[#35DFFF]">{state}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Provider</span>
              <span className="text-slate-300 truncate block">{providerId}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-slate-500 text-[9px] uppercase">Session</span>
              <span className="text-slate-400 truncate max-w-[165px]">
                {sessionId ?? 'none'} {isMuted ? '(muted)' : ''}
              </span>
            </div>
          </div>

          {/* Independent Audio Channel Meters (ref-driven, 0 re-renders) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>IN (User)</span>
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
              <span>OUT (Blink)</span>
              <span>Simulated Audio</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                ref={outputBarRef}
                className="h-full w-full origin-left bg-violet-400 transition-none"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          </div>

          {/* Manual State Triggers */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Trigger Lifecycle State
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

          {/* Error & Speech Burst Triggers */}
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
