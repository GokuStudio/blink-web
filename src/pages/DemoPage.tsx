import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Loader2,
  Monitor,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { DeviceShell } from '@/features/blink-device';
import { useDeviceStore } from '@/features/blink-device/state';
import { useTrackingStore } from '@/features/blink-device/state/trackingStore';
import type { BlinkExpressionType } from '@/shared/contracts';
import type { IRealtimeService } from '@/shared/realtime/interfaces/realtime-service.interface';
import { InsightsApp } from '@/features/insights/elevated/InsightsApp';
import { useBlinkVoiceExperience } from '@/features/hey-blink/integration/useBlinkVoiceExperience';
import { BlinkVoiceControlsPill } from '@/features/hey-blink/components/BlinkVoiceControlsPill';
import { BlinkVoiceSettingsPopover } from '@/features/hey-blink/components/BlinkVoiceSettingsPopover';
import type { IVoiceSession } from '@/features/hey-blink/services/voice-session.interface';
import type { DiagnosticActionType } from '@/features/demo/diagnostics/diagnosticStore';
import {
  useIntegratedDemoSession,
  type IntegratedStageState,
} from '@/features/demo/useIntegratedDemoSession';
import {
  IssueCenterTrigger,
  IssueCenterPanel,
} from '@/features/demo/diagnostics/IssueCenter';
import {
  ExploreBlinkTrigger,
  ExploreBlinkContent,
  useExploreBlinkProgress,
} from '@/features/demo/ExploreBlinkPanel';
import { RoomSessionPopover } from '@/features/demo/RoomSessionPopover';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

const LazyDevDialKit = import.meta.env.DEV
  ? React.lazy(() => import('@/features/demo/DevDialKitTuning'))
  : null;

interface StageStatusMeta {
  label: string;
  dotClass: string;
  textClass: string;
  caption: string;
}

function getStageStatusMeta(
  stageState: IntegratedStageState,
  isModelLoading: boolean
): StageStatusMeta {
  switch (stageState) {
    case 'LIVE':
      return {
        label: 'Live',
        dotClass: 'bg-[#A6FA4C] shadow-[0_0_8px_rgba(166,250,76,0.75)]',
        textClass: 'text-[#A6FA4C]',
        caption: 'Live eyelid mirroring active · Real telemetry streaming to Elevated',
      };
    case 'TRACKING_LOST':
      return {
        label: 'Tracking Lost',
        dotClass: 'bg-amber-300',
        textClass: 'text-amber-300',
        caption: 'Face temporarily outside frame · Observation paused automatically',
      };
    case 'CAMERA_REQUIRED':
      return {
        label: 'Ready',
        dotClass: 'bg-[#35DFFF]',
        textClass: 'text-neutral-200',
        caption: 'Autonomous idle active · Enable camera to mirror your eyes live',
      };
    case 'READY':
      return {
        label: isModelLoading ? 'Loading Vision' : 'Ready',
        dotClass: 'bg-[#35DFFF] animate-pulse',
        textClass: 'text-sky-300',
        caption: isModelLoading
          ? 'Initializing on-device MediaPipe face landmark model…'
          : 'Camera active · Detecting face in frame…',
      };
    case 'DEMO':
      return {
        label: 'Demo',
        dotClass: 'bg-neutral-400',
        textClass: 'text-neutral-300',
        caption: 'Simulated demonstration mode · Enable camera for live eye tracking',
      };
    case 'CONNECTING':
      return {
        label: 'Connecting',
        dotClass: 'bg-sky-300 animate-pulse',
        textClass: 'text-sky-300',
        caption: 'Synchronizing shared Blink session room…',
      };
    case 'INITIALIZING':
      return {
        label: 'Initializing',
        dotClass: 'bg-neutral-400 animate-pulse',
        textClass: 'text-neutral-400',
        caption: 'Preparing Blink companion experience…',
      };
    case 'OFFLINE':
      return {
        label: 'Offline',
        dotClass: 'bg-red-400',
        textClass: 'text-red-400',
        caption: 'Session disconnected · Reconnect to resume realtime synchronization',
      };
    case 'ERROR':
      return {
        label: 'Attention',
        dotClass: 'bg-red-400',
        textClass: 'text-red-400',
        caption: 'Open diagnostics to review and recover',
      };
  }
}

