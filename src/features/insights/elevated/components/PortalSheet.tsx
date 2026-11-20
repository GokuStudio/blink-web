import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface PortalSheetProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  placement?: 'bottom' | 'top';
  children: React.ReactNode;
}

/**
 * Renders overlays/bottom sheets via React Portal directly on `document.body`
 * so they always sit cleanly above the floating BottomDock and DistortionWave
 * stacking contexts, with Escape-key dismissal and scroll safety.
 */
export const PortalSheet: React.FC<PortalSheetProps> = ({
  open,
  onClose,
  ariaLabel,
  placement = 'bottom',
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  const isTop = placement === 'top';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className={`blink-elevated-scope fixed inset-0 z-[70] flex justify-center bg-black/74 backdrop-blur-[3px] ${
            isTop ? 'items-start px-4 pt-14' : 'items-end'
          }`}
        >
          <motion.div
            initial={isTop ? { y: -12, opacity: 0, scale: 0.98 } : { y: 44, opacity: 0 }}
            animate={isTop ? { y: 0, opacity: 1, scale: 1 } : { y: 0, opacity: 1 }}
            exit={isTop ? { y: -10, opacity: 0, scale: 0.98 } : { y: 36, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={
              isTop
                ? 'w-full max-w-[354px] rounded-[24px] surface-instrument p-4 shadow-[0_24px_60px_rgba(0,0,0,0.82)]'
                : 'w-full max-w-[390px] rounded-t-[28px] surface-instrument px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.85)]'
            }
          >
            {!isTop && (
              <div
                aria-hidden="true"
                className="mx-auto mb-4 h-[4px] w-[38px] rounded-full bg-white/[0.16]"
              />
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
