import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  Power,
  LogOut,
  Eye,
} from 'lucide-react';
import { DeskNodeVisual } from '../components/DeskNodeVisual';
import { PortalSheet } from '../components/PortalSheet';
import { blinkSound } from '../utils/soundEngine';

interface SettingsViewProps {
  deviceConnected: boolean;
  onToggleDeviceConnected: (next: boolean) => void;
  soundEnabled: boolean;
  onToggleSound: (next: boolean) => void;
  onShowToast: (msg: string) => void;
  roomCode?: string;
  mode?: 'LIVE' | 'DEMO' | 'OFFLINE';
  monitoringMode?: string;
  isStale?: boolean;
  onSwitchRoom?: (newRoom: string) => void;
}

const SENSITIVITY = ['Gentle', 'Adaptive', 'High'] as const;
const QUIET_WINDOWS = ['12:30 – 1:30 PM', '2:00 – 3:00 PM', '6:00 PM – 8:00 AM'] as const;
const VOICES = ['Warm · EN (US)', 'Calm Studio · EN', 'Minimal · EN'] as const;

const PhysicalToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-[28px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] ${
      checked ? 'bg-[#A6FA4C]' : 'bg-[#262B28]'
    }`}
  >
    <motion.span
      layout
      whileTap={{ scaleX: 1.18, scaleY: 0.94 }}
      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      className={`block h-[22px] w-[22px] rounded-full shadow-sm ${
        checked ? 'ml-auto bg-[#0E1409]' : 'mr-auto bg-[#8E9690]'
      }`}
    />
  </button>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  deviceConnected,
  onToggleDeviceConnected,
  soundEnabled,
  onToggleSound,
  onShowToast,
  roomCode = 'BLINK-DEMO',
  mode = 'DEMO',
  monitoringMode = 'active',
  isStale = false,
  onSwitchRoom,
}) => {
  const [calibrating, setCalibrating] = useState(false);
  const [sensitivity, setSensitivity] = useState<(typeof SENSITIVITY)[number]>('Adaptive');
  const [remindersOn, setRemindersOn] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [quietIdx, setQuietIdx] = useState(0);
  const [voiceIdx, setVoiceIdx] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disconnect' | 'signout' | null>(null);
  const calibrationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!deviceConnected && calibrating) {
      if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current);
      setCalibrating(false);
    }
  }, [deviceConnected, calibrating]);

  const runCalibration = () => {
    if (!deviceConnected) {
      onShowToast('Reconnect Desk Node 01 to calibrate');
      return;
    }
    if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current);
    setCalibrating(true);
    onShowToast('Optical gaze calibration running (demo)…');
    calibrationTimerRef.current = window.setTimeout(() => {
      setCalibrating(false);
      onShowToast('Gaze baseline confirmed at 17.0 /min');
    }, 2400);
  };

  return (
    <div className="px-5 pt-2 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.025em] text-[#F3F5F2]">
            Desk Node
          </h1>
          <p className="text-[12px] text-[#7F8782]">
            Hardware companion, rhythm &amp; controls
          </p>
        </div>
        <span className="font-mono-num text-[11px] text-[#8E9690]">Sam · SA</span>
      </header>

      {/* Interactive Physical Hardware Control Card */}
      <section className="rounded-[26px] surface-instrument px-5 pt-6 pb-5">
        <div className="flex flex-col items-center text-center">
          <DeskNodeVisual
            connected={deviceConnected}
            calibrating={calibrating}
            batteryPercent={86}
          />

          <div className="mt-4 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 py-1">
              <span
                className={`h-[7px] w-[7px] rounded-full ${
                  deviceConnected && mode !== 'OFFLINE'
                    ? 'bg-[#A6FA4C] shadow-[0_0_8px_rgba(166,250,76,0.75)]'
                    : 'bg-[#7A827D]'
                }`}
              />
              <span className="font-mono-num text-[10.5px] uppercase tracking-[0.07em] text-[#B0B8B2]">
                {calibrating
                  ? 'Calibrating…'
                  : deviceConnected && mode !== 'OFFLINE'
                    ? `${mode} · Connected`
                    : 'Disconnected'}
              </span>
            </div>

            <h2 className="mt-2.5 font-display text-[19px] font-semibold tracking-[-0.015em] text-[#F2F4F1]">
              Blink Desk Node 01
            </h2>
            <p className="font-mono-num mt-0.5 text-[11.5px] text-[#7F8782]">
              Room: {roomCode} · Mode: {mode} {isStale ? '(Stale)' : ''} · Status: {monitoringMode}
            </p>
            {onSwitchRoom && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = prompt('Enter Room Code', roomCode);
                    if (next && next.trim()) onSwitchRoom(next.trim());
                  }}
                  className="press-tactile text-[11px] font-mono text-[#A6FA4C] hover:underline"
                >
                  [Change Room]
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={runCalibration}
            disabled={calibrating}
            className="surface-tactile press-tactile flex h-[42px] items-center justify-center gap-1.5 rounded-[14px] text-[12.5px] font-medium text-[#E4E8E5] disabled:opacity-50 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5 text-[#A6FA4C]" />
            {calibrating ? 'Scanning…' : 'Calibrate Gaze'}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !deviceConnected;
              onToggleDeviceConnected(next);
              onShowToast(
                next ? 'Desk Node 01 connected (demo)' : 'Desk Node 01 set offline (demo)'
              );
            }}
            className="surface-tactile press-tactile flex h-[42px] items-center justify-center gap-1.5 rounded-[14px] text-[12.5px] font-medium text-[#E4E8E5] cursor-pointer"
          >
            <Power
              className={`h-3.5 w-3.5 ${deviceConnected ? 'text-[#E87461]' : 'text-[#A6FA4C]'}`}
            />
            {deviceConnected ? 'Set Offline' : 'Reconnect'}
          </button>
        </div>
      </section>

      {/* Tracking Sensitivity & Personal Baseline */}
      <section className="rounded-[24px] surface-instrument p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-[#F2F4F1]">
              Tracking sensitivity
            </span>
            <span className="font-mono-num text-[11px] text-[#A6FA4C]">{sensitivity}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 rounded-full surface-well p-[3px]">
            {SENSITIVITY.map((opt) => {
              const active = opt === sensitivity;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (opt !== sensitivity) blinkSound.playTabTick();
                    setSensitivity(opt);
                    onShowToast(`Sensitivity: ${opt}`);
                  }}
                  className="relative z-10 h-[32px] rounded-full text-[11.5px] font-medium cursor-pointer"
                >
                  {active && (
                    <motion.span
                      layoutId="sensitivityPill"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 -z-10 rounded-full bg-[#262B28] border border-white/[0.08]"
                    />
                  )}
                  <span className={active ? 'text-[#F2F4F1]' : 'text-[#8C938E]'}>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
          <div>
            <div className="text-[13.5px] font-medium text-[#F2F4F1]">
              Personal baseline
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-[22px] font-bold text-[#A6FA4C] tabular-nums">
                17.0
              </span>
              <span className="text-[11.5px] text-[#8E9690]">blinks/min</span>
            </div>
          </div>
          <button
            type="button"
            onClick={runCalibration}
            className="surface-tactile press-tactile inline-flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium text-[#A6FA4C] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${calibrating ? 'animate-spin' : ''}`} />
            Recalibrate
          </button>
        </div>
      </section>

      {/* Wellness, Breaks & Voice */}
      <section className="rounded-[24px] surface-instrument px-4 divide-y divide-white/[0.05]">
        <div className="flex items-center justify-between py-3.5">
          <div>
            <div className="text-[13.5px] font-medium text-[#F2F4F1]">
              20-20-20 break cues
            </div>
            <div className="text-[11px] text-[#7F8782]">Gentle nudge during long focus</div>
          </div>
          <PhysicalToggle
            checked={remindersOn}
            onChange={(v) => {
              blinkSound.playToggle(v);
              setRemindersOn(v);
              onShowToast(`Break cues ${v ? 'enabled' : 'muted'}`);
            }}
            ariaLabel="Toggle 20-20-20 break cues"
          />
        </div>

        <div className="flex items-center justify-between py-3.5">
          <div>
            <div className="text-[13.5px] font-medium text-[#F2F4F1]">
              Gentle haptic pulse
            </div>
            <div className="text-[11px] text-[#7F8782]">Subtle tactile tap on rest cue</div>
          </div>
          <PhysicalToggle
            checked={hapticsOn}
            onChange={(v) => {
              blinkSound.playToggle(v);
              setHapticsOn(v);
              onShowToast(`Haptic pulse ${v ? 'enabled' : 'off'}`);
            }}
            ariaLabel="Toggle gentle haptic pulse"
          />
        </div>

        <div className="flex items-center justify-between py-3.5">
          <div>
            <div className="text-[13.5px] font-medium text-[#F2F4F1]">
              Zen &amp; UI sounds
            </div>
            <div className="text-[11px] text-[#7F8782]">Soothing rest ambience &amp; end bell</div>
          </div>
          <PhysicalToggle
            checked={soundEnabled}
            onChange={(v) => {
              onToggleSound(v);
              if (v) blinkSound.playToggle(true);
              onShowToast(`Sounds ${v ? 'enabled' : 'muted'}`);
            }}
            ariaLabel="Toggle Zen and UI sounds"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            const next = (quietIdx + 1) % QUIET_WINDOWS.length;
            setQuietIdx(next);
            onShowToast(`Quiet Hours: ${QUIET_WINDOWS[next]}`);
          }}
          className="press-tactile flex w-full items-center justify-between py-3.5 text-left cursor-pointer"
        >
          <span className="text-[13.5px] font-medium text-[#F2F4F1]">Quiet hours</span>
          <span className="inline-flex items-center gap-1 font-mono-num text-[11.5px] text-[#98A09A]">
            {QUIET_WINDOWS[quietIdx]}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = (voiceIdx + 1) % VOICES.length;
            setVoiceIdx(next);
            onShowToast(`Voice persona: ${VOICES[next]}`);
          }}
          className="press-tactile flex w-full items-center justify-between py-3.5 text-left cursor-pointer"
        >
          <span className="text-[13.5px] font-medium text-[#F2F4F1]">Voice persona</span>
          <span className="inline-flex items-center gap-1 text-[12px] text-[#98A09A]">
            {VOICES[voiceIdx]}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </section>

      {/* Progressive Disclosure: Privacy, Data & Account Actions */}
      <section className="rounded-[24px] surface-instrument p-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#A6FA4C]" />
            <span className="text-[13.5px] font-medium text-[#F2F4F1]">
              Privacy, data &amp; account
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-[#8E9690] transition-transform duration-200 ${
              advancedOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24 }}
              className="overflow-hidden"
            >
              <p className="mt-3 rounded-[14px] surface-well p-3 text-[11.5px] leading-[1.48] text-[#98A09A]">
                You control what Blink remembers. In this interactive prototype,
                all blink timelines, assistant memories, and connected services
                use local demonstration data and do not transmit camera or
                microphone streams.
              </p>

              <div className="mt-3 flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmAction('disconnect')}
                  className="press-tactile flex h-[40px] flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-[#E87461]/10 border border-[#E87461]/22 text-[12px] font-medium text-[#E87461] cursor-pointer"
                >
                  <Power className="h-3.5 w-3.5" />
                  Disconnect Node
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('signout')}
                  className="press-tactile flex h-[40px] flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.04] border border-white/[0.07] text-[12px] font-medium text-[#C8CFCB] cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <p className="font-mono-num pb-2 text-center text-[10px] text-[#5B635E]">
        BLK-NOD-01-A936F · Prototype v2.0
      </p>

      {/* Sensitive Action Confirmation Sheet (Portaled cleanly above BottomDock) */}
      <PortalSheet
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        ariaLabel={
          confirmAction === 'disconnect'
            ? 'Disconnect Desk Node 01'
            : 'Sign out of Blink'
        }
      >
        <h3 className="font-display text-[18px] font-semibold text-[#F2F4F1]">
          {confirmAction === 'disconnect'
            ? 'Disconnect Desk Node 01?'
            : 'Sign out of Blink?'}
        </h3>
        <p className="mt-1.5 text-[13px] leading-[1.48] text-[#98A09A]">
          {confirmAction === 'disconnect'
            ? 'Home and Rhythm will smoothly transition into the offline companion state until you reconnect.'
            : 'Your local prototype session will remain resettable anytime.'}
        </p>
        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={() => setConfirmAction(null)}
            className="surface-tactile press-tactile flex h-[46px] flex-1 items-center justify-center rounded-full text-[13.5px] font-medium text-[#DCE0DD] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmAction === 'disconnect') {
                onToggleDeviceConnected(false);
                onShowToast('Desk Node 01 disconnected');
              } else {
                onShowToast('Sign out confirmed (demo)');
              }
              setConfirmAction(null);
            }}
            className="press-tactile flex h-[46px] flex-1 items-center justify-center rounded-full bg-[#E87461] text-[13.5px] font-semibold text-[#180B08] cursor-pointer"
          >
            {confirmAction === 'disconnect' ? 'Disconnect' : 'Sign Out'}
          </button>
        </div>
      </PortalSheet>
    </div>
  );
};
