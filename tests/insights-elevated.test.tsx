import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InsightsApp } from '@/features/insights/elevated/InsightsApp';
import { blinkSound } from '@/features/insights/elevated/utils/soundEngine';

function renderElevated(initialEntry = '/insights') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/insights" element={<InsightsApp />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Blink Elevated Insights Integration (Stage 1)', () => {
  it('mounts Home screen inside .blink-elevated-scope with telemetry cards and dock', () => {
    renderElevated('/insights');

    const root = screen.getByTestId('insights-elevated-app');
    expect(root).toHaveClass('blink-elevated-scope');
    expect(screen.getByText(/Session rhythm/i)).toBeInTheDocument();
    expect(screen.getByText(/Monitoring Time/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Blinks/i)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument();
  });

  it('navigates across all four Elevated screens via BottomDock', async () => {
    renderElevated('/insights');

    // Rhythm (Insights)
    fireEvent.click(screen.getByRole('button', { name: /Rhythm/i }));
    expect(await screen.findByText(/Eye Rhythm/i)).toBeInTheDocument();

    // Desk Node (Settings)
    fireEvent.click(screen.getByRole('button', { name: /Node/i }));
    expect(await screen.findByText(/Blink Desk Node 01/i)).toBeInTheDocument();

    // Hey Blink (Assistant) via BlinkPresenceOrb
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hey Blink assistant/i }));
    fireEvent.pointerUp(screen.getByRole('button', { name: /Hey Blink assistant/i }));
    expect(await screen.findByRole('heading', { name: /^Hey Blink$/i })).toBeInTheDocument();
  });

  it('supports deep-linking via ?screen= query parameter', () => {
    renderElevated('/insights?screen=settings');
    expect(screen.getByText(/Blink Desk Node 01/i)).toBeInTheDocument();
  });

  it('portals notifications sheet onto document.body with .blink-elevated-scope', async () => {
    renderElevated('/insights');

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    const dialog = await screen.findByRole('dialog', { name: /Notifications/i });
    expect(dialog).toHaveClass('blink-elevated-scope');
    expect(screen.getByText(/Gentle rest cue/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close updates/i }));
  });

  it('stops Zen ambience cleanly on unmount', () => {
    const stopSpy = vi.spyOn(blinkSound, 'stopZenAmbience');
    const { unmount } = renderElevated('/insights');

    unmount();
    expect(stopSpy).toHaveBeenCalled();
    stopSpy.mockRestore();
  });
});
