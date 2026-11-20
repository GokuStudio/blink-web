import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/shared/components/layout/Navbar';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Smartphone, Monitor, ShieldAlert } from 'lucide-react';

/**
 * Mode 4: Device Pairing & Room Join Placeholder
 * Supports pairing phone as either Blink Device or Companion Insights.
 */
export const JoinPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(roomCode || 'BLINK-DEMO');

  return (
    <div className="min-h-screen bg-[#080A0C] flex flex-col text-white" data-testid="join-page">
      <Navbar />

      <main className="flex-1 max-w-md w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        <Card className="p-6 bg-[#171A1D] border border-[#272E36] space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Pair Your Phone</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Select which role this phone will serve in demo room
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-400 block mb-1">Room Pairing Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0E1114] border border-[#272E36] text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-[#9AEA3F]"
              placeholder="BLINK-XXXX"
            />
          </div>

          <div className="space-y-2.5 pt-2">
            <Button
              variant="cyan"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => navigate('/device')}
            >
              <Monitor className="w-4 h-4" />
              <span>Connect as Blink Device (Eyes Display)</span>
            </Button>

            <Button
              variant="primary"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => navigate('/insights')}
            >
              <Smartphone className="w-4 h-4" />
              <span>Connect as Companion Insights (Dashboard)</span>
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              W0 Architecture Check: Realtime Firebase pairing and token validation will be enabled in milestone W1.
            </span>
          </div>
        </Card>
      </main>
    </div>
  );
};
