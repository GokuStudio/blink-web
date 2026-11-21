import React, { useEffect, useRef, useState } from 'react';
import {
  Info,
  X,
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  Eye,
  Camera,
  Sparkles,
  Bell,
  WifiOff,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { BlinkExpressionType } from '@/shared/contracts';
import { useDeviceStore } from '@/features/blink-device/state';
import { useTrackingStore } from '@/features/blink-device/state/trackingStore';
import { useWellnessStore } from '@/features/blink-device/wellness/wellnessStore';
import { usePersonalityStore } from '@/features/blink-device/personality';
import type { IntegratedDemoSession } from './useIntegratedDemoSession';

export type GuideStepStatus =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'needs_attention'
  | 'manual';

export interface ExploreBlinkTriggerProps {
  open: boolean;
  onToggle: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

const PREVIEW_EXPRESSIONS: Array<{ id: BlinkExpressionType; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'happy', label: 'Happy' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'alert', label: 'Alert' },
  { id: 'listening', label: 'Listening' },
];

function StatusPill({ status }: { status: GuideStepStatus }) {
  switch (status) {
    case 'passed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#A6FA4C]/15 border border-[#A6FA4C]/35 px-2 py-0.5 text-[10px] font-mono font-medium text-[#A6FA4C]">
          <CheckCircle2 className="h-3 w-3" />
          Passed
        </span>
      );
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/12 border border-sky-400/30 px-2 py-0.5 text-[10px] font-mono font-medium text-sky-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          In progress
        </span>
      );
    case 'needs_attention':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/35 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Needs attention
        </span>
      );
    case 'manual':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/[0.12] px-2 py-0.5 text-[10px] font-mono font-medium text-neutral-300">
          <Eye className="h-3 w-3" />
          Manual check
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 text-[10px] font-mono text-neutral-400">
          <Circle className="h-2.5 w-2.5" />
          Not started
        </span>
      );
  }
}

export const ExploreBlinkTrigger: React.FC<ExploreBlinkTriggerProps> = ({
  open,
  onToggle,
  buttonRef,
}) => (
  <button
    ref={buttonRef}
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label="Explore Blink interactive guide"
    data-testid="explore-blink-trigger"
    className={`relative flex h-8 w-8 min-[900px]:h-10 min-[900px]:w-10 items-center justify-center rounded-full min-[900px]:rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] ${
      open
        ? 'bg-white/[0.12] text-white'
        : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'
    }`}
  >
    <Info className="h-[18px] w-[18px]" strokeWidth={1.85} />
  </button>
);

