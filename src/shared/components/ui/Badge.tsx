import React from 'react';
import { cn } from '@/shared/utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'cyan' | 'neutral';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-[#171A1D] text-neutral-300 border border-[#272E36]',
      success: 'bg-[#9AEA3F]/15 text-[#9AEA3F] border border-[#9AEA3F]/30',
      cyan: 'bg-[#35DFFF]/15 text-[#35DFFF] border border-[#35DFFF]/30',
      warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
      neutral: 'bg-neutral-800 text-neutral-400 border border-neutral-700',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
