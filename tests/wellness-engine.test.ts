import { describe, it, expect, beforeEach } from 'vitest';
import { WellnessEngine } from '../src/features/blink-device/wellness/wellnessEngine';
import { BlinkEvent } from '../src/features/blink-device/tracking/types';

describe('WellnessEngine Deterministic Intelligence (Step 07)', () => {
  let engine: WellnessEngine;
  let currentTime = 1000;

  const tick = (ms: number) => {
    currentTime += ms;
    return currentTime;
  };

  const makeBilateralBlink = (timestamp: number, durationMs = 160): BlinkEvent => ({
    type: 'BilateralBlink',
    timestamp,
    durationMs,
    leftClosure: 0.85,
    rightClosure: 0.85,
  });

  const makeWink = (timestamp: number, side: 'left' | 'right'): BlinkEvent => ({
    type: side === 'left' ? 'LeftWink' : 'RightWink',
    timestamp,
    durationMs: 160,
    leftClosure: side === 'left' ? 0.85 : 0.05,
    rightClosure: side === 'right' ? 0.85 : 0.05,
  });

  beforeEach(() => {
    currentTime = 1000;
    engine = new WellnessEngine({
      noBlinkReminderThresholdMs: 12000,
      noBlinkNudgeThresholdMs: 18000,
      lowBlinkRateThresholdBpm: 12,
      minObservationTimeForRateMs: 30000,
      rollingWindowDurationMs: 60000,
      nudgeCooldownMs: 45000,
      maxStaleDataThresholdMs: 1500,
      lowRateHysteresisBpm: 2,
      minTrackingConfidence: 0.70,
      autoNudgeEnabled: true,
    });
    engine.startMonitoring(currentTime);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
  });

  // Scenario 1: Normal blinking produces no unnecessary nudges
  it('1. normal blinking produces no unnecessary nudges', () => {
    for (let i = 0; i < 15; i++) {
      tick(3000); // Blink every 3.0 seconds (~20 BPM)
      engine.updateTrackingStatus(true, true, 0.95, currentTime);
      engine.recordBlink(makeBilateralBlink(currentTime), currentTime);

      const decision = engine.evaluate(currentTime);
      expect(decision.eligible).toBe(false);
      expect(['observing', 'healthy']).toContain(engine.getWellnessState(currentTime));
    }

    expect(engine.getWellnessState(currentTime)).toBe('healthy');
    expect(engine.getMetrics(currentTime).totalAutomaticNudges).toBe(0);
  });

  // Scenario 2: Prolonged no-blink interval triggers correctly
  it('2. prolonged no-blink interval triggers correctly after 18s', () => {
    // 0s to 10s: healthy
    tick(10000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.evaluate(currentTime).eligible).toBe(false);

    // 12s: enters warning checkpoint (no nudge yet)
    tick(2500);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.getWellnessState(currentTime)).toBe('warning');
    expect(engine.evaluate(currentTime).eligible).toBe(false);

    // 18.5s: prolonged stare threshold met -> nudge eligible!
    tick(6000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    const decision = engine.evaluate(currentTime);

    expect(decision.eligible).toBe(true);
    expect(decision.triggerReason).toBe('prolonged_stare');
    expect(decision.urgency).toBe('medium');
  });

  // Scenario 3: Low rolling blink rate triggers only after sufficient observation (30s)
  it('3. low rolling blink rate triggers only after sufficient observation time (>= 30s)', () => {
    // At 20s with 1 blink (would extrapolate to 3 BPM, but observation time < 30s)
    tick(10000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.recordBlink(makeBilateralBlink(currentTime), currentTime);

    tick(10000); // 20s total observation
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.calculateRollingBlinkRate(currentTime)).toBeNull(); // Insufficient observation
    expect(engine.evaluate(currentTime).eligible).toBe(false);

    // Continue to 35s total observation with blinks spaced 8s apart (~7.5 BPM < 12 BPM threshold)
    tick(8000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.recordBlink(makeBilateralBlink(currentTime), currentTime);

    tick(8000); // 36s total observation
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.recordBlink(makeBilateralBlink(currentTime), currentTime);

    // Now valid observation time >= 30s and rate < 12 BPM
    const rate = engine.calculateRollingBlinkRate(currentTime);
    expect(rate).not.toBeNull();
    expect(rate).toBeLessThan(12);

    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(true);
    expect(decision.triggerReason).toBe('low_blink_rate');
  });

  // Scenario 4: Valid blink updates the last-blink timestamp
  it('4. valid blink updates the last-blink timestamp and resets stare timer', () => {
    tick(15000); // 15s stare (warning state)
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.getWellnessState(currentTime)).toBe('warning');

    // Valid bilateral blink arrives
    engine.recordBlink(makeBilateralBlink(currentTime), currentTime);

    const metrics = engine.getMetrics(currentTime);
    expect(metrics.timeSinceLastBlinkMs).toBe(0);
    expect(engine.evaluate(currentTime).eligible).toBe(false);
  });

  // Scenario 5: Wink does not incorrectly increment bilateral blink count
  it('5. wink does not incorrectly increment bilateral blink count or reset stare condition', () => {
    tick(10000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);

    // User winks left eye (opposite eye was open)
    engine.recordBlink(makeWink(currentTime, 'left'), currentTime);

    // Stare timer was NOT reset by a unilateral wink
    expect(engine.getMetrics(currentTime).timeSinceLastBlinkMs).toBe(10000);

    // Right wink also does not reset stare timer
    engine.recordBlink(makeWink(currentTime, 'right'), currentTime);
    expect(engine.getMetrics(currentTime).timeSinceLastBlinkMs).toBe(10000);
  });

  // Scenario 6: Face loss suspends monitoring
  it('6. face loss suspends monitoring and does not accumulate stare duration', () => {
    tick(5000); // 5s tracked
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.getMetrics(currentTime).timeSinceLastBlinkMs).toBe(5000);

    // Face is lost (user turns away or steps away)
    engine.updateTrackingStatus(true, false, 0.0, currentTime);
    expect(engine.getWellnessState(currentTime)).toBe('suspended');

    // Clock advances 25s while face is missing
    tick(25000);
    engine.updateTrackingStatus(true, false, 0.0, currentTime);

    // Stare duration must NOT advance while user is not tracked
    expect(engine.getMetrics(currentTime).timeSinceLastBlinkMs).toBe(5000);
    expect(engine.evaluate(currentTime).eligible).toBe(false);
    expect(engine.evaluate(currentTime).reason).toBe('no_face');
  });

  // Scenario 7: Face recovery resumes correctly
  it('7. face recovery resumes tracking and observation accumulation', () => {
    tick(5000);
    engine.updateTrackingStatus(true, false, 0.0, currentTime); // Lost at 5s

    tick(20000); // 20s away
    engine.updateTrackingStatus(true, true, 0.95, currentTime); // Face returns

    // Staring accumulation resumes from 5s
    tick(14000); // 5s + 14s = 19s > 18s threshold
    engine.updateTrackingStatus(true, true, 0.95, currentTime);

    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(true);
    expect(decision.triggerReason).toBe('prolonged_stare');
  });

  // Scenario 8: Camera stops during cooldown
  it('8. camera stopping during cooldown is safely handled', () => {
    // Trigger nudge at t=19000
    tick(19000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.triggerNudge('prolonged_stare', 'medium', currentTime);

    // Cooldown active (45s cooldown)
    expect(engine.getWellnessState(currentTime)).toBe('nudging');
    engine.completeNudge();
    expect(engine.getWellnessState(currentTime)).toBe('cooldown');

    // Camera stopped
    engine.updateTrackingStatus(false, false, 0.0, currentTime);
    expect(engine.evaluate(currentTime).eligible).toBe(false);
    expect(engine.evaluate(currentTime).reason).toBe('tracking_inactive');
  });

  // Scenario 9: Monitoring pause prevents nudges
  it('9. monitoring pause prevents nudges', () => {
    tick(20000); // Stared 20s
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.pauseMonitoring();

    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('monitoring_paused');
  });

  // Scenario 10: Cooldown prevents repeated alerts
  it('10. cooldown prevents repeated alerts within cooldown window', () => {
    tick(19000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.triggerNudge('prolonged_stare', 'medium', currentTime);
    engine.completeNudge();

    // 10s later (still within 45s cooldown)
    tick(10000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);

    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('cooldown_active');

    // 46s later (cooldown expired)
    tick(36000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    expect(engine.evaluate(currentTime).eligible).toBe(true);
  });

  // Scenario 11: No duplicate nudges
  it('11. avoids duplicate nudges while a nudge is already playing', () => {
    tick(19000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.triggerNudge('prolonged_stare', 'medium', currentTime);

    // Call evaluate while isNudging is active
    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('already_nudging');
  });

  // Scenario 12: Manual and automatic nudges do not overlap
  it('12. manual and automatic nudges do not overlap', () => {
    engine.triggerNudge('manual_test', 'medium', currentTime);
    expect(engine.getWellnessState(currentTime)).toBe('nudging');

    // Automatic evaluate during manual nudge
    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('already_nudging');
  });

  // Scenario 13: Explicit expression changes follow priority rules
  it('13. respects auto-nudge disabled toggle', () => {
    engine.setAutoNudgeEnabled(false);
    tick(20000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);

    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('auto_nudge_disabled');
  });

  // Scenario 14: Stale samples are ignored
  it('14. stale tracking samples (> 1.5s) are rejected', () => {
    engine.updateTrackingStatus(true, true, 0.95, currentTime);

    // Advance clock 2000ms without fresh tracking update
    tick(2000);
    const decision = engine.evaluate(currentTime);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('stale_data');
  });

  // Scenario 15: Clean reset
  it('15. reset() cleanly restores initial state and cancels counters', () => {
    tick(19000);
    engine.updateTrackingStatus(true, true, 0.95, currentTime);
    engine.triggerNudge('prolonged_stare', 'medium', currentTime);

    engine.reset(currentTime);

    const metrics = engine.getMetrics(currentTime);
    expect(metrics.mode).toBe('idle');
    expect(metrics.state).toBe('idle');
    expect(metrics.totalAutomaticNudges).toBe(0);
    expect(metrics.validObservationDurationMs).toBe(0);
  });

  // Scenario 16: Rapid toggling does not corrupt state
  it('16. rapid toggling between active, paused, and resume maintains state invariants', () => {
    for (let i = 0; i < 10; i++) {
      engine.pauseMonitoring();
      engine.resumeMonitoring(currentTime);
      tick(50);
      engine.updateTrackingStatus(true, true, 0.95, currentTime);
    }

    expect(engine.getMetrics(currentTime).mode).toBe('active');
    expect(engine.getMetrics(currentTime).validObservationDurationMs).toBeGreaterThan(0);
  });
});
