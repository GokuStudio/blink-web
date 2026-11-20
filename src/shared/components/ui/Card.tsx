import React from 'react';
import { cn } from '@/shared/utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-[#171A1D] border border-[#272E36]',
      elevated: 'bg-[#1C2025] border border-[#2E353F] shadow-xl',
      bordered: 'bg-transparent border border-[#272E36]',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-2xl p-4 sm:p-5 text-white', variants[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
