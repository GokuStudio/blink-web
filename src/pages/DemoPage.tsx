import React, { useState } from 'react';
import { DeviceShell, EyeTrackingDevPanel, usePersonalityStore } from '@/features/blink-device';
import { useDeviceStore } from '@/features/blink-device/state';
import { BlinkExpressionType } from '@/shared/contracts';
import { InsightsShell } from '@/features/insights';
import { Navbar } from '@/shared/components/layout/Navbar';
import { Sliders, RefreshCw, Smartphone, Sparkles, Activity } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

export const DemoPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [showConfig, setShowConfig] = useState(() => searchParams.get('config') === '1');
  const [configTab, setConfigTab] = useState<'controls' | 'tracking'>(() =>
    searchParams.get('tab') === 'tracking' ? 'tracking' : 'controls'
  );
  const {
    expression: storeExpr,
    setExpression,
    triggerBlink,
    triggerWink,
    triggerNudge,
    materialParams,
    setMaterialParam,
    resetMaterialParams,
  } = useDeviceStore();
  const exprParam = searchParams.get('expr') as BlinkExpressionType | null;
  const expression = exprParam || storeExpr;

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

            <DeviceShell mode="desktop-integrated" expression={expression} />

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
          <div className="absolute bottom-16 right-0 w-88 sm:w-96 max-h-[85vh] overflow-y-auto p-4 rounded-2xl bg-[#171A1D] border border-[#272E36] shadow-2xl text-xs space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between font-semibold text-white">
              <div className="flex items-center gap-1 bg-[#0E1114] p-1 rounded-xl border border-[#272E36]">
                <button
                  onClick={() => setConfigTab('controls')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    configTab === 'controls'
                      ? 'bg-[#35DFFF] text-black font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Expressions</span>
                </button>
                <button
                  onClick={() => setConfigTab('tracking')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    configTab === 'tracking'
                      ? 'bg-[#35DFFF] text-black font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Eye Tracking</span>
                </button>
              </div>
              <button
                onClick={() => setShowConfig(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {configTab === 'tracking' ? (
              <EyeTrackingDevPanel />
            ) : (
              <>
                <p className="text-neutral-400">
                  Active Expression: <span className="font-mono text-[#35DFFF] font-bold">{expression}</span>
                </p>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Primary Expressions</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['idle', 'happy', 'sleepy', 'alert', 'thinking', 'listening'] as BlinkExpressionType[]).map((expr) => (
                      <button
                        key={expr}
                        onClick={() => {
                          setExpression(expr);
                          usePersonalityStore.getState().onUserExpression(expr);
                        }}
                        className={`py-1.5 px-2 rounded-lg font-medium text-center capitalize transition-colors ${
                          expression === expr
                            ? 'bg-[#35DFFF] text-black font-semibold'
                            : 'bg-[#22262B] text-neutral-300 hover:bg-[#2A3036] hover:text-white'
                        }`}
                      >
                        {expr}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-[#272E36]">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Choreography & Actions</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => triggerBlink()}
                      className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#35DFFF] font-medium text-center"
                    >
                      Natural Blink
                    </button>
                    <button
                      onClick={() => triggerBlink({ isDouble: true })}
                      className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#35DFFF] font-medium text-center"
                    >
                      Double Blink
                    </button>
                    <button
                      onClick={() => triggerWink('left')}
                      className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 font-medium text-center"
                    >
                      Wink Left
                    </button>
                    <button
                      onClick={() => triggerWink('right')}
                      className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 font-medium text-center"
                    >
                      Wink Right
                    </button>
                    <button
                      onClick={() => triggerNudge()}
                      className="col-span-2 py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#FF5449] font-medium text-center"
                    >
                      Trigger Nudge
                    </button>
                  </div>
                </div>

                {/* Development Material Tuning Controls (Refinement 03) */}
                <div className="space-y-2 pt-2 border-t border-[#272E36]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                      Optical Material Controls
                    </span>
                    <button
                      onClick={() => resetMaterialParams()}
                      className="text-[10px] text-[#35DFFF] hover:underline"
                    >
                      Reset Defaults
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                        <span>Inner Emission</span>
                        <span className="font-mono text-white">{materialParams.innerEmission.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={materialParams.innerEmission}
                        onChange={(e) => setMaterialParam('innerEmission', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#22262B] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                        <span>Rim Diffusion</span>
                        <span className="font-mono text-white">{materialParams.rimDiffusion.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={materialParams.rimDiffusion}
                        onChange={(e) => setMaterialParam('rimDiffusion', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#22262B] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                        <span>Outer Halo</span>
                        <span className="font-mono text-white">{materialParams.outerHalo.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.4"
                        max="1.6"
                        step="0.05"
                        value={materialParams.outerHalo}
                        onChange={(e) => setMaterialParam('outerHalo', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#22262B] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                        <span>Texture Contrast</span>
                        <span className="font-mono text-white">{materialParams.textureContrast.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={materialParams.textureContrast}
                        onChange={(e) => setMaterialParam('textureContrast', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#22262B] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-neutral-400 mb-0.5">
                        <span>Substrate Depth</span>
                        <span className="font-mono text-white">{materialParams.depthVariation.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={materialParams.depthVariation}
                        onChange={(e) => setMaterialParam('depthVariation', parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#22262B] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#272E36]">
                  <button
                    onClick={() => {
                      setExpression('idle');
                      resetMaterialParams();
                      window.location.reload();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset Demo State
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
