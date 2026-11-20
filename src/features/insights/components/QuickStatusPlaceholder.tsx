import React from 'react';
import { Activity, ShieldCheck, Wifi } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { ConnectionStatus } from '@/shared/contracts';

interface QuickStatusProps {
  status: ConnectionStatus;
  blinkRate: number;
  healthScore: number;
}

export const QuickStatusPlaceholder: React.FC<QuickStatusProps> = ({
  status,
  blinkRate,
  healthScore,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {/* Device Connection */}
      <Card className="flex flex-col items-center text-center p-3 sm:p-4 bg-[#171A1D]">
        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-1">
          <Wifi className="w-3.5 h-3.5 text-[#35DFFF]" />
          <span>Status</span>
        </div>
        <Badge variant={status === 'connected' ? 'success' : 'neutral'} className="capitalize mt-1">
          {status}
        </Badge>
      </Card>

      {/* Blink Rate Monitor */}
      <Card className="flex flex-col items-center text-center p-3 sm:p-4 bg-[#171A1D]">
        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-1">
          <Activity className="w-3.5 h-3.5 text-[#9AEA3F]" />
          <span>Blinks / min</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
          {blinkRate}
        </div>
        <span className="text-[10px] text-neutral-500">Normal: 14-20</span>
      </Card>

      {/* Eye Health Score */}
      <Card className="flex flex-col items-center text-center p-3 sm:p-4 bg-[#171A1D]">
        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-1">
          <ShieldCheck className="w-3.5 h-3.5 text-[#9AEA3F]" />
          <span>Health Score</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-[#9AEA3F] tracking-tight mt-0.5">
          {healthScore}
        </div>
        <span className="text-[10px] text-neutral-500">Demo scale</span>
      </Card>
    </div>
  );
};
