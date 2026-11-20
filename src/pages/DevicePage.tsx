import React, { useEffect, useState } from 'react';
import { DeviceShell } from '@/features/blink-device';
import { useDeviceStore } from '@/features/blink-device';
import { BlinkExpressionType } from '@/shared/contracts';
import { useFullscreen } from '@/shared/hooks/useFullscreen';
import { Maximize2, Minimize2, ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

/**
 * Mode 2: Blink Device
 * Standalone phone screen in landscape orientation.
 * Pure black fullscreen display, only glowing cyan eyes visible.
 * Bezel is completely hidden.
 */
export const DevicePage: React.FC = () => {
  const { expression: storeExpr, setExpression, triggerBlink } = useDeviceStore();
  const [searchParams] = useSearchParams();
  const exprParam = searchParams.get('expr') as BlinkExpressionType | null;
  const expression = exprParam || storeExpr;
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [showHud, setShowHud] = useState(true);

  // Auto-hide controls after 3 seconds for clean presentation
  useEffect(() => {
    const timer = setTimeout(() => setShowHud(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none"
      onClick={() => setShowHud(true)}
      data-testid="device-page"
    >
      {/* Standalone Device Shell (WebGL Eyes only, no bezel) */}
      <DeviceShell mode="standalone-device" expression={expression} className="w-full h-full" />

      {/* Floating HUD Controls for mobile demo operator */}
      {showHud && (
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50 pointer-events-auto transition-opacity">
          <Link
            to="/demo"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-neutral-300 text-xs hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to Demo</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerBlink();
              }}
              className="px-3 py-1.5 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-[#35DFFF] text-xs hover:bg-[#22262B]"
            >
              Trigger Blink
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-white text-xs hover:bg-[#22262B]"
            >
              <RefreshCw className="w-3 h-3 text-[#35DFFF]" />
              <span>Expr: {expression}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="p-2 rounded-full bg-[#171A1D]/80 backdrop-blur-md border border-[#272E36] text-white hover:bg-[#22262B]"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
