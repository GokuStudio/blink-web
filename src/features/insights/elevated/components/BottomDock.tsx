import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, Activity, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { AssistantPhase, DestinationId } from '../data/mockBlinkData';
import { BlinkPresenceOrb } from './BlinkPresenceOrb';

interface BottomDockProps {
  active: DestinationId;
  onSelect: (id: DestinationId) => void;
  assistantPhase: AssistantPhase;
  onOrbHoldStart: () => void;
  onOrbHoldEnd: () => void;
  embedded?: boolean;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  active,
  onSelect,
  assistantPhase,
  onOrbHoldStart,
  onOrbHoldEnd,
  embedded = false,
}) => {
  const navRef = useRef<HTMLElement | null>(null);
  const navItems: Array<{
    id: Exclude<DestinationId, 'assistant'>;
    label: string;
    icon: LucideIcon;
  }> = [
    { id: 'home', label: 'Blink', icon: Eye },
    { id: 'insights', label: 'Rhythm', icon: Activity },
    { id: 'settings', label: 'Node', icon: SlidersHorizontal },
  ];

  return (
    <div
      className={
        embedded
          ? 'pointer-events-none absolute bottom-0 inset-x-0 z-40 w-full px-4 pb-3.5 pt-6 bg-gradient-to-t from-[#0D0F0E] via-[#0D0F0E]/92 to-transparent'
          : 'pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[390px] -translate-x-1/2 px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-[#0D0F0E] via-[#0D0F0E]/92 to-transparent'
      }
    >
      <div className="pointer-events-auto flex items-center gap-3">
        <nav
          ref={navRef}
          aria-label="Main navigation"
          className="relative grid flex-1 grid-cols-3 items-center rounded-full bg-[#141716]/95 border border-white/[0.08] p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="relative z-10 flex h-[52px] flex-col items-center justify-center gap-1 rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A6FA4C]"
              >
                {isActive && (
                  <motion.span
                    layoutId="blinkDockActivePill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-full bg-[#242927] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  />
                )}
                <Icon
                  className={`h-[18px] w-[18px] transition-colors duration-150 ${
                    isActive ? 'text-[#A6FA4C]' : 'text-[#8C938E]'
                  }`}
                  strokeWidth={isActive ? 2.1 : 1.75}
                />
                <span
                  className={`text-[10.5px] font-medium leading-none transition-colors duration-150 ${
                    isActive ? 'text-[#F2F4F1]' : 'text-[#7F8782]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        <BlinkPresenceOrb
          size="dock"
          phase={assistantPhase}
          active={active === 'assistant'}
          reflectionTargets={[navRef]}
          onTap={() => onSelect('assistant')}
          onHoldStart={onOrbHoldStart}
          onHoldEnd={onOrbHoldEnd}
          ariaLabel="Hey Blink assistant (tap to open, press and hold for simulated voice)"
        />
      </div>
    </div>
  );
};
