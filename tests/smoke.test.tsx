import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DemoPage } from '@/pages/DemoPage';
import { DevicePage } from '@/pages/DevicePage';
import { InsightsPage } from '@/pages/InsightsPage';
import { JoinPage } from '@/pages/JoinPage';

describe('Blink Routes Smoke Tests', () => {
  it('renders DemoPage with integrated two-panel shell', () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <Routes>
          <Route path="/demo" element={<DemoPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Blink Integrated Demonstration/i)).toBeInTheDocument();
    expect(screen.getByTestId('device-shell-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('insights-shell')).toBeInTheDocument();
  });

  it('renders DevicePage in standalone mode without bezel', () => {
    render(
      <MemoryRouter initialEntries={['/device']}>
        <Routes>
          <Route path="/device" element={<DevicePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('device-page')).toBeInTheDocument();
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();
  });

  it('renders InsightsPage standalone companion dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route path="/insights" element={<InsightsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('insights-page')).toBeInTheDocument();
    expect(screen.getByText(/BLINK INSIGHTS/i)).toBeInTheDocument();
  });

  it('renders JoinPage pairing view', () => {
    render(
      <MemoryRouter initialEntries={['/join/TEST-CODE']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('join-page')).toBeInTheDocument();
    expect(screen.getByText(/Pair Your Phone/i)).toBeInTheDocument();
  });
});