export interface DemoPageProps {
  /** Optional injected realtime service for deterministic automated testing. */
  realtimeService?: IRealtimeService;
  /** Optional injected voice session factory for deterministic automated testing. */
  createVoiceSession?: () => IVoiceSession;
}

export const DemoPage: React.FC<DemoPageProps> = ({ realtimeService, createVoiceSession }) => {
  const [searchParams] = useSearchParams();
  const prefersReducedMotion = Boolean(useReducedMotion());

  const session = useIntegratedDemoSession({ injectedService: realtimeService });
  const voice = useBlinkVoiceExperience({ createSession: createVoiceSession });
  const guideProgress = useExploreBlinkProgress(session);

  const handleCombinedDiagnosticAction = (action: DiagnosticActionType) => {
    if (action === 'retry_voice') {
      void voice.retryVoice();
      return;
    }
    if (action === 'end_voice') {
      void voice.endVoice();
      return;
    }
    if (action === 'enable_voice_preview') {
      void voice.startPreviewVoice();
      return;
    }
    session.handleDiagnosticAction(action);
  };

  // Granular device & tracking selectors (never subscribing to 30fps closure floats)
  const storeExpr = useDeviceStore((s) => s.expression);
  const isCameraActive = useTrackingStore((s) => s.isCameraActive);
  const isModelLoading = useTrackingStore((s) => s.isModelLoading);
  const isMirroringEnabled = useTrackingStore((s) => s.isMirroringEnabled);
  const setMirroringEnabled = useTrackingStore((s) => s.setMirroringEnabled);

  const exprParam = searchParams.get('expr') as BlinkExpressionType | null;
  const expression = exprParam || storeExpr;

  // Responsive mobile/tablet pane switcher: companion-first on <900px, never unmounts either pane
  const [compactPane, setCompactPane] = useState<'companion' | 'device'>('companion');

  // Docked non-overlapping side rail (Explore Blink OR System Diagnostics)
  const isDesktopLayout = useMediaQuery('(min-width: 900px)');
  const [activeDrawer, setActiveDrawer] = useState<'guide' | 'issues' | null>(null);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const issueTriggerRef = useRef<HTMLButtonElement>(null);

  const toggleDrawer = (which: 'guide' | 'issues') => {
    setActiveDrawer((prev) => (prev === which ? null : which));
  };

  // Optional dev-only DialKit live tuning when explicitly enabled via ?tune=1 in DEV
  const showDevDialKit =
    import.meta.env.DEV && Boolean(LazyDevDialKit) && searchParams.get('tune') === '1';

  useEffect(() => {
    document.title = 'Blink — Eye-Health Companion';
  }, []);

  const statusMeta = getStageStatusMeta(session.stageState, isModelLoading);
  const drawerOpen = activeDrawer !== null;

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#030405] text-[#F2F4F1] flex flex-col"
      data-testid="demo-integrated-stage"
    >
      {/* Compact Viewport Header (visible < 900px: Tablet & Mobile companion-first navigation) */}
      <div className="flex min-[900px]:hidden items-center justify-between gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 bg-[#0A0B0C]/95 border-b border-white/[0.07] z-30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-[-0.03em] text-white/85 select-none">
            Blink
          </span>
          {/* Reserve horizontal space for the inline compact utility dock on <900px */}
          <div className="w-[116px] h-8 shrink-0" aria-hidden="true" />
        </div>

        <div
          role="tablist"
          aria-label="Switch Blink view"
          className="inline-flex items-center rounded-full bg-[#141618] border border-white/[0.08] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={compactPane === 'companion'}
            onClick={() => setCompactPane('companion')}
            data-testid="pane-switch-companion"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
              compactPane === 'companion'
                ? 'bg-[#232725] text-[#F2F4F1]'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Companion</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compactPane === 'device'}
            onClick={() => setCompactPane('device')}
            data-testid="pane-switch-device"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
              compactPane === 'device'
                ? 'bg-[#232725] text-[#F2F4F1]'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Device</span>
          </button>
        </div>
      </div>

      {/* Main Layout Row: Docked Non-Obstructing Left Rail (when open) + Responsive Split Stage */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* DOCKED SIDEBAR RAIL (Desktop >= 900px): Pushes Device smoothly so eyes are NEVER hidden */}
        <AnimatePresence initial={false}>
          {drawerOpen && isDesktopLayout && (
            <motion.aside
              key="docked-side-rail"
              initial={prefersReducedMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { width: 'clamp(296px, 24vw, 356px)', opacity: 1 }
              }
              exit={prefersReducedMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              data-testid="demo-docked-rail"
              className="flex shrink-0 h-full overflow-hidden border-r border-white/[0.08] bg-[#0E1012] z-30"
            >
              <div className="h-full w-[clamp(296px,24vw,356px)] shrink-0">
                {activeDrawer === 'guide' ? (
                  <ExploreBlinkContent
                    open={true}
                    onClose={() => setActiveDrawer(null)}
                    session={session}
                    progress={guideProgress}
                    triggerRef={guideTriggerRef}
                  />
                ) : (
                  <IssueCenterPanel
                    open={true}
                    onClose={() => setActiveDrawer(null)}
                    onAction={handleCombinedDiagnosticAction}
                    triggerRef={issueTriggerRef}
                  />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* PRIMARY SPLIT STAGE (55% / 45% when rail closed; adaptive reflow when rail open) */}
        <div
          className={`flex-1 min-w-0 min-h-0 grid grid-cols-1 ${
            drawerOpen
              ? 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(376px,416px)] min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(406px,440px)]'
              : 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(384px,430px)] min-[1200px]:grid-cols-[minmax(0,1.22fr)_minmax(420px,1fr)]'
          }`}
        >
          {/* LEFT PANE: Blink Physical Companion Device */}
          <section
            aria-label="Blink Hardware Device"
            data-testid="demo-device-pane"
            className={`${
              compactPane === 'device' ? 'flex' : 'hidden'
            } min-[900px]:flex relative min-w-0 min-h-0 flex-col justify-between bg-[#020203] min-[900px]:border-r border-white/[0.06] overflow-hidden`}
          >
            {/* Restrained radial ambient depth behind hardware bezel */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 47%, rgba(53, 223, 255, 0.035) 0%, rgba(2, 2, 3, 0) 56%)',
              }}
            />

            {/* Discreet Desktop Top Bar (never overflows or clips) */}
            <header className="relative z-20 hidden min-[900px]:flex items-center justify-between gap-2 px-5 xl:px-7 pt-5 pb-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                <span className="text-[22px] xl:text-[24px] font-semibold tracking-[-0.035em] text-white/30 select-none">
                  Blink
                </span>
                <span
                  data-testid="stage-state-badge"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.035] border border-white/[0.07] px-2.5 py-1 text-[10.5px] font-mono tracking-wide shrink-0"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                  <span className={statusMeta.textClass}>{statusMeta.label}</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <RoomSessionPopover session={session} />
                <Link
                  to="/device"
                  title="Open standalone Blink Device"
                  aria-label="Open standalone Blink Device display"
                  className={`${
                    drawerOpen ? 'hidden xl:inline-flex' : 'inline-flex'
                  } h-8 items-center justify-center gap-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] px-2.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors`}
                >
                  <Monitor className="h-3.5 w-3.5 shrink-0" />
                  <span className={drawerOpen ? 'hidden 2xl:inline' : 'hidden xl:inline'}>
                    Device
                  </span>
                </Link>
                <Link
                  to="/insights"
                  title="Open standalone Blink Elevated Companion"
                  aria-label="Open standalone Blink Elevated companion"
                  className={`${
                    drawerOpen ? 'hidden xl:inline-flex' : 'inline-flex'
                  } h-8 items-center justify-center gap-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] px-2.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors`}
                >
                  <Smartphone className="h-3.5 w-3.5 shrink-0" />
                  <span className={drawerOpen ? 'hidden 2xl:inline' : 'hidden xl:inline'}>
                    Companion
                  </span>
                </Link>
              </div>
            </header>

            {/* Visual Focal Center: Unboxed Blink Device Shell (Layer 1-3) */}
            <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 py-4">
              <motion.div
                layout="position"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={`max-w-full transition-[width] duration-300 ${
                  drawerOpen
                    ? 'w-[min(360px,46vh,88%)] xl:w-[min(420px,52vh,88%)]'
                    : 'w-[min(440px,54vh,88vw)] min-[900px]:w-[min(390px,52vh,88%)] min-[1200px]:w-[min(460px,58vh,82%)]'
                }`}
              >
                <DeviceShell
                  key={session.rendererKey}
                  mode="desktop-integrated"
                  expression={expression}
                  frameless={true}
                  voiceExperience={voice}
                  onWebGLStatusChange={session.handleWebGLStatusChange}
                  onSustainedLowFps={session.handleSustainedLowFps}
                  onBezelError={session.handleBezelError}
                  className="bg-black"
                />
              </motion.div>

              {/* Centered Floating Control Capsule beneath Device */}
              <div className="mt-5 flex flex-col items-center gap-2">
                <div
                  data-testid="device-primary-controls"
                  className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full bg-[#151719]/92 border border-white/[0.09] p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.68)] backdrop-blur-md"
                >
                  <button
                    type="button"
                    onClick={() => void session.toggleCamera()}
                    disabled={session.isCameraBusy}
                    data-testid="stage-camera-toggle"
                    aria-label={
                      isCameraActive ? 'Turn camera off' : 'Enable camera for live eye mirroring'
                    }
                    aria-pressed={isCameraActive}
                    className={`inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-full px-4 text-[12px] font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#A6FA4C] ${
                      isCameraActive
                        ? 'bg-[#A6FA4C]/16 border border-[#A6FA4C]/45 text-[#A6FA4C] hover:bg-[#A6FA4C]/22'
                        : 'bg-white/[0.07] border border-white/[0.10] text-[#F2F4F1] hover:bg-white/[0.13]'
                    }`}
                  >
                    {session.isCameraBusy || isModelLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#35DFFF]" />
                    ) : isCameraActive ? (
                      <Camera className="h-4 w-4" strokeWidth={1.9} />
                    ) : (
                      <CameraOff className="h-4 w-4 text-neutral-300" strokeWidth={1.9} />
                    )}
                    <span className="whitespace-nowrap">
                      {session.isCameraBusy || isModelLoading
                        ? 'Starting…'
                        : isCameraActive
                          ? 'Camera On'
                          : 'Enable Camera'}
                    </span>
                  </button>

                  {!isCameraActive && session.stageState === 'OFFLINE' ? (
                    <button
                      type="button"
                      onClick={() => void session.reconnectSession()}
                      aria-label="Reconnect Blink session"
                      data-testid="stage-reconnect-btn"
                      className="inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] px-3.5 text-[12px] font-medium text-neutral-200 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-[#A6FA4C]" />
                      <span>Reconnect</span>
                    </button>
                  ) : null}

                  {/* Subtle optical divider between Camera and Voice controls */}
                  <div className="h-5 w-px bg-white/[0.09] mx-0.5" aria-hidden="true" />

                  {/* Cohesive Voice Control Pill ([ Talk to Blink ] / [ Mic On ] [ Interrupt ] [ End ]) */}
                  <BlinkVoiceControlsPill voice={voice} />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 max-w-[380px] px-2">
                  <p
                    data-testid="stage-status-caption"
                    className="text-[11.5px] text-neutral-400 text-center leading-snug"
                  >
                    {voice.isEngaged
                      ? voice.isSimulated
                        ? 'Voice preview active · Camera monitoring and Elevated telemetry continue uninterrupted'
                        : 'Voice mode active · Camera monitoring and Elevated telemetry continue uninterrupted'
                      : statusMeta.caption}
                  </p>

                  {isCameraActive && !voice.isEngaged && (
                    <button
                      type="button"
                      onClick={() => setMirroringEnabled(!isMirroringEnabled)}
                      aria-label={
                        isMirroringEnabled ? 'Pause eyelid mirroring' : 'Resume eyelid mirroring'
                      }
                      aria-pressed={isMirroringEnabled}
                      data-testid="stage-mirror-toggle"
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#35DFFF] ${
                        isMirroringEnabled
                          ? 'bg-white/[0.05] text-neutral-300 hover:bg-white/[0.09] hover:text-white'
                          : 'bg-white/[0.03] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300'
                      }`}
                    >
                      {isMirroringEnabled ? (
                        <Eye className="h-3 w-3 text-[#35DFFF]" strokeWidth={2} />
                      ) : (
                        <EyeOff className="h-3 w-3 text-neutral-500" strokeWidth={2} />
                      )}
                      <span>{isMirroringEnabled ? 'Mirroring On' : 'Mirroring Paused'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quiet Bottom Safe Spacer */}
            <div className="h-6 shrink-0" aria-hidden="true" />
          </section>

          {/* RIGHT PANE: Complete Blink Elevated Companion */}
          <section
            aria-label="Blink Elevated Companion"
            data-testid="demo-companion-pane"
            className={`${
              compactPane === 'companion' ? 'flex' : 'hidden'
            } min-[900px]:flex relative min-w-0 min-h-0 flex-col items-center justify-center bg-[#040505] p-0 min-[600px]:p-4 min-[900px]:p-4 xl:p-6 overflow-hidden`}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 18%, rgba(166, 250, 76, 0.05) 0%, rgba(4, 5, 5, 0) 56%)',
              }}
            />

            <div className="relative z-10 flex h-full w-full items-center justify-center">
              <InsightsApp
                embedded={true}
                manageConnection={false}
                realtimeService={session.realtimeService}
                roomCode={session.roomCode}
                onReconnectOverride={session.reconnectSession}
                onSwitchRoomOverride={session.switchRoom}
                onLiveStateChange={session.handleElevatedLiveChange}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Discreet Utility Dock: Bottom-left on desktop (shifts cleanly beside docked rail when open), inline top-left on <900px */}
      <div
        className={`fixed top-[max(7px,env(safe-area-inset-top))] left-[74px] min-[900px]:top-auto min-[900px]:bottom-[max(16px,env(safe-area-inset-bottom))] z-50 flex flex-row min-[900px]:flex-col items-center gap-1 rounded-full min-[900px]:rounded-2xl bg-[#131517]/92 border border-white/[0.09] px-1 py-0.5 min-[900px]:p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.75)] backdrop-blur-lg transition-[left] duration-300 ${
          drawerOpen
            ? 'min-[900px]:left-[calc(clamp(296px,24vw,356px)+12px)]'
            : 'min-[900px]:left-3'
        }`}
        aria-label="Blink guidance and system diagnostics"
      >
        <ExploreBlinkTrigger
          open={activeDrawer === 'guide'}
          onToggle={() => toggleDrawer('guide')}
          buttonRef={guideTriggerRef}
        />
        <div
          className="h-4 w-px min-[900px]:h-px min-[900px]:w-6 bg-white/[0.08]"
          aria-hidden="true"
        />
        <IssueCenterTrigger
          open={activeDrawer === 'issues'}
          onToggle={() => toggleDrawer('issues')}
          buttonRef={issueTriggerRef}
        />
        <div
          className="h-4 w-px min-[900px]:h-px min-[900px]:w-6 bg-white/[0.08]"
          aria-hidden="true"
        />
        <BlinkVoiceSettingsPopover
          voice={voice}
          open={voiceSettingsOpen}
          onToggle={() => setVoiceSettingsOpen((v) => !v)}
          onClose={() => setVoiceSettingsOpen(false)}
          placement="dock-left"
        />
      </div>

      {/* COMPACT VIEWPORT (<900px) NON-OBSTRUCTING BOTTOM HALF-SHEET */}
      <AnimatePresence>
        {drawerOpen && !isDesktopLayout && (
          <motion.div
            key="compact-bottom-drawer"
            initial={prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[65] h-[min(52dvh,460px)] overflow-hidden rounded-t-3xl border-t border-white/[0.12] bg-[#0E1012] shadow-[0_-24px_64px_rgba(0,0,0,0.88)]"
          >
            {activeDrawer === 'guide' ? (
              <ExploreBlinkContent
                open={true}
                onClose={() => setActiveDrawer(null)}
                session={session}
                progress={guideProgress}
                triggerRef={guideTriggerRef}
              />
            ) : (
              <IssueCenterPanel
                open={true}
                onClose={() => setActiveDrawer(null)}
                onAction={handleCombinedDiagnosticAction}
                triggerRef={issueTriggerRef}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev-Only DialKit Live Tuning Harness (never loaded or exposed in production) */}
      {showDevDialKit && LazyDevDialKit && (
        <Suspense fallback={null}>
          <LazyDevDialKit />
        </Suspense>
      )}
    </div>
  );
};
