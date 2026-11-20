import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Send,
  Calendar,
  Mail,
  Utensils,
  Wifi,
  WifiOff,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  BLINK_MEMORIES,
  QUICK_PROMPTS,
  type AssistantPhase,
  type MemoryItem,
} from '../data/mockBlinkData';
import { BlinkEyes } from '../components/BlinkEyes';
import { PortalSheet } from '../components/PortalSheet';
import { blinkSound } from '../utils/soundEngine';
import type { RitualKind } from '../components/RestRitualOverlay';

interface AssistantViewProps {
  phase: AssistantPhase;
  onPhaseChange: (phase: AssistantPhase) => void;
  onStartRitual: (kind: RitualKind) => void;
  onShowToast: (msg: string) => void;
}

const PHASE_COPY: Record<AssistantPhase, { badge: string; hint: string }> = {
  idle: {
    badge: 'Hey Blink · Ready',
    hint: 'Tap Blink or mic for simulated voice, or type below',
  },
  listening: {
    badge: 'Listening · Simulated Demo',
    hint: 'Tap again to send simulated voice request',
  },
  thinking: {
    badge: 'Reviewing rhythm…',
    hint: 'Checking your seeded blink timeline and schedule',
  },
  responding: {
    badge: 'Responding…',
    hint: 'Preparing a concise suggestion',
  },
};

