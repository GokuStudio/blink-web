import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Eye, Activity, Monitor, Compass, ShieldCheck } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useAuth } from '@/shared/hooks/useAuth';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { userId, isAuthenticated } = useAuth();

  const navItems = [
    { path: '/demo', label: 'Demo Mode', icon: Monitor },
    { path: '/device', label: 'Device Mode', icon: Eye },
    { path: '/insights', label: 'Insights Mode', icon: Activity },
    { path: '/join/BLINK-DEMO', label: 'Pair Device', icon: Compass },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#272E36] bg-[#080A0C]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo */}
        <Link to="/demo" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#171A1D] border border-[#272E36] flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-[#35DFFF] animate-pulse" />
          </div>
          <span className="font-bold text-base tracking-wider text-white">BLINK</span>
          <span className="text-[10px] font-semibold text-[#9AEA3F] bg-[#9AEA3F]/10 px-1.5 py-0.5 rounded border border-[#9AEA3F]/20">
            W0 MVP
          </span>
        </Link>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(
                item.path.split('/')[1] ? `/${item.path.split('/')[1]}` : item.path
              );
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[#171A1D] text-white border border-[#272E36]'
                      : 'text-neutral-400 hover:text-white hover:bg-[#171A1D]/50'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-[#35DFFF]' : 'text-neutral-400')} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Auth Session Status Pill */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#171A1D] border border-[#272E36] text-[11px]"
            title={userId ? `Authenticated User ID: ${userId}` : 'Connecting auth...'}
          >
            <ShieldCheck className={cn('w-3.5 h-3.5', isAuthenticated ? 'text-[#9AEA3F]' : 'text-neutral-500')} />
            <span className="font-mono text-neutral-300">
              {userId ? `${userId.slice(0, 7)}...` : 'Connecting'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
