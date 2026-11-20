import React from 'react';
import { InsightsShell } from '@/features/insights';
import { Navbar } from '@/shared/components/layout/Navbar';

/**
 * Mode 3: Blink Insights
 * Standalone phone screen in portrait orientation.
 * Mobile-first companion dashboard for eye-health monitoring and device controls.
 */
export const InsightsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#080A0C] flex flex-col text-white" data-testid="insights-page">
      <Navbar />

      <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-6 flex flex-col justify-start">
        <InsightsShell isStandaloneMobile={true} className="w-full" />
      </main>
    </div>
  );
};