export const AssistantView: React.FC<AssistantViewProps> = ({
  phase,
  onPhaseChange,
  onStartRitual,
  onShowToast,
}) => {
  const [micAllowed, setMicAllowed] = useState(true);
  const [online, setOnline] = useState(true);
  const [draft, setDraft] = useState('');
  const [sendBurstKey, setSendBurstKey] = useState(0);
  const [activeMemory, setActiveMemory] = useState<MemoryItem | null>(null);
  const [liveReply, setLiveReply] = useState<{
    prompt: string;
    reply: string;
    actionBreak?: boolean;
  } | null>(null);
  const timersRef = useRef<number[]>([]);
  const holdTimerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const submitQuery = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (!online) {
      onShowToast('Assistant offline (demo error state)');
      return;
    }

    clearTimers();
    setDraft('');
    setSendBurstKey((k) => k + 1);
    onPhaseChange('thinking');

    timersRef.current.push(
      window.setTimeout(() => onPhaseChange('responding'), 850),
      window.setTimeout(() => {
        const lower = clean.toLowerCase();
        let reply =
          'Your simulated morning average is 14.2 blinks/min versus your 17.0 baseline. Taking a 20-second horizon rest helps ease sustained focus.';
        let actionBreak = false;

        if (lower.includes('break') || lower.includes('20s') || lower.includes('horizon')) {
          reply = 'Ready whenever you are — I can start a calm 20-second horizon rest right now.';
          actionBreak = true;
        } else if (lower.includes('calendar') || lower.includes('schedule')) {
          reply =
            'Simulated Calendar sync shows a 2:00 PM design review. Quiet Hours will keep visual nudges muted during that block.';
        } else if (lower.includes('dip') || lower.includes('10 am')) {
          reply =
            'Between 09:50 and 10:40 your simulated timeline dipped to 11.4/min after an uninterrupted stretch at the display.';
        }

        setLiveReply({ prompt: clean, reply, actionBreak });
        onPhaseChange('idle');
        blinkSound.playReplyReady();
      }, 1750)
    );
  };

  const toggleSimulatedVoice = () => {
    if (!online) {
      onShowToast('Reconnect assistant to try simulated voice');
      return;
    }
    if (!micAllowed) {
      onShowToast('Microphone permission is turned off (demo)');
      return;
    }
    if (phase === 'listening') {
      submitQuery('How are my eyes right now?');
    } else if (phase === 'idle') {
      blinkSound.playListenStart();
      onPhaseChange('listening');
    }
  };

  const groups: Array<'Today' | 'Earlier'> = ['Today', 'Earlier'];

  return (
    <div className="px-5 pt-2 space-y-6">
      {/* Header with subtle Demo Connectivity & Mic Permission Controls */}
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.025em] text-[#F3F5F2]">
            Hey Blink
          </h1>
          <p className="text-[11.5px] text-[#7F8782]">
            Simulated voice &amp; wellness companion
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              clearTimers();
              setMicAllowed((m) => !m);
              onPhaseChange('idle');
              onShowToast(
                micAllowed ? 'Mic permission disabled (demo)' : 'Mic permission allowed (demo)'
              );
            }}
            aria-label="Toggle simulated microphone permission"
            className={`surface-tactile press-tactile flex h-[34px] w-[34px] items-center justify-center rounded-full cursor-pointer ${
              micAllowed ? 'text-[#A6FA4C]' : 'text-[#E87461]'
            }`}
          >
            {micAllowed ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              clearTimers();
              setOnline((o) => !o);
              onPhaseChange('idle');
            }}
            aria-label="Toggle simulated connection state"
            className={`surface-tactile press-tactile inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium cursor-pointer ${
              online ? 'text-[#C8CFCB]' : 'text-[#E87461]'
            }`}
          >
            {online ? <Wifi className="h-3.5 w-3.5 text-[#A6FA4C]" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{online ? 'Online' : 'Offline'}</span>
          </button>
        </div>
      </header>

      {/* Expressive Stage Presence — Normal Rectangular Blink Preview */}
      <section className="flex flex-col items-center rounded-[26px] surface-instrument px-4 py-6 text-center">
        <button
          type="button"
          onPointerDown={() => {
            didHoldRef.current = false;
            if (online && micAllowed && phase === 'idle') {
              holdTimerRef.current = window.setTimeout(() => {
                didHoldRef.current = true;
                onPhaseChange('listening');
              }, 320);
            }
          }}
          onPointerUp={() => {
            if (holdTimerRef.current) {
              window.clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            if (didHoldRef.current) {
              didHoldRef.current = false;
              submitQuery('How are my eyes right now?');
            } else {
              toggleSimulatedVoice();
            }
          }}
          onPointerCancel={() => {
            if (holdTimerRef.current) {
              window.clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            didHoldRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSimulatedVoice();
            }
          }}
          aria-label="Hey Blink interactive rectangular preview"
          className="press-tactile relative flex items-center justify-center py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C] focus-visible:outline-offset-4 rounded-[34px]"
        >
          {/* Soft feathered glow behind rectangular Blink preview */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 rounded-full transition-opacity duration-500"
            style={{
              opacity: !online ? 0.08 : phase === 'listening' ? 0.85 : 0.62,
              background:
                phase === 'listening'
                  ? 'radial-gradient(circle at 50% 50%, rgba(166,250,76,0.26) 0%, rgba(38,123,255,0.14) 44%, transparent 70%)'
                  : 'radial-gradient(circle at 50% 50%, rgba(38,123,255,0.24) 0%, rgba(101,214,255,0.06) 44%, transparent 68%)',
            }}
          />

          {/* Normal rectangular anodized Blink hardware preview */}
          <div
            className="relative flex h-[122px] w-[192px] items-center justify-center rounded-[32px] p-[9px]"
            style={{
              background:
                'linear-gradient(155deg, #2D3230 0%, #191C1A 48%, #0E100F 100%)',
              boxShadow:
                phase === 'listening'
                  ? 'inset 0 1.5px 1px rgba(255,255,255,0.2), 0 0 0 1.5px rgba(166,250,76,0.55), 0 18px 36px rgba(0,0,0,0.72)'
                  : 'inset 0 1.5px 1px rgba(255,255,255,0.16), inset 0 -2px 6px rgba(0,0,0,0.85), 0 18px 36px rgba(0,0,0,0.72)',
            }}
          >
            <div
              className="relative flex h-full w-full items-center justify-center rounded-[23px] overflow-hidden"
              style={{
                background:
                  'radial-gradient(circle at 50% 44%, #081220 0%, #030508 100%)',
                boxShadow:
                  'inset 0 3px 12px rgba(0,0,0,0.94), inset 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              <div className="relative z-10 -mt-1.5 flex items-center justify-center">
                <BlinkEyes
                  variant="node"
                  awake={online}
                  attentive={phase === 'listening'}
                  curious={phase === 'thinking' || phase === 'responding'}
                />
              </div>

              <span
                className="absolute bottom-[8px] z-10 h-[3.5px] w-[22px] rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: !online
                    ? '#4E5451'
                    : phase === 'listening'
                      ? '#A6FA4C'
                      : '#7CE8FF',
                  opacity: online ? 0.9 : 0.4,
                  boxShadow: online
                    ? phase === 'listening'
                      ? '0 0 10px rgba(166,250,76,0.75)'
                      : '0 0 10px rgba(124,232,255,0.55)'
                    : 'none',
                }}
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-20"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 38%)',
                }}
              />
            </div>
          </div>
        </button>

        <div className="mt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono-num text-[10.5px] font-medium ${
              !online
                ? 'bg-[#E87461]/14 text-[#E87461]'
                : !micAllowed
                  ? 'bg-[#F0B45A]/14 text-[#F0B45A]'
                  : phase === 'listening'
                    ? 'bg-[#A6FA4C]/16 text-[#A6FA4C]'
                    : 'bg-white/[0.05] text-[#C8CFCB]'
            }`}
          >
            {!online
              ? 'Connection unavailable · Demo error state'
              : !micAllowed
                ? 'Mic access off · Tap mic icon to allow'
                : PHASE_COPY[phase].badge}
          </span>
          <p className="mt-2 text-[12px] text-[#8E9690]">
            {!online
              ? 'Reconnect above to try simulated voice or text queries.'
              : PHASE_COPY[phase].hint}
          </p>
        </div>

        {/* Accessible Voice Trigger Button + Text Composer (uniform p-1.5 padding all around) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(draft);
          }}
          className="mt-5 flex w-full items-center gap-2.5 rounded-full surface-well p-1.5"
        >
          <button
            type="button"
            onClick={toggleSimulatedVoice}
            aria-label={phase === 'listening' ? 'Stop simulated listening' : 'Start simulated listening'}
            className={`press-tactile relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full cursor-pointer ${
              phase === 'listening'
                ? 'bg-[#A6FA4C] text-[#0D1308]'
                : 'bg-white/[0.05] text-[#C8CFCB] hover:text-white'
            }`}
          >
            {phase === 'listening' && (
              <motion.span
                aria-hidden="true"
                initial={{ scale: 0.9, opacity: 0.7 }}
                animate={{ scale: 1.55, opacity: 0 }}
                transition={{ duration: 1.25, repeat: Infinity, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0 rounded-full border border-[#A6FA4C]"
              />
            )}
            <Mic className="relative z-10 h-4 w-4" />
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!online}
            placeholder={online ? 'Ask Blink about your rhythm…' : 'Offline mode…'}
            className="w-full bg-transparent text-[13px] text-[#F2F4F1] placeholder:text-[#6B736E] focus:outline-none disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!online || !draft.trim() || phase === 'thinking' || phase === 'responding'}
            aria-label="Send message"
            className="press-tactile flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#A6FA4C] text-[#0D1308] disabled:opacity-35 overflow-hidden cursor-pointer"
          >
            <motion.span
              key={sendBurstKey}
              initial={sendBurstKey > 0 ? { x: -8, y: 8, opacity: 0 } : false}
              animate={{ x: 0, y: 0, opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
            </motion.span>
          </button>
        </form>

        {/* Live Simulated Response Drawer */}
        <AnimatePresence>
          {liveReply && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-4 w-full rounded-[18px] surface-well p-3.5 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-medium text-[#A6FA4C]">
                  “{liveReply.prompt}”
                </span>
                <button
                  type="button"
                  onClick={() => setLiveReply(null)}
                  aria-label="Dismiss reply"
                  className="text-[#737B76] hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.48] text-[#DCE0DD]">
                {liveReply.reply}
              </p>
              {liveReply.actionBreak && (
                <button
                  type="button"
                  onClick={() => onStartRitual('horizon-20')}
                  className="btn-lime-tactile press-tactile mt-3 h-[36px] rounded-full px-4 text-[12px] font-semibold cursor-pointer"
                >
                  Begin 20s Horizon Rest
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Quick Prompts Strip */}
      <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              if (q.toLowerCase().includes('20s')) {
                onStartRitual('horizon-20');
              } else {
                submitQuery(q);
              }
            }}
            className="surface-tactile press-tactile shrink-0 rounded-full px-3.5 py-2 text-[12px] font-medium text-[#D6DCD8] hover:text-white cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Editorial Memories (Grouped, Restrained, Useful) */}
      <section aria-label="Blink memories" className="space-y-4">
        {groups.map((grp) => (
          <div key={grp}>
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#737B76]">
              {grp}
            </h2>
            <div className="rounded-[22px] surface-instrument divide-y divide-white/[0.05] px-4">
              {BLINK_MEMORIES.filter((m) => m.group === grp).map((mem) => (
                <button
                  key={mem.id}
                  type="button"
                  onClick={() => setActiveMemory(mem)}
                  className="press-tactile flex w-full items-center justify-between gap-3 py-3.5 text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.8px] font-medium text-[#F2F4F1]">
                        {mem.title}
                      </span>
                      <span className="font-mono-num shrink-0 text-[10.5px] text-[#6B736E]">
                        {mem.time}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono-num shrink-0 rounded-full bg-white/[0.05] px-2 py-[1.5px] text-[9.8px] text-[#A6FA4C]">
                        {mem.metricTag}
                      </span>
                      <p className="truncate text-[12px] text-[#8C938E]">
                        {mem.summary}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#6B736E]" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Connected Ecosystem Chips (Honest Demo Labels) */}
      <section aria-label="Connected services" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#737B76]">
            Ecosystem · Simulated
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Calendar', status: 'Synced', icon: Calendar, active: true },
            { label: 'Gmail', status: 'Briefs', icon: Mail, active: true },
            { label: 'Fuel', status: 'Setup', icon: Utensils, active: false },
          ].map((svc) => {
            const Icon = svc.icon;
            return (
              <button
                key={svc.label}
                type="button"
                onClick={() =>
                  onShowToast(`${svc.label} integration is simulated in this prototype`)
                }
                className="surface-instrument press-tactile flex flex-col items-start rounded-[16px] p-3 text-left cursor-pointer"
              >
                <Icon
                  className={`h-4 w-4 ${svc.active ? 'text-[#A6FA4C]' : 'text-[#7F8782]'}`}
                  strokeWidth={1.85}
                />
                <span className="mt-2 text-[12px] font-medium text-[#E4E8E5]">
                  {svc.label}
                </span>
                <span className="font-mono-num mt-0.5 text-[10px] text-[#7F8782]">
                  {svc.status}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Memory Detail Sheet (Portaled cleanly above BottomDock) */}
      <PortalSheet
        open={activeMemory !== null}
        onClose={() => setActiveMemory(null)}
        ariaLabel={activeMemory?.title ?? 'Conversation memory'}
      >
        {activeMemory && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-[17px] font-semibold text-[#F2F4F1]">
                  {activeMemory.title}
                </h3>
                <p className="font-mono-num mt-0.5 text-[11px] text-[#7F8782]">
                  {activeMemory.time} · {activeMemory.metricTag} · Demo memory
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMemory(null)}
                aria-label="Close memory"
                className="surface-tactile press-tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#98A09A] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-[55dvh] space-y-2.5 overflow-y-auto pr-0.5">
              {activeMemory.messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-[16px] px-3.5 py-2.5 text-[13px] leading-[1.48] ${
                    m.from === 'user'
                      ? 'ml-8 bg-[#A6FA4C]/12 border border-[#A6FA4C]/22 text-[#ECF7E2]'
                      : 'mr-4 surface-well text-[#D6DCD8]'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
          </>
        )}
      </PortalSheet>
    </div>
  );
};
