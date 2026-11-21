import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { MotionConfig, AnimatePresence, motion } from 'framer-motion';
import { DistortionWave } from 'distortion-waves';
import { X, Check } from 'lucide-react';
import type {
  AssistantPhase,
  ComfortChoice,
  DestinationId,
  TimeRangeId,
} from './data/mockBlinkData';
import { BottomDock } from './components/BottomDock';
import { RestRitualOverlay, type RitualKind } from './components/RestRitualOverlay';
import { PortalSheet } from './components/PortalSheet';
import { blinkSound } from './utils/soundEngine';
import { HomeView } from './screens/HomeView';
import { InsightsView } from './screens/InsightsView';
import { AssistantView } from './screens/AssistantView';
import { SettingsView } from './screens/SettingsView';
import {
  useElevatedLiveTelemetry,
  type ElevatedLiveTelemetryState,
} from './hooks/useElevatedLiveTelemetry';
import type { IRealtimeService } from '@/shared/realtime/interfaces/realtime-service.interface';
import './elevated.css';

function parseDestination(param: string | null): DestinationId {
  if (
    param === 'home' ||
    param === 'insights' ||
    param === 'settings' ||
    param === 'assistant'
  ) {
    return param;
  }
  return 'home';
}

function formatCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export interface InsightsAppProps {
  realtimeService?: IRealtimeService;
  roomCode?: string;
  /** When true (integrated /demo stage), scopes dock, scroll, and toasts to the companion phone frame. */
  embedded?: boolean;
  /** When false, external room coordinator owns connect/disconnect on the shared realtimeService. */
  manageConnection?: boolean;
  onReconnectOverride?: () => Promise<void>;
  onSwitchRoomOverride?: (roomCode: string) => Promise<void>;
  onLiveStateChange?: (state: ElevatedLiveTelemetryState) => void;
}