export function useExploreBlinkProgress(session: IntegratedDemoSession) {
  const isCameraActive = useTrackingStore((s) => s.isCameraActive);
  const permissionState = useTrackingStore((s) => s.permissionState);
  const isFaceDetected = useTrackingStore((s) => s.isFaceDetected);
  const blinkCount = useTrackingStore((s) => s.blinkCount);
  const leftWinkCount = useTrackingStore((s) => s.leftWinkCount);
  const rightWinkCount = useTrackingStore((s) => s.rightWinkCount);
  const cameraError = useTrackingStore((s) => s.cameraError);
  const expression = useDeviceStore((s) => s.expression);
  const personalityRunning = usePersonalityStore((s) => s.isRunning);
  const personalityOwner = usePersonalityStore((s) => s.owner);

  const [cameraGrantedObserved, setCameraGrantedObserved] = useState(false);
  const [faceDetectedObserved, setFaceDetectedObserved] = useState(false);
  const [blinkBaselineAtCameraStart, setBlinkBaselineAtCameraStart] = useState(0);
  const [winkBaselineAtCameraStart, setWinkBaselineAtCameraStart] = useState(0);
  const [blinksPassed, setBlinksPassed] = useState(false);
  const [telemetryPassed, setTelemetryPassed] = useState(false);
  const [winkPassed, setWinkPassed] = useState(false);
  const [faceLossObserved, setFaceLossObserved] = useState(false);
  const [faceReturnObserved, setFaceReturnObserved] = useState(false);
  const [nudgeUnderstandingRead, setNudgeUnderstandingRead] = useState(false);
  const [nudgePreviewStarted, setNudgePreviewStarted] = useState(false);
  const [nudgePreviewPassed, setNudgePreviewPassed] = useState(false);
  const [previewedExpressions, setPreviewedExpressions] = useState<string[]>([]);
  const [disconnectObserved, setDisconnectObserved] = useState(false);
  const [reconnectPassed, setReconnectPassed] = useState(false);

  const prevCameraActiveRef = useRef(isCameraActive);
  const prevFaceDetectedRef = useRef(isFaceDetected);
  const prevExpressionRef = useRef(expression);
  const hasInitiallyConnectedRef = useRef(false);
  const exprResetTimerRef = useRef<number | null>(null);

  // Track real camera activation & capture baseline counts
  useEffect(() => {
    if (isCameraActive && !prevCameraActiveRef.current) {
      setBlinkBaselineAtCameraStart(blinkCount);
      setWinkBaselineAtCameraStart(leftWinkCount + rightWinkCount);
    }
    if (isCameraActive && permissionState === 'granted') {
      setCameraGrantedObserved(true);
    }
    prevCameraActiveRef.current = isCameraActive;
  }, [isCameraActive, permissionState, blinkCount, leftWinkCount, rightWinkCount]);

  // Track real face detected, look-away, and return-to-frame transitions
  useEffect(() => {
    if (isCameraActive && isFaceDetected) {
      setFaceDetectedObserved(true);
      if (faceLossObserved && !prevFaceDetectedRef.current) {
        setFaceReturnObserved(true);
      }
    } else if (
      isCameraActive &&
      faceDetectedObserved &&
      prevFaceDetectedRef.current &&
      !isFaceDetected
    ) {
      setFaceLossObserved(true);
    }
    prevFaceDetectedRef.current = isFaceDetected;
  }, [isCameraActive, isFaceDetected, faceDetectedObserved, faceLossObserved]);

  // Track real confirmed bilateral blinks (>= 2 after camera activation)
  const observedRealBlinks = Math.max(0, blinkCount - blinkBaselineAtCameraStart);
  useEffect(() => {
    if (isCameraActive && observedRealBlinks >= 2) {
      setBlinksPassed(true);
    }
  }, [isCameraActive, observedRealBlinks]);

  // Track real telemetry reaching Elevated (LIVE mode + actual totalBlinks > 0)
  useEffect(() => {
    if (session.elevatedLive?.mode === 'LIVE' && session.elevatedLive.totalBlinks > 0) {
      setTelemetryPassed(true);
    }
  }, [session.elevatedLive?.mode, session.elevatedLive?.totalBlinks]);

  // Track real wink detection
  const observedRealWinks = Math.max(
    0,
    leftWinkCount + rightWinkCount - winkBaselineAtCameraStart
  );
  useEffect(() => {
    if (isCameraActive && observedRealWinks >= 1) {
      setWinkPassed(true);
    }
  }, [isCameraActive, observedRealWinks]);

  // Track real nudge preview completion (nudging -> non-nudging)
  useEffect(() => {
    if (expression === 'nudging') {
      setNudgePreviewStarted(true);
    } else if (nudgePreviewStarted && prevExpressionRef.current === 'nudging') {
      setNudgePreviewPassed(true);
    }
    prevExpressionRef.current = expression;
  }, [expression, nudgePreviewStarted]);

  // Track real offline -> connected recovery cycle (only after initial startup connect completes)
  useEffect(() => {
    const isConnectedNow =
      session.connectionStatus === 'connected' &&
      session.elevatedLive?.mode !== 'OFFLINE' &&
      !session.isManuallyDisconnected;

    if (isConnectedNow) {
      if (hasInitiallyConnectedRef.current && disconnectObserved) {
        setReconnectPassed(true);
      }
      hasInitiallyConnectedRef.current = true;
    } else if (
      hasInitiallyConnectedRef.current &&
      (session.stageState === 'OFFLINE' ||
        session.elevatedLive?.mode === 'OFFLINE' ||
        session.isManuallyDisconnected)
    ) {
      setDisconnectObserved(true);
    }
  }, [
    session.stageState,
    session.connectionStatus,
    session.elevatedLive?.mode,
    session.isManuallyDisconnected,
    disconnectObserved,
  ]);

  useEffect(() => {
    return () => {
      if (exprResetTimerRef.current) window.clearTimeout(exprResetTimerRef.current);
    };
  }, []);

  const handlePreviewExpression = (expr: BlinkExpressionType) => {
    if (exprResetTimerRef.current) {
      window.clearTimeout(exprResetTimerRef.current);
      exprResetTimerRef.current = null;
    }

    usePersonalityStore.getState().onUserExpression(expr);

    if (expr !== 'idle') {
      setPreviewedExpressions((prev) => (prev.includes(expr) ? prev : [...prev, expr]));
      exprResetTimerRef.current = window.setTimeout(() => {
        if (usePersonalityStore.getState().owner === 'user') {
          usePersonalityStore.getState().resetOwnership();
        }
      }, 4500);
    }
  };

  const handleTriggerSafeNudge = () => {
    usePersonalityStore.getState().onNudgeStart();
    useWellnessStore.getState().triggerManualNudge();
  };

  const statuses: Record<number, GuideStepStatus> = {
    1: personalityRunning ? 'passed' : 'manual',
    2: cameraGrantedObserved
      ? 'passed'
      : permissionState === 'denied' || permissionState === 'error' || Boolean(cameraError)
        ? 'needs_attention'
        : session.isCameraBusy || permissionState === 'requesting'
          ? 'in_progress'
          : 'not_started',
    3: faceDetectedObserved ? 'passed' : isCameraActive ? 'in_progress' : 'not_started',
    4: blinksPassed
      ? 'passed'
      : isCameraActive && isFaceDetected
        ? 'in_progress'
        : 'not_started',
    5: telemetryPassed ? 'passed' : isCameraActive ? 'in_progress' : 'not_started',
    6: winkPassed ? 'passed' : isCameraActive && isFaceDetected ? 'manual' : 'not_started',
    7: faceLossObserved ? 'passed' : faceDetectedObserved ? 'in_progress' : 'not_started',
    8: faceReturnObserved ? 'passed' : faceLossObserved ? 'in_progress' : 'not_started',
    9: nudgeUnderstandingRead ? 'passed' : 'manual',
    10: nudgePreviewPassed ? 'passed' : expression === 'nudging' ? 'in_progress' : 'not_started',
    11:
      previewedExpressions.length >= 2
        ? 'passed'
        : previewedExpressions.length === 1
          ? 'in_progress'
          : 'not_started',
    12: reconnectPassed ? 'passed' : disconnectObserved ? 'in_progress' : 'not_started',
  };

  const passedCount = Object.values(statuses).filter((s) => s === 'passed').length;

  return {
    statuses,
    passedCount,
    isCameraActive,
    blinksPassed,
    observedRealBlinks,
    nudgeUnderstandingRead,
    setNudgeUnderstandingRead,
    expression,
    personalityOwner,
    handlePreviewExpression,
    handleTriggerSafeNudge,
  };
}

