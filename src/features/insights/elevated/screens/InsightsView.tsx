import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Timer,
  Eye,
  ArrowDownRight,
} from 'lucide-react';
import {
  INSIGHTS_DATASETS,
  type ComfortChoice,
  type TimeRangeId,
} from '../data/mockBlinkData';
import { ScrubbableRhythmChart } from '../components/ScrubbableRhythmChart';
import { PrecisionTickGauge } from '../components/PrecisionTickGauge';
import { blinkSound } from '../utils/soundEngine';
import type { RitualKind } from '../components/RestRitualOverlay';

interface InsightsViewProps {
  range: TimeRangeId;
  onRangeChange: (next: TimeRangeId) => void;
  comfort: ComfortChoice | null;
  onSelectComfort: (choice: ComfortChoice) => void;
  onStartRitual: (kind: RitualKind) => void;
  extraBreaks: number;
  mode?: 'LIVE' | 'DEMO' | 'OFFLINE';
  liveAvgRate?: number;
  liveSessionSeconds?: number;
  liveTotalBlinks?: number;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  range,
  onRangeChange,
  comfort,
  onSelectComfort,
  onStartRitual,
  extraBreaks,
  mode = 'DEMO',
  liveAvgRate,
  liveSessionSeconds,
  liveTotalBlinks,
}) => {
  const [sessionOpen, setSessionOpen] = useState(false);
  const dataset = INSIGHTS_DATASETS[range];
  const breaksDone = Math.min(
    dataset.breaksTarget,
    dataset.breaksCompleted + (range === 'today' ? extraBreaks : 0)
  );

  const effectiveAvgRate =
    range === 'today' && liveAvgRate !== undefined && liveAvgRate > 0
      ? liveAvgRate
      : dataset.avgRate;

  // Baseline vernier positions (scale 10 -> 22 blinks/min)
  const clampPct = (v: number) => Math.min(96, Math.max(4, ((v - 10) / 12) * 100));
  const currentPct = clampPct(effectiveAvgRate);
  const baselinePct = clampPct(dataset.baseline);

  const renderComfortFace = (id: ComfortChoice, selected: boolean) => {
    if (id === 'fresh') {
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.2" />
          <motion.circle
            cx="9"
            cy="9.8"
            r="1.1"
            fill="currentColor"
            stroke="none"
            animate={{ scaleY: selected ? [1, 0.15, 1] : 1 }}
            transition={{ duration: 0.28 }}
            style={{ transformOrigin: '9px 9.8px' }}
          />
          <motion.circle
            cx="15"
            cy="9.8"
            r="1.1"
            fill="currentColor"
            stroke="none"
            animate={{ scaleY: selected ? [1, 0.15, 1] : 1 }}
            transition={{ duration: 0.28 }}
            style={{ transformOrigin: '15px 9.8px' }}
          />
          <motion.path
            initial={false}
            d={selected ? 'M 8 14 Q 12 18.2 16 14' : 'M 8.5 14.3 Q 12 17.2 15.5 14.3'}
            animate={{ d: selected ? 'M 8 14 Q 12 18.2 16 14' : 'M 8.5 14.3 Q 12 17.2 15.5 14.3' }}
            transition={{ duration: 0.24 }}
          />
        </svg>
      );
    }
    if (id === 'tired') {
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.2" />
          <motion.path
            initial={false}
            d={selected ? 'M 7.6 10.4 Q 9.2 11.4 10.6 10.4' : 'M 7.8 10.2 L 10.4 10.2'}
            animate={{ d: selected ? 'M 7.6 10.4 Q 9.2 11.4 10.6 10.4' : 'M 7.8 10.2 L 10.4 10.2' }}
            transition={{ duration: 0.24 }}
          />
          <motion.path
            initial={false}
            d={selected ? 'M 13.4 10.4 Q 14.8 11.4 16.4 10.4' : 'M 13.6 10.2 L 16.2 10.2'}
            animate={{ d: selected ? 'M 13.4 10.4 Q 14.8 11.4 16.4 10.4' : 'M 13.6 10.2 L 16.2 10.2' }}
            transition={{ duration: 0.24 }}
          />
          <line x1="9" y1="15.4" x2="15" y2="15.4" />
        </svg>
      );
    }
    return (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <motion.path
          initial={false}
          d={selected ? 'M 7.8 9.2 L 10.6 10.6' : 'M 8.2 9.8 L 10.4 10.2'}
          animate={{ d: selected ? 'M 7.8 9.2 L 10.6 10.6' : 'M 8.2 9.8 L 10.4 10.2' }}
          transition={{ duration: 0.22 }}
        />
        <motion.path
          initial={false}
          d={selected ? 'M 16.2 9.2 L 13.4 10.6' : 'M 15.8 9.8 L 13.6 10.2'}
          animate={{ d: selected ? 'M 16.2 9.2 L 13.4 10.6' : 'M 15.8 9.8 L 13.6 10.2' }}
          transition={{ duration: 0.22 }}
        />
        <motion.path
          initial={false}
          d={selected ? 'M 8.4 16.4 Q 12 13.4 15.6 16.4' : 'M 8.8 16 Q 12 14 15.2 16'}
          animate={{ d: selected ? 'M 8.4 16.4 Q 12 13.4 15.6 16.4' : 'M 8.8 16 Q 12 14 15.2 16' }}
          transition={{ duration: 0.24 }}
        />
      </svg>
    );
  };

  const comfortItems: Array<{ id: ComfortChoice; label: string }> = [
    { id: 'fresh', label: 'Fresh' },
    { id: 'tired', label: 'Tired' },
    { id: 'strained', label: 'Strained' },
  ];

  return (
    <div className="px-5 pt-2 space-y-6">
      {/* Header + Tactile Morphing Timeframe Switcher */}
      <header>
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.025em] text-[#F3F5F2]">
            Eye Rhythm
          </h1>
          <span className="font-mono-num text-[10px] text-[#737B76]">
            {mode === 'LIVE'
              ? 'LIVE SESSION · REFERENCE HISTORY'
              : mode === 'OFFLINE'
                ? 'OFFLINE · REFERENCE HISTORY'
                : 'SIMULATED TELEMETRY'}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Timeframe"
          className="mt-4 grid grid-cols-3 rounded-full surface-well p-[3px]"
        >
          {(['today', '7d', '30d'] as TimeRangeId[]).map((id) => {
            const active = range === id;
            const label = INSIGHTS_DATASETS[id].label;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => {
                  if (!active) blinkSound.playTabTick();
                  onRangeChange(id);
                }}
                className="relative z-10 h-[34px] rounded-full text-[12px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
              >
                {active && (
                  <motion.span
                    layoutId="insightsRangePill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-full bg-[#A6FA4C] shadow-[0_0_16px_rgba(166,250,76,0.3)]"
                  />
                )}
                <span className={active ? 'text-[#0D1308] font-semibold' : 'text-[#98A09A]'}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 1. WHAT IS HAPPENING? — Architectural Numeral + Scrubbable Rhythm Waveform */}
      <section aria-label="Blink cadence overview" className="space-y-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={`${range}-${dataset.avgRate}`}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
                className="font-display text-[48px] font-bold leading-none tracking-[-0.035em] text-[#F4F6F3] tabular-nums"
              >
                {dataset.avgRate.toFixed(1)}
              </motion.span>
              <span className="text-[13px] text-[#8E9690]">blinks/min</span>
            </div>
            <p className="mt-1.5 text-[13px] text-[#98A09A]">
              {dataset.summaryHeadline}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#F0B45A]/12 border border-[#F0B45A]/22 px-2.5 py-1 font-mono-num text-[11px] font-medium text-[#F0B45A]">
            <ArrowDownRight className="h-3.5 w-3.5" />
            {dataset.deltaPercent}%
          </span>
        </div>

        <ScrubbableRhythmChart dataset={dataset} />
      </section>

      {/* 2. HOW DIFFERENT IS IT FROM USUAL? — Baseline Vernier + Weekly Small Multiple */}
      <section className="rounded-[24px] surface-instrument p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#F2F4F1]">
            Against your baseline
          </h2>
          <span className="font-mono-num text-[11px] text-[#8E9690]">
            30d avg {dataset.baseline.toFixed(1)}/m
          </span>
        </div>

        {/* Vernier Comparison Rail */}
        <div className="rounded-[16px] surface-well px-3.5 py-3.5">
          <div className="relative h-[22px] flex items-center">
            <div className="h-[4px] w-full rounded-full bg-[#242826]" />
            {/* Span between current and baseline */}
            <div
              className="absolute h-[4px] rounded-full bg-gradient-to-r from-[#F0B45A] to-[#A6FA4C]"
              style={{
                left: `${Math.min(currentPct, baselinePct)}%`,
                width: `${Math.max(4, Math.abs(baselinePct - currentPct))}%`,
              }}
            />
            {/* Baseline white reference pin */}
            <div
              className="absolute top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-full bg-[#F2F4F1]"
              style={{ left: `${baselinePct}%` }}
              title={`Baseline ${dataset.baseline}/min`}
            />
            {/* Current rate jewel dot */}
            <motion.div
              animate={{ left: `${currentPct}%` }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A6FA4C] ring-4 ring-[#A6FA4C]/20"
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono-num text-[10.5px]">
            <span className="text-[#A6FA4C]">{dataset.label}: {dataset.avgRate.toFixed(1)}/m</span>
            <span className="text-[#98A09A]">Usual: {dataset.baseline.toFixed(1)}/m</span>
          </div>
        </div>

        {/* Small-Multiple Daily/Weekly Rhythm Capsules on 7D & 30D */}
        {range !== 'today' && (
          <div className="pt-1">
            <div className="mb-2 flex items-center justify-between text-[11px] text-[#8C938E]">
              <span>Cadence distribution</span>
              <span className="font-mono-num">target 17</span>
            </div>
            <div
              className="grid gap-2 items-end h-[64px]"
              style={{ gridTemplateColumns: `repeat(${dataset.weeklyBars.length}, minmax(0, 1fr))` }}
            >
              {dataset.weeklyBars.map((b, i) => {
                const hPct = Math.min(100, Math.max(24, ((b.avg - 11) / 8) * 100));
                const healthy = b.avg >= 16;
                return (
                  <div key={`${b.day}-${i}`} className="flex h-full flex-col items-center justify-end gap-1.5">
                    <motion.div
                      initial={{ height: '18%' }}
                      animate={{ height: `${hPct}%` }}
                      transition={{ duration: 0.35, delay: i * 0.03 }}
                      className="w-full max-w-[22px] rounded-full"
                      style={{
                        backgroundColor: healthy ? '#A6FA4C' : '#F0B45A',
                        opacity: healthy ? 0.88 : 0.78,
                      }}
                    />
                    <span className="font-mono-num text-[10px] text-[#7F8782]">{b.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Break Adherence 5-Pip Track */}
        <div className="border-t border-white/[0.06] pt-3.5">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#DCE0DD]">Break adherence</span>
            <span className="font-mono-num text-[#A6FA4C]">
              {breaksDone} / {dataset.breaksTarget}
            </span>
          </div>
          <PrecisionTickGauge
            total={dataset.breaksTarget}
            activeCount={breaksDone}
            accentColor="#A6FA4C"
            height={12}
            ariaLabel={`${breaksDone} of ${dataset.breaksTarget} breaks completed`}
          />
          <p className="mt-2 text-[11px] text-[#7F8782]">{dataset.nextPause}</p>
        </div>

        {/* Progressive Disclosure: Session Behaviour Telemetry */}
        <div className="border-t border-white/[0.06] pt-2.5">
          <button
            type="button"
            onClick={() => setSessionOpen((v) => !v)}
            aria-expanded={sessionOpen}
            className="flex w-full items-center justify-between py-1 text-[12px] font-medium text-[#98A09A] hover:text-[#F2F4F1] cursor-pointer"
          >
            <span>Session telemetry</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                sessionOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <AnimatePresence initial={false}>
            {sessionOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <div className="rounded-[14px] surface-well p-3">
                    <div className="font-mono-num text-[16px] font-semibold text-[#F2F4F1]">
                      {dataset.maxOpenGaze}
                    </div>
                    <div className="mt-1 text-[10.5px] text-[#8C938E]">Max gaze</div>
                  </div>
                  <div className="rounded-[14px] surface-well p-3">
                    <div className="font-mono-num text-[16px] font-semibold text-[#F2F4F1]">
                      {range === 'today' && liveSessionSeconds !== undefined && liveSessionSeconds > 0
                        ? `${Math.floor(liveSessionSeconds / 60)}m ${liveSessionSeconds % 60}s`
                        : dataset.observedTime}
                    </div>
                    <div className="mt-1 text-[10.5px] text-[#8C938E]">Observed</div>
                  </div>
                  <div className="rounded-[14px] surface-well p-3">
                    <div className="font-mono-num text-[16px] font-semibold text-[#A6FA4C]">
                      {range === 'today' && liveTotalBlinks !== undefined && liveTotalBlinks > 0
                        ? `${liveTotalBlinks}`
                        : dataset.coverage}
                    </div>
                    <div className="mt-1 text-[10.5px] text-[#8C938E]">
                      {range === 'today' && liveTotalBlinks !== undefined && liveTotalBlinks > 0
                        ? 'Total Blinks'
                        : 'Coverage'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 3. WHY MIGHT IT MATTER? — Restrained Custom Optical Rhythm Illustration + Observation */}
      <section className="rounded-[24px] surface-instrument p-4">
        <div className="flex items-start gap-3.5">
          {/* Bespoke Geometric Blink Rhythm Illustration */}
          <div
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[16px] surface-well"
            aria-hidden="true"
          >
            <svg viewBox="0 0 48 48" className="h-[40px] w-[40px]">
              <path
                d="M 6 24 C 14 13, 34 13, 42 24 C 34 35, 14 35, 6 24 Z"
                fill="none"
                stroke="#A6FA4C"
                strokeWidth="1.6"
                opacity="0.85"
              />
              <path
                d="M 8 24 Q 16 17, 24 24 T 40 24"
                fill="none"
                stroke="#F0B45A"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="24" cy="24" r="3" fill="#A6FA4C" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-[#F2F4F1]">
              {dataset.patternTitle}
            </h2>
            <p className="mt-1 text-[12.2px] leading-[1.48] text-[#98A09A]">
              {dataset.patternBody}
            </p>
          </div>
        </div>
      </section>

      {/* 4. WHAT CAN I DO? — Comfort Check-in + Micro-Rituals */}
      <section className="space-y-3">
        <div className="rounded-[22px] surface-instrument p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#E4E8E5]">
              How do your eyes feel right now?
            </span>
            <span className="text-[10.5px] text-[#737B76]">Check-in</span>
          </div>

          <div
            role="radiogroup"
            aria-label="Eye comfort check-in"
            className="mt-3 grid grid-cols-3 gap-2"
          >
            {comfortItems.map((item) => {
              const selected = comfort === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectComfort(item.id)}
                  className={`press-tactile flex h-[64px] flex-col items-center justify-center gap-1.5 rounded-[16px] border cursor-pointer ${
                    selected
                      ? 'bg-[#A6FA4C]/14 border-[#A6FA4C]/45 text-[#A6FA4C]'
                      : 'surface-well text-[#98A09A] hover:text-[#F2F4F1]'
                  }`}
                >
                  {renderComfortFace(item.id, selected)}
                  <span className="text-[11.5px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              blinkSound.playWaveFlow();
              onStartRitual('horizon-20');
            }}
            className="btn-lime-tactile press-tactile flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[13px] font-semibold cursor-pointer"
          >
            <Timer className="h-4 w-4" strokeWidth={2.3} />
            20s Horizon Rest
          </button>
          <button
            type="button"
            onClick={() => {
              blinkSound.playWaveFlow();
              onStartRitual('gentle-blinks');
            }}
            className="surface-tactile press-tactile flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[13px] font-medium text-[#E4E8E5] cursor-pointer"
          >
            <Eye className="h-4 w-4 text-[#A6FA4C]" strokeWidth={2} />
            5 Gentle Blinks
          </button>
        </div>
      </section>
    </div>
  );
};