export const InsightsApp: React.FC<InsightsAppProps> = ({
  realtimeService,
  roomCode,
  embedded = false,
  manageConnection = true,
  onReconnectOverride,
  onSwitchRoomOverride,
  onLiveStateChange,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [destination, setDestination] = useState<DestinationId>(() =>
    parseDestination(searchParams.get('screen'))
  );

  const live = useElevatedLiveTelemetry({
    service: realtimeService,
    roomCode,
    manageConnection,
    onReconnectOverride,
    onSwitchRoomOverride,
  });

  const onLiveStateChangeRef = useRef(onLiveStateChange);
  onLiveStateChangeRef.current = onLiveStateChange;

  useEffect(() => {
    onLiveStateChangeRef.current?.(live);
  }, [
    live.mode,
    live.connectionStatus,
    live.deviceConnected,
    live.isStale,
    live.lastSyncTimestamp,
    live.totalBlinks,
    live.blinkRate,
    live.isFaceDetected,
    live.error,
    live.roomCode,
  ]);

  const [clockLabel, setClockLabel] = useState<string>(() =>
    embedded ? formatCurrentTime() : '18:33'
  );
  useEffect(() => {
    if (!embedded) return;
    setClockLabel(formatCurrentTime());
    const id = window.setInterval(() => setClockLabel(formatCurrentTime()), 30000);
    return () => window.clearInterval(id);
  }, [embedded]);

  const [observationPaused, setObservationPaused] = useState<boolean>(false);
  const [range, setRange] = useState<TimeRangeId>('today');
  const [comfort, setComfort] = useState<ComfortChoice | null>(null);
  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>('idle');
  const [breaksTaken, setBreaksTaken] = useState(2);
  const [extraBreaks, setExtraBreaks] = useState(0);
  const [ritual, setRitual] = useState<{ open: boolean; kind: RitualKind }>({
    open: false,
    kind: 'horizon-20',
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const swipeTrackRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync destination if `?screen=` query param changes externally
  useEffect(() => {
    const param = searchParams.get('screen');
    if (param) {
      const parsed = parseDestination(param);
      setDestination((prev) => (prev === parsed ? prev : parsed));
    }
  }, [searchParams]);

  // Stop any playing Zen Web Audio ambience when leaving /insights
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      blinkSound.stopZenAmbience(0.2);
    };
  }, []);

  const handleSetSoundEnabled = useCallback((next: boolean) => {
    setSoundEnabled(next);
    blinkSound.setEnabled(next);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const navigate = useCallback(
    (next: DestinationId) => {
      setDestination((prev) => {
        if (prev !== next) blinkSound.playTabTick();
        return next;
      });
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (next === 'home') {
            updated.delete('screen');
          } else {
            updated.set('screen', next);
          }
          return updated;
        },
        { replace: true }
      );
      if (embedded) {
        if (typeof scrollContainerRef.current?.scrollTo === 'function') {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      } else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    },
    [embedded, setSearchParams]
  );

  const handleRitualComplete = useCallback(() => {
    setBreaksTaken((b) => Math.min(3, b + 1));
    setExtraBreaks((e) => e + 1);
    setObservationPaused(false);
    live.setSimulatedBlinkRate(18);
  }, [live]);

  const toastNode = (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className={`blink-elevated-scope pointer-events-none left-1/2 z-[80] -translate-x-1/2 max-w-[min(344px,calc(100%-32px))] rounded-full bg-[#192018]/95 border border-[#A6FA4C]/30 px-4 py-2 text-center text-[12px] font-medium text-[#ECF7E2] shadow-[0_14px_32px_rgba(0,0,0,0.72)] backdrop-blur-md ${
            embedded
              ? `absolute ${ritual.open ? 'bottom-5' : 'bottom-[90px]'}`
              : `fixed ${
                  ritual.open
                    ? 'bottom-[calc(20px+env(safe-area-inset-bottom))]'
                    : 'bottom-[calc(94px+env(safe-area-inset-bottom))]'
                }`
          }`}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={
          embedded
            ? 'blink-elevated-scope relative flex h-full w-full items-center justify-center bg-transparent'
            : 'blink-elevated-scope min-h-dvh sm:min-h-[calc(100dvh-56px)] w-full bg-[#060707] flex justify-center'
        }
        data-testid="insights-elevated-app"
      >
        <div
          className={
            embedded
              ? 'relative flex h-full w-full max-w-[390px] min-[600px]:max-h-[820px] flex-col overflow-hidden min-[600px]:rounded-[38px] min-[600px]:border min-[600px]:border-white/[0.10] bg-[#0D0F0E] text-[#F2F4F1] min-[600px]:shadow-[0_32px_96px_rgba(0,0,0,0.88),0_0_0_1px_rgba(255,255,255,0.04)_inset]'
              : 'relative w-full max-w-[390px] min-h-dvh sm:min-h-[calc(100dvh-56px)] bg-[#0D0F0E] text-[#F2F4F1] shadow-[0_0_90px_rgba(0,0,0,0.9)]'
          }
        >
          {/* Subtle flowing DistortionWave without wireframe DOM capture */}
          <DistortionWave
            revealed={ritual.open}
            source={destination === 'home' ? swipeTrackRef : undefined}
            type="vertical"
            palette="colorful"
            capture={false}
            waveStyle={{
              anticipation: 0.12,
              travel: 1.05,
              rimFade: 1.15,
              hairlineFade: 1.0,
              hairlineLinger: 0.15,
              amplitude: 10,
              swell: 7,
              blur: 8,
              aberration: 0.24,
              strength: 0.36,
              rimWidth: 8,
              rimStrength: 0.3,
              hairlineOpacity: 0.22,
              particleCount: 16,
            }}
            reducedMotion="system"
            cornerRadius={embedded ? 38 : 0}
            style={{
              width: '100%',
              height: embedded ? '100%' : undefined,
              minHeight: '100%',
              overflow: 'hidden',
              backgroundColor: '#0D0F0E',
            }}
            revealedContent={
              <RestRitualOverlay
                open={ritual.open}
                kind={ritual.kind}
                soundEnabled={soundEnabled}
                onToggleSound={() => {
                  const next = !soundEnabled;
                  handleSetSoundEnabled(next);
                  if (next) blinkSound.playToggle(true);
                  showToast(next ? 'Zen sound on' : 'Zen sound muted');
                }}
                onClose={() => setRitual((r) => ({ ...r, open: false }))}
                onComplete={handleRitualComplete}
              />
            }
          >
            <div
              ref={scrollContainerRef}
              className={
                embedded
                  ? 'h-full w-full overflow-y-auto no-scrollbar bg-[#0D0F0E]'
                  : 'min-h-dvh sm:min-h-[calc(100dvh-56px)] w-full bg-[#0D0F0E]'
              }
            >
              {/* Minimal Mobile Status Bar */}
              <div
                className="flex items-center justify-between px-5 pt-3 pb-1 select-none"
                aria-label="Status bar"
              >
                <span className="font-mono-num text-[11.5px] font-medium text-[#DCE0DD]">
                  {clockLabel}
                </span>
                {embedded && (
                  <span
                    aria-hidden="true"
                    className="hidden min-[600px]:inline-block h-[18px] w-[72px] rounded-full bg-black/80 border border-white/[0.06]"
                  />
                )}
                <div className="flex items-center gap-[5px] text-[#C8CFCB]" aria-hidden="true">
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                    <rect x="0.5" y="6.8" width="2.2" height="2.8" rx="0.6" fill="currentColor" opacity="0.5" />
                    <rect x="3.9" y="4.8" width="2.2" height="4.8" rx="0.6" fill="currentColor" opacity="0.78" />
                    <rect x="7.3" y="2.8" width="2.2" height="6.8" rx="0.6" fill="currentColor" />
                    <rect x="10.7" y="0.8" width="2.2" height="8.8" rx="0.6" fill="currentColor" />
                  </svg>
                  <svg width="13" height="10" viewBox="0 0 14 11" fill="none">
                    <path d="M1.2 3.8C4.4 0.9 9.6 0.9 12.8 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M3.4 6.2C5.4 4.4 8.6 4.4 10.6 6.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <circle cx="7" cy="8.8" r="1.1" fill="currentColor" />
                  </svg>
                  <span className="font-mono-num text-[10px] text-[#A6FA4C]">86%</span>
                </div>
              </div>

              {/* Primary Content Stage */}
              <main className="pb-[110px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={destination}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {destination === 'home' && (
                      <HomeView
                        blinkRate={live.blinkRate}
                        onChangeBlinkRate={live.setSimulatedBlinkRate}
                        paused={observationPaused || !live.isFaceDetected || live.monitoringMode === 'paused'}
                        onTogglePaused={setObservationPaused}
                        connected={live.deviceConnected && live.mode !== 'OFFLINE'}
                        onReconnect={live.reconnect}
                        onStartRitual={(kind) => setRitual({ open: true, kind })}
                        swipeTrackRef={swipeTrackRef}
                        onOpenInsights={() => navigate('insights')}
                        onOpenSettings={() => navigate('settings')}
                        onOpenNotifications={() => setNotifOpen(true)}
                        hasUnread={hasUnread}
                        breaksTaken={breaksTaken}
                        onShowToast={showToast}
                        mode={live.mode}
                        totalBlinks={live.totalBlinks}
                        avgRate={live.avgRate}
                        sessionSeconds={live.sessionSeconds}
                        isFaceDetected={live.isFaceDetected}
                        isValidZero={live.isValidZero}
                        isStale={live.isStale}
                        isMonitoring={live.isMonitoring}
                        roomCode={live.roomCode}
                        lastSyncTimestamp={live.lastSyncTimestamp}
                      />
                    )}

                    {destination === 'insights' && (
                      <InsightsView
                        range={range}
                        onRangeChange={setRange}
                        comfort={comfort}
                        onSelectComfort={(c) => {
                          setComfort(c);
                          showToast(`Comfort logged: ${c}`);
                        }}
                        onStartRitual={(kind) => setRitual({ open: true, kind })}
                        extraBreaks={extraBreaks}
                        mode={live.mode}
                        liveAvgRate={live.avgRate}
                        liveSessionSeconds={live.sessionSeconds}
                        liveTotalBlinks={live.totalBlinks}
                      />
                    )}

                    {destination === 'assistant' && (
                      <AssistantView
                        phase={assistantPhase}
                        onPhaseChange={setAssistantPhase}
                        onStartRitual={(kind) => setRitual({ open: true, kind })}
                        onShowToast={showToast}
                      />
                    )}

                    {destination === 'settings' && (
                      <SettingsView
                        deviceConnected={live.deviceConnected && live.mode !== 'OFFLINE'}
                        onToggleDeviceConnected={(connected) => {
                          if (connected) {
                            live.reconnect();
                            setObservationPaused(false);
                          } else {
                            setObservationPaused(true);
                          }
                        }}
                        soundEnabled={soundEnabled}
                        onToggleSound={handleSetSoundEnabled}
                        onShowToast={showToast}
                        roomCode={live.roomCode}
                        mode={live.mode}
                        monitoringMode={live.monitoringMode}
                        isStale={live.isStale}
                        onSwitchRoom={live.switchRoom}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
          </DistortionWave>

          {/* Persistent Anodized Dock + Continuous Blink Presence Orb (hidden during Rest Ritual) */}
          {!ritual.open && (
            <BottomDock
              active={destination}
              onSelect={navigate}
              assistantPhase={assistantPhase}
              embedded={embedded}
              onOrbHoldStart={() => {
                navigate('assistant');
                setAssistantPhase('listening');
                blinkSound.playListenStart();
                showToast('Listening (simulated voice)…');
              }}
              onOrbHoldEnd={() => {
                // Keep Hey Blink in listening state ready for tap-to-send
              }}
            />
          )}

          {/* Quiet Floating Toast (scoped inside phone frame when embedded; portaled on standalone /insights) */}
          {embedded
            ? toastNode
            : typeof document !== 'undefined' && createPortal(toastNode, document.body)}

          {/* Notifications Popover (Portaled cleanly at top above everything) */}
          <PortalSheet
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            ariaLabel="Notifications"
            placement="top"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-[#F2F4F1]">
                  Updates
                </h2>
                <p className="text-[11px] text-[#7F8782]">
                  Simulated companion cues
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHasUnread(false);
                    showToast('All cues marked read');
                  }}
                  className="press-tactile inline-flex items-center gap-1 rounded-full bg-[#A6FA4C]/12 px-2.5 py-1 text-[11px] font-medium text-[#A6FA4C] cursor-pointer"
                >
                  <Check className="h-3 w-3" /> Read
                </button>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="Close updates"
                  className="surface-tactile flex h-7 w-7 items-center justify-center rounded-full text-[#98A09A] hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="rounded-[16px] surface-well p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-[#F2F4F1]">
                    Gentle rest cue
                  </span>
                  <span className="font-mono-num text-[10px] text-[#737B76]">Now</span>
                </div>
                <p className="mt-1 text-[11.5px] text-[#8E9690]">
                  Simulated cadence dipped to {live.blinkRate || 13}/min during a 48m focus block.
                </p>
              </div>
              <div className="rounded-[16px] surface-well p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-[#F2F4F1]">
                    Desk Node 01 ready
                  </span>
                  <span className="font-mono-num text-[10px] text-[#737B76]">32m</span>
                </div>
                <p className="mt-1 text-[11.5px] text-[#8E9690]">
                  Firmware v3.4.1 active at 86% battery.
                </p>
              </div>
            </div>
          </PortalSheet>
        </div>
      </div>
    </MotionConfig>
  );
};

export default InsightsApp;
