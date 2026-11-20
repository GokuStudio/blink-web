import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InsightsShell } from '@/features/insights';
import { Navbar } from '@/shared/components/layout/Navbar';

const LazyInsightsApp = React.lazy(
  () => import('@/features/insights/elevated/InsightsApp')
);

/**
 * Mode 3: Blink Insights
 * Hosts the feature-owned Elevated companion app on /insights (full-bleed on
 * mobile viewports, desktop Navbar preserved on sm+). Preserves Developer 2's
 * classic InsightsShell via ?mode=classic and on /demo.
 */
export const InsightsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isClassic = searchParams.get('mode') === 'classic';

  if (isClassic) {
    return (
      <div className="min-h-screen bg-[#080A0C] flex flex-col text-white" data-testid="insights-page">
        <Navbar />

        <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-6 flex flex-col justify-start">
          <InsightsShell isStandaloneMobile={true} className="w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#060707] flex flex-col text-white" data-testid="insights-page">
      {/* Desktop navigation preserved on sm+; hidden on mobile for full-bleed Elevated companion shell */}
      <div className="hidden sm:block">
        <Navbar />
      </div>

      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center bg-[#060707] text-xs font-mono text-neutral-500">
            Loading Blink Companion…
          </div>
        }
      >
        <LazyInsightsApp />
      </Suspense>
    </div>
  );
};
