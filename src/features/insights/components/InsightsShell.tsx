import React from 'react';
import { QuickStatusPlaceholder } from './QuickStatusPlaceholder';
import { TelemetryCardPlaceholder } from './TelemetryCardPlaceholder';
import { useInsightsStore } from '../state';
import { useDeviceStore } from '@/features/blink-device';
import { Badge } from '@/shared/components/ui/Badge';
import { AlertCircle } from 'lucide-react';

interface InsightsShellProps {
  className?: string;
  isStandaloneMobile?: boolean;
}

export const InsightsShell: React.FC<InsightsShellProps> = ({
  className = '',
  isStandaloneMobile = false,
}) => {
  const { status, blinkRate, healthScore, activeAlert, triggerNudgeAlert } = useInsightsStore();
  const { expression, setExpression } = useDeviceStore();

  const handleNudge = () => {
    triggerNudgeAlert('Low blink rate detected (10 blinks/min). Blink now to refresh eyes.');
    setExpression('nudging');
    setTimeout(() => {
      setExpression('idle');
    }, 3000);
  };

  return (
    <div
      className={`w-full max-w-md mx-auto flex flex-col gap-4 p-4 sm:p-6 bg-[#0E1114] rounded-3xl border border-[#272E36] text-white shadow-2xl ${className}`}
      data-testid="insights-shell"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#272E36]/60">
        <div>
          <h2 className="text-base font-bold text-white tracking-wide">BLINK INSIGHTS</h2>
          <p className="text-xs text-neutral-400">Eye-Health Monitoring & Companion</p>
        </div>
        <Badge variant="success">LIVE COMPANION</Badge>
      </div>

      {/* Active Nudge Notification Banner */}
      {activeAlert && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#9AEA3F]/15 border border-[#9AEA3F]/30 text-[#9AEA3F] text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{activeAlert}</span>
        </div>
      )}

      {/* Quick Status Cards */}
      <QuickStatusPlaceholder status={status} blinkRate={blinkRate} healthScore={healthScore} />

      {/* Telemetry & Controls */}
      <TelemetryCardPlaceholder
        currentExpression={expression}
        onExpressionSelect={setExpression}
        onTriggerNudge={handleNudge}
      />

      {/* Mobile Guidance Footer */}
      {isStandaloneMobile && (
        <div className="mt-auto pt-4 text-center text-xs text-neutral-500">
          Tip: Add to home screen for standalone PWA experience.
        </div>
      )}
    </div>
  );
};
