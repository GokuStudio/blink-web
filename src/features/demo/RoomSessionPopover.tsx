import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link2, Check, Copy, RefreshCw, X, Radio } from 'lucide-react';
import type { IntegratedDemoSession } from './useIntegratedDemoSession';

interface RoomSessionPopoverProps {
  session: IntegratedDemoSession;
}

export const RoomSessionPopover: React.FC<RoomSessionPopoverProps> = ({ session }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(session.roomCode);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    setDraft(session.roomCode);
  }, [session.roomCode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [open]);

  const handleCopyJoinLink = async () => {
    const joinUrl = `${window.location.origin}/join/${encodeURIComponent(session.roomCode)}`;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Session room ${session.roomCode}`}
        data-testid="room-session-trigger"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-2.5 text-[11px] font-mono text-neutral-300 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
      >
        <Radio
          className={`h-3 w-3 ${
            session.connectionStatus === 'connected'
              ? session.transportKind === 'firebase'
                ? 'text-[#A6FA4C]'
                : 'text-sky-300'
              : 'text-neutral-500'
          }`}
        />
        <span>{session.roomCode}</span>
        <span className="text-neutral-500">·</span>
        <span className="text-[10px] text-neutral-400">
          {session.transportKind === 'firebase' ? 'Cloud' : 'Local'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Room and Pairing Session"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-10 z-50 w-[min(290px,calc(100vw-24px))] rounded-2xl bg-[#131517]/97 border border-white/[0.10] p-3.5 shadow-[0_20px_54px_rgba(0,0,0,0.85)] backdrop-blur-xl text-left space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-white">Shared Session Room</p>
                <p className="text-[10.5px] text-neutral-400">
                  {session.transportKind === 'firebase'
                    ? 'Authenticated Firebase RTDB room'
                    : 'Integrated in-browser session (no cloud keys)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close room menu"
                className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void session.switchRoom(draft);
                setOpen(false);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                aria-label="Room code"
                placeholder="BLINK-DEMO"
                className="h-8 min-w-0 flex-1 rounded-xl bg-black/50 border border-white/[0.10] px-2.5 font-mono text-[11px] uppercase text-white focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
              />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] px-2.5 text-[11px] font-medium text-white cursor-pointer"
              >
                <Link2 className="h-3 w-3 text-[#A6FA4C]" />
                Join
              </button>
            </form>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={() => void handleCopyJoinLink()}
                className="inline-flex items-center gap-1.5 text-[11px] text-neutral-300 hover:text-white cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#A6FA4C]" />
                    <span className="text-[#A6FA4C]">Join URL copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy /join link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void session.reconnectSession()}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Reconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
