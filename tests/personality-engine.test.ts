import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersonalityEngine } from '../src/features/blink-device/personality/personalityEngine';
import {
  PersonalityContext,
  SpontaneousExpression,
} from '../src/features/blink-device/personality/types';
import { usePersonalityStore } from '../src/features/blink-device/personality/personalityStore';
import { useDeviceStore } from '../src/features/blink-device/state';
import { useTrackingStore } from '../src/features/blink-device/state/trackingStore';
import { createCuriosityEvent, sampleEyeGaze, SeededPRNG } from '../src/features/blink-device/components/EyeCanvas';

describe('Autonomous Personality & Context-Aware Engine (Step 09)', () => {
  let engine: PersonalityEngine;
  let currentTime = 1000;

  const tick = (ms: number) => {
    currentTime += ms;
    return currentTime;
  };

  const createDefaultContext = (overrides: Partial<PersonalityContext> = {}): PersonalityContext => ({
    isCameraActive: false,
    isMirroringActive: false,
    isFaceDetected: false,
    isMonitoringActive: false,
    isMonitoringPaused: false,
    isNudgeActive: false,
    isListeningActive: false,
    isDocumentVisible: true,
    currentOwner: 'default',
    currentExpression: 'idle',
    ...overrides,
  });

  beforeEach(() => {
    currentTime = 1000;
    engine = new PersonalityEngine(
      {
        enabled: true,
        minQuietIntervalMs: 15000,
        minIntervalMs: 20000,
        maxIntervalMs: 45000,
        happyDurationMinMs: 1000,
        happyDurationMaxMs: 2000,
        thinkingDurationMinMs: 1500,
        thinkingDurationMaxMs: 3000,
        sleepyDurationMinMs: 1500,
        sleepyDurationMaxMs: 3000,
        sleepyQuietThresholdMs: 30000,
        seed: 1337,
        suppressDuringMirroring: true,
        testSuppressed: false,
      },
      currentTime
    );
  });

  afterEach(() => {
    usePersonalityStore.getState().stopEngine();
    usePersonalityStore.getState().resetOwnership();
  });

  // Scenario 1: Spontaneous expression occurs after eligibility
  it('1. spontaneous expression occurs after eligibility', () => {
    const context = createDefaultContext();

    // Advance past max interval (e.g. 50s)
    tick(50000);
    const decision = engine.evaluate(context, currentTime);

    expect(decision.action).toBe('trigger');
    expect(['happy', 'thinking', 'sleepy']).toContain(decision.expression);
    expect(decision.durationMs).toBeGreaterThanOrEqual(1000);
    expect(decision.durationMs).toBeLessThanOrEqual(3000);
    expect(decision.suppressionReason).toBe('none');

    const diag = engine.getDiagnostics(context, currentTime);
    expect(diag.activityState).toBe('active');
    expect(diag.totalSpontaneousActions).toBe(1);
  });

  // Scenario 2: No expression occurs before the minimum interval
  it('2. no expression occurs before the minimum interval', () => {
    const context = createDefaultContext();

    // Advance only 5 seconds (well below 15s quiet interval and 20s min interval)
    tick(5000);
    let decision = engine.evaluate(context, currentTime);
    expect(decision.action).toBe('none');
    expect(decision.suppressionReason).toBe('quiet_interval');
    expect(decision.timeUntilNextEligibleMs).toBeGreaterThan(0);

    // Advance to 14.5s (still below 15s quiet interval)
    tick(9500);
    decision = engine.evaluate(context, currentTime);
    expect(decision.action).toBe('none');
    expect(decision.suppressionReason).toBe('quiet_interval');
  });

  // Scenario 3: Randomized timing remains within bounds
  it('3. randomized timing remains within bounds', () => {
    const context = createDefaultContext();
    const config = engine.getConfig();

    // Test 20 successive scheduling cycles
    for (let cycle = 0; cycle < 20; cycle++) {
      tick(50000);
      const decision = engine.evaluate(context, currentTime);
      expect(decision.action).toBe('trigger');

      // Finish active action
      tick(decision.durationMs! + 10);
      const returnDecision = engine.evaluate(context, currentTime);
      expect(returnDecision.action).toBe('return_to_neutral');

      // The next eligible time must be >= minIntervalMs and <= maxIntervalMs from completion
      const diag = engine.getDiagnostics(context, currentTime);
      expect(diag.timeUntilNextEligibleMs).toBeGreaterThanOrEqual(config.minQuietIntervalMs);
      expect(diag.timeUntilNextEligibleMs).toBeLessThanOrEqual(config.maxIntervalMs);
    }
  });

  // Scenario 4: Seeded behavior is deterministic
  it('4. seeded behavior is deterministic across identical runs', () => {
    const seed = 4242;
    const runSimulation = (s: number) => {
      const simEngine = new PersonalityEngine({ seed: s }, 0);
      const log: { time: number; expr: string; dur: number }[] = [];
      let t = 0;
      const ctx = createDefaultContext();

      for (let i = 0; i < 15; i++) {
        t += 35000;
        const d = simEngine.evaluate(ctx, t);
        if (d.action === 'trigger') {
          log.push({ time: t, expr: d.expression!, dur: d.durationMs! });
          t += d.durationMs! + 10;
          simEngine.evaluate(ctx, t);
        }
      }
      return log;
    };

    const runA = runSimulation(seed);
    const runB = runSimulation(seed);
    expect(runA.length).toBeGreaterThan(0);
    expect(runA).toEqual(runB);

    // Different seed produces a different pattern
    const runC = runSimulation(9999);
    expect(runA).not.toEqual(runC);
  });

  // Scenario 5: No excessive repeated expressions
  it('5. avoids consecutive identical expressions', () => {
    const context = createDefaultContext();
    let prevExpr: SpontaneousExpression | null = null;
    let consecutiveSame = 0;

    for (let i = 0; i < 25; i++) {
      tick(50000);
      const decision = engine.evaluate(context, currentTime);
      if (decision.action === 'trigger') {
        if (prevExpr !== null && decision.expression === prevExpr) {
          consecutiveSame++;
        }
        prevExpr = decision.expression as SpontaneousExpression;
        tick(decision.durationMs! + 50);
        engine.evaluate(context, currentTime);
      }
    }

    // Engine logic explicitly filters out lastSpontaneous when >1 candidates exist
    expect(consecutiveSame).toBe(0);
  });

  // Scenario 6: Nudge interrupts personality safely
  it('6. nudge interrupts active personality safely with token invalidation', () => {
    const context = createDefaultContext();
    tick(50000);

    // Trigger spontaneous expression
    const decision = engine.evaluate(context, currentTime);
    expect(decision.action).toBe('trigger');
    const tokenBeforeNudge = decision.generationToken;

    // Nudge triggers at mid-action
    tick(500);
    const nudgeContext = createDefaultContext({
      isNudgeActive: true,
      currentOwner: 'nudge',
      currentExpression: 'nudging',
    });

    const interruptDecision = engine.evaluate(nudgeContext, currentTime);
    expect(interruptDecision.action).toBe('none');
    expect(interruptDecision.suppressionReason).toBe('nudge_active');

    // Token must have incremented, rendering any previous delayed return-to-idle invalid
    expect(interruptDecision.generationToken).toBeGreaterThan(tokenBeforeNudge);

    const diag = engine.getDiagnostics(nudgeContext, currentTime);
    expect(diag.activityState).toBe('suppressed');
  });

  // Scenario 7: Camera mirroring remains responsive
  it('7. camera mirroring suppresses conflicting autonomous eyelid deformers', () => {
    // Camera mirroring active with face detected
    const mirroringContext = createDefaultContext({
      isCameraActive: true,
      isFaceDetected: true,
      isMirroringActive: true,
    });

    tick(60000);
    const decision = engine.evaluate(mirroringContext, currentTime);

    // Under default config, personality is suppressed during active mirroring to keep gaze & eyes calm
    expect(decision.action).toBe('none');
    expect(decision.suppressionReason).toBe('mirroring_active');

    // If configured to allow expressions during mirroring
    engine.setConfig({ suppressDuringMirroring: false }, currentTime);
    const allowedDecision = engine.evaluate(mirroringContext, currentTime);
    expect(allowedDecision.action).toBe('trigger');
  });

  // Scenario 8: Explicit expression command takes priority
  it('8. explicit expression command takes priority over autonomous personality', () => {
    const context = createDefaultContext();
    tick(50000);
    const decision = engine.evaluate(context, currentTime);
    expect(decision.action).toBe('trigger');

    // Remote command arrives
    const commandContext = createDefaultContext({
      currentOwner: 'command',
      currentExpression: 'alert',
    });

    tick(200);
    const evalAfterCmd = engine.evaluate(commandContext, currentTime);
    expect(evalAfterCmd.action).toBe('none');
    expect(evalAfterCmd.suppressionReason).toBe('explicit_command');

    // Local user override also takes priority
    const userContext = createDefaultContext({
      currentOwner: 'user',
      currentExpression: 'sleepy',
    });
    const evalAfterUser = engine.evaluate(userContext, currentTime);
    expect(evalAfterUser.action).toBe('none');
    expect(evalAfterUser.suppressionReason).toBe('user_override');
  });

  // Scenario 9: Voice/listening state suppresses incompatible personality
  it('9. voice/listening state suppresses incompatible personality', () => {
    const listeningContext = createDefaultContext({
      isListeningActive: true,
      currentOwner: 'voice',
      currentExpression: 'listening',
    });

    tick(60000);
    const decision = engine.evaluate(listeningContext, currentTime);
    expect(decision.action).toBe('none');
    expect(decision.suppressionReason).toBe('listening_active');
  });

  // Scenario 10: Monitoring pause behavior
  it('10. monitoring pause behavior allows quiet character idle behavior', () => {
    const pausedContext = createDefaultContext({
      isMonitoringActive: false,
      isMonitoringPaused: true,
    });

    tick(50000);
    // When monitoring is paused, calm character idle behavior is still allowed
    const decision = engine.evaluate(pausedContext, currentTime);
    expect(decision.action).toBe('trigger');
    expect(['happy', 'thinking', 'sleepy']).toContain(decision.expression);
  });

  // Scenario 11: Face-loss behavior
  it('11. face-loss behavior during camera tracking allows restrained idle behavior', () => {
    // Camera is active but face is temporarily not detected (e.g. user looked away or stepped back)
    const faceLossContext = createDefaultContext({
      isCameraActive: true,
      isFaceDetected: false,
      isMirroringActive: false,
    });

    tick(50000);
    const decision = engine.evaluate(faceLossContext, currentTime);
    // Because face is lost and mirroring is inactive, character can express calm restrained idle
    expect(decision.action).toBe('trigger');
    expect(decision.suppressionReason).toBe('none');
  });

  // Scenario 12: Background-tab suspension
  it('12. background-tab suspension pauses scheduling when document is hidden', () => {
    const backgroundContext = createDefaultContext({
      isDocumentVisible: false,
    });

    tick(60000);
    const decision = engine.evaluate(backgroundContext, currentTime);
    expect(decision.action).toBe('none');
    expect(decision.suppressionReason).toBe('tab_hidden');

    // Resuming tab visibility restores normal scheduling
    const foregroundContext = createDefaultContext({
      isDocumentVisible: true,
    });
    const resumedDecision = engine.evaluate(foregroundContext, currentTime);
    expect(resumedDecision.action).toBe('trigger');
  });

  // Scenario 13: Proper return to neutral
  it('13. proper return to neutral after duration expires', () => {
    const context = createDefaultContext();
    tick(50000);
    const decision = engine.evaluate(context, currentTime);
    expect(decision.action).toBe('trigger');
    const dur = decision.durationMs!;

    // Halfway through: still holding
    tick(dur / 2);
    const holdDecision = engine.evaluate(context, currentTime);
    expect(holdDecision.action).toBe('hold');
    expect(holdDecision.expression).toBe(decision.expression);

    // Duration expired: returns to neutral idle
    tick(dur / 2 + 10);
    const returnDecision = engine.evaluate(context, currentTime);
    expect(returnDecision.action).toBe('return_to_neutral');
    expect(returnDecision.expression).toBe('idle');
  });

  // Scenario 14: No stale restoration after newer commands
  it('14. no stale restoration after newer commands via generation token', async () => {
    const store = usePersonalityStore.getState();

    // Trigger spontaneous expression via store
    store.triggerNextExpression(true);
    expect(usePersonalityStore.getState().owner).toBe('personality');
    const spontaneousExpr = useDeviceStore.getState().expression;
    expect(['happy', 'thinking', 'sleepy']).toContain(spontaneousExpr);

    // Explicit remote command arrives while spontaneous expression is active
    store.onRemoteCommand('alert', 10);
    expect(usePersonalityStore.getState().owner).toBe('command');
    expect(useDeviceStore.getState().expression).toBe('alert');

    // Simulate expiration of the previous spontaneous expression timeout
    // In personalityStore, activeRestorationTimer checks token and owner === 'personality'.
    // Because owner is 'command', the expression MUST remain 'alert'!
    await new Promise((r) => setTimeout(r, 100));
    expect(useDeviceStore.getState().expression).toBe('alert');
    expect(usePersonalityStore.getState().owner).toBe('command');
  });

  // Scenario 15: Rapid enable/disable toggling
  it('15. rapid enable/disable toggling maintains robust state', () => {
    const context = createDefaultContext();

    for (let i = 0; i < 20; i++) {
      engine.setConfig({ enabled: false }, currentTime);
      expect(engine.getConfig().enabled).toBe(false);
      const dOff = engine.evaluate(context, currentTime);
      expect(dOff.action).toBe('none');
      expect(dOff.suppressionReason).toBe('disabled');

      engine.setConfig({ enabled: true }, currentTime);
      expect(engine.getConfig().enabled).toBe(true);
    }

    tick(50000);
    const finalDecision = engine.evaluate(context, currentTime);
    expect(finalDecision.action).toBe('trigger');
  });

  // Scenario 16: Component teardown and timer cleanup
  it('16. component teardown and timer cleanup removes intervals cleanly', () => {
    const store = usePersonalityStore.getState();
    store.startEngine();
    expect(usePersonalityStore.getState().isRunning).toBe(true);

    store.stopEngine();
    expect(usePersonalityStore.getState().isRunning).toBe(false);
    expect(usePersonalityStore.getState().currentSpontaneous).toBeNull();
  });

  // Scenario 17: Firebase telemetry remains unaffected
  it('17. Firebase telemetry data contracts remain unaffected by spontaneous expressions', () => {
    // Spontaneous expressions do not mutate tracking blink counts or rates
    const tracking = useTrackingStore.getState();
    const initialBlinkCount = tracking.blinkCount;

    usePersonalityStore.getState().triggerNextExpression(true);
    const afterExpr = useDeviceStore.getState().expression;
    expect(['happy', 'thinking', 'sleepy']).toContain(afterExpr);

    // Tracking counts unchanged
    expect(useTrackingStore.getState().blinkCount).toBe(initialBlinkCount);
  });

  // Scenario 18: No regression to idle curiosity
  it('18. no regression to idle curiosity glance generation and micro-saccades', () => {
    const prng = new SeededPRNG(42);
    const event = createCuriosityEvent(currentTime, prng as any);

    expect(event.startTime).toBe(currentTime);
    expect(event.totalDur).toBeGreaterThan(500);
    expect(event.targetLeft).toBeDefined();
    expect(event.targetRight).toBeDefined();

    // Verify sampling curve functions without regression
    const sampled = sampleEyeGaze(
      currentTime + 200,
      event.startTime,
      event.delayLeft,
      event.moveDurLeft,
      event.holdDur,
      event.returnDurLeft,
      event.targetLeft,
      { x: 0, y: 0 },
      event.anticipateLeft
    );

    expect(typeof sampled.x).toBe('number');
    expect(typeof sampled.y).toBe('number');
    expect(isNaN(sampled.x)).toBe(false);
    expect(isNaN(sampled.y)).toBe(false);
  });
});
