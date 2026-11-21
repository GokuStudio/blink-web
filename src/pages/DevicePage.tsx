import React, { useEffect, useState } from 'react';
import { DeviceShell } from '@/features/blink-device';
import { useDeviceStore } from '@/features/blink-device';
import { BlinkExpressionType } from '@/shared/contracts';
import { useFullscreen } from '@/shared/hooks/useFullscreen';
import { Maximize2, Minimize2, ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBlinkVoiceExperience } from '@/features/hey-blink/integration/useBlinkVoiceExperience';
import { BlinkVoiceControlsPill } from '@/features/hey-blink/components/BlinkVoiceControlsPill';
import { BlinkVoiceSettingsPopover } from '@/features/hey-blink/components/BlinkVoiceSettingsPopover';
import type { IVoiceSession } from '@/features/hey-blink/services/voice-session.interface';

export interface DevicePageProps {
  /** Optional injected voice session factory for deterministic automated testing. */
  createVoiceSession?: () => IVoiceSession;
}

/**
 * Mode 2: Blink Device
 * Standalone phone/tablet screen in landscape or portrait orientation.
 * Pure black fullscreen display: glowing cyan eyes OR centered audio-reactive Voice Ring.
 * Physical desktop bezel is completely omitted.
 */
export const DevicePage: React.FC<DevicePageProps> = ({ createVoiceSession }) => {
  const { expression: storeExpr, setExpression, triggerBlink } = useDeviceStore();
  const [searchParams] = useSearchParams();
  const exprParam = searchParams.get('expr') as BlinkExpressionType | null;
  const expression = exprParam || storeExpr;
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [showHud, setShowHud] = useState(true);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);

  const voice = useBlinkVoiceExperience({
    createSession: createVoiceSession,
    reportDiagnostics: false,
  });

  // Auto-hide top operator HUD after 3 seconds in Eye Mode for pure presentation
  useEffect(() => {
    if (voice.isEngaged) return;
    const timer = setTimeout(() => setShowHud(false), 3000);
    return () => clearTimeout(timer);
  }, [voice.isEngaged]);

  // Escape key gracefully ends an active voice conversation
  useEffect(() => {
    if (!voice.isEngaged) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void voice.endVoice();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [voice.isEngaged, voice.endVoice]);

  return (
    <div
      className="relative w-screen h-dvh bg-black overflow-hidden flex items-center justify-center select-none"
      onClick={() => setShowHud(true)}
      data-testid="device-page"
      data-voice-mode={voice.isEngaged ? 'active' : 'idle'}
    >
      {/* Standalone Device Shell (WebGL Eyes <-> Voice Ring, NO bezel) */}
      <DeviceShell
        mode="standalone-device"
        expression={expression}
        voiceExperience={voice}
        className="w-full h-full"
      />

      {/* Floating Top HUD Controls for demo operator */}
      {showHud && (
        <div
          className="absolute top-[max(16px,env(safe-area-inset-top))] left-[max(16px,env(safe-area-inset-left))] right-[max(16px,env(safe-area-inset-right))] flex items-center justify-between z-50 pointer-events-auto transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            to="/demo"
            className="flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-neutral-300 text-xs hover:text-white focus-visible:outline-2 focus-visible:outline-[#35DFFF]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to Demo</span>
          </Link>

          <div className="flex items-center gap-2">
            {!voice.isEngaged && (
              <>
                <button
                  type="button"
                  onClick={() => triggerBlink()}
                  className="min-h-[44px] px-3.5 py-2 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-[#35DFFF] text-xs hover:bg-[#22262B] cursor-pointer"
                >
                  Trigger Blink
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const primaryExpressions: BlinkExpressionType[] = [
                      'idle',
                      'happy',
                      'sleepy',
                      'alert',
                      'thinking',
                      'listening',
                    ];
                    const currentIndex = primaryExpressions.indexOf(expression);
                    const nextExpr =
                      currentIndex >= 0 && currentIndex < primaryExpressions.length - 1
                        ? primaryExpressions[currentIndex + 1]
                        : primaryExpressions[0];
                    setExpression(nextExpr);
                  }}
                  className="flex items-center gap-1 min-h-[44px] px-3.5 py-2 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-white text-xs hover:bg-[#22262B] cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-[#35DFFF]" />
                  <span>Expr: {expression}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => toggleFullscreen()}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-white hover:bg-[#22262B] cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Restrained Bottom Voice Control Capsule respecting safe areas */}
      <div
        className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#141618]/88 border border-white/[0.09] p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.72)] backdrop-blur-md">
          <BlinkVoiceControlsPill voice={voice} />
          <BlinkVoiceSettingsPopover
            voice={voice}
            open={voiceSettingsOpen}
            onToggle={() => setVoiceSettingsOpen((v) => !v)}
            onClose={() => setVoiceSettingsOpen(false)}
          />
        </div>
      </div>
    </div>
  );
};
