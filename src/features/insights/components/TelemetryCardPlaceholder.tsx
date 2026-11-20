import React from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { BlinkExpressionType } from '@/shared/contracts';
import { BellRing, Sparkles } from 'lucide-react';

interface TelemetryCardProps {
  currentExpression: BlinkExpressionType;
  onExpressionSelect: (expr: BlinkExpressionType) => void;
  onTriggerNudge: () => void;
}

const EXPRESSIONS: { label: string; value: BlinkExpressionType }[] = [
  { label: 'Idle', value: 'idle' },
  { label: 'Happy', value: 'happy' },
  { label: 'Sleepy', value: 'sleepy' },
  { label: 'Alert', value: 'alert' },
  { label: 'Thinking', value: 'thinking' },
  { label: 'Listening', value: 'listening' },
];

export const TelemetryCardPlaceholder: React.FC<TelemetryCardProps> = ({
  currentExpression,
  onExpressionSelect,
  onTriggerNudge,
}) => {
  return (
    <div className="space-y-4">
      {/* Expression Command Controls */}
      <Card className="p-4 sm:p-5 bg-[#171A1D] border border-[#272E36]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#35DFFF]" />
            <h3 className="text-sm font-semibold text-white">Live Expression Controls</h3>
          </div>
          <span className="text-xs text-[#35DFFF] font-mono uppercase bg-[#35DFFF]/10 px-2 py-0.5 rounded">
            {currentExpression}
          </span>
        </div>
        <p className="text-xs text-neutral-400 mb-3">
          Select an expression to send an idempotent state command to the Blink Device in real time:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {EXPRESSIONS.map((item) => (
            <button
              key={item.value}
              onClick={() => onExpressionSelect(item.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentExpression === item.value
                  ? 'bg-[#35DFFF] text-black font-semibold shadow-md shadow-[#35DFFF]/20'
                  : 'bg-[#22262B] text-neutral-300 hover:text-white hover:bg-[#2A3036]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Nudge Demonstration Trigger */}
      <Card className="p-4 sm:p-5 bg-[#171A1D] border border-[#272E36] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#9AEA3F]" />
            <h4 className="text-sm font-semibold text-white">Interactive Nudge</h4>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Simulate a low-blink rate reminder alert.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onTriggerNudge}>
          Trigger Nudge
        </Button>
      </Card>
    </div>
  );
};
