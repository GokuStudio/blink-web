import React, { useState } from 'react';
import { DeviceShell } from '@/features/blink-device';
import { InsightsShell } from '@/features/insights';
import { Navbar } from '@/shared/components/layout/Navbar';
import { Sliders, RefreshCw, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DemoPage: React.FC = () => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="min-h-screen bg-[#080A0C] flex flex-col text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Blink Integrated Demonstration
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
              Unified presentation mode combining the physical hardware shell with the companion dashboard.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/device"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#171A1D] border border-[#272E36] hover:bg-[#22262B] transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#35DFFF]" />
              <span>Launch Phone Device</span>
            </Link>
            <Link
              to="/insights"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#171A1D] border border-[#272E36] hover:bg-[#22262B] transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#9AEA3F]" />
              <span>Launch Phone Companion</span>
            </Link>
          </div>
        </div>

        {/* Two-Panel Desktop Integrated Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Panel: Blink Physical Companion Device (Bezel + Eyes) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center p-4 sm:p-8 rounded-3xl bg-[#0E1114] border border-[#272E36]">
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-xs font-mono tracking-wider text-neutral-400 uppercase">
                HARDWARE EMULATION — LAYER 1-3
              </span>
              <span className="text-xs font-medium text-[#35DFFF] bg-[#35DFFF]/10 px-2 py-0.5 rounded border border-[#35DFFF]/20">
                CYAN EYE ENGINE
              </span>
            </div>

            <DeviceShell mode="desktop-integrated" />

            <div className="w-full text-center mt-4 text-xs text-neutral-500">
              WebGL Eyes Canvas rendered beneath transparent physical bezel asset.
            </div>
          </div>

          {/* Right Panel: Blink Companion Insights Dashboard */}
          <div className="lg:col-span-5 flex justify-center">
            <InsightsShell className="w-full" />
          </div>
        </div>
      </main>

      {/* Floating Configuration Button & Drawer */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-12 h-12 rounded-full bg-[#171A1D] border border-[#272E36] text-[#9AEA3F] hover:bg-[#22262B] shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Demo Configuration"
        >
          <Sliders className="w-5 h-5" />
        </button>

        {showConfig && (
          <div className="absolute bottom-16 right-0 w-72 p-4 rounded-2xl bg-[#171A1D] border border-[#272E36] shadow-2xl text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between font-semibold text-white">
              <span>Demo Controls</span>
              <button
                onClick={() => setShowConfig(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-neutral-400">
              Phase W0 Foundation mode. Room code: <span className="font-mono text-[#9AEA3F]">BLINK-DEMO</span>
            </p>
            <div className="pt-2 border-t border-[#272E36]">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Demo State
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
