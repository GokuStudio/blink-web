import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ArrowRight,
  WifiOff,
  Pause,
  Play,
} from 'lucide-react';
import { deriveBlinkZone } from '../data/mockBlinkData';
import { BlinkAperture } from '../components/BlinkAperture';
import { PrecisionTickGauge } from '../components/PrecisionTickGauge';
import { SwipeToRest } from '../components/SwipeToRest';
import type { RitualKind } from '../components/RestRitualOverlay';

interface HomeViewProps {
  blinkRate: number;
  onChangeBlinkRate: (next: number) => void;
  paused: boolean;
  onTogglePaused: (next: boolean) => void;
  connected: boolean;
  onReconnect: () => void;
  onStartRitual: (kind: RitualKind) => void;
  swipeTrackRef?: React.RefObject<HTMLDivElement>;
  onOpenInsights: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  hasUnread: boolean;
  breaksTaken: number;
  onShowToast: (msg: string) => void;
}

const BASELINE_RATE = 17;

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const HomeView: React.FC<HomeViewProps> = ({
  blinkRate,
  onChangeBlinkRate,
  paused,
  onTogglePaused,
  connected,
  onReconnect,
  onStartRitual,
  swipeTrackRef,
  onOpenInsights,
  onOpenSettings,
  onOpenNotifications,
  hasUnread,
  breaksTaken,
  onShowToast,
}) => {
  const [simTrayOpen, setSimTrayOpen] = useState(false);
  const [cadenceInfoOpen, setCadenceInfoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [bellRingKey, setBellRingKey] = useState(0);

  // Live session telemetry counters driven coherently by active blink rate
  const [sessionSeconds, setSessionSeconds] = useState(48 * 60 + 12);
  const [totalBlinks, setTotalBlinks] = useState(642);

  const isInactive = !connected || paused || blinkRate <= 0;
  const zone = deriveBlinkZone(blinkRate, paused, connected, BASELINE_RATE);

  useEffect(() => {
    if (isInactive) return;
    const timer = window.setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isInactive]);

  useEffect(() => {
    if (isInactive) return;
    const msPerBlink = Math.max(1800, Math.round(60000 / Math.max(1, blinkRate)));
    const timer = window.setInterval(() => {
      setTotalBlinks((b) => b + 1);
    }, msPerBlink);
    return () => window.clearInterval(timer);
  }, [blinkRate, isInactive]);

  const activeTicks = isInactive
    ? 0
    : Math.min(20, Math.max(1, Math.round((blinkRate / 25) * 20)));

  const deltaDiff = blinkRate - BASELINE_RATE;
  const deltaText = !connected
    ? 'Desk Node 01 not in range'
    : paused
      ? 'Optical observation paused'
      : deltaDiff === 0
        ? `Matched with your usual ${BASELINE_RATE}`
        : deltaDiff < 0
          ? `${Math.abs(deltaDiff)} below your usual ${BASELINE_RATE}`
          : `${deltaDiff} above your usual ${BASELINE_RATE}`;

  // Derived coherent telemetry values for the 6-card grid
  const avgRate = isInactive ? 0 : Number(((14.8 * 3 + blinkRate) / 4).toFixed(1));
  const closureMs = isInactive ? null : Math.round(165 + Math.max(0, 20 - blinkRate) * 2.5);
  const incompleteBlinks = isInactive ? 0 : blinkRate <= 14 ? 4 : 2;

  const handlePrimaryAction = () => {
    if (!connected) {
      onReconnect();
      onShowToast('Desk Node 01 reconnected (demo)');
      return;
    }
    if (paused) {
      onTogglePaused(false);
      onShowToast('Observation resumed (demo)');
      return;
    }
    onStartRitual('horizon-20');
  };

  const handleSecondaryAction = () => {
    if (!connected || paused) {
      onOpenSettings();
      return;
    }
    if (zone.id === 'healthy' || zone.id === 'brisk') {
      onOpenInsights();
      return;
    }
    onShowToast('Break cue snoozed for 10 min');
  };

  return (
    <div className="px-5 pt-2">
      {/* Calm Minimal Top Bar */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSimTrayOpen((v) => !v)}
          aria-expanded={simTrayOpen}
          className="surface-tactile press-tactile inline-flex h-[36px] items-center gap-2 rounded-full px-3 text-[11.5px] font-medium text-[#DCE0DD] cursor-pointer"
        >
          <span
            className="h-[7px] w-[7px] rounded-full transition-colors duration-300"
            style={{
              backgroundColor: zone.accentHex,
              boxShadow: !isInactive ? `0 0 8px ${zone.accentHex}` : 'none',
            }}
          />
          <span>Node 01</span>
          <span className="text-[#626A65]">·</span>
          <span
            className="transition-colors duration-300"
            style={{ color: isInactive ? '#98A09A' : zone.accentHex }}
          >
            {connected ? (paused ? 'Paused' : 'Active') : 'Offline'}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#7F8782] transition-transform duration-200 ${
              simTrayOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-mono-num rounded-full bg-white/[0.04] border border-white/[0.06] px-2 py-[4px] text-[9.5px] tracking-[0.06em] text-[#7E8681]">
            DEMO
          </span>
          <button
            type="button"
            onClick={() => {
              setBellRingKey((k) => k + 1);
              onOpenNotifications();
            }}
            aria-label={hasUnread ? 'Notifications (unread)' : 'Notifications'}
            className="surface-tactile press-tactile relative flex h-[38px] w-[38px] items-center justify-center rounded-full text-[#DCE0DD] cursor-pointer"
          >
            {/* Damped pendulum notification bell + swinging clapper */}
            <motion.svg
              key={bellRingKey}
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={bellRingKey > 0 ? { rotate: 0 } : false}
              animate={bellRingKey > 0 ? { rotate: [0, -14, 11, -6, 3, 0] } : undefined}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              style={{ transformOrigin: '12px 3px' }}
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <motion.path
                d="M13.73 21a2 2 0 0 1-3.46 0"
                animate={bellRingKey > 0 ? { x: [0, 1.8, -1.5, 0.8, 0] } : undefined}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
            </motion.svg>
            {hasUnread && (
              <span className="absolute top-[8px] right-[9px] h-[7px] w-[7px] rounded-full bg-[#A6FA4C] shadow-[0_0_8px_rgba(166,250,76,0.8)]" />
            )}
          </button>
        </div>
      </header>

      {/* Progressive Disclosure: Live Blink Rate Simulator (Color adapts automatically from count) */}
      <AnimatePresence initial={false}>
        {simTrayOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-[18px] surface-well p-3.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#98A09A]">Simulate live blink count</span>
                <span
                  className="font-mono-num font-semibold"
                  style={{ color: zone.accentHex }}
                >
                  {paused ? 'Paused' : `${blinkRate} /min · ${zone.shortLabel}`}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={25}
                  value={blinkRate}
                  disabled={!connected}
                  onChange={(e) => {
                    if (paused) onTogglePaused(false);
                    onChangeBlinkRate(Number(e.target.value));
                  }}
                  aria-label="Simulate live blink rate"
                  className="w-full accent-[#A6FA4C] cursor-pointer"
                />
                {connected ? (
                  <button
                    type="button"
                    onClick={() => onTogglePaused(!paused)}
                    className="surface-tactile press-tactile inline-flex h-[30px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-medium text-[#DCE0DD] cursor-pointer"
                  >
                    {paused ? <Play className="h-3 w-3 text-[#A6FA4C]" /> : <Pause className="h-3 w-3" />}
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onReconnect();
                      onShowToast('Desk Node 01 reconnected');
                    }}
                    className="surface-tactile press-tactile inline-flex h-[30px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-medium text-[#A6FA4C] cursor-pointer"
                  >
                    Reconnect
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between font-mono-num text-[9.5px] text-[#6B736E]">
                <span>1–9 Coral</span>
                <span>10–14 Amber</span>
                <span>15–20 Lime</span>
                <span>21+ Mint</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3-Second Focal Hero: Subtle 5-Segment Circular Gauge + Centered Count */}
      <section className="mt-4 flex flex-col items-center text-center">
        <BlinkAperture
          blinkRate={blinkRate}
          paused={paused}
          connected={connected}
          baseline={BASELINE_RATE}
          zone={zone}
          expanded={cadenceInfoOpen}
          onTap={() => {
            if (!connected) {
              onReconnect();
              onShowToast('Desk Node 01 reconnected');
              return;
            }
            setCadenceInfoOpen((open) => !open);
          }}
        />

        {/* Immediate Personal Comparison Pill */}
        <button
          type="button"
          onClick={() => setCadenceInfoOpen((open) => !open)}
          aria-expanded={cadenceInfoOpen}
          className="press-tactile mt-1 inline-flex items-center gap-2 rounded-full bg-white/[0.035] border border-white/[0.06] px-3.5 py-1.5 text-[11.5px] text-[#AEB6B0] hover:border-white/[0.12] cursor-pointer"
        >
          {!connected ? (
            <WifiOff className="h-3.5 w-3.5 text-[#8C938E]" />
          ) : paused ? (
            <Pause className="h-3.5 w-3.5 text-[#8C938E]" />
          ) : (
            <span
              className="h-[6px] w-[6px] rounded-full transition-colors duration-300"
              style={{ backgroundColor: zone.accentHex }}
            />
          )}
          <span className="tabular-nums">{deltaText}</span>
        </button>

        {/* Controlled Touch Expansion: Concise Cadence & Personal Baseline Breakdown */}
        <AnimatePresence initial={false}>
          {cadenceInfoOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="w-full overflow-hidden"
            >
              <div className="mt-3 rounded-[18px] surface-well px-4 py-3 text-left">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-[#E4E8E5]">
                    {isInactive ? zone.shortLabel : `${blinkRate} /min · ${zone.shortLabel}`}
                  </span>
                  <span
                    className="font-mono-num text-[10.5px]"
                    style={{ color: zone.accentHex }}
                  >
                    Scale 0–25 /min
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-[1.45] text-[#8E9690]">
                  The 3 arcs span 0–25 blinks/min and shift color automatically
                  with your live blink count. Your{' '}
                  <span className="font-num text-[#DCE0DD]">{BASELINE_RATE} /min</span>{' '}
                  personal baseline is a self-referenced habit benchmark, not a
                  medical threshold.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expressive Headline + Quiet Supporting Guidance */}
        <motion.div
          key={zone.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-[300px]"
        >
          <h1 className="font-display text-[24px] font-semibold leading-[1.18] tracking-[-0.025em] text-[#F3F5F2]">
            {zone.headline}
          </h1>
          <p className="mt-2 text-[13px] leading-[1.45] text-[#8E9690]">
            {zone.guidance}
          </p>
        </motion.div>

        {/* Tactile Swipe-to-Rest Control */}
        <div className="mt-6 w-full">
          <SwipeToRest
            trackRef={swipeTrackRef}
            label={
              !connected
                ? 'Swipe to reconnect Node 01'
                : paused
                  ? 'Swipe to resume observation'
                  : 'Swipe to rest · 20s'
            }
            mode={!connected ? 'reconnect' : paused ? 'resume' : 'rest'}
            secondaryLabel={zone.ctaSecondary}
            onComplete={handlePrimaryAction}
            onSecondaryAction={handleSecondaryAction}
          />
        </div>
      </section>

      {/* Recessed Temporal Rhythm Instrument */}
      <section className="mt-7 rounded-[24px] surface-instrument p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[12px] font-medium text-[#C8CFCB]">
              Session rhythm
            </span>
            <p className="font-mono-num mt-0.5 text-[10.5px] text-[#737B76]">
              {!connected
                ? 'Last sync 14m ago'
                : paused
                  ? 'Paused · 48m observed'
                  : '48m observed · Last break 32m ago'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="press-tactile inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#98A09A] hover:text-[#F2F4F1] cursor-pointer"
          >
            {detailsOpen ? 'Less' : 'Details'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                detailsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        <div className="mt-3.5 rounded-[16px] surface-well px-3.5 py-3">
          <PrecisionTickGauge
            total={20}
            activeCount={activeTicks}
            markerIndex={13}
            accentColor={isInactive ? '#6D7670' : zone.accentHex}
            height={20}
            ariaLabel="Blink cadence relative to personal baseline"
          />
          <div className="mt-2 flex items-center justify-between font-mono-num text-[10px] text-[#737B76]">
            <span>Low</span>
            <span className="text-[#C8CFCB]">Baseline {BASELINE_RATE}/m</span>
            <span>25</span>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3.5 text-center">
                <div className="rounded-[14px] bg-white/[0.025] py-2.5 px-2">
                  <div className="font-mono-num text-[15px] font-semibold text-[#F2F4F1]">
                    {avgRate > 0 ? avgRate.toFixed(1) : '—'}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#7F8782]">Avg /min</div>
                </div>
                <div className="rounded-[14px] bg-white/[0.025] py-2.5 px-2">
                  <div className="font-mono-num text-[15px] font-semibold text-[#A6FA4C]">
                    {breaksTaken}/3
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#7F8782]">Breaks</div>
                </div>
                <div className="rounded-[14px] bg-white/[0.025] py-2.5 px-2">
                  <div className="font-mono-num text-[15px] font-semibold text-[#F2F4F1]">
                    96%
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#7F8782]">Coverage</div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenInsights}
                className="press-tactile mt-3 flex h-[44px] w-full items-center justify-between rounded-[14px] bg-white/[0.04] border border-white/[0.06] px-3.5 text-[12.5px] font-medium text-[#E4E8E5] hover:bg-white/[0.07] cursor-pointer"
              >
                <span>Explore full rhythm story</span>
                <ArrowRight className="h-4 w-4 text-[#A6FA4C]" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Live Telemetry Grid below Session Rhythm (adapted from reference metrics) */}
      <section aria-label="Session blink metrics" className="mt-4">
        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. Monitoring Time */}
          <div className="rounded-[20px] surface-instrument p-4">
            <div className="text-[12px] font-medium text-[#98A09A]">
              Monitoring Time
            </div>
            <div className="font-mono-num mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#F3F5F2]">
              {isInactive ? '00:00' : formatClock(sessionSeconds)}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7F8782]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: isInactive ? '#6D7670' : zone.accentHex }}
              />
              <span>{isInactive ? 'Idle' : 'Active'}</span>
            </div>
          </div>

          {/* 2. Total Blinks */}
          <div className="rounded-[20px] surface-instrument p-4">
            <div className="text-[12px] font-medium text-[#98A09A]">
              Total Blinks
            </div>
            <div className="font-mono-num mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#F3F5F2]">
              {isInactive ? '0' : totalBlinks.toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] text-[#7F8782]">
              Current session
            </div>
          </div>

          {/* 3. Blinks / Min */}
          <div className="rounded-[20px] surface-instrument p-4">
            <div className="text-[12px] font-medium text-[#98A09A]">
              Blinks / Min
            </div>
            <div
              className="font-mono-num mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] transition-colors duration-300"
              style={{ color: isInactive ? '#8C938E' : zone.accentHex }}
            >
              {isInactive ? '0' : blinkRate}
            </div>
            <div className="mt-2 text-[11px] text-[#7F8782]">Rolling 60s</div>
          </div>

          {/* 4. Average Rate */}
          <div className="rounded-[20px] surface-instrument p-4">
            <div className="text-[12px] font-medium text-[#98A09A]">
              Average Rate
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-mono-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#F3F5F2]">
                {isInactive ? '0' : avgRate.toFixed(1)}
              </span>
              <span className="text-[11px] text-[#7F8782]">/min</span>
            </div>
            <div className="mt-2 text-[11px] text-[#7F8782]">
              Target ~{BASELINE_RATE}/min
            </div>
          </div>

          {/* 5. Closure Duration */}
          <div className="rounded-[20px] surface-instrument p-4">
            <div className="text-[12px] font-medium text-[#98A09A]">
              Closure Duration
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-mono-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#F3F5F2]">
                {closureMs !== null ? closureMs : '—'}
              </span>
              {closureMs !== null && (
                <span className="text-[11px] text-[#7F8782]">ms</span>
              )}
            </div>
            <div className="mt-2 text-[11px] text-[#7F8782]">
              Avg: {closureMs !== null ? '190 ms' : '—'}
            </div>
          </div>

          {/* 6. Incomplete Blinks + Live Monitor CTA */}
          <button
            type="button"
            onClick={onOpenInsights}
            className="press-tactile rounded-[20px] surface-instrument p-4 text-left hover:border-white/[0.12] cursor-pointer"
          >
            <div className="text-[12px] font-medium text-[#98A09A]">
              Incomplete Blinks
            </div>
            <div className="font-mono-num mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#F3F5F2]">
              {incompleteBlinks}
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#A6FA4C]">
              <span>Live Monitor</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};
