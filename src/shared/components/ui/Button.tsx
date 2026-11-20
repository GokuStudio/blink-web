import React from 'react';
import { cn } from '@/shared/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'cyan';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none';

    const variants = {
      primary: 'bg-[#9AEA3F] text-black font-semibold hover:bg-[#88dc2f] shadow-lg shadow-[#9AEA3F]/10',
      secondary: 'bg-[#171A1D] text-white hover:bg-[#22262B] border border-[#272E36]',
      outline: 'border border-[#272E36] text-white hover:bg-[#171A1D]',
      ghost: 'text-neutral-400 hover:text-white hover:bg-[#171A1D]',
      cyan: 'bg-[#35DFFF] text-black font-semibold hover:bg-[#22c8e6] shadow-lg shadow-[#35DFFF]/15',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
      icon: 'p-2 w-9 h-9',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
