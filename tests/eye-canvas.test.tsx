import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  EyeCanvas,
  EXPR_TO_ID,
  SeededPRNG,
  createCuriosityEvent,
  sampleEyeGaze,
  calculateBlinkScale,
  evaluateActiveBlink,
  evaluateNudgeChoreography,
  EXPRESSION_MOTION,
} from '@/features/blink-device/components/EyeCanvas';
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

  describe('Nudge Visual Choreography Tests (Section 4 Compliance)', () => {
    it('executes Stage A: Left screen eye RED double blink while right eye is hidden (0-340ms)', () => {
      // Mid-first blink of left eye (50ms)
      const frame1 = evaluateNudgeChoreography(50);
      expect(frame1.leftVisible).toBe(1.0);
      expect(frame1.rightVisible).toBe(0.0);
      expect(frame1.leftColor).toBe(1.0); // 1.0 = RED
      expect(frame1.isFinished).toBe(false);

      // Between blinks (140ms)
      const frame2 = evaluateNudgeChoreography(140);
      expect(frame2.leftVisible).toBe(0.0);
      expect(frame2.rightVisible).toBe(0.0);

      // Mid-second blink of left eye (210ms)
      const frame3 = evaluateNudgeChoreography(210);
      expect(frame3.leftVisible).toBe(1.0);
      expect(frame3.rightVisible).toBe(0.0);
      expect(frame3.leftColor).toBe(1.0); // 1.0 = RED
    });

    it('executes Stage B: Right screen eye BLUE double blink while left eye is hidden (340-680ms)', () => {
      // Mid-first blink of right eye (340 + 50 = 390ms)
      const frame1 = evaluateNudgeChoreography(390);
      expect(frame1.leftVisible).toBe(0.0);
      expect(frame1.rightVisible).toBe(1.0);
      expect(frame1.rightColor).toBe(0.0); // 0.0 = BLUE
      expect(frame1.isFinished).toBe(false);

      // Between blinks (340 + 140 = 480ms)
      const frame2 = evaluateNudgeChoreography(480);
      expect(frame2.leftVisible).toBe(0.0);
      expect(frame2.rightVisible).toBe(0.0);

      // Mid-second blink of right eye (340 + 210 = 550ms)
      const frame3 = evaluateNudgeChoreography(550);
      expect(frame3.leftVisible).toBe(0.0);
      expect(frame3.rightVisible).toBe(1.0);
      expect(frame3.rightColor).toBe(0.0); // 0.0 = BLUE
    });

    it('executes Stage C: Both eyes appear: left RED, right BLUE, double blink together (680-1100ms)', () => {
      // First synchronous blink (680 + 50 = 730ms)
      const frame1 = evaluateNudgeChoreography(730);
      expect(frame1.leftVisible).toBe(1.0);
      expect(frame1.rightVisible).toBe(1.0);
      expect(frame1.leftColor).toBe(1.0);  // Left RED
      expect(frame1.rightColor).toBe(0.0); // Right BLUE
      expect(frame1.isFinished).toBe(false);
    });

    it('executes Stage D: Both eyes briefly disappear before repeat (1100-1350ms)', () => {
      const frame = evaluateNudgeChoreography(1200);
      expect(frame.leftVisible).toBe(0.0);
      expect(frame.rightVisible).toBe(0.0);
      expect(frame.isFinished).toBe(false);
    });

    it('executes Stage E: Repeats for bounded 2-cycle sequence and terminates at 2700ms', () => {
      // Cycle 2 repeats Stage A at 1350 + 50ms = 1400ms
      const cycle2A = evaluateNudgeChoreography(1400);
      expect(cycle2A.leftVisible).toBe(1.0);
      expect(cycle2A.rightVisible).toBe(0.0);
      expect(cycle2A.leftColor).toBe(1.0);
      expect(cycle2A.isFinished).toBe(false);

      // Beyond total duration (>= 2700ms): finishes cleanly
      const endFrame = evaluateNudgeChoreography(2700);
      expect(endFrame.isFinished).toBe(true);
    });
  });

  describe('Idle Curiosity & Independent Movement Tests (Refinement 01C)', () => {
    it('produces deterministic, reproducible sequences using SeededPRNG', () => {
      const rng1 = new SeededPRNG(42);
      const rng2 = new SeededPRNG(42);
      const seq1 = [rng1.next(), rng1.next(), rng1.range(5, 10)];
      const seq2 = [rng2.next(), rng2.next(), rng2.range(5, 10)];
      expect(seq1).toEqual(seq2);
    });

    it('generates curiosity events adhering strictly to timing specifications', () => {
      const rng = new SeededPRNG(99);
      for (let i = 0; i < 20; i++) {
        const ev = createCuriosityEvent(1000, rng);

        // Eye movement duration: 120-280ms
        expect(ev.moveDurLeft).toBeGreaterThanOrEqual(120);
        expect(ev.moveDurLeft).toBeLessThanOrEqual(280);
        expect(ev.moveDurRight).toBeGreaterThanOrEqual(120);
        expect(ev.moveDurRight).toBeLessThanOrEqual(280);

        // Eye follow delay: 0 for leader, 80-180ms for follower
        const maxDelay = Math.max(ev.delayLeft, ev.delayRight);
        expect(maxDelay).toBeGreaterThanOrEqual(80);
        expect(maxDelay).toBeLessThanOrEqual(180);
        expect(Math.min(ev.delayLeft, ev.delayRight)).toBe(0);

        // Directional hold: 350-900ms
        expect(ev.holdDur).toBeGreaterThanOrEqual(350);
        expect(ev.holdDur).toBeLessThanOrEqual(900);

        // Return duration: 250-450ms
        expect(ev.returnDurLeft).toBeGreaterThanOrEqual(250);
        expect(ev.returnDurLeft).toBeLessThanOrEqual(450);
        expect(ev.returnDurRight).toBeGreaterThanOrEqual(250);
        expect(ev.returnDurRight).toBeLessThanOrEqual(450);

        // Total duration covers movement, hold, and return
        expect(ev.totalDur).toBeGreaterThanOrEqual(ev.holdDur + 400);
      }
    });

    it('bounds eye gaze displacement within 8–12% of eye diameter', () => {
      const rng = new SeededPRNG(77);
      // Shader maps max gaze 1.0 to 0.018 in UV coordinates
      // Eye diameter is 2 * 0.0913 = 0.1826 in UV coordinates
      const eyeDiameter = 0.1826;
      const maxDisplacementUV = 0.018;

      for (let i = 0; i < 25; i++) {
        const ev = createCuriosityEvent(0, rng);

        const leftMag = Math.sqrt(ev.targetLeft.x ** 2 + ev.targetLeft.y ** 2);
        const rightMag = Math.sqrt(ev.targetRight.x ** 2 + ev.targetRight.y ** 2);

        // Bounded target coordinates
        expect(Math.abs(ev.targetLeft.x)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(ev.targetLeft.y)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(ev.targetRight.x)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(ev.targetRight.y)).toBeLessThanOrEqual(1.0);

        // Actual displacement percentage of eye diameter
        const leftPercent = (leftMag * maxDisplacementUV) / eyeDiameter;
        const rightPercent = (rightMag * maxDisplacementUV) / eyeDiameter;

        expect(leftPercent).toBeLessThanOrEqual(0.125);
        expect(rightPercent).toBeLessThanOrEqual(0.125);
      }
    });

    it('samples independent gaze trajectory with follow delay, hold, and cubic return', () => {
      const rng = new SeededPRNG(1234);
      const ev = createCuriosityEvent(1000, rng);

      const microBase = { x: 0, y: 0 };

      // Before glance begins (t < 1000)
      const atStart = sampleEyeGaze(950, ev.startTime, ev.delayLeft, ev.moveDurLeft, ev.holdDur, ev.returnDurLeft, ev.targetLeft, microBase);
      expect(atStart.x).toBe(0);
      expect(atStart.y).toBe(0);

      // Trailing eye waiting during follow delay
      const followerDelay = Math.max(ev.delayLeft, ev.delayRight);
      const isRightFollower = ev.delayRight > 0;
      const tDuringDelay = 1000 + followerDelay * 0.5;
      const followerDuringDelay = sampleEyeGaze(
        tDuringDelay,
        ev.startTime,
        isRightFollower ? ev.delayRight : ev.delayLeft,
        isRightFollower ? ev.moveDurRight : ev.moveDurLeft,
        ev.holdDur,
        isRightFollower ? ev.returnDurRight : ev.returnDurLeft,
        isRightFollower ? ev.targetRight : ev.targetLeft,
        microBase
      );
      expect(followerDuringDelay.x).toBe(0);
      expect(followerDuringDelay.y).toBe(0);

      // During hold phase
      const tHold = 1000 + followerDelay + 300;
      const atHold = sampleEyeGaze(tHold, ev.startTime, ev.delayLeft, ev.moveDurLeft, ev.holdDur, ev.returnDurLeft, ev.targetLeft, microBase);
      expect(atHold.x).toBeCloseTo(ev.targetLeft.x, 2);
      expect(atHold.y).toBeCloseTo(ev.targetLeft.y, 2);

      // After return phase completed
      const tComplete = 1000 + ev.totalDur + 50;
      const atComplete = sampleEyeGaze(tComplete, ev.startTime, ev.delayLeft, ev.moveDurLeft, ev.holdDur, ev.returnDurLeft, ev.targetLeft, microBase);
      expect(atComplete.x).toBeCloseTo(0, 2);
      expect(atComplete.y).toBeCloseTo(0, 2);
    });
  });

  describe('Expression Fidelity & Morphing Verification (Refinement 02)', () => {
    it('correctly maps all 6 primary expressions to distinct pose IDs', () => {
      const primary: Record<string, number> = {
        idle: 0,
        happy: 1,
        sleepy: 2,
        thinking: 3,
        alert: 4,
        listening: 7,
      };

      Object.entries(primary).forEach(([name, expectedId]) => {
        expect(EXPR_TO_ID[name as BlinkExpressionType]).toBe(expectedId);
      });
    });

    it('renders and transitions across all 6 primary expressions cleanly', () => {
      const { rerender } = render(<EyeCanvas expression="idle" />);
      expect(screen.getByText(/Current Eye State: idle/i)).toBeInTheDocument();

      const sequence: BlinkExpressionType[] = ['happy', 'sleepy', 'alert', 'thinking', 'listening', 'idle'];
      sequence.forEach((expr) => {
        rerender(<EyeCanvas expression={expr} />);
        expect(screen.getByText(new RegExp(`Current Eye State: ${expr}`, 'i'))).toBeInTheDocument();
      });
    });
  });

  describe('Optical Depth & Shader Material Quality Tests (Refinement 03)', () => {
    it('initializes material parameters with calibrated defaults of 1.0', () => {
      const store = useDeviceStore.getState();
      expect(store.materialParams).toEqual({
        innerEmission: 1.0,
        rimDiffusion: 1.0,
        outerHalo: 1.0,
        textureContrast: 1.0,
        depthVariation: 1.0,
      });
    });

    it('updates individual material parameters and resets cleanly', () => {
      const store = useDeviceStore.getState();

      act(() => {
        store.setMaterialParam('innerEmission', 1.25);
        store.setMaterialParam('outerHalo', 0.85);
      });

      expect(useDeviceStore.getState().materialParams.innerEmission).toBe(1.25);
      expect(useDeviceStore.getState().materialParams.outerHalo).toBe(0.85);
      expect(useDeviceStore.getState().materialParams.rimDiffusion).toBe(1.0);

      act(() => {
        store.resetMaterialParams();
      });

      expect(useDeviceStore.getState().materialParams.innerEmission).toBe(1.0);
      expect(useDeviceStore.getState().materialParams.outerHalo).toBe(1.0);
    });

    it('renders EyeCanvas safely with custom material parameters', () => {
      const { container } = render(
        <EyeCanvas
          expression="idle"
          materialParams={{
            innerEmission: 1.1,
            rimDiffusion: 1.2,
            outerHalo: 0.9,
            textureContrast: 1.15,
            depthVariation: 1.05,
          }}
        />
      );
      expect(container.querySelector('canvas')).toBeInTheDocument();
    });
  });

  describe('Advanced Motion Choreography Tests (Refinement 04)', () => {
    it('evaluates organic non-linear blink curves with rapid closure and smooth reopening', () => {
      const duration = 180;
      // Start open
      expect(calculateBlinkScale(0, duration)).toBe(1.0);

      // Fast closure phase (at ~30ms, eye is already closing quickly)
      const scaleAt30 = calculateBlinkScale(30, duration);
      expect(scaleAt30).toBeLessThan(0.70);

      // Minimum closed hold
      const scaleClosed = calculateBlinkScale(60, duration);
      expect(scaleClosed).toBe(0.04);

      // Smooth decelerating reopen (at 120ms eye is ~75% open, at 180ms fully open)
      const scaleAt120 = calculateBlinkScale(120, duration);
      expect(scaleAt120).toBeGreaterThan(0.65);
      expect(scaleAt120).toBeLessThan(0.90);
      expect(calculateBlinkScale(duration, duration)).toBe(1.0);
    });

    it('evaluates double-blink cycles correctly with a flutter gap between troughs', () => {
      const activeBlink = {
        startTime: 1000,
        duration: 160,
        isDouble: true,
        doubleGap: 80,
        doubleDuration: 130,
        leftOffset: 0,
        rightOffset: 0,
      };

      // Trough 1 (during first blink cycle)
      const during1 = evaluateActiveBlink(1000 + 55, activeBlink);
      expect(during1.scaleLeft).toBe(0.04);

      // Flutter gap (between cycle 1 and cycle 2, eye is reopened)
      const inGap = evaluateActiveBlink(1000 + 160 + 40, activeBlink);
      expect(inGap.scaleLeft).toBe(1.0);

      // Trough 2 (during second blink cycle)
      const during2 = evaluateActiveBlink(1000 + 160 + 80 + 45, activeBlink);
      expect(during2.scaleLeft).toBe(0.04);

      // Completed
      const completed = evaluateActiveBlink(1000 + 160 + 80 + 130 + 10, activeBlink);
      expect(completed.isDone).toBe(true);
    });

    it('applies independent micro-timing offsets between left and right eyes', () => {
      const activeBlink = {
        startTime: 500,
        duration: 180,
        isDouble: false,
        doubleGap: 0,
        doubleDuration: 0,
        leftOffset: 0,
        rightOffset: 12, // Right eye lags by 12ms
      };

      // At t=50ms, left eye is further along its closure curve than right eye
      const sample = evaluateActiveBlink(550, activeBlink);
      expect(sample.scaleLeft).toBeLessThan(sample.scaleRight);
    });

    it('assigns unique motion curves and calibrated durations to all 6 primary expressions', () => {
      const primary: BlinkExpressionType[] = ['idle', 'happy', 'sleepy', 'alert', 'thinking', 'listening'];

      primary.forEach((expr) => {
        const config = EXPRESSION_MOTION[expr];
        expect(config).toBeDefined();
        expect(config.duration).toBeGreaterThan(150);
        expect(config.duration).toBeLessThanOrEqual(600);

        // Verify ease curve bounds [0, 1]
        expect(config.ease(0)).toBeCloseTo(0, 2);
        expect(config.ease(1)).toBeCloseTo(1, 2);
      });

      // Verify specific character choreography:
      // Alert is faster than Sleepy
      expect(EXPRESSION_MOTION.alert.duration).toBeLessThan(EXPRESSION_MOTION.sleepy.duration);
      // Sleepy has viscous weighted start (at p=0.5, value < 0.5)
      expect(EXPRESSION_MOTION.sleepy.ease(0.5)).toBeLessThan(0.45);
      // Alert has fast snap (at p=0.5, value > 0.85)
      expect(EXPRESSION_MOTION.alert.ease(0.5)).toBeGreaterThan(0.85);
    });

    it('handles store wink actions and double blink triggers cleanly', () => {
      const store = useDeviceStore.getState();

      act(() => {
        store.triggerWink('left');
      });
      expect(useDeviceStore.getState().isWinkingLeft).toBe(true);

      act(() => {
        store.triggerWink('right');
      });
      expect(useDeviceStore.getState().isWinkingRight).toBe(true);

      act(() => {
        store.triggerBlink({ isDouble: true });
      });
      expect(useDeviceStore.getState().isBlinking).toBe(true);
      expect(useDeviceStore.getState().isDoubleBlink).toBe(true);
    });

    it('renders and switches rapidly without stuck eye states or unmount errors', () => {
      const { rerender, unmount } = render(<EyeCanvas expression="idle" isBlinking={true} />);
      expect(screen.getByText(/Current Eye State: idle/i)).toBeInTheDocument();

      // Rapidly change expressions
      rerender(<EyeCanvas expression="happy" isBlinking={false} />);
      rerender(<EyeCanvas expression="alert" isBlinking={true} />);
      rerender(<EyeCanvas expression="sleepy" isBlinking={false} />);
      expect(screen.getByText(/Current Eye State: sleepy/i)).toBeInTheDocument();

      // Clean unmount
      expect(() => unmount()).not.toThrow();
    });
  });
});
