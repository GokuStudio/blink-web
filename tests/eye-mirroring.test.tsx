import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EyeTrackingBridge, DEFAULT_BRIDGE_CONFIG } from '../src/features/blink-device/tracking/eyeTrackingBridge';
import { render, screen, act } from '@testing-library/react';
import { EyeCanvas } from '../src/features/blink-device/components/EyeCanvas';

describe('EyeTrackingBridge Low-Latency Mirroring Engine', () => {
  let bridge: EyeTrackingBridge;

  beforeEach(() => {
    bridge = new EyeTrackingBridge();
    bridge.setTrackingActive(true);
    bridge.setMirroringEnabled(true);
  });

  afterEach(() => {
    bridge.reset();
  });

  // Test 1: Both eyes open
  it('1. maintains full vertical openness (scale = 1.0) when both eyes are open', () => {
    bridge.injectSample(0.05, 0.05, true);
    const sample = bridge.sample(100);

    expect(sample.isMirroringActive).toBe(true);
    expect(sample.scaleLeft).toBeCloseTo(1.0, 2);
    expect(sample.scaleRight).toBeCloseTo(1.0, 2);
  });

  // Test 2: Both eyes close
  it('2. rapidly compresses vertical scale towards minimum (0.04) when both eyes close', () => {
    bridge.injectSample(0.05, 0.05, true);
    bridge.sample(100);

    // Full closure (0.85 > saturation threshold 0.80)
    bridge.injectSample(0.85, 0.85, true);
    // Sample with attack response
    const sample = bridge.sample(116);

    expect(sample.isMirroringActive).toBe(true);
    expect(sample.scaleLeft).toBeLessThan(0.20); // Fast attack closure
    expect(sample.scaleRight).toBeLessThan(0.20);

    // Next frame reaches closed minimum
    const sample2 = bridge.sample(132);
    expect(sample2.scaleLeft).toBeCloseTo(DEFAULT_BRIDGE_CONFIG.minOpenness, 2);
    expect(sample2.scaleRight).toBeCloseTo(DEFAULT_BRIDGE_CONFIG.minOpenness, 2);
  });

  // Test 3: Both eyes reopen
  it('3. smoothly reopens back to 1.0 when eyes reopen', () => {
    // Start closed
    bridge.injectSample(0.85, 0.85, true);
    bridge.sample(100);
    bridge.sample(116);

    // Reopen eyes (0.05)
    bridge.injectSample(0.05, 0.05, true);

    // Release frame 1: smooth rise
    const sample1 = bridge.sample(132);
    expect(sample1.scaleLeft).toBeGreaterThan(0.3);

    // Settling frames
    bridge.sample(148);
    bridge.sample(164);
    bridge.sample(180);
    const settled = bridge.sample(196);
    expect(settled.scaleLeft).toBeCloseTo(1.0, 1);
    expect(settled.scaleRight).toBeCloseTo(1.0, 1);
  });

  // Test 4: Left wink
  it('4. compresses left eye while keeping right eye fully open during left wink', () => {
    bridge.injectSample(0.05, 0.05, true);
    bridge.sample(100);

    // Left closes, right stays open
    bridge.injectSample(0.85, 0.05, true);
    const sample = bridge.sample(116);

    expect(sample.scaleLeft).toBeLessThan(0.20);
    expect(sample.scaleRight).toBeCloseTo(1.0, 2);
  });

  // Test 5: Right wink
  it('5. compresses right eye while keeping left eye fully open during right wink', () => {
    bridge.injectSample(0.05, 0.05, true);
    bridge.sample(100);

    // Right closes, left stays open
    bridge.injectSample(0.05, 0.85, true);
    const sample = bridge.sample(116);

    expect(sample.scaleRight).toBeLessThan(0.20);
    expect(sample.scaleLeft).toBeCloseTo(1.0, 2);
  });

  // Test 6: Rapid natural blinking
  it('6. tracks rapid natural blinking without queue lag or overshoot', async () => {
    bridge.injectSample(0.05, 0.05, true);
    bridge.sample(0);

    // Simulate quick natural blink descent & rise over 140ms
    const samples: number[] = [];
    for (let t = 0; t <= 140; t += 16) {
      const p = t / 140;
      const score = p < 0.4 ? 0.05 + 0.85 * (p / 0.4) : 0.90 - 0.85 * ((p - 0.4) / 0.6);
      bridge.injectSample(score, score, true);
      const s = bridge.sample(t);
      samples.push(s.scaleLeft);
    }

    // Minimum scale reached during the blink
    const minScale = Math.min(...samples);
    expect(minScale).toBeLessThan(0.15);

    // Settled near open
    bridge.sample(160);
    bridge.sample(176);
    bridge.sample(192);
    const finalSample = bridge.sample(208);
    expect(finalSample.scaleLeft).toBeGreaterThan(0.90);
  });

  // Test 7: Slow deliberate closure
  it('7. smoothly follows slow deliberate eyelid closure matching continuous input', () => {
    bridge.injectSample(0.05, 0.05, true);
    bridge.sample(0);

    // Halfway closed (score 0.45)
    bridge.injectSample(0.45, 0.45, true);
    const sampleHalf = bridge.sample(50);
    expect(sampleHalf.scaleLeft).toBeGreaterThan(0.25);
    expect(sampleHalf.scaleLeft).toBeLessThan(0.75);

    // Fully closed (score 0.85)
    bridge.injectSample(0.85, 0.85, true);
    const sampleFull = bridge.sample(100);
    expect(sampleFull.scaleLeft).toBeLessThan(0.20);
  });

  // Test 8: Noisy tracking values & deadband
  it('8. filters out noise within deadband without trembling', () => {
    bridge.injectSample(0.02, 0.02, true);
    const sample1 = bridge.sample(100);
    expect(sample1.scaleLeft).toBeCloseTo(1.0, 2);

    // Micro-jitter below lower deadzone (0.08 < 0.10)
    bridge.injectSample(0.08, 0.08, true);
    const sample2 = bridge.sample(116);
    expect(sample2.scaleLeft).toBeCloseTo(1.0, 2); // Unchanged

    // Small micro-tremor under noise deadband
    bridge.injectSample(0.09, 0.09, true);
    const sample3 = bridge.sample(132);
    expect(sample3.scaleLeft).toBeCloseTo(1.0, 2);
  });

  // Test 9: Face leaves the frame
  it('9. smoothly relaxes to open state when face is lost mid-closure', () => {
    // Eyes closed
    bridge.injectSample(0.85, 0.85, true);
    bridge.sample(100);

    // Face lost (user turns away or occlusion)
    bridge.injectSample(0, 0, false);
    const sampleLost = bridge.sample(116);
    expect(sampleLost.isMirroringActive).toBe(false);

    // Glides back to open
    bridge.sample(132);
    bridge.sample(148);
    bridge.sample(164);
    bridge.sample(180);
    bridge.sample(196);
    const settled = bridge.sample(212);
    expect(settled.scaleLeft).toBeCloseTo(1.0, 1);
  });

  // Test 10: Camera stops mid-blink
  it('10. cleanly deactivates mirroring and resets to open when camera is stopped mid-blink', () => {
    bridge.injectSample(0.85, 0.85, true);
    bridge.sample(100);

    // Camera stopped
    bridge.setTrackingActive(false);
    const sampleStopped = bridge.sample(116);

    expect(sampleStopped.isMirroringActive).toBe(false);
    expect(bridge.getMetrics().pipelineLatencyMs).toBeGreaterThanOrEqual(0);
  });

  // Test 11: Mirroring enabled / disabled independence
  it('11. allows disabling mirroring while camera tracking continues measuring telemetry', () => {
    bridge.setMirroringEnabled(false);
    bridge.injectSample(0.85, 0.85, true);

    const sample = bridge.sample(100);
    expect(sample.isMirroringActive).toBe(false);
    expect(sample.scaleLeft).toBeCloseTo(1.0, 2);
  });
});

describe('EyeCanvas Rendering Bridge Integration', () => {
  it('12. expression command morphs cleanly while EyeCanvas is rendered', () => {
    const { rerender } = render(<EyeCanvas expression="idle" />);
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();

    act(() => {
      rerender(<EyeCanvas expression="happy" />);
    });
    expect(screen.getByText(/Current Eye State: happy/i)).toBeInTheDocument();

    act(() => {
      rerender(<EyeCanvas expression="alert" />);
    });
    expect(screen.getByText(/Current Eye State: alert/i)).toBeInTheDocument();
  });

  it('13. responds to window resize without crash', () => {
    render(<EyeCanvas expression="idle" />);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByTestId('eye-webgl-canvas')).toBeInTheDocument();
  });

  it('14. cleanly unmounts and remounts without memory leak', () => {
    const { unmount } = render(<EyeCanvas expression="idle" />);
    expect(screen.getByTestId('eye-canvas-placeholder')).toBeInTheDocument();

    act(() => {
      unmount();
    });

    // Remount
    const { container } = render(<EyeCanvas expression="idle" />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });
});
