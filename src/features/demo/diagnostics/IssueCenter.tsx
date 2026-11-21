import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  Camera,
  RefreshCw,
  Link2,
  ShieldAlert,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import {
  useDiagnosticStore,
  type DiagnosticActionType,
  type DiagnosticIssue,
  type DiagnosticSeverity,
} from './diagnosticStore';

export interface IssueCenterTriggerProps {
  open: boolean;
  onToggle: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export interface IssueCenterPanelProps {
  open: boolean;
  onClose: () => void;
  onAction: (action: DiagnosticActionType) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  return `${mins}m ago`;
}

function getSeverityStyle(severity: DiagnosticSeverity) {
  switch (severity) {
    case 'ERROR':
      return {
        badge: 'bg-red-500/15 text-red-400 border-red-500/30',
        dot: 'bg-red-400',
        icon: AlertCircle,
        iconColor: 'text-red-400',
      };
    case 'WARNING':
      return {
        badge: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
        dot: 'bg-amber-300',
        icon: AlertTriangle,
        iconColor: 'text-amber-300',
      };
    default:
      return {
        badge: 'bg-sky-400/12 text-sky-300 border-sky-400/25',
        dot: 'bg-sky-300',
        icon: Info,
        iconColor: 'text-sky-300',
      };
  }
}

function getActionIcon(actionType?: DiagnosticActionType) {
  switch (actionType) {
    case 'enable_camera':
      return Camera;
    case 'retry_connection':
      return RefreshCw;
    case 'rejoin_room':
      return Link2;
    case 'check_permissions':
      return ShieldAlert;
    case 'reload_rendering':
      return RotateCcw;
    default:
      return RefreshCw;
  }
}

export const IssueCenterTrigger: React.FC<IssueCenterTriggerProps> = ({
  open,
  onToggle,
  buttonRef,
}) => {
  const activeIssues = useDiagnosticStore((s) => s.activeIssues);
  const liveAnnouncement = useDiagnosticStore((s) => s.liveAnnouncement);

  const errorCount = activeIssues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = activeIssues.filter((i) => i.severity === 'WARNING').length;
  const attentionCount = errorCount + warningCount;
  const totalActiveCount = activeIssues.length;

  const highestSeverity: DiagnosticSeverity | 'HEALTHY' =
    errorCount > 0
      ? 'ERROR'
      : warningCount > 0
        ? 'WARNING'
        : totalActiveCount > 0
          ? 'INFO'
          : 'HEALTHY';

  const triggerLabel =
    highestSeverity === 'ERROR'
      ? `System diagnostics: ${errorCount} error${errorCount > 1 ? 's' : ''}`
      : highestSeverity === 'WARNING'
        ? `System diagnostics: ${warningCount} warning${warningCount > 1 ? 's' : ''}`
        : highestSeverity === 'INFO'
          ? `System diagnostics: ${totalActiveCount} notice${totalActiveCount > 1 ? 's' : ''}`
          : 'System diagnostics: All systems healthy';

  return (
    <>
      {/* Accessible live region for newly appearing WARNING/ERROR issues (deduplicated) */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement?.text || ''}
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        data-testid="issue-center-trigger"
        className={`relative flex h-8 w-8 min-[900px]:h-10 min-[900px]:w-10 items-center justify-center rounded-full min-[900px]:rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] ${
          open
            ? 'bg-white/[0.12] text-white'
            : highestSeverity === 'ERROR'
              ? 'text-red-400 hover:bg-red-500/10'
              : highestSeverity === 'WARNING'
                ? 'text-amber-300 hover:bg-amber-400/10'
                : highestSeverity === 'INFO'
                  ? 'text-neutral-300 hover:bg-white/[0.08]'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06]'
        }`}
      >
        {highestSeverity === 'ERROR' || highestSeverity === 'WARNING' ? (
          <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={1.85} />
        ) : highestSeverity === 'INFO' ? (
          <CheckCircle2 className="h-[18px] w-[18px] text-neutral-400" strokeWidth={1.8} />
        ) : (
          <CheckCircle2 className="h-[17px] w-[17px] text-[#A6FA4C]/75" strokeWidth={1.8} />
        )}

        {attentionCount > 0 && (
          <span
            data-testid="issue-center-badge"
            className={`absolute -top-0.5 -right-0.5 flex min-w-[16px] h-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-mono font-semibold leading-none ${
              highestSeverity === 'ERROR'
                ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                : 'bg-amber-400 text-black shadow-[0_0_8px_rgba(251,191,36,0.45)]'
            }`}
          >
            {attentionCount}
          </span>
        )}
        {attentionCount === 0 && totalActiveCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 min-[900px]:top-2 min-[900px]:right-2 h-1.5 w-1.5 rounded-full bg-sky-400/80"
          />
        )}
      </button>
    </>
  );
};

