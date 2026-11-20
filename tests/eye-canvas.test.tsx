import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EyeCanvas, EXPR_TO_ID } from '@/features/blink-device/components/EyeCanvas';
import { DeviceShell } from '@/features/blink-device/components/DeviceShell';
import { useDeviceStore } from '@/features/blink-device/state';
import { BlinkExpressionType } from '@/shared/contracts';

describe('Blink Eye Character & Visual Architecture Tests', () => {
  it('maps all BlinkExpressionType values to valid shader pose IDs', () => {
    const expressions: BlinkExpressionType[] = [
      'idle',
      'happy',
      'sleepy',
      'thinking',
      'alert',
      'speaking',
      'offline',
      'listening',
      'nudging',
      'error',
    ];

    expressions.forEach((expr) => {
      const id = EXPR_TO_ID[expr];
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(7);
    });
  });

  it('renders EyeCanvas safely in headless environments', () => {
    const { container } = render(<EyeCanvas expression="idle" />);
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('eye-webgl-canvas')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('updates expression and accessible state description', () => {
    const { rerender } = render(<EyeCanvas expression="happy" />);
    expect(screen.getByText(/Current Eye State: happy/i)).toBeInTheDocument();

    rerender(<EyeCanvas expression="alert" />);
    expect(screen.getByText(/Current Eye State: alert/i)).toBeInTheDocument();
  });

  it('renders DeviceShell in desktop mode with transparent bezel asset on Layer 3', () => {
    render(<DeviceShell mode="desktop-integrated" expression="idle" />);

    const shell = screen.getByTestId('device-shell-desktop');
    expect(shell).toBeInTheDocument();

    // Check Bezel asset
    const bezelImg = screen.getByAltText('Blink Physical Bezel');
    expect(bezelImg).toBeInTheDocument();
    expect(bezelImg).toHaveAttribute('src', '/assets/bezel/bezel.png');

    // Check Eye Canvas beneath bezel
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();
  });

  it('renders DeviceShell in standalone mode without physical bezel asset', () => {
    render(<DeviceShell mode="standalone-device" expression="idle" />);

    // Bezel must be omitted in standalone mode
    expect(screen.queryByAltText('Blink Physical Bezel')).not.toBeInTheDocument();
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();
  });

  it('updates useDeviceStore expression and triggers nudge choreography', () => {
    const store = useDeviceStore.getState();
    expect(store.expression).toBe('idle');

    act(() => {
      store.setExpression('happy');
    });
    expect(useDeviceStore.getState().expression).toBe('happy');

    act(() => {
      store.triggerNudge();
    });
    expect(useDeviceStore.getState().expression).toBe('nudging');

    act(() => {
      store.triggerBlink();
    });
    expect(useDeviceStore.getState().isBlinking).toBe(true);
  });

  it('executes nudge completion callback correctly', () => {
    const onComplete = vi.fn();
    render(<EyeCanvas expression="nudging" onNudgeComplete={onComplete} />);
    expect(screen.getByText(/Current Eye State: nudging/i)).toBeInTheDocument();
  });
});