export interface ExploreBlinkContentProps {
  open: boolean;
  onClose: () => void;
  session: IntegratedDemoSession;
  progress: ReturnType<typeof useExploreBlinkProgress>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

export const ExploreBlinkContent: React.FC<ExploreBlinkContentProps> = ({
  open,
  onClose,
  session,
  progress,
  triggerRef,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        triggerRef?.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const {
    statuses,
    passedCount,
    isCameraActive,
    blinksPassed,
    observedRealBlinks,
    nudgeUnderstandingRead,
    setNudgeUnderstandingRead,
    expression,
    personalityOwner,
    handlePreviewExpression,
    handleTriggerSafeNudge,
  } = progress;

  return (
    <div
      role="dialog"
      aria-label="Explore Blink Guided Demonstration"
      data-testid="explore-blink-panel"
      className="flex h-full w-full flex-col overflow-hidden bg-[#0E1012] text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#A6FA4C]" strokeWidth={1.9} />
            <h2 className="text-[14px] font-semibold text-[#F2F4F1] tracking-tight">
              Explore Blink
            </h2>
            <span className="font-mono text-[10.5px] text-neutral-400 bg-white/[0.05] px-2 py-0.5 rounded-full">
              {passedCount}/12 verified
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Interactive walkthrough · eyes &amp; companion stay unobstructed
          </p>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => {
            onClose();
            triggerRef?.current?.focus();
          }}
          aria-label="Close Explore Blink guide"
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Ordered 12-Step Checklist */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {/* 1. Meet Blink */}
        <div data-testid="guide-step-1" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">1. Meet Blink</span>
            <StatusPill status={statuses[1]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Observe Blink&apos;s autonomous micro-saccades, curiosity glances, and calm idle presence while the camera is off.
          </p>
        </div>

        {/* 2. Enable camera */}
        <div data-testid="guide-step-2" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">2. Enable camera</span>
            <StatusPill status={statuses[2]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Grant webcam access. Video frames stay strictly in local browser memory.
          </p>
          {!isCameraActive && (
            <button
              type="button"
              onClick={() => void session.enableCamera()}
              disabled={session.isCameraBusy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#A6FA4C]/15 hover:bg-[#A6FA4C]/25 border border-[#A6FA4C]/35 px-3 py-1 text-[11px] font-medium text-[#A6FA4C] disabled:opacity-50 cursor-pointer"
            >
              <Camera className="h-3 w-3" />
              {session.isCameraBusy ? 'Starting camera…' : 'Enable Camera'}
            </button>
          )}
        </div>

        {/* 3. Face detected */}
        <div data-testid="guide-step-3" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">3. Face detected</span>
            <StatusPill status={statuses[3]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Center your face in frame to verify MediaPipe face landmark tracking is locked on.
          </p>
        </div>

        {/* 4. Blink naturally */}
        <div data-testid="guide-step-4" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">4. Blink naturally</span>
            <StatusPill status={statuses[4]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Blink normally a couple of times and watch Blink&apos;s cyan eyelids mirror yours in real time.
            {isCameraActive && !blinksPassed && (
              <span className="ml-1 font-mono text-sky-300">
                ({Math.min(observedRealBlinks, 2)}/2 confirmed)
              </span>
            )}
          </p>
        </div>

        {/* 5. Blink counter */}
        <div data-testid="guide-step-5" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">5. Blink counter</span>
            <StatusPill status={statuses[5]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Confirm live telemetry updates the Elevated companion on the right (Total Blinks updates immediately; BPM stabilizes after 30s).
          </p>
        </div>

        {/* 6. Try a wink */}
        <div data-testid="guide-step-6" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">6. Try a wink</span>
            <StatusPill status={statuses[6]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Close one eye briefly. Blink mirrors the matching eye independently without counting a wink as a bilateral blink.
          </p>
        </div>

        {/* 7. Look away */}
        <div data-testid="guide-step-7" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">7. Look away</span>
            <StatusPill status={statuses[7]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Move out of camera frame. Blink pauses stare accumulation and suspends observation rather than logging false fatigue.
          </p>
        </div>

        {/* 8. Return to frame */}
        <div data-testid="guide-step-8" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">8. Return to frame</span>
            <StatusPill status={statuses[8]} />
          </div>
          <p className="mt-1 text-[11.5px] text-neutral-400">
            Return into frame and confirm mirroring and observation resume automatically without refreshing.
          </p>
        </div>

        {/* 9. Understand nudges */}
        <div data-testid="guide-step-9" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">9. Understand nudges</span>
            <StatusPill status={statuses[9]} />
          </div>
          <p className="text-[11.5px] leading-relaxed text-neutral-400">
            Blink uses ergonomic wellness heuristics (not medical diagnostics) to decide when to gently remind you to blink:
          </p>
          <ul className="space-y-1 text-[11px] text-neutral-300 pl-3.5 list-disc">
            <li>Extended confirmed stare: warning at 12s, nudge at 18s without a blink.</li>
            <li>Low rolling rate: below 12 blinks/min after ≥30s valid observation (recovers at 14/min).</li>
            <li>45-second cooldown prevents repeated reminders.</li>
            <li>Automatically suppressed whenever your face leaves the frame.</li>
          </ul>
          {!nudgeUnderstandingRead && (
            <button
              type="button"
              onClick={() => setNudgeUnderstandingRead(true)}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] hover:bg-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-neutral-200 cursor-pointer"
            >
              <CheckCircle2 className="h-3 w-3 text-[#A6FA4C]" />
              Got it
            </button>
          )}
        </div>

        {/* 10. Experience a nudge */}
        <div data-testid="guide-step-10" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-medium text-[#F2F4F1]">10. Experience a nudge</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-mono text-neutral-400">
                Preview
              </span>
            </div>
            <StatusPill status={statuses[10]} />
          </div>
          <p className="text-[11.5px] text-neutral-400">
            Trigger a safe manual preview of Blink&apos;s red-left / blue-right alternating eye nudge without changing production thresholds.
          </p>
          <button
            type="button"
            onClick={handleTriggerSafeNudge}
            disabled={expression === 'nudging'}
            data-testid="guide-trigger-nudge-btn"
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 px-3 py-1 text-[11px] font-medium text-red-300 disabled:opacity-50 cursor-pointer"
          >
            <Bell className="h-3 w-3" />
            {expression === 'nudging' ? 'Nudging…' : 'Preview Nudge'}
          </button>
        </div>

        {/* 11. Observe expressions */}
        <div data-testid="guide-step-11" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-medium text-[#F2F4F1]">11. Observe expressions</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-mono text-neutral-400">
                Preview
              </span>
            </div>
            <StatusPill status={statuses[11]} />
          </div>
          <p className="text-[11.5px] text-neutral-400">
            Preview Blink&apos;s shader expressions using the live expression engine. Previews auto-return to idle so camera tracking stays in charge.
          </p>
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            {PREVIEW_EXPRESSIONS.map((item) => {
              const isActive = expression === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePreviewExpression(item.id)}
                  data-testid={`guide-expr-${item.id}`}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#35DFFF]/20 border border-[#35DFFF]/50 text-[#35DFFF]'
                      : 'bg-white/[0.05] border border-white/[0.07] text-neutral-300 hover:bg-white/[0.10] hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {personalityOwner === 'user' && expression !== 'idle' && (
            <button
              type="button"
              onClick={() => usePersonalityStore.getState().resetOwnership()}
              className="inline-flex items-center gap-1 text-[10.5px] text-neutral-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Return to live idle now
            </button>
          )}
        </div>

        {/* 12. Disconnect and recover */}
        <div data-testid="guide-step-12" className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-[#F2F4F1]">12. Disconnect and recover</span>
            <StatusPill status={statuses[12]} />
          </div>
          <p className="text-[11.5px] text-neutral-400">
            Test how Elevated and the Issue Center handle an offline drop and clean session recovery safely without touching backend rules.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void session.disconnectSession()}
              disabled={session.isManuallyDisconnected}
              data-testid="guide-disconnect-btn"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.10] px-3 py-1 text-[11px] font-medium text-neutral-200 disabled:opacity-45 cursor-pointer"
            >
              <WifiOff className="h-3 w-3 text-amber-300" />
              Simulate Offline
            </button>
            <button
              type="button"
              onClick={() => void session.reconnectSession()}
              disabled={!session.isManuallyDisconnected && session.connectionStatus === 'connected'}
              data-testid="guide-reconnect-btn"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#A6FA4C]/15 hover:bg-[#A6FA4C]/25 border border-[#A6FA4C]/35 px-3 py-1 text-[11px] font-medium text-[#A6FA4C] disabled:opacity-45 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