export const IssueCenterPanel: React.FC<IssueCenterPanelProps> = ({
  open,
  onClose,
  onAction,
  triggerRef,
}) => {
  const activeIssues = useDiagnosticStore((s) => s.activeIssues);
  const resolvedHistory = useDiagnosticStore((s) => s.resolvedHistory);
  const [historyOpen, setHistoryOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const errorCount = activeIssues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = activeIssues.filter((i) => i.severity === 'WARNING').length;
  const totalActiveCount = activeIssues.length;

  const highestSeverity: DiagnosticSeverity | 'HEALTHY' =
    errorCount > 0
      ? 'ERROR'
      : warningCount > 0
        ? 'WARNING'
        : totalActiveCount > 0
          ? 'INFO'
          : 'HEALTHY';

  // Close on Escape and outside click (without interfering with trigger toggle)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        triggerRef?.current?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const renderIssueCard = (issue: DiagnosticIssue) => {
    const style = getSeverityStyle(issue.severity);
    const SevIcon = style.icon;
    const ActionIcon = getActionIcon(issue.actionType);

    return (
      <div
        key={issue.id}
        data-testid={`diagnostic-issue-${issue.code}`}
        className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3 space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SevIcon className={`h-4 w-4 shrink-0 ${style.iconColor}`} strokeWidth={1.9} />
            <h3 className="text-[12.5px] font-medium text-[#F2F4F1] leading-snug">
              {issue.title}
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-mono tracking-wider uppercase ${style.badge}`}
          >
            {issue.severity}
          </span>
        </div>

        <p className="text-[11.5px] leading-relaxed text-[#9CA39F]">
          {issue.explanation}
        </p>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10.5px] text-[#6E7672]">
            {formatRelativeTime(issue.lastSeenAt)}
            {issue.occurrenceCount > 1 ? ` · ×${issue.occurrenceCount}` : ''}
          </span>
          {issue.actionType && issue.actionLabel && (
            <button
              type="button"
              onClick={() => onAction(issue.actionType!)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-[#F2F4F1] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
            >
              <ActionIcon className="h-3 w-3 text-[#A6FA4C]" strokeWidth={2} />
              <span>{issue.actionLabel}</span>
            </button>
          )}
        </div>

        <p className="text-[10.5px] text-[#7D8580] border-t border-white/[0.05] pt-1.5">
          Next: {issue.recommendedAction}
        </p>
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="System Diagnostics"
      data-testid="issue-center-popover"
      className="flex h-full w-full flex-col overflow-hidden bg-[#0E1012] text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              highestSeverity === 'ERROR'
                ? 'bg-red-400'
                : highestSeverity === 'WARNING'
                  ? 'bg-amber-300'
                  : 'bg-[#A6FA4C]'
            }`}
          />
          <h2 className="text-[13.5px] font-semibold text-[#F2F4F1] tracking-tight">
            System Diagnostics
          </h2>
          {totalActiveCount > 0 && (
            <span className="font-mono text-[10px] text-neutral-400 bg-white/[0.05] px-1.5 py-0.5 rounded-full">
              {totalActiveCount}
            </span>
          )}
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => {
            onClose();
            triggerRef?.current?.focus();
          }}
          aria-label="Close diagnostics"
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {activeIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <CheckCircle2 className="h-7 w-7 text-[#A6FA4C] mb-2" strokeWidth={1.7} />
            <p className="text-[13px] font-medium text-[#F2F4F1]">
              All systems healthy
            </p>
            <p className="mt-1 text-[11.5px] text-neutral-400 max-w-[240px]">
              WebGL eye rendering, camera pipeline, and room sync have no active issues.
            </p>
          </div>
        ) : (
          activeIssues.map(renderIssueCard)
        )}

        {/* Session-scoped Resolved History */}
        {resolvedHistory.length > 0 && (
          <div className="pt-1 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className="flex w-full items-center justify-between py-1.5 px-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 cursor-pointer"
            >
              <span>Resolved this session ({resolvedHistory.length})</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  historyOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {historyOpen && (
              <div className="mt-1.5 space-y-1.5">
                {resolvedHistory.slice(0, 8).map((item) => (
                  <div
                    key={`${item.id}-resolved`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] border border-white/[0.04] px-2.5 py-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#A6FA4C]/75" />
                      <span className="truncate text-neutral-300">{item.title}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-neutral-500">
                      {item.resolvedAt ? formatRelativeTime(item.resolvedAt) : 'Resolved'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
